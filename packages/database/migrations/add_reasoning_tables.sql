-- AI Reasoning and Transparency System Tables

-- AI reasoning results table
CREATE TABLE ai_reasoning (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moment_id VARCHAR(255) NOT NULL REFERENCES moments(id),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decision VARCHAR(10) NOT NULL CHECK (decision IN ('buy', 'sell', 'hold', 'skip')),
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    primary_reasoning TEXT NOT NULL,
    supporting_reasons JSONB NOT NULL DEFAULT '[]',
    risk_factors JSONB NOT NULL DEFAULT '[]',
    key_statistics JSONB NOT NULL DEFAULT '{}',
    analysis_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reasoning factors table (normalized for better querying)
CREATE TABLE reasoning_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reasoning_id UUID NOT NULL REFERENCES ai_reasoning(id) ON DELETE CASCADE,
    factor_type VARCHAR(50) NOT NULL CHECK (factor_type IN (
        'player_performance', 'market_trend', 'scarcity', 'social_sentiment', 
        'technical_analysis', 'fundamental_analysis', 'risk_assessment'
    )),
    name VARCHAR(255) NOT NULL,
    weight DECIMAL(3,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
    value DECIMAL(10,4) NOT NULL,
    raw_value DECIMAL(10,4),
    impact DECIMAL(5,2) NOT NULL CHECK (impact >= -100 AND impact <= 100),
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    description TEXT NOT NULL,
    supporting_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Detailed reasoning context table
CREATE TABLE reasoning_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reasoning_id UUID NOT NULL REFERENCES ai_reasoning(id) ON DELETE CASCADE,
    player_analysis JSONB NOT NULL DEFAULT '{}',
    market_context JSONB NOT NULL DEFAULT '{}',
    scarcity_analysis JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reasoning outcomes table (for tracking accuracy)
CREATE TABLE reasoning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reasoning_id UUID NOT NULL REFERENCES ai_reasoning(id) ON DELETE CASCADE,
    actual_outcome JSONB NOT NULL,
    outcome_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    accuracy_score DECIMAL(3,2) CHECK (accuracy_score >= 0 AND accuracy_score <= 1),
    lessons_learned JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reasoning templates table
CREATE TABLE reasoning_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(100) UNIQUE NOT NULL,
    decision_type VARCHAR(50) NOT NULL,
    template_text TEXT NOT NULL,
    required_variables JSONB NOT NULL DEFAULT '[]',
    optional_variables JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reasoning insights table (for storing derived insights)
CREATE TABLE reasoning_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    supporting_evidence JSONB NOT NULL DEFAULT '[]',
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    actionable_recommendation TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reasoning performance metrics table
CREATE TABLE reasoning_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    total_decisions INTEGER NOT NULL DEFAULT 0,
    accurate_decisions INTEGER NOT NULL DEFAULT 0,
    accuracy_rate DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    confidence_calibration DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    factor_importance JSONB NOT NULL DEFAULT '{}',
    common_failures JSONB NOT NULL DEFAULT '[]',
    improvement_suggestions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(metric_date)
);

-- Indexes for performance
CREATE INDEX idx_ai_reasoning_moment_id ON ai_reasoning(moment_id);
CREATE INDEX idx_ai_reasoning_user_id ON ai_reasoning(user_id);
CREATE INDEX idx_ai_reasoning_decision ON ai_reasoning(decision);
CREATE INDEX idx_ai_reasoning_confidence ON ai_reasoning(confidence_score);
CREATE INDEX idx_ai_reasoning_created_at ON ai_reasoning(created_at);

CREATE INDEX idx_reasoning_factors_reasoning_id ON reasoning_factors(reasoning_id);
CREATE INDEX idx_reasoning_factors_type ON reasoning_factors(factor_type);
CREATE INDEX idx_reasoning_factors_weight ON reasoning_factors(weight);
CREATE INDEX idx_reasoning_factors_impact ON reasoning_factors(impact);

CREATE INDEX idx_reasoning_context_reasoning_id ON reasoning_context(reasoning_id);
CREATE INDEX idx_reasoning_outcomes_reasoning_id ON reasoning_outcomes(reasoning_id);
CREATE INDEX idx_reasoning_outcomes_timestamp ON reasoning_outcomes(outcome_timestamp);

CREATE INDEX idx_reasoning_templates_decision_type ON reasoning_templates(decision_type);
CREATE INDEX idx_reasoning_templates_active ON reasoning_templates(is_active);

CREATE INDEX idx_reasoning_insights_type ON reasoning_insights(insight_type);
CREATE INDEX idx_reasoning_insights_active ON reasoning_insights(is_active);

CREATE INDEX idx_reasoning_performance_date ON reasoning_performance(metric_date);

-- Full-text search indexes for reasoning content
CREATE INDEX idx_ai_reasoning_search ON ai_reasoning USING gin(to_tsvector('english', primary_reasoning || ' ' || COALESCE(supporting_reasons::text, '')));
CREATE INDEX idx_reasoning_factors_search ON reasoning_factors USING gin(to_tsvector('english', name || ' ' || description));

-- Triggers for updated_at timestamps
CREATE TRIGGER update_ai_reasoning_updated_at BEFORE UPDATE ON ai_reasoning FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reasoning_templates_updated_at BEFORE UPDATE ON reasoning_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reasoning_insights_updated_at BEFORE UPDATE ON reasoning_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default reasoning templates
INSERT INTO reasoning_templates (template_id, decision_type, template_text, required_variables, optional_variables) VALUES
('buy_strong_performance', 'buy', 'Player {player_name} just scored {points} points with {rebounds} rebounds, showing {performance_trend} performance. Current price of ${current_price} is {price_assessment} compared to fair value of ${fair_value}. {additional_factors}', 
 '["player_name", "points", "rebounds", "performance_trend", "current_price", "price_assessment", "fair_value"]', 
 '["additional_factors", "risk_note"]'),

('buy_undervalued', 'buy', 'Moment appears undervalued at ${current_price} vs fair value of ${fair_value} ({discount_percentage}% discount). {scarcity_factor} and {market_context}. Confidence: {confidence_level}%', 
 '["current_price", "fair_value", "discount_percentage", "scarcity_factor", "market_context", "confidence_level"]', 
 '["risk_factors"]'),

('skip_overvalued', 'skip', 'Current price of ${current_price} exceeds fair value of ${fair_value} by {premium_percentage}%. {market_reasoning} Risk factors include: {risk_factors}', 
 '["current_price", "fair_value", "premium_percentage", "market_reasoning", "risk_factors"]', 
 '["alternative_suggestion"]'),

('hold_uncertain', 'hold', 'Mixed signals for this moment. {positive_factors} but {negative_factors}. Confidence too low ({confidence_level}%) for action. Monitoring for: {watch_factors}', 
 '["positive_factors", "negative_factors", "confidence_level", "watch_factors"]', 
 '["timeline"]');