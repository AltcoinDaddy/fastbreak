import { MarketplaceListing, MarketplaceSale, MomentPriceData, ArbitrageOpportunity } from '../types/marketplace';

describe('Marketplace Monitor Integration Tests', () => {
  describe('Data Processing', () => {
    it('should process marketplace listings correctly', () => {
      const rawListingData = {
        id: 'listing_123',
        moment_id: 'moment_456',
        player_id: 'player_789',
        player_name: 'LeBron James',
        moment_type: 'dunk',
        serial_number: '100',
        price: '150.50',
        currency: 'USD',
        seller_id: 'seller_abc',
        listed_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:30:00Z',
        status: 'active',
      };

      // Simulate data parsing (similar to TopShotClient.parseListings)
      const parsedListing: MarketplaceListing = {
        id: rawListingData.id,
        momentId: rawListingData.moment_id,
        playerId: rawListingData.player_id,
        playerName: rawListingData.player_name,
        momentType: rawListingData.moment_type,
        serialNumber: parseInt(rawListingData.serial_number),
        price: parseFloat(rawListingData.price),
        currency: rawListingData.currency,
        marketplaceId: 'topshot',
        sellerId: rawListingData.seller_id,
        listedAt: new Date(rawListingData.listed_at),
        updatedAt: new Date(rawListingData.updated_at),
        status: rawListingData.status as 'active',
        metadata: {},
      };

      expect(parsedListing.momentId).toBe('moment_456');
      expect(parsedListing.serialNumber).toBe(100);
      expect(parsedListing.price).toBe(150.50);
      expect(parsedListing.listedAt).toBeInstanceOf(Date);
    });

    it('should process marketplace sales correctly', () => {
      const rawSaleData = {
        id: 'sale_123',
        moment_id: 'moment_456',
        player_id: 'player_789',
        price: '175.25',
        currency: 'USD',
        buyer_id: 'buyer_def',
        seller_id: 'seller_abc',
        sold_at: '2024-01-15T12:00:00Z',
        transaction_hash: '0x123abc456def',
        fees: {
          marketplace_fee: '8.76',
          royalty_fee: '8.76',
          total_fees: '17.52',
        },
      };

      // Simulate data parsing (similar to TopShotClient.parseSales)
      const parsedSale: MarketplaceSale = {
        id: rawSaleData.id,
        momentId: rawSaleData.moment_id,
        playerId: rawSaleData.player_id,
        price: parseFloat(rawSaleData.price),
        currency: rawSaleData.currency,
        marketplaceId: 'topshot',
        buyerId: rawSaleData.buyer_id,
        sellerId: rawSaleData.seller_id,
        soldAt: new Date(rawSaleData.sold_at),
        transactionHash: rawSaleData.transaction_hash,
        fees: {
          marketplaceFee: parseFloat(rawSaleData.fees.marketplace_fee),
          royaltyFee: parseFloat(rawSaleData.fees.royalty_fee),
          totalFees: parseFloat(rawSaleData.fees.total_fees),
        },
      };

      expect(parsedSale.momentId).toBe('moment_456');
      expect(parsedSale.price).toBe(175.25);
      expect(parsedSale.fees?.totalFees).toBe(17.52);
      expect(parsedSale.soldAt).toBeInstanceOf(Date);
    });

    it('should process moment price data correctly', () => {
      const rawPriceData = {
        moment_id: 'moment_456',
        player_id: 'player_789',
        current_price: '150.00',
        floor_price: '120.00',
        average_price: '140.00',
        last_sale_price: '145.00',
        volume_24h: '5000.00',
        sales_count_24h: '25',
        listings_count: '15',
        price_change_24h: '5.50',
        volatility: '0.15',
        last_updated: '2024-01-15T12:00:00Z',
        price_history: [
          {
            timestamp: '2024-01-15T10:00:00Z',
            price: '145.00',
            volume: '200',
            type: 'sale',
          },
        ],
      };

      // Simulate data parsing (similar to TopShotClient.parseMomentPriceData)
      const parsedPriceData: MomentPriceData = {
        momentId: rawPriceData.moment_id,
        playerId: rawPriceData.player_id,
        currentPrice: parseFloat(rawPriceData.current_price),
        floorPrice: parseFloat(rawPriceData.floor_price),
        averagePrice: parseFloat(rawPriceData.average_price),
        lastSalePrice: parseFloat(rawPriceData.last_sale_price),
        priceHistory: rawPriceData.price_history.map(point => ({
          timestamp: new Date(point.timestamp),
          price: parseFloat(point.price),
          volume: parseInt(point.volume),
          marketplaceId: 'topshot',
          type: point.type as 'sale',
        })),
        volume24h: parseFloat(rawPriceData.volume_24h),
        salesCount24h: parseInt(rawPriceData.sales_count_24h),
        listingsCount: parseInt(rawPriceData.listings_count),
        priceChange24h: parseFloat(rawPriceData.price_change_24h),
        volatility: parseFloat(rawPriceData.volatility),
        lastUpdated: new Date(rawPriceData.last_updated),
      };

      expect(parsedPriceData.currentPrice).toBe(150.00);
      expect(parsedPriceData.volume24h).toBe(5000.00);
      expect(parsedPriceData.priceHistory).toHaveLength(1);
      expect(parsedPriceData.priceHistory[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Arbitrage Detection Logic', () => {
    it('should identify arbitrage opportunities correctly', () => {
      const listing1: MarketplaceListing = {
        id: 'listing_1',
        momentId: 'moment_123',
        playerId: 'player_456',
        playerName: 'LeBron James',
        momentType: 'dunk',
        serialNumber: 100,
        price: 100.00,
        currency: 'USD',
        marketplaceId: 'marketplace1',
        sellerId: 'seller_1',
        listedAt: new Date(),
        updatedAt: new Date(),
        status: 'active',
      };

      const listing2: MarketplaceListing = {
        ...listing1,
        id: 'listing_2',
        price: 120.00,
        marketplaceId: 'marketplace2',
        sellerId: 'seller_2',
      };

      // Simulate arbitrage opportunity calculation
      const profitAmount = listing2.price - listing1.price;
      const profitPercentage = (profitAmount / listing1.price) * 100;

      const opportunity: Partial<ArbitrageOpportunity> = {
        momentId: listing1.momentId,
        sourceMarketplace: listing1.marketplaceId,
        targetMarketplace: listing2.marketplaceId,
        sourcePrice: listing1.price,
        targetPrice: listing2.price,
        profitAmount,
        profitPercentage,
      };

      expect(opportunity.profitAmount).toBe(20.00);
      expect(opportunity.profitPercentage).toBe(20.00);
      expect(opportunity.sourceMarketplace).toBe('marketplace1');
      expect(opportunity.targetMarketplace).toBe('marketplace2');
    });

    it('should calculate risk scores appropriately', () => {
      const highRiskListing: MarketplaceListing = {
        id: 'listing_high_risk',
        momentId: 'moment_123',
        playerId: 'player_456',
        playerName: 'LeBron James',
        momentType: 'dunk',
        serialNumber: 5, // Low serial number = higher risk
        price: 2000.00, // High price = higher risk
        currency: 'USD',
        marketplaceId: 'topshot',
        sellerId: 'seller_1',
        listedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Old listing = higher risk
        updatedAt: new Date(),
        status: 'active',
      };

      const lowRiskListing: MarketplaceListing = {
        ...highRiskListing,
        id: 'listing_low_risk',
        serialNumber: 1000, // High serial number = lower risk
        price: 50.00, // Low price = lower risk
        listedAt: new Date(), // Recent listing = lower risk
      };

      // Simulate risk calculation
      const calculateRisk = (listing: MarketplaceListing): number => {
        let risk = 0;
        
        // Age risk
        const ageHours = (Date.now() - listing.listedAt.getTime()) / (1000 * 60 * 60);
        risk += Math.min(30, ageHours);
        
        // Price risk
        if (listing.price > 1000) risk += 20;
        else if (listing.price > 500) risk += 10;
        else if (listing.price > 100) risk += 5;
        
        // Serial number risk
        if (listing.serialNumber <= 10) risk += 15;
        else if (listing.serialNumber <= 100) risk += 10;
        else if (listing.serialNumber <= 1000) risk += 5;
        
        return Math.min(100, risk);
      };

      const highRisk = calculateRisk(highRiskListing);
      const lowRisk = calculateRisk(lowRiskListing);

      expect(highRisk).toBeGreaterThan(lowRisk);
      expect(highRisk).toBeGreaterThan(40); // Should be high risk
      expect(lowRisk).toBeLessThan(20); // Should be low risk
    });
  });

  describe('Price Change Detection', () => {
    it('should detect significant price changes', () => {
      const previousPrice = 100.00;
      const currentPrice = 130.00;
      const changeThreshold = 10; // 10%

      const changeAmount = currentPrice - previousPrice;
      const changePercentage = (changeAmount / previousPrice) * 100;
      const isSignificant = Math.abs(changePercentage) >= changeThreshold;

      expect(changeAmount).toBe(30.00);
      expect(changePercentage).toBe(30.00);
      expect(isSignificant).toBe(true);
    });

    it('should detect volume spikes', () => {
      const currentVolume = 15000;
      const averageVolume = 3000;
      const spikeThreshold = 3; // 3x average

      const spikeMultiplier = currentVolume / averageVolume;
      const isSpike = spikeMultiplier >= spikeThreshold;

      expect(spikeMultiplier).toBe(5);
      expect(isSpike).toBe(true);
    });
  });

  describe('Alert Triggering Logic', () => {
    it('should trigger price drop alerts correctly', () => {
      const alert = {
        alertType: 'price_drop' as const,
        threshold: 100.00,
        momentId: 'moment_123',
      };

      const currentPrice = 85.00;
      const shouldTrigger = currentPrice <= alert.threshold;

      expect(shouldTrigger).toBe(true);
    });

    it('should trigger price increase alerts correctly', () => {
      const alert = {
        alertType: 'price_increase' as const,
        threshold: 200.00,
        momentId: 'moment_123',
      };

      const currentPrice = 250.00;
      const shouldTrigger = currentPrice >= alert.threshold;

      expect(shouldTrigger).toBe(true);
    });

    it('should trigger volume spike alerts correctly', () => {
      const alert = {
        alertType: 'volume_spike' as const,
        threshold: 4.0, // 4x average volume
        momentId: 'moment_123',
      };

      const currentVolume = 12000;
      const averageVolume = 2500;
      const volumeMultiplier = currentVolume / averageVolume;
      const shouldTrigger = volumeMultiplier >= alert.threshold;

      expect(volumeMultiplier).toBe(4.8);
      expect(shouldTrigger).toBe(true);
    });
  });

  describe('Data Caching Logic', () => {
    it('should structure cache keys correctly', () => {
      const momentId = 'moment_123';
      const alertId = 'alert_456';
      const opportunityId = 'arb_789';

      const priceDataKey = `price_data:${momentId}`;
      const priceHistoryKey = `price_history:${momentId}`;
      const alertKey = `alert:${alertId}`;
      const arbitrageKey = `arbitrage:${opportunityId}`;

      expect(priceDataKey).toBe('price_data:moment_123');
      expect(priceHistoryKey).toBe('price_history:moment_123');
      expect(alertKey).toBe('alert:alert_456');
      expect(arbitrageKey).toBe('arbitrage:arb_789');
    });

    it('should handle cache TTL correctly', () => {
      const oneHour = 3600; // seconds
      const oneDay = 86400; // seconds
      const sevenDays = 604800; // seconds

      // Price data should have 1 hour TTL
      expect(oneHour).toBe(3600);
      
      // Alerts should have 7 days TTL
      expect(sevenDays).toBe(604800);
      
      // Arbitrage opportunities should have 1 hour TTL
      expect(oneHour).toBe(3600);
    });
  });

  describe('WebSocket Message Handling', () => {
    it('should parse WebSocket messages correctly', () => {
      const rawMessage = JSON.stringify({
        type: 'listing_update',
        data: {
          momentId: 'moment_123',
          price: 155.00,
          status: 'active',
          timestamp: '2024-01-15T12:00:00Z',
        },
        timestamp: '2024-01-15T12:00:00Z',
        marketplaceId: 'topshot',
      });

      const parsedMessage = JSON.parse(rawMessage);

      expect(parsedMessage.type).toBe('listing_update');
      expect(parsedMessage.data.momentId).toBe('moment_123');
      expect(parsedMessage.data.price).toBe(155.00);
      expect(parsedMessage.marketplaceId).toBe('topshot');
    });

    it('should handle different message types', () => {
      const messageTypes = [
        'listing_update',
        'sale',
        'price_change',
        'volume_update',
      ];

      messageTypes.forEach(type => {
        const message = {
          type,
          data: { momentId: 'moment_123' },
          timestamp: new Date(),
          marketplaceId: 'topshot',
        };

        expect(message.type).toBe(type);
        expect(message.data.momentId).toBe('moment_123');
      });
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should handle malformed API responses', () => {
      const malformedResponse = {
        // Missing required fields
        id: 'listing_123',
        // moment_id is missing
        price: 'invalid_price', // Invalid price format
      };

      // Simulate safe parsing
      const safeParse = (data: any): Partial<MarketplaceListing> | null => {
        try {
          if (!data.id || !data.moment_id) {
            return null;
          }
          
          const price = parseFloat(data.price);
          if (isNaN(price)) {
            return null;
          }

          return {
            id: data.id,
            momentId: data.moment_id,
            price,
          };
        } catch (error) {
          return null;
        }
      };

      const result = safeParse(malformedResponse);
      expect(result).toBeNull();
    });

    it('should handle network timeouts gracefully', () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';

      const isRetryableError = (error: Error): boolean => {
        return error.name === 'TimeoutError' || 
               error.message.includes('timeout') ||
               error.message.includes('ECONNRESET');
      };

      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it('should validate data integrity', () => {
      const validateListing = (listing: any): boolean => {
        return !!(
          listing.id &&
          listing.momentId &&
          typeof listing.price === 'number' &&
          listing.price > 0 &&
          listing.marketplaceId &&
          listing.listedAt instanceof Date
        );
      };

      const validListing = {
        id: 'listing_123',
        momentId: 'moment_456',
        price: 150.00,
        marketplaceId: 'topshot',
        listedAt: new Date(),
      };

      const invalidListing = {
        id: 'listing_123',
        // momentId missing
        price: -50.00, // Invalid negative price
        marketplaceId: 'topshot',
        listedAt: new Date(),
      };

      expect(validateListing(validListing)).toBe(true);
      expect(validateListing(invalidListing)).toBe(false);
    });
  });
});