import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// Validation schemas
const notificationRequestSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  type: Joi.string().valid('trade', 'budget', 'system', 'opportunity').required(),
  title: Joi.string().min(1).max(255).required(),
  message: Joi.string().min(1).max(2000).required(),
  priority: Joi.string().valid('low', 'medium', 'high').required(),
  channels: Joi.array().items(Joi.string().valid('database', 'email', 'push', 'webhook')).optional(),
  metadata: Joi.object().optional()
});

const pushSubscriptionSchema = Joi.object({
  subscription: Joi.object({
    endpoint: Joi.string().uri().required(),
    keys: Joi.object({
      p256dh: Joi.string().required(),
      auth: Joi.string().required()
    }).required()
  }).required()
});

const momentDetailsSchema = Joi.object({
  playerName: Joi.string().required(),
  momentType: Joi.string().required(),
  price: Joi.number().positive().required(),
  serialNumber: Joi.number().integer().positive().required(),
  scarcityRank: Joi.number().integer().positive().optional(),
  marketValue: Joi.number().positive().optional()
});

const budgetInfoSchema = Joi.object({
  currentSpending: Joi.number().min(0).required(),
  dailyLimit: Joi.number().positive().required(),
  remainingBudget: Joi.number().min(0).required(),
  percentageUsed: Joi.number().min(0).max(100).required()
});

const systemErrorSchema = Joi.object({
  type: Joi.string().required(),
  message: Joi.string().required(),
  service: Joi.string().required(),
  timestamp: Joi.date().required(),
  troubleshootingSteps: Joi.array().items(Joi.string()).optional()
});

/**
 * Validate notification request
 */
export function validateNotificationRequest(req: Request, res: Response, next: NextFunction): void {
  const { error } = notificationRequestSchema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid notification request',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate push subscription request
 */
export function validatePushSubscription(req: Request, res: Response, next: NextFunction): void {
  const { error } = pushSubscriptionSchema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid push subscription',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate purchase notification request
 */
export function validatePurchaseNotification(req: Request, res: Response, next: NextFunction): void {
  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    momentDetails: momentDetailsSchema.required(),
    reasoning: Joi.string().min(1).max(1000).required(),
    strategyUsed: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid purchase notification request',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate rare moment notification request
 */
export function validateRareMomentNotification(req: Request, res: Response, next: NextFunction): void {
  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    momentDetails: momentDetailsSchema.keys({
      scarcityRank: Joi.number().integer().positive().required(),
      marketValue: Joi.number().positive().required()
    }).required()
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid rare moment notification request',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate budget warning notification request
 */
export function validateBudgetWarningNotification(req: Request, res: Response, next: NextFunction): void {
  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    budgetInfo: budgetInfoSchema.required()
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid budget warning notification request',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate system error notification request
 */
export function validateSystemErrorNotification(req: Request, res: Response, next: NextFunction): void {
  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    error: systemErrorSchema.required()
  });

  const { error } = schema.validate(req.body);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid system error notification request',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate pagination parameters
 */
export function validatePagination(req: Request, res: Response, next: NextFunction): void {
  const schema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional()
  });

  const { error } = schema.validate(req.query);
  
  if (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid pagination parameters',
      details: error.details.map(detail => detail.message)
    });
    return;
  }
  
  next();
}

/**
 * Validate UUID parameter
 */
export function validateUuidParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const schema = Joi.string().uuid().required();
    const { error } = schema.validate(req.params[paramName]);
    
    if (error) {
      res.status(400).json({
        success: false,
        error: `Invalid ${paramName} parameter`,
        details: error.details.map(detail => detail.message)
      });
      return;
    }
    
    next();
  };
}

/**
 * Generic validation middleware factory
 */
export function validate(schema: Joi.ObjectSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const data = target === 'body' ? req.body : target === 'query' ? req.query : req.params;
    const { error } = schema.validate(data);
    
    if (error) {
      res.status(400).json({
        success: false,
        error: `Invalid ${target} data`,
        details: error.details.map(detail => detail.message)
      });
      return;
    }
    
    next();
  };
}