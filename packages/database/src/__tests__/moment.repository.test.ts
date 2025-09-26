import { MomentRepository } from '../repositories/moment';
import { Moment } from '@fastbreak/types';

// Mock the database connection
const mockDb = {
  query: jest.fn(),
} as any;

describe('MomentRepository', () => {
  let momentRepo: MomentRepository;

  beforeEach(() => {
    momentRepo = new MomentRepository(mockDb);
    jest.clearAllMocks();
  });

  describe('createOrUpdateMoment', () => {
    it('should create new moment', async () => {
      const mockMoment = {
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockMoment] });

      const momentData: Omit<Moment, 'id'> = {
        playerId: 'player1',
        playerName: 'LeBron James',
        gameDate: new Date('2024-01-15'),
        momentType: 'Dunk',
        serialNumber: 123,
        currentPrice: 150.00,
        aiValuation: 200.00,
        confidence: 0.85,
        marketplaceId: 'topshot',
        scarcityRank: 5,
      };

      const result = await momentRepo.createOrUpdateMoment(momentData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO moments'),
        expect.arrayContaining(['player1_123', 'player1', 'LeBron James'])
      );
      expect(result.playerName).toBe('LeBron James');
      expect(result.currentPrice).toBe(150.00);
    });

    it('should update existing moment on conflict', async () => {
      const mockMoment = {
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 175.00, // Updated price
        ai_valuation: 220.00, // Updated valuation
        confidence: 0.90, // Updated confidence
        marketplace_id: 'topshot',
        scarcity_rank: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockMoment] });

      const momentData: Omit<Moment, 'id'> = {
        playerId: 'player1',
        playerName: 'LeBron James',
        gameDate: new Date('2024-01-15'),
        momentType: 'Dunk',
        serialNumber: 123,
        currentPrice: 175.00,
        aiValuation: 220.00,
        confidence: 0.90,
        marketplaceId: 'topshot',
        scarcityRank: 5,
      };

      const result = await momentRepo.createOrUpdateMoment(momentData);

      expect(result.currentPrice).toBe(175.00);
      expect(result.aiValuation).toBe(220.00);
      expect(result.confidence).toBe(0.90);
    });
  });

  describe('getMomentsByPlayer', () => {
    it('should return moments for specific player', async () => {
      const mockMoments = [{
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
      }];

      jest.spyOn(momentRepo as any, 'findByCondition').mockResolvedValue(
        mockMoments.map(m => momentRepo['mapRowToEntity'](m))
      );

      const result = await momentRepo.getMomentsByPlayer('player1', 25);

      expect(momentRepo['findByCondition']).toHaveBeenCalledWith(
        'player_id = $1 ORDER BY game_date DESC LIMIT $2',
        ['player1', 25]
      );
      expect(result).toHaveLength(1);
      expect(result[0].playerName).toBe('LeBron James');
    });
  });

  describe('getUndervaluedMoments', () => {
    it('should return moments where AI valuation exceeds current price', async () => {
      const mockMoments = [{
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00, // Higher than current price
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
      }];

      mockDb.query.mockResolvedValue({ rows: mockMoments });

      const result = await momentRepo.getUndervaluedMoments(0.8, 50);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ai_valuation > current_price'),
        [0.8, 50]
      );
      expect(result).toHaveLength(1);
      expect(result[0].aiValuation).toBeGreaterThan(result[0].currentPrice);
    });
  });

  describe('getMomentsByMarketplace', () => {
    it('should return moments from specific marketplace', async () => {
      const mockMoments = [{
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
      }];

      jest.spyOn(momentRepo as any, 'findByCondition').mockResolvedValue(
        mockMoments.map(m => momentRepo['mapRowToEntity'](m))
      );

      const result = await momentRepo.getMomentsByMarketplace('topshot', 100);

      expect(momentRepo['findByCondition']).toHaveBeenCalledWith(
        'marketplace_id = $1 ORDER BY updated_at DESC LIMIT $2',
        ['topshot', 100]
      );
      expect(result).toHaveLength(1);
      expect(result[0].marketplaceId).toBe('topshot');
    });
  });

  describe('updateMomentPrice', () => {
    it('should update moment price', async () => {
      const mockMoment = {
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 175.00, // Updated price
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockMoment] });

      const result = await momentRepo.updateMomentPrice('player1_123', 175.00);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE moments'),
        [175.00, 'player1_123']
      );
      expect(result!.currentPrice).toBe(175.00);
    });

    it('should return null if moment not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await momentRepo.updateMomentPrice('nonexistent', 100.00);

      expect(result).toBeNull();
    });
  });

  describe('updateMomentValuation', () => {
    it('should update AI valuation and confidence', async () => {
      const mockMoment = {
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 220.00, // Updated valuation
        confidence: 0.90, // Updated confidence
        marketplace_id: 'topshot',
        scarcity_rank: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockMoment] });

      const result = await momentRepo.updateMomentValuation('player1_123', 220.00, 0.90);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET ai_valuation = $1, confidence = $2'),
        [220.00, 0.90, 'player1_123']
      );
      expect(result!.aiValuation).toBe(220.00);
      expect(result!.confidence).toBe(0.90);
    });
  });

  describe('searchMoments', () => {
    it('should search moments by player name and moment type', async () => {
      const mockMoments = [{
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
      }];

      mockDb.query.mockResolvedValue({ rows: mockMoments });

      const result = await momentRepo.searchMoments('LeBron', {
        minPrice: 100,
        maxPrice: 300,
        minConfidence: 0.8,
        marketplaceId: 'topshot'
      }, 25);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('player_name ILIKE $1 OR moment_type ILIKE $1'),
        expect.arrayContaining(['%LeBron%', 100, 300, 0.8, 'topshot', 25])
      );
      expect(result).toHaveLength(1);
      expect(result[0].playerName).toBe('LeBron James');
    });

    it('should search without filters', async () => {
      const mockMoments = [{
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
      }];

      mockDb.query.mockResolvedValue({ rows: mockMoments });

      const result = await momentRepo.searchMoments('Dunk', undefined, 50);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('player_name ILIKE $1 OR moment_type ILIKE $1'),
        ['%Dunk%', 50]
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getMomentPriceHistory', () => {
    it('should return price history for moment', async () => {
      const mockMoment = {
        id: 'player1_123',
        player_id: 'player1',
        player_name: 'LeBron James',
        game_date: new Date('2024-01-15'),
        moment_type: 'Dunk',
        serial_number: 123,
        current_price: 150.00,
        ai_valuation: 200.00,
        confidence: 0.85,
        marketplace_id: 'topshot',
        scarcity_rank: 5,
      };

      jest.spyOn(momentRepo as any, 'findById').mockResolvedValue(
        momentRepo['mapRowToEntity'](mockMoment)
      );

      const result = await momentRepo.getMomentPriceHistory('player1_123', 30);

      expect(result).toHaveLength(1);
      expect(result[0].price).toBe(150.00);
      expect(result[0].date).toBeInstanceOf(Date);
    });

    it('should return empty array if moment not found', async () => {
      jest.spyOn(momentRepo as any, 'findById').mockResolvedValue(null);

      const result = await momentRepo.getMomentPriceHistory('nonexistent', 30);

      expect(result).toEqual([]);
    });
  });
});