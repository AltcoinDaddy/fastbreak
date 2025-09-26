import jwt from 'jsonwebtoken';
import { User } from '@fastbreak/types';

export interface JWTPayload {
  userId: string;
  walletAddress: string;
  iat?: number;
  exp?: number;
}

export class JWTService {
  private secret: string;
  private expiresIn: string;

  constructor(secret: string, expiresIn = '24h') {
    if (!secret) {
      throw new Error('JWT secret is required');
    }
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  public generateToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      walletAddress: user.walletAddress,
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn,
      issuer: 'fastbreak-api',
      audience: 'fastbreak-users',
    });
  }

  public generateRefreshToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      walletAddress: user.walletAddress,
    };

    return jwt.sign(payload, this.secret, {
      expiresIn: '7d', // Refresh tokens last longer
      issuer: 'fastbreak-api',
      audience: 'fastbreak-refresh',
    });
  }

  public verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: 'fastbreak-api',
        audience: 'fastbreak-users',
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  public verifyRefreshToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.secret, {
        issuer: 'fastbreak-api',
        audience: 'fastbreak-refresh',
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else {
        throw new Error('Refresh token verification failed');
      }
    }
  }

  public decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  public isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  }
}