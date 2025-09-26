import { BaseAgent, AgentConfig, TriggerCondition } from './base-agent';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import axios, { AxiosInstance } from 'axios';

export interface GameEventAgentConfig extends AgentConfig {
  lookAheadHours: number;
  performanceThresholds: {
    points: number;
    rebounds: number;
    assists: number;
    blocks: number;
    steals: number;
  };
  momentCategories: string[];
  enableRealTimeUpdates: boolean;
}

export interface GameEvent {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: Date;
  status: 'scheduled' | 'live' | 'completed';
  players: GamePlayer[];
}

export interface GamePlayer {
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  stats?: PlayerStats;
}

export interface PlayerStats {
  points: number;
  rebounds: number;
  assists: number;
  blocks: number;
  steals: number;
  fieldGoalPercentage: number;
  threePointPercentage: number;
  freeThrowPercentage: number;
  minutesPlayed: number;
}

export interface PlayerMoment {
  momentId: string;
  playerId: string;
  playerName: string;
  category: string;
  currentPrice: number;
  volume24h: number;
  priceChange24h: number;
}

export class GameEventAgent extends BaseAgent {
  protected config: GameEventAgentConfig;
  private nbaStatsAPI: AxiosInstance;
  private topShotAPI: AxiosInstance;
  private trackedGames: Map<string, GameEvent> = new Map();
  private trackedPlayers: Map<string, GamePlayer> = new Map();

