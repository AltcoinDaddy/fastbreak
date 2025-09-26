import { GameEventAgent, GameEventAgentConfig } from '../../agents/game-event-agent';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';
import axios from 'axios';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GameEventAgent Integration Tests', () => {
  let agent: GameEventAgent;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: GameEventAgentConfig;

  beforeEach(() => {
    // Setup mocks
    mockDb = {
      initialize: jest.fn(),
      close: jest.fn(),
    } as any;

    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;

    config = {
      checkIntervalMs: 60000,
      lookAheadHours: 24,
      performanceThresholds: {
        points: 30,
        rebounds: 10,
        assists: 10,
        blocks: 3,
        steals: 3,
      },
      momentCategories: ['rookie', 'veteran', 'legendary'],
      enableRealTimeUpdates: true,
    };

    // Setup axios mocks
    mockedAxios.create.mockReturnValue(mockedAxios);

    agent = new GameEventAgent(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize trigger conditions successfully', async () => {
      // Mock NBA API response for upcoming games
      mockedAxios.get.mockResolvedValue({
        data: {
          resultSets: [{
            rowSet: [
              ['team1', 'team2', 'game1', 'game1', 'game123', new Date().toISOString(), 'Team A', 'Team B'],
            ],
          }],
        },
      });

      await agent.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Game event trigger conditions initialized');
    });

    it('should load upcoming games during initialization', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          resultSets: [{
            rowSet: [
              ['team1', 'team2', 'game1', 'game1', 'game123', new Date().toISOString(), 'Team A', 'Team B'],
              ['team3', 'team4', 'game2', 'game2', 'game456', new Date().toISOString(), 'Team C', 'Team D'],
            ],
      