import { TopShotClient } from '../clients/topshot-client';
import { MarketplaceConfig, MarketplaceListing, MarketplaceSale } from '../types/marketplace';
import winston from 'winston';
import axios from 'axios';
import WebSocket from 'ws';

// Mock dependencies
jest.mock('axios');
jest.mock('ws');
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockImplementation((fn) => fn()),
    size: 0,
    pending: 0,
  }));
});
jest.mock('p-retry', () => {
  return jest.fn().mockImplementation((fn) => fn());
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TopShotClient Integration Tests', () => {
  let client: TopShotClient;
  let mockLogger: winston.Logger;
  let config: MarketplaceConfig;

  beforeEach(() => {
    // Create mock logger
    mockLogger = winston.createLogger({
      silent: true,
    });

    // Create test config
    config = {
      id: 'topshot',
      name: 'NBA Top Shot',
      baseUrl: 'https://api.nbatopshot.com',
      apiKey: 'test_api_key',
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerMinute: 600,
        requestsPerHour: 36000,
      },
      endpoints: {
        listings: '/marketplace/listings',
        sales: '/marketplace/sales',
        moments: '/moments',
        players: '/players',
      },
      websocket: {
        url: 'wss://api.nbatopshot.com/ws',
        channels: ['listings', 'sales', 'prices'],
      },
      isActive: true,
      priority: 1,
    };

    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: {
        headers: {
          common: {},
        },
      },
      interceptors: {
        request: {
          use: jest.fn(),
        },
        response: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    
    // Set up default mock responses
    mockAxiosInstance.get.mockResolvedValue({ status: 200, data: [] });

    client = new TopShotClient(config, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('HTTP API Integration', () => {
    it('should fetch active listings with proper filtering', async () => {
      const mockListingsResponse = {
        status: 200,
        data: [
          {
            id: 'listing_1',
            moment_id: 'moment_123',
            player_id: 'player_456',
            player_name: 'LeBron James',
            moment_type: 'dunk',
            serial_number: 100,
            price: 150.00,
            currency: 'USD',
            seller_id: 'seller_789',
            listed_at: '2024-01-15T10:00:00Z',
            updated_at: '2024-01-15T10:00:00Z',
            status: 'active',
          },
          {
            id: 'listing_2',
            moment_id: 'moment_124',
            player_id: 'player_457',
            player_name: 'Stephen Curry',
            moment_type: 'three_pointer',
            serial_number: 50,
            price: 200.00,
            currency: 'USD',
            seller_id: 'seller_790',
            listed_at: '2024-01-15T11:00:00Z',
            updated_at: '2024-01-15T11:00:00Z',
            status: 'active',
          },
        ],
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockListingsResponse);

      const filters = {
        playerId: 'player_456',
        minPrice: 100,
        maxPrice: 300,
        limit: 50,
      };

      const listings = await client.getActiveListings(filters);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        config.endpoints.listings,
        { params: filters }
      );
      expect(listings).toHaveLength(2);
      expect(listings[0].momentId).toBe('moment_123');
      expect(listings[0].playerName).toBe('LeBron James');
      expect(listings[1].price).toBe(200.00);
    });

    it('should fetch recent sales with time filtering', async () => {
      const mockSalesResponse = {
        status: 200,
        data: [
          {
            id: 'sale_1',
            moment_id: 'moment_123',
            player_id: 'player_456',
            price: 175.00,
            currency: 'USD',
            buyer_id: 'buyer_123',
            seller_id: 'seller_789',
            sold_at: '2024-01-15T12:00:00Z',
            transaction_hash: '0x123abc',
            fees: {
              marketplace_fee: 8.75,
              royalty_fee: 8.75,
              total_fees: 17.50,
            },
          },
        ],
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockSalesResponse);

      const filters = {
        playerId: 'player_456',
        hours: 24,
        limit: 100,
      };

      const sales = await client.getRecentSales(filters);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        config.endpoints.sales,
        { params: filters }
      );
      expect(sales).toHaveLength(1);
      expect(sales[0].price).toBe(175.00);
      expect(sales[0].fees?.totalFees).toBe(17.50);
    });

    it('should fetch moment price data', async () => {
      const mockPriceResponse = {
        status: 200,
        data: {
          moment_id: 'moment_123',
          player_id: 'player_456',
          current_price: 150.00,
          floor_price: 120.00,
          average_price: 140.00,
          last_sale_price: 145.00,
          volume_24h: 5000.00,
          sales_count_24h: 25,
          listings_count: 15,
          price_change_24h: 5.50,
          volatility: 0.15,
          last_updated: '2024-01-15T12:00:00Z',
          price_history: [
            {
              timestamp: '2024-01-15T10:00:00Z',
              price: 145.00,
              volume: 200,
              type: 'sale',
            },
            {
              timestamp: '2024-01-15T11:00:00Z',
              price: 150.00,
              volume: 150,
              type: 'sale',
            },
          ],
        },
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockPriceResponse);

      const priceData = await client.getMomentPriceData('moment_123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `${config.endpoints.moments}/moment_123/price`
      );
      expect(priceData).toBeDefined();
      expect(priceData!.currentPrice).toBe(150.00);
      expect(priceData!.volume24h).toBe(5000.00);
      expect(priceData!.priceHistory).toHaveLength(2);
    });

    it('should fetch market depth data', async () => {
      const mockDepthResponse = {
        status: 200,
        data: {
          moment_id: 'moment_123',
          bids: [
            { price: 148.00, quantity: 5, cumulative_quantity: 5 },
            { price: 147.00, quantity: 3, cumulative_quantity: 8 },
          ],
          asks: [
            { price: 152.00, quantity: 2, cumulative_quantity: 2 },
            { price: 153.00, quantity: 4, cumulative_quantity: 6 },
          ],
          spread: 4.00,
          mid_price: 150.00,
          timestamp: '2024-01-15T12:00:00Z',
        },
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockDepthResponse);

      const marketDepth = await client.getMarketDepth('moment_123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `${config.endpoints.moments}/moment_123/depth`
      );
      expect(marketDepth).toBeDefined();
      expect(marketDepth!.bids).toHaveLength(2);
      expect(marketDepth!.asks).toHaveLength(2);
      expect(marketDepth!.spread).toBe(4.00);
    });
  });

  describe('WebSocket Integration', () => {
    let mockWebSocket: jest.Mocked<WebSocket>;

    beforeEach(() => {
      mockWebSocket = {
        on: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        ping: jest.fn(),
        readyState: WebSocket.OPEN,
      } as any;

      (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWebSocket);
    });

    it('should establish WebSocket connection', async () => {
      const connectPromise = client.connect();

      // Simulate successful connection
      const openCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'open'
      )?.[1];
      
      if (openCallback) {
        openCallback();
      }

      await expect(connectPromise).resolves.toBeUndefined();
      expect(WebSocket).toHaveBeenCalledWith(config.websocket!.url);
    });

    it('should subscribe to WebSocket channels', async () => {
      const connectPromise = client.connect();

      // Simulate successful connection
      const openCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'open'
      )?.[1];
      
      if (openCallback) {
        openCallback();
      }

      await connectPromise;

      // Check that subscription messages were sent for each channel
      expect(mockWebSocket.send).toHaveBeenCalledTimes(config.websocket!.channels.length);
      
      config.websocket!.channels.forEach(channel => {
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: 'subscribe',
            channel: channel,
          })
        );
      });
    });

    it('should handle WebSocket messages', async () => {
      const connectPromise = client.connect();

      // Simulate successful connection
      const openCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'open'
      )?.[1];
      
      if (openCallback) {
        openCallback();
      }

      await connectPromise;

      // Set up event listener
      const eventPromise = new Promise((resolve) => {
        client.once('listingUpdate', resolve);
      });

      // Simulate receiving a message
      const messageCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'message'
      )?.[1];

      const testMessage = {
        type: 'listing_update',
        data: {
          momentId: 'moment_123',
          price: 155.00,
          status: 'active',
        },
      };

      if (messageCallback) {
        messageCallback(JSON.stringify(testMessage));
      }

      const receivedData = await eventPromise;
      expect(receivedData).toEqual(testMessage.data);
    });

    it('should handle WebSocket reconnection', async () => {
      const connectPromise = client.connect();

      // Simulate successful initial connection
      const openCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'open'
      )?.[1];
      
      if (openCallback) {
        openCallback();
      }

      await connectPromise;

      // Simulate connection close
      const closeCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'close'
      )?.[1];

      if (closeCallback) {
        closeCallback();
      }

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should attempt to create new WebSocket connection
      expect(WebSocket).toHaveBeenCalledTimes(2);
    });

    it('should handle WebSocket errors gracefully', async () => {
      const connectPromise = client.connect();

      // Simulate connection error
      const errorCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      if (errorCallback) {
        errorCallback(new Error('WebSocket connection failed'));
      }

      await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({ status: 200, data: [] });

      // Make multiple requests quickly
      const requests = Array.from({ length: 15 }, () => 
        client.getActiveListings({ limit: 10 })
      );

      const results = await Promise.allSettled(requests);

      // All requests should complete (queued by rate limiter)
      expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    });

    it('should provide queue statistics', () => {
      const stats = client.getQueueStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('pending');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.pending).toBe('number');
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry failed requests', async () => {
      const mockAxiosInstance = mockedAxios.create();
      
      // First call fails, second succeeds
      (mockAxiosInstance.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200, data: [] });

      const result = await client.getActiveListings();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockRejectedValue(new Error('API Error'));

      await expect(client.getActiveListings()).rejects.toThrow('API Error');
    });

    it('should handle malformed response data', async () => {
      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: null, // Malformed data
      });

      const result = await client.getMomentPriceData('moment_123');
      expect(result).toBeNull();
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy status when connected', () => {
      expect(client.isHealthy()).toBe(true);
    });

    it('should report unhealthy status with large queue', () => {
      // Mock a large queue size
      (client as any).requestQueue = { size: 150, pending: 50 };
      
      expect(client.isHealthy()).toBe(false);
    });
  });

  describe('Data Parsing', () => {
    it('should parse listing data correctly', async () => {
      const mockResponse = {
        status: 200,
        data: [
          {
            listing_id: 'listing_1', // Different field name
            moment_id: 'moment_123',
            player_name: 'LeBron James',
            serial_number: '100', // String instead of number
            price: '150.00', // String instead of number
            listed_at: '2024-01-15T10:00:00Z',
          },
        ],
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockResponse);

      const listings = await client.getActiveListings();

      expect(listings).toHaveLength(1);
      expect(listings[0].id).toBe('listing_1');
      expect(listings[0].serialNumber).toBe(100); // Parsed to number
      expect(listings[0].price).toBe(150.00); // Parsed to number
    });

    it('should handle missing optional fields', async () => {
      const mockResponse = {
        status: 200,
        data: [
          {
            id: 'listing_1',
            moment_id: 'moment_123',
            price: 150.00,
            // Missing optional fields
          },
        ],
      };

      const mockAxiosInstance = mockedAxios.create();
      (mockAxiosInstance.get as jest.Mock).mockResolvedValue(mockResponse);

      const listings = await client.getActiveListings();

      expect(listings).toHaveLength(1);
      expect(listings[0].metadata).toEqual({});
      expect(listings[0].currency).toBe('USD'); // Default value
    });
  });

  describe('Connection Management', () => {
    it('should disconnect cleanly', async () => {
      await client.connect();
      await client.disconnect();

      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    it('should handle multiple connection attempts', async () => {
      const connectPromise1 = client.connect();
      const connectPromise2 = client.connect();

      // Simulate successful connection
      const openCallback = (mockWebSocket.on as jest.Mock).mock.calls.find(
        call => call[0] === 'open'
      )?.[1];
      
      if (openCallback) {
        openCallback();
      }

      await Promise.all([connectPromise1, connectPromise2]);

      // Should only create one WebSocket connection
      expect(WebSocket).toHaveBeenCalledTimes(1);
    });
  });
});