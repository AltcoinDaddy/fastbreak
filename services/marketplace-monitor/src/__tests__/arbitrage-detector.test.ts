import { ArbitrageDetector, ArbitrageConfig } from '../services/arbitrage-detector';
import { TopShotClient } from '../clients/topshot-client';
import { MarketplaceListing, ArbitrageOpportunity } from '../types/marketplace';
import winston from 'winston';

// Mock TopShotClient
jest.mock('../clients/topshot-client');

describe('ArbitrageDetector', () => {
  let arbitrageDetector: ArbitrageDetector;
  let mockClients: Map<string, jest.Mocked<TopShotClient>>;
  let mockLogger: winston.Logger;
  let config: ArbitrageConfig;

  beforeEach(() => {
    // Create mock logger
    mockLogger = winston.createLogger({
      silent: true, // Suppress logs during testing
    });

    // Create config
    config = {
      minProfitPercentage: 5,
      minProfitAmount: 10,
      maxRiskScore: 70,
      scanIntervalMs: 30000,
      maxOpportunityAge: 10,
      marketplaces: ['marketplace1', 'marketplace2'],
    };

    // Create mock clients
    mockClients = new Map();
    
    const mockClient1 = {
      isHealthy: jest.fn().mockReturnValue(true),
      getActiveListings: jest.fn(),
    } as any;
    
    const mockClient2 = {
      isHealthy: jest.fn().mockReturnValue(true),
      getActiveListings: jest.fn(),
    } as any;

    mockClients.set('marketplace1', mockClient1);
    mockClients.set('marketplace2', mockClient2);

    arbitrageDetector = new ArbitrageDetector(config, mockClients, mockLogger);
  });

  afterEach(() => {
    arbitrageDetector.stop();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(arbitrageDetector).toBeInstanceOf(ArbitrageDetector);
      expect(arbitrageDetector.getActiveOpportunities()).toHaveLength(0);
    });
  });

  describe('start and stop', () => {
    it('should start and stop without errors', () => {
      expect(() => {
        arbitrageDetector.start();
        arbitrageDetector.stop();
      }).not.toThrow();
    });
  });

  describe('opportunity detection', () => {
    const createMockListing = (
      momentId: string,
      price: number,
      marketplaceId: string,
      serialNumber: number = 100
    ): MarketplaceListing => ({
      id: `listing_${momentId}_${marketplaceId}`,
      momentId,
      playerId: 'player_123',
      playerName: 'Test Player',
      momentType: 'dunk',
      serialNumber,
      price,
      currency: 'USD',
      marketplaceId,
      sellerId: 'seller_123',
      listedAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
    });

    it('should detect arbitrage opportunity between marketplaces', async () => {
      // Setup mock listings with price difference
      const listings1 = [createMockListing('moment_1', 100, 'marketplace1')];
      const listings2 = [createMockListing('moment_1', 120, 'marketplace2')];

      mockClients.get('marketplace1')!.getActiveListings.mockResolvedValue(listings1);
      mockClients.get('marketplace2')!.getActiveListings.mockResolvedValue(listings2);

      // Listen for opportunity detection
      const opportunityPromise = new Promise<ArbitrageOpportunity>((resolve) => {
        arbitrageDetector.once('opportunityDetected', resolve);
      });

      // Start detector
      arbitrageDetector.start();

      // Wait for opportunity detection
      const opportunity = await opportunityPromise;

      expect(opportunity).toBeDefined();
      expect(opportunity.momentId).toBe('moment_1');
      expect(opportunity.profitAmount).toBe(20);
      expect(opportunity.profitPercentage).toBe(20);
      expect(opportunity.sourceMarketplace).toBe('marketplace1');
      expect(opportunity.targetMarketplace).toBe('marketplace2');
    });

    it('should not detect opportunity if profit is below threshold', async () => {
      // Setup mock listings with small price difference
      const listings1 = [createMockListing('moment_1', 100, 'marketplace1')];
      const listings2 = [createMockListing('moment_1', 102, 'marketplace2')]; // Only 2% profit

      mockClients.get('marketplace1')!.getActiveListings.mockResolvedValue(listings1);
      mockClients.get('marketplace2')!.getActiveListings.mockResolvedValue(listings2);

      let opportunityDetected = false;
      arbitrageDetector.once('opportunityDetected', () => {
        opportunityDetected = true;
      });

      arbitrageDetector.start();

      // Wait a bit to ensure no opportunity is detected
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(opportunityDetected).toBe(false);
    });

    it('should calculate risk score correctly', () => {
      const listing1 = createMockListing('moment_1', 100, 'marketplace1', 5); // Low serial number
      const listing2 = createMockListing('moment_1', 120, 'marketplace2', 5);

      // Access private method for testing
      const riskScore = (arbitrageDetector as any).calculateRiskScore(listing1, listing2);

      expect(riskScore).toBeGreaterThan(0);
      expect(riskScore).toBeLessThanOrEqual(100);
    });

    it('should calculate confidence correctly', () => {
      const listing1 = createMockListing('moment_1', 100, 'marketplace1');
      const listing2 = createMockListing('moment_1', 120, 'marketplace2');

      // Access private method for testing
      const confidence = (arbitrageDetector as any).calculateConfidence(listing1, listing2, 20);

      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('opportunity management', () => {
    it('should track active opportunities', () => {
      const mockOpportunity: ArbitrageOpportunity = {
        id: 'test_opportunity',
        momentId: 'moment_1',
        sourceMarketplace: 'marketplace1',
        targetMarketplace: 'marketplace2',
        sourcePrice: 100,
        targetPrice: 120,
        profitAmount: 20,
        profitPercentage: 20,
        confidence: 0.8,
        riskScore: 30,
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000), // 10 minutes
        status: 'active',
        executionRisk: {
          liquidityRisk: 20,
          priceMovementRisk: 30,
          executionTimeRisk: 10,
        },
      };

      // Simulate opportunity detection
      (arbitrageDetector as any).activeOpportunities.set(mockOpportunity.id, mockOpportunity);

      const opportunities = arbitrageDetector.getActiveOpportunities();
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].id).toBe('test_opportunity');
    });

    it('should mark opportunity as executed', () => {
      const mockOpportunity: ArbitrageOpportunity = {
        id: 'test_opportunity',
        momentId: 'moment_1',
        sourceMarketplace: 'marketplace1',
        targetMarketplace: 'marketplace2',
        sourcePrice: 100,
        targetPrice: 120,
        profitAmount: 20,
        profitPercentage: 20,
        confidence: 0.8,
        riskScore: 30,
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        status: 'active',
        executionRisk: {
          liquidityRisk: 20,
          priceMovementRisk: 30,
          executionTimeRisk: 10,
        },
      };

      (arbitrageDetector as any).activeOpportunities.set(mockOpportunity.id, mockOpportunity);

      arbitrageDetector.markOpportunityExecuted('test_opportunity');

      const opportunity = arbitrageDetector.getOpportunityById('test_opportunity');
      expect(opportunity?.status).toBe('executed');
    });

    it('should get statistics correctly', () => {
      const mockOpportunity: ArbitrageOpportunity = {
        id: 'test_opportunity',
        momentId: 'moment_1',
        sourceMarketplace: 'marketplace1',
        targetMarketplace: 'marketplace2',
        sourcePrice: 100,
        targetPrice: 120,
        profitAmount: 20,
        profitPercentage: 20,
        confidence: 0.8,
        riskScore: 30,
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        status: 'active',
        executionRisk: {
          liquidityRisk: 20,
          priceMovementRisk: 30,
          executionTimeRisk: 10,
        },
      };

      (arbitrageDetector as any).activeOpportunities.set(mockOpportunity.id, mockOpportunity);

      const stats = arbitrageDetector.getStats();
      expect(stats.activeOpportunities).toBe(1);
      expect(stats.averageProfit).toBe(20);
      expect(stats.averageRisk).toBe(30);
    });
  });

  describe('error handling', () => {
    it('should handle marketplace client errors gracefully', async () => {
      // Setup mock to throw error
      mockClients.get('marketplace1')!.getActiveListings.mockRejectedValue(new Error('API Error'));
      mockClients.get('marketplace2')!.getActiveListings.mockResolvedValue([]);

      // Should not throw error
      expect(() => {
        arbitrageDetector.start();
      }).not.toThrow();

      // Wait a bit to ensure error handling
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle unhealthy clients', async () => {
      // Make one client unhealthy
      mockClients.get('marketplace1')!.isHealthy.mockReturnValue(false);
      mockClients.get('marketplace2')!.getActiveListings.mockResolvedValue([]);

      arbitrageDetector.start();

      // Should still work with healthy clients
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
});