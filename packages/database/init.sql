-- FastBreak Database Schema

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(18) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User strategies table
CREATE TABLE strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('rookie_risers', 'post_game_spikes', 'arbitrage_mode')),
    parameters JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Budget limits table
CREATE TABLE budget_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    daily_spending_cap DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
    max_price_per_moment DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    total_budget_limit DECIMAL(10,2) NOT NULL DEFAULT 10000.00,
    emergency_stop_threshold DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    push_enabled BOOLEAN DEFAULT true,
    trade_notifications BOOLEAN DEFAULT true,
    budget_alerts BOOLEAN DEFAULT true,
    system_alerts BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Moments table
CREATE TABLE moments (
    id VARCHAR(255) PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    player_name VARCHAR(255) NOT NULL,
    game_date DATE NOT NULL,
    moment_type VARCHAR(100) NOT NULL,
    serial_number INTEGER NOT NULL,
    current_price DECIMAL(10,2),
    ai_valuation DECIMAL(10,2),
    confidence DECIMAL(3,2),
    marketplace_id VARCHAR(255) NOT NULL,
    scarcity_rank INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trades table
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    moment_id VARCHAR(255) NOT NULL REFERENCES moments(id),
    action VARCHAR(10) NOT NULL CHECK (action IN ('buy', 'sell')),
    price DECIMAL(10,2) NOT NULL,
    reasoning TEXT,
    strategy_used VARCHAR(50),
    profit_loss DECIMAL(10,2),
    transaction_hash VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Analysis table
CREATE TABLE ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moment_id VARCHAR(255) NOT NULL REFERENCES moments(id),
    fair_value DECIMAL(10,2) NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    factors JSONB NOT NULL,
    recommendation VARCHAR(10) NOT NULL CHECK (recommendation IN ('buy', 'hold', 'sell', 'skip')),
    risk_score DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('trade', 'budget', 'system', 'opportunity')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(10) NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Strategy performance tracking
CREATE TABLE strategy_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    total_trades INTEGER DEFAULT 0,
    successful_trades INTEGER DEFAULT 0,
    total_profit DECIMAL(10,2) DEFAULT 0.00,
    average_return DECIMAL(5,2) DEFAULT 0.00,
    last_executed TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(strategy_id)
);

-- Indexes for performance
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_strategies_user_id ON strategies(user_id);
CREATE INDEX idx_strategies_type ON strategies(type);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_moment_id ON trades(moment_id);
CREATE INDEX idx_trades_created_at ON trades(created_at);
CREATE INDEX idx_moments_player_id ON moments(player_id);
CREATE INDEX idx_moments_marketplace_id ON moments(marketplace_id);
CREATE INDEX idx_ai_analyses_moment_id ON ai_analyses(moment_id);
CREATE INDEX idx_ai_analyses_created_at ON ai_analyses(created_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_budget_limits_updated_at BEFORE UPDATE ON budget_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_moments_updated_at BEFORE UPDATE ON moments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_strategy_performance_updated_at BEFORE UPDATE ON strategy_performance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();