  constructor(
    config: GameEventAgentConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('GameEventAgent', 'game_event_monitoring', config, db, redisClient, logger);
    this.config = config;

    // Initialize NBA Stats API client
    this.nbaStatsAPI = axios.create({
      baseURL: 'https://stats.nba.com/stats',
      timeout: 30000,
      headers: {
        'User-Agent': 'FastBreak/1.0',
        'Accept': 'application/json',
      },
    });

    // Initialize Top Shot API client
    this.topShotAPI = axios.create({
      baseURL: 'https://api.nbatopshot.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  protected async initializeTriggerConditions(): Promise<void> {
    try {
      this.logger.info('Initializing game event trigger conditions');

      // Add trigger for upcoming games
      this.addTriggerCondition({
        type: 'upcoming_games',
        parameters: {
          lookAheadHours: this.config.lookAheadHours,
        },
        isActive: true,
      });

      // Add trigger for live game performance
      this.addTriggerCondition({
        type: 'live_performance',
        parameters: {
          thresholds: this.config.performanceThresholds,
        },
        isActive: this.config.enableRealTimeUpdates,
      });

      // Add trigger for post-game analysis
      this.addTriggerCondition({
        type: 'post_game_analysis',
        parameters: {
          categories: this.config.momentCategories,
        },
        isActive: true,
      });

      // Load initial game data
      await this.loadUpcomingGames();

      this.logger.info('Game event trigger conditions initialized');
    } catch (error) {
      this.logger.error('Failed to initialize trigger conditions:', error);
      throw error;
    }
  }

  protected async evaluateTriggerConditions(): Promise<TriggerCondition[]> {
    const activatedTriggers: TriggerCondition[] = [];

    try {
      for (const condition of this.getAllTriggerConditions()) {
        if (!condition.isActive) continue;

        let shouldTrigger = false;

        switch (condition.type) {
          case 'upcoming_games':
            shouldTrigger = await this.evaluateUpcomingGames(condition);
            break;
          case 'live_performance':
            shouldTrigger = await this.evaluateLivePerformance(condition);
            break;
          case 'post_game_analysis':
            shouldTrigger = await this.evaluatePostGameAnalysis(condition);
            break;
        }

        if (shouldTrigger) {
          activatedTriggers.push(condition);
        }
      }
    } catch (error) {
      this.logger.error('Error evaluating trigger conditions:', error);
    }

    return activatedTriggers;
  }

  protected async executeTriggerActions(triggers: TriggerCondition[]): Promise<void> {
    for (const trigger of triggers) {
      try {
        switch (trigger.type) {
          case 'upcoming_games':
            await this.handleUpcomingGames(trigger);
            break;
          case 'live_performance':
            await this.handleLivePerformance(trigger);
            break;
          case 'post_game_analysis':
            await this.handlePostGameAnalysis(trigger);
            break;
        }
      } catch (error) {
        this.logger.error('Error executing trigger action:', { trigger: trigger.type, error });
      }
    }
  }

  // Trigger evaluation methods
  private async evaluateUpcomingGames(condition: TriggerCondition): Promise<boolean> {
    try {
      const now = new Date();
      const lookAheadTime = new Date(now.getTime() + condition.parameters.lookAheadHours * 60 * 60 * 1000);

      // Check for games starting within the lookahead window
      for (const game of this.trackedGames.values()) {
        if (game.status === 'scheduled' && 
            game.gameDate > now && 
            game.gameDate <= lookAheadTime) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating upcoming games:', error);
      return false;
    }
  }

  private async evaluateLivePerformance(condition: TriggerCondition): Promise<boolean> {
    try {
      // Check for live games with exceptional performances
      for (const game of this.trackedGames.values()) {
        if (game.status === 'live') {
          for (const player of game.players) {
            if (player.stats && this.isExceptionalPerformance(player.stats, condition.parameters.thresholds)) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating live performance:', error);
      return false;
    }
  }

  private async evaluatePostGameAnalysis(condition: TriggerCondition): Promise<boolean> {
    try {
      // Check for recently completed games
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      for (const game of this.trackedGames.values()) {
        if (game.status === 'completed' && game.gameDate > oneHourAgo) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating post-game analysis:', error);
      return false;
    }
  }

  // Trigger action handlers
  private async handleUpcomingGames(trigger: TriggerCondition): Promise<void> {
    try {
      this.logger.info('Handling upcoming games trigger');

      const upcomingGames = Array.from(this.trackedGames.values())
        .filter(game => {
          const now = new Date();
          const lookAheadTime = new Date(now.getTime() + trigger.parameters.lookAheadHours * 60 * 60 * 1000);
          return game.status === 'scheduled' && game.gameDate > now && game.gameDate <= lookAheadTime;
        });

      for (const game of upcomingGames) {
        // Generate alerts for key players in upcoming games
        await this.analyzeUpcomingGamePlayers(game);
      }

    } catch (error) {
      this.logger.error('Error handling upcoming games:', error);
    }
  }

  private async handleLivePerformance(trigger: TriggerCondition): Promise<void> {
    try {
      this.logger.info('Handling live performance trigger');

      const liveGames = Array.from(this.trackedGames.values())
        .filter(game => game.status === 'live');

      for (const game of liveGames) {
        for (const player of game.players) {
          if (player.stats && this.isExceptionalPerformance(player.stats, trigger.parameters.thresholds)) {
            await this.handleExceptionalPerformance(player, game);
          }
        }
      }

    } catch (error) {
      this.logger.error('Error handling live performance:', error);
    }
  }

  private async handlePostGameAnalysis(trigger: TriggerCondition): Promise<void> {
    try {
      this.logger.info('Handling post-game analysis trigger');

      const recentlyCompletedGames = Array.from(this.trackedGames.values())
        .filter(game => {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          return game.status === 'completed' && game.gameDate > oneHourAgo;
        });

      for (const game of recentlyCompletedGames) {
        await this.analyzePostGameOpportunities(game);
      }

    } catch (error) {
      this.logger.error('Error handling post-game analysis:', error);
    }
  }

  // Analysis methods
  private async analyzeUpcomingGamePlayers(game: GameEvent): Promise<void> {
    try {
      // Get player moments for upcoming game participants
      const playerMoments = await this.getPlayerMoments(game.players.map(p => p.playerId));

      for (const moment of playerMoments) {
        // Generate pre-game opportunity alerts
        this.generateAlert({
          type: 'pre_game_opportunity',
          severity: 'medium',
          title: `Pre-Game Opportunity: ${moment.playerName}`,
          message: `${moment.playerName} has an upcoming game. Current moment price: $${moment.currentPrice}`,
          data: {
            gameId: game.gameId,
            momentId: moment.momentId,
            playerId: moment.playerId,
            playerName: moment.playerName,
            currentPrice: moment.currentPrice,
            gameDate: game.gameDate,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
          },
        });
      }

    } catch (error) {
      this.logger.error('Error analyzing upcoming game players:', error);
    }
  }

  private async handleExceptionalPerformance(player: GamePlayer, game: GameEvent): Promise<void> {
    try {
      const playerMoments = await this.getPlayerMoments([player.playerId]);

      for (const moment of playerMoments) {
        // Calculate opportunity score based on performance
        const opportunityScore = this.calculateOpportunityScore(player.stats!, moment);

        if (opportunityScore > 70) {
          this.generateOpportunity({
            type: 'live_performance_spike',
            momentId: moment.momentId,
            action: 'buy',
            estimatedProfit: moment.currentPrice * 0.15, // Estimated 15% gain
            confidence: opportunityScore,
            riskScore: 100 - opportunityScore,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
            data: {
              gameId: game.gameId,
              playerId: player.playerId,
              playerName: player.playerName,
              stats: player.stats,
              currentPrice: moment.currentPrice,
              performanceMetrics: this.getPerformanceMetrics(player.stats!),
            },
          });
        }

        // Generate high-priority alert for exceptional performance
        this.generateAlert({
          type: 'exceptional_performance',
          severity: 'high',
          title: `Exceptional Performance: ${player.playerName}`,
          message: `${player.playerName} is having an exceptional game! Stats: ${this.formatStats(player.stats!)}`,
          data: {
            gameId: game.gameId,
            momentId: moment.momentId,
            playerId: player.playerId,
            playerName: player.playerName,
            stats: player.stats,
            currentPrice: moment.currentPrice,
            opportunityScore,
          },
        });
      }

    } catch (error) {
      this.logger.error('Error handling exceptional performance:', error);
    }
  }

  private async analyzePostGameOpportunities(game: GameEvent): Promise<void> {
    try {
      // Analyze all players from the completed game
      for (const player of game.players) {
        if (!player.stats) continue;

        const playerMoments = await this.getPlayerMoments([player.playerId]);

        for (const moment of playerMoments) {
          // Check for post-game price movement opportunities
          const priceMovementScore = this.calculatePriceMovementScore(player.stats, moment);

          if (priceMovementScore > 60) {
            const action = moment.priceChange24h > 0 ? 'sell' : 'buy';
            const estimatedProfit = Math.abs(moment.currentPrice * (priceMovementScore / 100) * 0.1);

            this.generateOpportunity({
              type: 'post_game_movement',
              momentId: moment.momentId,
              action,
              estimatedProfit,
              confidence: priceMovementScore,
              riskScore: 100 - priceMovementScore,
              expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
              data: {
                gameId: game.gameId,
                playerId: player.playerId,
                playerName: player.playerName,
                stats: player.stats,
                currentPrice: moment.currentPrice,
                priceChange24h: moment.priceChange24h,
                volume24h: moment.volume24h,
              },
            });
          }
        }
      }

    } catch (error) {
      this.logger.error('Error analyzing post-game opportunities:', error);
    }
  }

  // Data loading methods
  private async loadUpcomingGames(): Promise<void> {
    try {
      // Load games for the next 48 hours
      const response = await this.nbaStatsAPI.get('/leaguegamefinder', {
        params: {
          DateFrom: new Date().toISOString().split('T')[0],
          DateTo: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
      });

      const games = response.data.resultSets[0].rowSet;

      for (const gameData of games) {
        const game: GameEvent = {
          gameId: gameData[4],
          homeTeam: gameData[6],
          awayTeam: gameData[7],
          gameDate: new Date(gameData[5]),
          status: 'scheduled',
          players: [],
        };

        // Load players for this game
        await this.loadGamePlayers(game);
        this.trackedGames.set(game.gameId, game);
      }

      this.logger.info('Loaded upcoming games', { count: this.trackedGames.size });

    } catch (error) {
      this.logger.error('Error loading upcoming games:', error);
    }
  }

  private async loadGamePlayers(game: GameEvent): Promise<void> {
    try {
      // This would load player rosters for the teams in the game
      // For now, using a simplified implementation
      
      const players: GamePlayer[] = [
        // This would be populated with actual roster data
      ];

      game.players = players;

    } catch (error) {
      this.logger.error('Error loading game players:', error);
    }
  }

  private async getPlayerMoments(playerIds: string[]): Promise<PlayerMoment[]> {
    try {
      const moments: PlayerMoment[] = [];

      for (const playerId of playerIds) {
        // Check cache first
        const cachedMoments = await this.cacheGet(`player_moments:${playerId}`);
        if (cachedMoments) {
          moments.push(...JSON.parse(cachedMoments));
          continue;
        }

        // Fetch from Top Shot API
        const response = await this.topShotAPI.get(`/players/${playerId}/moments`);
        const playerMoments = response.data.moments || [];

        // Cache the results
        await this.cacheSet(`player_moments:${playerId}`, JSON.stringify(playerMoments), 300); // 5 minutes

        moments.push(...playerMoments);
      }

      return moments;

    } catch (error) {
      this.logger.error('Error getting player moments:', error);
      return [];
    }
  }

  // Utility methods
  private isExceptionalPerformance(stats: PlayerStats, thresholds: any): boolean {
    return (
      stats.points >= thresholds.points ||
      stats.rebounds >= thresholds.rebounds ||
      stats.assists >= thresholds.assists ||
      stats.blocks >= thresholds.blocks ||
      stats.steals >= thresholds.steals
    );
  }

  private calculateOpportunityScore(stats: PlayerStats, moment: PlayerMoment): number {
    let score = 0;

    // Performance-based scoring
    score += Math.min(stats.points / 50 * 30, 30); // Max 30 points for scoring
    score += Math.min(stats.rebounds / 20 * 15, 15); // Max 15 points for rebounds
    score += Math.min(stats.assists / 15 * 15, 15); // Max 15 points for assists
    score += Math.min((stats.blocks + stats.steals) / 8 * 10, 10); // Max 10 points for defensive stats

    // Efficiency scoring
    if (stats.fieldGoalPercentage > 0.6) score += 10;
    if (stats.threePointPercentage > 0.5) score += 10;

    // Market factors
    if (moment.volume24h > 100) score += 5; // High volume
    if (Math.abs(moment.priceChange24h) < 0.05) score += 5; // Stable price

    return Math.min(score, 100);
  }

  private calculatePriceMovementScore(stats: PlayerStats, moment: PlayerMoment): number {
    let score = 0;

    // Performance impact on price
    const performanceScore = this.calculateOpportunityScore(stats, moment);
    score += performanceScore * 0.6;

    // Market momentum
    if (moment.priceChange24h > 0.1) score += 20; // Strong upward movement
    if (moment.volume24h > moment.currentPrice * 10) score += 15; // High volume relative to price

    // Timing factors
    score += 10; // Post-game timing bonus

    return Math.min(score, 100);
  }

  private getPerformanceMetrics(stats: PlayerStats): any {
    return {
      gameScore: stats.points + stats.rebounds + stats.assists + stats.blocks + stats.steals,
      efficiency: (stats.points + stats.rebounds + stats.assists) / Math.max(stats.minutesPlayed / 48, 1),
      shootingEfficiency: (stats.fieldGoalPercentage + stats.threePointPercentage + stats.freeThrowPercentage) / 3,
    };
  }

  private formatStats(stats: PlayerStats): string {
    return `${stats.points}pts, ${stats.rebounds}reb, ${stats.assists}ast, ${stats.blocks}blk, ${stats.steals}stl`;
  }
}