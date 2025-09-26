// Quick test script to verify the strategy service fixes
const { StrategyValidator } = require('./services/strategy-service/dist/validators/strategy-validator');
const { STRATEGY_TEMPLATES } = require('./services/strategy-service/dist/templates/strategy-templates');

console.log('🧪 Testing Strategy Service Fixes\n');

// Test 1: Check that templates load correctly
console.log('1. Testing Strategy Templates:');
console.log(`   Found ${STRATEGY_TEMPLATES.length} strategy templates`);
STRATEGY_TEMPLATES.forEach(template => {
  console.log(`   ✓ ${template.name} (${template.type})`);
});

// Test 2: Test parameter validation
console.log('\n2. Testing Parameter Validation:');

const testParameters = {
  postGameSpikes: {
    performanceMetrics: [
      { name: 'points', threshold: 30, comparison: 'greater_than', weight: 0.4 },
      { name: 'rebounds', threshold: 12, comparison: 'greater_than', weight: 0.6 }
    ],
    timeWindow: 2,
    priceChangeThreshold: 0.05,
    volumeThreshold: 2.0,
    gameTypes: ['regular_season'],
    playerTiers: ['superstar'],
    momentTypes: ['dunk'],
    maxPriceMultiplier: 1.5,
    socialSentimentWeight: 0.3
  }
};

try {
  const validation = StrategyValidator.validateStrategyParameters(
    testParameters, 
    'post_game_spikes_aggressive'
  );
  
  if (validation.isValid) {
    console.log('   ✓ Parameter validation passed');
  } else {
    console.log('   ✗ Parameter validation failed:', validation.errors);
  }
} catch (error) {
  console.log('   ✗ Error during validation:', error.message);
}

// Test 3: Test strategy compatibility
console.log('\n3. Testing Strategy Compatibility:');

const mockStrategies = [
  {
    budgetAllocation: { percentage: 0.3, maxAmount: 1000, dailyLimit: 100 },
    riskControls: { maxConcurrentTrades: 3 },
    templateId: 'rookie_risers_basic',
    isActive: true
  },
  {
    budgetAllocation: { percentage: 0.4, maxAmount: 1000, dailyLimit: 100 },
    riskControls: { maxConcurrentTrades: 2 },
    templateId: 'arbitrage_conservative',
    isActive: true
  }
];

try {
  const compatibility = StrategyValidator.validateCompatibility(mockStrategies);
  
  if (compatibility.isValid) {
    console.log('   ✓ Strategy compatibility check passed');
    if (compatibility.warnings.length > 0) {
      console.log('   ⚠️  Warnings:', compatibility.warnings);
    }
  } else {
    console.log('   ✗ Strategy compatibility failed:', compatibility.errors);
  }
} catch (error) {
  console.log('   ✗ Error during compatibility check:', error.message);
}

console.log('\n✅ Test completed!');