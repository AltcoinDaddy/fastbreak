import { DatabaseManager } from './index';
import { config } from 'dotenv';

// Load environment variables
config();

export class DataSeeder {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  public async seedAll(): Promise<void> {
    console.log('Starting database seeding...');
    
    await this.seedUsers();
    await this.seedMoments();
    await this.seedStrategies();
    await this.seedTrades();
    await this.seedNotifications();
    
    console.log('Database seeding completed successfully');
  }

  private async seedUsers(): Promise<void> {
    console.log('Seeding users...');
    
    const users = [
      { walletAddress: '0x1234567890abcdef' },
      { walletAddress: '0xfedcba0987654321' },
      { walletAddress: '0x1111222233334444' },
    ];

    for (const userData of users) {
      try {
        await this.db.users.createUser(userData.walletAddress);
        console.log(`Created user: ${userData.walletAddress}`);
      } catch (error) {
        // User might already exist, skip
        console.log(`User ${userData.walletAddress} already exists, skipping...`);
      }
    }
  }

  private async seedMoments(): Promise<void> {
    console.log('Seeding moments...');
    
    const moments = [
      {
        playerId: 'lebron-james',
        playerName: 'LeBron James',
        gameDate: new Date('2024-01-15'),
        momentType: 'Dunk',
        serialNumber: 123,
        currentPrice: 150.00,
        aiValuation: 200.00,
        confidence: 0.85,
        marketplaceId: 'topshot',
        scarcityRank: 5,
      },
      {
        playerId: 'stephen-curry',
        playerName: 'Stephen Curry',
        gameDate: new Date('2024-01-16'),
        momentType: '3-Pointer',
        serialNumber: 456,
        currentPrice: 120.00,
        aiValuation: 180.00,
        confidence: 0.78,
        marketplaceId: 'topshot',
        scarcityRank: 8,
      },
      {
        playerId: 'giannis-antetokounmpo',
        playerName: 'Giannis Antetokounmpo',
        gameDate: new Date('2024-01-17'),
        momentType: 'Block',
        serialNumber: 789,
        currentPrice: 95.00,
        aiValuation: 140.00,
        confidence: 0.92,
        marketplaceId: 'topshot',
        scarcityRank: 12,
      },
    ];

    for (const momentData of moments) {
      const moment = await this.db.moments.createOrUpdateMoment(momentData);
      console.log(`Created moment: ${moment.playerName} ${moment.momentType}`);
    }
  }

  private async seedStrategies(): Promise<void> {
    console.log('Seeding strategies...');
    
    // Get first user
    const users = await this.db.users.findAll(1);
    if (users.length === 0) return;
    
    const userId = users[0].id;
    
    const strategies = [
      {
        type: 'rookie_risers',
        parameters: {
          rookieRisers: {
            performanceThreshold: 0.8,
            priceLimit: 300,
            minGamesPlayed: 10,
            maxYearsExperience: 3,
            targetPositions: ['PG', 'SG', 'SF'],
            excludeTeams: ['LAL', 'GSW'],
            minMinutesPerGame: 20,
            efficiencyRatingMin: 15,
            usageRateMin: 18,
            projectedGrowthRate: 0.25,
          }
        }
      },
      {
        type: 'post_game_spikes',
        parameters: {
          postGameSpikes: {
            performanceMetrics: [
              { name: 'points', threshold: 25, comparison: 'greater_than' as const, weight: 0.4 },
              { name: 'rebounds', threshold: 10, comparison: 'greater_than' as const, weight: 0.3 },
              { name: 'assists', threshold: 8, comparison: 'greater_than' as const, weight: 0.3 }
            ],
            timeWindow: 24,
            priceChangeThreshold: 0.15,
            volumeThreshold: 100,
            gameTypes: ['regular_season' as const, 'playoffs' as const],
            playerTiers: ['superstar' as const, 'all_star' as const],
            momentTypes: ['Dunk', '3-Pointer', 'Block'],
            maxPriceMultiplier: 2.5,
            socialSentimentWeight: 0.2,
          }
        }
      },
      {
        type: 'arbitrage_mode',
        parameters: {
          arbitrageMode: {
            priceDifferenceThreshold: 0.1,
            maxExecutionTime: 30,
            marketplaces: ['topshot', 'othermarket'],
            maxRiskScore: 0.7,
            minConfidenceLevel: 0.8,
            slippageTolerance: 0.05,
            maxPositionSize: 1000,
            excludeHighVolatility: true,
          }
        }
      },
    ];

    for (const strategyData of strategies) {
      const strategy = await this.db.strategies.createStrategy(
        userId,
        strategyData.type,
        strategyData.parameters
      );
      console.log(`Created strategy: ${strategy.type}`);
    }

    // Add additional strategy variations for comprehensive testing
    const additionalStrategies = [
      {
        type: 'rookie_risers',
        parameters: {
          rookieRisers: {
            performanceThreshold: 0.75,
            priceLimit: 500,
            minGamesPlayed: 15,
            maxYearsExperience: 2,
            targetPositions: ['C', 'PF'],
            minMinutesPerGame: 25,
            efficiencyRatingMin: 18,
            usageRateMin: 20,
            projectedGrowthRate: 0.35,
          }
        }
      },
      {
        type: 'post_game_spikes',
        parameters: {
          postGameSpikes: {
            performanceMetrics: [
              { name: 'points', threshold: 30, comparison: 'greater_than' as const, weight: 0.5 },
              { name: 'steals', threshold: 3, comparison: 'greater_than' as const, weight: 0.25 },
              { name: 'blocks', threshold: 2, comparison: 'greater_than' as const, weight: 0.25 }
            ],
            timeWindow: 12,
            priceChangeThreshold: 0.20,
            volumeThreshold: 150,
            gameTypes: ['playoffs' as const, 'finals' as const],
            playerTiers: ['superstar' as const],
            momentTypes: ['Dunk', 'Block', 'Steal'],
            maxPriceMultiplier: 3.0,
            socialSentimentWeight: 0.3,
          }
        }
      },
      {
        type: 'arbitrage_mode',
        parameters: {
          arbitrageMode: {
            priceDifferenceThreshold: 0.15,
            maxExecutionTime: 45,
            marketplaces: ['topshot', 'nbatopshot', 'marketplace3'],
            maxRiskScore: 0.5,
            minConfidenceLevel: 0.9,
            slippageTolerance: 0.03,
            maxPositionSize: 2000,
            excludeHighVolatility: false,
          }
        }
      },
    ];

    for (const strategyData of additionalStrategies) {
      const strategy = await this.db.strategies.createStrategy(
        userId,
        strategyData.type,
        strategyData.parameters
      );
      console.log(`Created additional strategy: ${strategy.type}`);
    }
  }

