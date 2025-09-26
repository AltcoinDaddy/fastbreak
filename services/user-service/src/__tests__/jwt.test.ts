import { JWTService } from '../auth/jwt';
import jwt from 'jsonwebtoken';

describe('JWTService', () => {
  let jwtService: JWTService;
  const secret = 'test-secret-key';
  const mockUser = {
    id: 'user-123',
    walletAddress: '0x1234567890abcdef',
    strategies: [],
    budgetLimits: {} as any,
    notificationPreferences: {} as any,
    createdAt: new Date(),
    lastActive: new Date(),
  };

  beforeEach(() => {
    jwtService = new JWTService(secret, '1h');
  });

  describe('constructor', () => {
    it('should create JWTService with valid secret', () => {
      expect(() => new JWTService(secret)).not.toThrow();
    });

    it('should throw error if no secret provided', () => {
      expect(() => new JWTService('')).toThrow('JWT secret is required');
    });
  });

  describe('generateToken', () => {
    it('should generate valid access token', () => {
      const token = jwtService.generateToken(mockUser);
      
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

      // Verify token structure
      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.walletAddress).toBe(mockUser.walletAddress);
      expect(decoded.iss).toBe('fastbreak-api');
      expect(decoded.aud).toBe('fastbreak-users');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate valid refresh token', () => {
      const token = jwtService.generateRefreshToken(mockUser);
      
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      // Verify token structure
      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.walletAddress).toBe(mockUser.walletAddress);
      expect(decoded.iss).toBe('fastbreak-api');
      expect(decoded.aud).toBe('fastbreak-refresh');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid access token', () => {
      const token = jwtService.generateToken(mockUser);
      const payload = jwtService.verifyToken(token);

      expect(payload.userId).toBe(mockUser.id);
      expect(payload.walletAddress).toBe(mockUser.walletAddress);
    });

    it('should throw error for invalid token', () => {
      expect(() => jwtService.verifyToken('invalid-token'))
        .toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { userId: mockUser.id, walletAddress: mockUser.walletAddress },
        secret,
        { expiresIn: '-1h', issuer: 'fastbreak-api', audience: 'fastbreak-users' }
      );

      expect(() => jwtService.verifyToken(expiredToken))
        .toThrow('Token has expired');
    });

    it('should throw error for token with wrong audience', () => {
      const wrongAudienceToken = jwt.sign(
        { userId: mockUser.id, walletAddress: mockUser.walletAddress },
        secret,
        { expiresIn: '1h', issuer: 'fastbreak-api', audience: 'wrong-audience' }
      );

      expect(() => jwtService.verifyToken(wrongAudienceToken))
        .toThrow('Invalid token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const token = jwtService.generateRefreshToken(mockUser);
      const payload = jwtService.verifyRefreshToken(token);

      expect(payload.userId).toBe(mockUser.id);
      expect(payload.walletAddress).toBe(mockUser.walletAddress);
    });

    it('should throw error for access token used as refresh token', () => {
      const accessToken = jwtService.generateToken(mockUser);
      
      expect(() => jwtService.verifyRefreshToken(accessToken))
        .toThrow('Invalid refresh token');
    });
  });

  describe('decodeToken', () => {
    it('should decode valid token without verification', () => {
      const token = jwtService.generateToken(mockUser);
      const payload = jwtService.decodeToken(token);

      expect(payload).toBeTruthy();
      expect(payload!.userId).toBe(mockUser.id);
      expect(payload!.walletAddress).toBe(mockUser.walletAddress);
    });

    it('should return null for invalid token', () => {
      const payload = jwtService.decodeToken('invalid-token');
      expect(payload).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const token = jwtService.generateToken(mockUser);
      const isExpired = jwtService.isTokenExpired(token);
      
      expect(isExpired).toBe(false);
    });

    it('should return true for expired token', () => {
      const expiredToken = jwt.sign(
        { userId: mockUser.id, walletAddress: mockUser.walletAddress },
        secret,
        { expiresIn: '-1h' }
      );

      const isExpired = jwtService.isTokenExpired(expiredToken);
      expect(isExpired).toBe(true);
    });

    it('should return true for invalid token', () => {
      const isExpired = jwtService.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });

    it('should return true for token without expiration', () => {
      const tokenWithoutExp = jwt.sign(
        { userId: mockUser.id, walletAddress: mockUser.walletAddress },
        secret
        // No expiresIn specified
      );

      const isExpired = jwtService.isTokenExpired(tokenWithoutExp);
      expect(isExpired).toBe(true);
    });
  });
});