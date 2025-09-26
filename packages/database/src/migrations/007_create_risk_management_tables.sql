-- Migration: Create Risk Management Tables
-- Description: Creates tables for budget limits, spending tracking, risk alerts, and emergency stops

-- Budget Limits Table
CREATE TABLE IF NOT EXISTS budget_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    daily_spending_cap DECIMAL(15,2) NOT NULL DEFAULT 1000.00,
    weekly_spending_cap DECIMAL(15,2) NOT NULL DEFAULT 5000.00,
    monthly_spending_cap DECIMAL(15,2) NOT NULL DEFAULT 20000.00,
    max_price_per_moment DECIMAL(15,2) NOT NULL DEFAULT 500.00,
    total_budget_limit DECIMAL(15,2) NOT NULL DEFAULT 100000.00,
    emergency_stop_threshold DECIMAL(15,2) NOT NULL DEFAULT 50000.00,
    reserve_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    auto_rebalance BOOLEAN NOT NULL DEFAULT true,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spending Tracker Table
CREATE TABLE IF NOT EXISTS spending_tracker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_spent DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    weekly_spent DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    monthly_spent DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    total_spent DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    average_transaction_size DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    largest_transaction DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk Alerts Table
CREATE TABLE IF NOT EXISTS risk_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'budget_exceeded',
        'daily_limit_reached',
        'concentration_risk',
        'drawdown_exceeded',
        'volatility_spike',
        'correlation_increase',
        'liquidity_risk',
        'stop_loss_triggered',
        'emergency_stop',
        'suspicious_activity'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    threshold DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    current_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    triggered BOOLEAN NOT NULL DEFAULT false,
    triggered_at TIMESTAMP WITH TIME ZONE,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    auto_resolve BOOLEAN NOT NULL DEFAULT false,
    resolution_action TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Emergency Stops Table
CREATE TABLE IF NOT EXISTS emergency_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    triggered_by VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    trigger_conditions JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    impact JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_limits_user_id ON budget_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_limits_updated_at ON budget_limits(updated_at);

CREATE INDEX IF NOT EXISTS idx_spending_tracker_user_id ON spending_tracker(user_id);
CREATE INDEX IF NOT EXISTS idx_spending_tracker_date ON spending_tracker(date);
CREATE INDEX IF NOT EXISTS idx_spending_tracker_user_date ON spending_tracker(user_id, date);

CREATE INDEX IF NOT EXISTS idx_risk_alerts_user_id ON risk_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_type ON risk_alerts(type);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_severity ON risk_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_triggered ON risk_alerts(triggered);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_acknowledged ON risk_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_created_at ON risk_alerts(created_at);

CREATE INDEX IF NOT EXISTS idx_emergency_stops_user_id ON emergency_stops(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_stops_is_active ON emergency_stops(is_active);
CREATE INDEX IF NOT EXISTS idx_emergency_stops_triggered_at ON emergency_stops(triggered_at);

-- Constraints
ALTER TABLE budget_limits ADD CONSTRAINT chk_budget_limits_positive_amounts 
    CHECK (
        daily_spending_cap > 0 AND 
        weekly_spending_cap > 0 AND 
        monthly_spending_cap > 0 AND 
        max_price_per_moment > 0 AND 
        total_budget_limit > 0 AND 
        emergency_stop_threshold > 0 AND
        reserve_amount >= 0
    );

ALTER TABLE budget_limits ADD CONSTRAINT chk_budget_limits_hierarchy 
    CHECK (
        weekly_spending_cap >= daily_spending_cap AND
        monthly_spending_cap >= weekly_spending_cap AND
        total_budget_limit >= monthly_spending_cap AND
        emergency_stop_threshold <= total_budget_limit
    );

ALTER TABLE spending_tracker ADD CONSTRAINT chk_spending_tracker_positive_amounts 
    CHECK (
        daily_spent >= 0 AND 
        weekly_spent >= 0 AND 
        monthly_spent >= 0 AND 
        total_spent >= 0 AND
        transaction_count >= 0 AND
        average_transaction_size >= 0 AND
        largest_transaction >= 0
    );

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_limits_user_active 
    ON budget_limits(user_id) 
    WHERE updated_at = (SELECT MAX(updated_at) FROM budget_limits bl WHERE bl.user_id = budget_limits.user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spending_tracker_user_date_unique 
    ON spending_tracker(user_id, date);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_budget_limits_updated_at 
    BEFORE UPDATE ON budget_limits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spending_tracker_updated_at 
    BEFORE UPDATE ON spending_tracker 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();