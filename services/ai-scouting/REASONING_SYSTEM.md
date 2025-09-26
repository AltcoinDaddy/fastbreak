# AI Reasoning and Transparency System

## Overview

The AI Reasoning and Transparency System provides comprehensive explanations for all AI-driven decisions in the FastBreak NBA Top Shot auto-collector. This system ensures users understand why the AI made specific trading decisions and provides transparency into the decision-making process.

## Features

### 🧠 Detailed Reasoning Generation
- **Factor Analysis**: Breaks down decisions into weighted factors (player performance, market trends, scarcity, social sentiment)
- **Impact Calculation**: Shows how each factor contributes to the final decision
- **Confidence Scoring**: Provides confidence levels for each factor and overall decision
- **Risk Assessment**: Identifies potential risks and mitigation strategies

### 📊 Human-Friendly Explanations
- **Plain English Summaries**: Converts technical analysis into understandable explanations
- **Key Statistics**: Highlights the most important numbers that influenced the decision
- **Market Context**: Explains current market conditions and trends
- **Decision Factors**: Lists the top factors that led to the recommendation

### 🔍 Reasoning History and Search
- **Complete History**: Stores all reasoning for every decision made
- **Advanced Search**: Filter by moment, player, decision type, confidence level, date range
- **Performance Tracking**: Monitor accuracy of past decisions
- **Learning Insights**: Identify patterns and improve future decisions

### 📈 Performance Monitoring
- **Accuracy Metrics**: Track how often AI decisions prove correct
- **Confidence Calibration**: Measure how well confidence scores match actual outcomes
- **Factor Importance**: Rank which factors are most predictive
- **Failure Mode Analysis**: Identify common failure patterns and improvement opportunities

## Architecture

### Core Components

1. **ReasoningService**: Main service for generating and managing reasoning
2. **ReasoningFactor**: Individual factors that contribute to decisions
3. **AIReasoningResult**: Complete reasoning output with all details
4. **ReasoningExplanation**: Human-friendly explanation of the reasoning
5. **ReasoningHistory**: Historical record of all reasoning for analysis

### Database Schema

The system uses several PostgreSQL tables:

- `ai_reasoning`: Main reasoning records
- `reasoning_factors`: Individual factors for each reasoning
- `reasoning_context`: Detailed context (player, market, scarcity analysis)
- `reasoning_outcomes`: Actual outcomes for accuracy tracking
- `reasoning_templates`: Templates for generating explanations
- `reasoning_performance`: Performance metrics over time

## API Endpoints

### Get Moment Reasoning
```http
GET /reasoning/moment/{moment_id}?limit=10
```
Returns reasoning history for a specific moment.

### Get Human Explanation
```http
GET /reasoning/moment/{moment_id}/explanation
```
Returns a human-friendly explanation of the latest reasoning.

### Search Reasoning
```http
POST /reasoning/search
```
Search reasoning history with filters:
```json
{
  "moment_ids": ["moment_123"],
  "decision_types": ["buy", "sell"],
  "date_from": "2024-01-01T00:00:00",
  "date_to": "2024-01-31T23:59:59",
  "min_confidence": 0.7,
  "limit": 50,
  "offset": 0
}
```

### Performance Metrics
```http
GET /reasoning/performance?days_back=30
```
Returns performance metrics for the reasoning system.

### Factor Importance
```http
GET /reasoning/factors/importance?days_back=30
```
Returns ranking of factor importance over time.

### Decisions Summary
```http
GET /reasoning/decisions/summary?days_back=7
```
Returns summary of recent decisions and confidence levels.

### Confidence Distribution
```http
GET /reasoning/confidence/distribution?days_back=30
```
Returns distribution of confidence scores over time.

## Usage Examples

### Generating Reasoning for a Decision

```python
from src.services.reasoning_service import ReasoningService
from src.models.moment_analysis import MomentAnalysisResult

# Create reasoning service
reasoning_service = ReasoningService(db_client)

# Generate detailed reasoning
reasoning_result = reasoning_service.generate_detailed_reasoning(
    analysis_result=moment_analysis,
    user_id="user_123"
)

# Store reasoning in database
reasoning_id = await reasoning_service.store_reasoning(
    reasoning_result=reasoning_result,
    user_id="user_123"
)
```

### Getting Human-Friendly Explanation

```python
# Get reasoning history
reasoning_results = await reasoning_service.get_reasoning_by_moment(
    moment_id="moment_123",
    limit=1
)

# Generate explanation
explanation = reasoning_service.generate_human_explanation(
    reasoning_results[0]
)

print(explanation.summary)
# Output: "AI recommends to purchase this moment with 85% confidence."

print(explanation.key_factors)
# Output: ["Player Performance Analysis: Strong recent performance", ...]
```

