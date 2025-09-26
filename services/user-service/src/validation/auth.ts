import Joi from 'joi';

// Flow wallet address validation
const flowAddressSchema = Joi.string()
  .pattern(/^0x[a-fA-F0-9]{16}$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid Flow wallet address format',
    'any.required': 'Wallet address is required',
  });

// Wallet authentication request validation
export const walletAuthSchema = Joi.object({
  walletAddress: flowAddressSchema,
  message: Joi.string()
    .min(50)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Authentication message too short',
      'string.max': 'Authentication message too long',
      'any.required': 'Authentication message is required',
    }),
  signatures: Joi.array()
    .items(
      Joi.object({
        addr: flowAddressSchema,
        keyId: Joi.number().integer().min(0).required(),
        signature: Joi.string().required(),
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one signature is required',
      'any.required': 'Signatures are required',
    }),
});

// Refresh token request validation
export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required',
    }),
});

// User profile update validation
export const updateProfileSchema = Joi.object({
  notificationPreferences: Joi.object({
    email: Joi.string().email().allow(null, '').optional(),
    pushEnabled: Joi.boolean().optional(),
    tradeNotifications: Joi.boolean().optional(),
    budgetAlerts: Joi.boolean().optional(),
    systemAlerts: Joi.boolean().optional(),
  }).optional(),
  budgetLimits: Joi.object({
    dailySpendingCap: Joi.number().positive().max(100000).optional(),
    maxPricePerMoment: Joi.number().positive().max(50000).optional(),
    totalBudgetLimit: Joi.number().positive().max(1000000).optional(),
    emergencyStopThreshold: Joi.number().positive().max(500000).optional(),
  }).optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

// Strategy configuration validation
export const strategyConfigSchema = Joi.object({
  type: Joi.string()
    .valid('rookie_risers', 'post_game_spikes', 'arbitrage_mode')
    .required(),
  parameters: Joi.when('type', {
    is: 'rookie_risers',
    then: Joi.object({
      performanceThreshold: Joi.number().min(0).max(1).required(),
      priceLimit: Joi.number().positive().max(10000).required(),
      minGamesPlayed: Joi.number().integer().min(1).max(100).required(),
    }),
    otherwise: Joi.when('type', {
      is: 'post_game_spikes',
      then: Joi.object({
        performanceMetrics: Joi.array()
          .items(Joi.string().valid('points', 'rebounds', 'assists', 'steals', 'blocks'))
          .min(1)
          .required(),
        timeWindow: Joi.number().integer().min(1).max(168).required(), // 1 hour to 1 week
        priceChangeThreshold: Joi.number().min(0).max(1).required(),
      }),
      otherwise: Joi.object({
        priceDifferenceThreshold: Joi.number().min(0).max(1).required(),
        maxExecutionTime: Joi.number().integer().min(1).max(300).required(), // 1 to 300 seconds
        marketplaces: Joi.array()
          .items(Joi.string())
          .min(2)
          .required(),
      }),
    }),
  }),
});

// Validation middleware factory
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join(', ');
      
      return res.status(400).json({
        success: false,
        error: `Validation error: ${errorMessage}`,
        timestamp: new Date(),
      });
    }

    req.body = value;
    next();
  };
};

// Query parameter validation
export const validateWalletAddress = (req: any, res: any, next: any) => {
  const { walletAddress } = req.params;
  
  const { error } = flowAddressSchema.validate(walletAddress);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid wallet address format',
      timestamp: new Date(),
    });
  }
  
  next();
};

// Pagination validation
export const validatePagination = (req: any, res: any, next: any) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().valid('created_at', 'updated_at', 'name').default('created_at'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  });

  const { error, value } = schema.validate(req.query);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: `Query validation error: ${error.details[0].message}`,
      timestamp: new Date(),
    });
  }

  req.query = value;
  next();
};