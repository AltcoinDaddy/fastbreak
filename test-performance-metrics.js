// Test the performance metrics structure that was causing the original error
const { STRATEGY_TEMPLATES } = require('./services/strategy-service/dist/templates/strategy-templates');

console.log('🎯 Testing Performance Metrics Structure\n');

// Find the post-game spikes template
const postGameTemplate = STRATEGY_TEMPLATES.find(t => t.type === 'post_game_spikes');

if (postGameTemplate) {
  console.log('✓ Found post-game spikes template');
  console.log('✓ Template name:', postGameTemplate.name);
  
  const performanceMetrics = postGameTemplate.defaultParameters.postGameSpikes.performanceMetrics;
  console.log('✓ Performance metrics count:', performanceMetrics.length);
  
  performanceMetrics.forEach((metric, index) => {
    console.log(`  ${index + 1}. ${metric.name}: threshold=${metric.threshold}, weight=${metric.weight}`);
  });
  
  // Test that weights sum to 1.0
  const totalWeight = performanceMetrics.reduce((sum, metric) => sum + metric.weight, 0);
  console.log('✓ Total weight:', totalWeight);
  
  if (Math.abs(totalWeight - 1.0) < 0.01) {
    console.log('✅ Weights sum correctly to 1.0');
  } else {
    console.log('❌ Weights do not sum to 1.0');
  }
} else {
  console.log('❌ Could not find post-game spikes template');
}