  private async seedTrades(): Promise<void> {
    console.log('Seeding trades...');
    
    // Get first user and moments
    const users = await this.db.users.findAll(1);
    const moments = await this.db.moments.findAll(3);
    
    if (users.length === 0 || moments.length === 0) return;
    
    const userId = users[0].id;
    
    const trades = [
      {
        userId,
        momentId: moments[0].id,
        action: 'buy' as const,
        price: 150.00,
        reasoning: 'AI detected undervalued LeBron James moment after strong performance',
        strategyUsed: 'rookie_risers',
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      },
      {
        userId,
        momentId: moments[1].id,
        action: 'buy' as const,
        price: 120.00,
        reasoning: 'Post-game spike opportunity for Stephen Curry 3-pointer',
        strategyUsed: 'post_game_spikes',
        transactionHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      },
      {
        userId,
        momentId: moments[0].id,
        action: 'sell' as const,
        price: 175.00,
        reasoning: 'Profit taking after 16.7% gain',
        strategyUsed: 'rookie_risers',
        profitLoss: 25.00,
        transactionHash: '0x1111222233334444111122223333444411112222333344441111222233334444',
      },
    ];

    for (const tradeData of trades) {
      const trade = await this.db.trades.createTrade(tradeData);
      console.log(`Created trade: ${trade.action} ${trade.price}`);
    }
  }

  private async seedNotifications(): Promise<void> {
    console.log('Seeding notifications...');
    
    // Get first user
    const users = await this.db.users.findAll(1);
    if (users.length === 0) return;
    
    const userId = users[0].id;
    
    const notifications = [
      {
        userId,
        type: 'trade' as const,
        title: 'Trade Executed',
        message: 'Successfully purchased LeBron James Dunk moment for $150.00',
        priority: 'medium' as const,
        read: false,
      },
      {
        userId,
        type: 'opportunity' as const,
        title: 'New Opportunity Detected',
        message: 'AI found undervalued Giannis Antetokounmpo Block moment',
        priority: 'high' as const,
        read: false,
      },
      {
        userId,
        type: 'budget' as const,
        title: 'Budget Alert',
        message: 'Daily spending has reached 75% of your limit',
        priority: 'medium' as const,
        read: true,
      },
      {
        userId,
        type: 'system' as const,
        title: 'System Update',
        message: 'FastBreak AI models have been updated with latest performance data',
        priority: 'low' as const,
        read: true,
      },
    ];

    for (const notificationData of notifications) {
      const notification = await this.db.notifications.createNotification(notificationData);
      console.log(`Created notification: ${notification.title}`);
    }
  }

  public async clearAll(): Promise<void> {
    console.log('Clearing all seed data...');
    
    await this.db.getConnection().query('TRUNCATE TABLE notifications CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE trades CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE ai_analyses CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE moments CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE strategy_performance CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE strategies CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE notification_preferences CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE budget_limits CASCADE');
    await this.db.getConnection().query('TRUNCATE TABLE users CASCADE');
    
    console.log('All seed data cleared');
  }
}

// CLI script for seeding
async function runSeeder() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const db = new DatabaseManager(databaseUrl);
  const seeder = new DataSeeder(db);

  try {
    await db.initialize();
    
    const command = process.argv[2];
    
    if (command === 'clear') {
      await seeder.clearAll();
    } else if (command === 'seed') {
      await seeder.seedAll();
    } else if (command === 'reset') {
      await seeder.clearAll();
      await seeder.seedAll();
    } else {
      console.log('Usage: npm run seed [seed|clear|reset]');
      console.log('  seed  - Add sample data to database');
      console.log('  clear - Remove all data from database');
      console.log('  reset - Clear and then seed database');
    }
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Run seeder if this file is executed directly
if (require.main === module) {
  runSeeder();
}