### Searching Reasoning History

```python
from src.models.reasoning import ReasoningSearchQuery

# Create search query
search_query = ReasoningSearchQuery(
    decision_types=["buy"],
    min_confidence=0.8,
    date_from=datetime.now() - timedelta(days=30),
    limit=100
)

# Search reasoning
search_result = await reasoning_service.search_reasoning(search_query)

print(f"Found {search_result.total_count} high-confidence buy decisions")
```

## Reasoning Factor Types

### Player Performance Factors
- Recent game performance trends
- Season consistency metrics
- Career trajectory analysis
- Clutch performance statistics
- Injury status and recovery

### Market Trend Factors
- Price momentum and direction
- Volume trends and liquidity
- Market sentiment indicators
- Comparable sales analysis
- Arbitrage opportunities

### Scarcity Factors
- Serial number rarity
- Moment type distribution
- Player moment availability
- Total circulation analysis
- Collector demand patterns

### Social Sentiment Factors
- Social media mentions
- Sentiment analysis scores
- Viral potential indicators
- Influencer endorsements
- Community engagement

## Performance Metrics

### Accuracy Tracking
- **Decision Accuracy**: Percentage of decisions that prove profitable
- **Confidence Calibration**: How well confidence scores match actual outcomes
- **Factor Performance**: Which factors are most predictive of success

### Improvement Suggestions
The system automatically generates suggestions for improvement:
- Data quality enhancements
- Model recalibration needs
- Factor weight adjustments
- New data source recommendations

## Configuration

### Environment Variables
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/fastbreak
REDIS_URL=redis://localhost:6379
AI_REASONING_LOG_LEVEL=INFO
```

### Reasoning Templates
The system uses templates to generate consistent explanations:
```sql
INSERT INTO reasoning_templates (template_id, decision_type, template_text) VALUES
('buy_strong_performance', 'buy', 'Player {player_name} just scored {points} points...');
```

## Testing

### Unit Tests
```bash
cd services/ai-scouting
python -m pytest tests/test_reasoning_service.py -v
python -m pytest tests/test_reasoning_routes.py -v
```

### Basic Functionality Test
```bash
cd services/ai-scouting
python test_reasoning_basic.py
```

## Monitoring and Alerts

### Key Metrics to Monitor
- Reasoning generation latency
- Database query performance
- Accuracy rate trends
- Confidence calibration drift
- Factor importance changes

### Alerts
- Low accuracy rates (< 60%)
- Poor confidence calibration (< 0.7)
- High reasoning generation failures
- Database connection issues

## Security Considerations

### Data Privacy
- User-specific reasoning can be filtered by user_id
- Sensitive information is not logged in reasoning explanations
- Database access is restricted to authorized services

### Performance
- Reasoning generation is cached for 30 minutes
- Database queries are optimized with proper indexing
- Large search results are paginated

## Future Enhancements

### Planned Features
- **Visual Reasoning**: Generate charts and graphs to explain decisions
- **Interactive Explanations**: Allow users to explore different scenarios
- **Reasoning Comparison**: Compare reasoning across similar moments
- **Automated Learning**: Automatically adjust factor weights based on outcomes
- **Natural Language Queries**: Allow users to ask questions about reasoning

### Integration Opportunities
- **Dashboard Widgets**: Embed reasoning explanations in the main dashboard
- **Mobile Notifications**: Send reasoning summaries with trade notifications
- **API Extensions**: Provide reasoning data to third-party applications
- **Machine Learning Pipeline**: Use reasoning data to improve AI models

## Troubleshooting

### Common Issues

1. **Reasoning Generation Fails**
   - Check database connectivity
   - Verify analysis result format
   - Review factor validation errors

2. **Poor Explanation Quality**
   - Update reasoning templates
   - Improve factor descriptions
   - Enhance supporting data

3. **Performance Issues**
   - Check database query performance
   - Review caching configuration
   - Monitor memory usage

### Debug Mode
Enable detailed logging:
```python
import logging
logging.getLogger('src.services.reasoning_service').setLevel(logging.DEBUG)
```

## Contributing

### Adding New Factor Types
1. Add new enum value to `ReasoningFactorType`
2. Update factor conversion logic in `_convert_to_reasoning_factor`
3. Add corresponding analysis in context generation methods
4. Update tests and documentation

### Improving Explanations
1. Add new templates to `reasoning_templates` table
2. Update `generate_human_explanation` method
3. Test with various decision scenarios
4. Gather user feedback on clarity

---

For more information, see the [FastBreak Documentation](../../README.md) or contact the development team.