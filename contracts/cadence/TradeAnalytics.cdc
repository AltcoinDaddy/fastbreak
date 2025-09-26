import FastBreakController from "./FastBreakController.cdc"
import SafetyControls from "./SafetyControls.cdc"

/// TradeAnalytics contract provides comprehensive performance tracking and analytics
/// for FastBreak trading strategies and user performance
pub contract TradeAnalytics {

    /// Events
    pub event AnalyticsInitialized()
    pub event PerformanceRecorded(userAddress: Address, strategyId: UInt64, profit: Fix64, returnRate: UFix64)
    pub event LeaderboardUpdated(period: String, topPerformers: [Address])
    pub event StrategyPerformanceAnalyzed(strategyType: String, averageReturn: Fix64, successRate: UFix64)
    pub event RiskMetricsCalculated(userAddress: Address, sharpeRatio: UFix64, maxDrawdown: UFix64)
    pub event BenchmarkUpdated(benchmarkType: String, value: UFix64)

    /// Paths
    pub let AdminStoragePath: StoragePath
    pub let AnalyticsStoragePath: StoragePath

    /// Performance Periods
    pub enum PerformancePeriod: UInt8 {
        pub case Daily
        pub case Weekly
        pub case Monthly
        pub case Quarterly
        pub case Yearly
        pub case AllTime
    }

    /// Strategy Performance Metrics
    pub struct StrategyPerformance {
        pub let strategyId: UInt64
        pub let strategyType: String
        pub var totalTrades: UInt64
        pub var successfulTrades: UInt64
        pub var totalProfit: Fix64
        pub var totalVolume: UFix64
        pub var averageReturn: Fix64
        pub var bestTrade: Fix64
        pub var worstTrade: Fix64
        pub var winRate: UFix64
        pub var profitFactor: UFix64
        pub var sharpeRatio: UFix64
        pub var maxDrawdown: UFix64
        pub var averageHoldingPeriod: UFix64
        pub let createdAt: UFix64
        pub var updatedAt: UFix64

        init(strategyId: UInt64, strategyType: String) {
            self.strategyId = strategyId
            self.strategyType = strategyType
            self.totalTrades = 0
            self.successfulTrades = 0
            self.totalProfit = 0.0
            self.totalVolume = 0.0
            self.averageReturn = 0.0
            self.bestTrade = 0.0
            self.worstTrade = 0.0
            self.winRate = 0.0
            self.profitFactor = 0.0
            self.sharpeRatio = 0.0
            self.maxDrawdown = 0.0
            self.averageHoldingPeriod = 0.0
            self.createdAt = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun updatePerformance(
            profit: Fix64,
            volume: UFix64,
            holdingPeriod: UFix64
        ) {
            self.totalTrades = self.totalTrades + 1
            self.totalProfit = self.totalProfit + profit
            self.totalVolume = self.totalVolume + volume

            if profit > 0.0 {
                self.successfulTrades = self.successfulTrades + 1
            }

            // Update best and worst trades
            if profit > self.bestTrade {
                self.bestTrade = profit
            }
            if profit < self.worstTrade {
                self.worstTrade = profit
            }

            // Calculate metrics
            self.winRate = UFix64(self.successfulTrades) / UFix64(self.totalTrades)
            self.averageReturn = self.totalProfit / Fix64(self.totalTrades)
            
            // Update average holding period
            let totalHoldingTime = self.averageHoldingPeriod * UFix64(self.totalTrades - 1) + holdingPeriod
            self.averageHoldingPeriod = totalHoldingTime / UFix64(self.totalTrades)

            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun calculateAdvancedMetrics(returns: [Fix64], riskFreeRate: UFix64) {
            if returns.length == 0 {
                return
            }

            // Calculate Sharpe Ratio
            var totalReturn: Fix64 = 0.0
            for returnValue in returns {
                totalReturn = totalReturn + returnValue
            }
            let averageReturn = totalReturn / Fix64(returns.length)
            
            // Calculate standard deviation
            var variance: Fix64 = 0.0
            for returnValue in returns {
                let diff = returnValue - averageReturn
                variance = variance + (diff * diff)
            }
            variance = variance / Fix64(returns.length)
            let standardDeviation = self.sqrt(variance)

            if standardDeviation > 0.0 {
                self.sharpeRatio = UFix64((averageReturn - Fix64(riskFreeRate)) / standardDeviation)
            }

            // Calculate Maximum Drawdown
            var peak: Fix64 = returns[0]
            var maxDrawdown: Fix64 = 0.0
            
            for returnValue in returns {
                if returnValue > peak {
                    peak = returnValue
                }
                let drawdown = peak - returnValue
                if drawdown > maxDrawdown {
                    maxDrawdown = drawdown
                }
            }
            
            self.maxDrawdown = UFix64(maxDrawdown)
            self.updatedAt = getCurrentBlock().timestamp
        }

        // Helper function for square root calculation (simplified)
        pub fun sqrt(value: Fix64): Fix64 {
            if value <= 0.0 {
                return 0.0
            }
            // Simplified square root using Newton's method
            var x: Fix64 = value / 2.0
            var prev: Fix64 = 0.0
            
            while x != prev {
                prev = x
                x = (x + value / x) / 2.0
            }
            
            return x
        }
    }

    /// User Performance Analytics
    pub struct UserAnalytics {
        pub let userAddress: Address
        pub var totalTrades: UInt64
        pub var totalProfit: Fix64
        pub var totalVolume: UFix64
        pub var strategyPerformances: {UInt64: StrategyPerformance}
        pub var dailyReturns: [Fix64]
        pub var monthlyReturns: [Fix64]
        pub var riskMetrics: {String: UFix64}
        pub var rankings: {String: UInt64} // period -> rank
        pub let createdAt: UFix64
        pub var updatedAt: UFix64

        init(userAddress: Address) {
            self.userAddress = userAddress
            self.totalTrades = 0
            self.totalProfit = 0.0
            self.totalVolume = 0.0
            self.strategyPerformances = {}
            self.dailyReturns = []
            self.monthlyReturns = []
            self.riskMetrics = {}
            self.rankings = {}
            self.createdAt = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun recordTrade(
            strategyId: UInt64,
            strategyType: String,
            profit: Fix64,
            volume: UFix64,
            holdingPeriod: UFix64
        ) {
            // Update overall metrics
            self.totalTrades = self.totalTrades + 1
            self.totalProfit = self.totalProfit + profit
            self.totalVolume = self.totalVolume + volume

            // Update strategy-specific performance
            if !self.strategyPerformances.containsKey(strategyId) {
                self.strategyPerformances[strategyId] = StrategyPerformance(
                    strategyId: strategyId,
                    strategyType: strategyType
                )
            }

            self.strategyPerformances[strategyId]!.updatePerformance(
                profit: profit,
                volume: volume,
                holdingPeriod: holdingPeriod
            )

            // Add to daily returns (simplified - would need proper date handling)
            self.dailyReturns.append(profit)
            
            // Keep only last 365 days of returns
            if self.dailyReturns.length > 365 {
                self.dailyReturns.removeFirst()
            }

            self.updatedAt = getCurrentBlock().timestamp

            emit PerformanceRecorded(
                userAddress: self.userAddress,
                strategyId: strategyId,
                profit: profit,
                returnRate: volume > 0.0 ? UFix64(profit / Fix64(volume)) : 0.0
            )
        }

        pub fun calculateRiskMetrics(riskFreeRate: UFix64) {
            if self.dailyReturns.length == 0 {
                return
            }

            // Calculate overall Sharpe ratio
            var totalReturn: Fix64 = 0.0
            for returnValue in self.dailyReturns {
                totalReturn = totalReturn + returnValue
            }
            let averageReturn = totalReturn / Fix64(self.dailyReturns.length)
            
            var variance: Fix64 = 0.0
            for returnValue in self.dailyReturns {
                let diff = returnValue - averageReturn
                variance = variance + (diff * diff)
            }
            variance = variance / Fix64(self.dailyReturns.length)
            
            if variance > 0.0 {
                let standardDeviation = self.sqrt(variance)
                self.riskMetrics["sharpeRatio"] = UFix64((averageReturn - Fix64(riskFreeRate)) / standardDeviation)
            }

            // Calculate maximum drawdown
            var peak: Fix64 = self.dailyReturns[0]
            var maxDrawdown: Fix64 = 0.0
            
            for returnValue in self.dailyReturns {
                if returnValue > peak {
                    peak = returnValue
                }
                let drawdown = peak - returnValue
                if drawdown > maxDrawdown {
                    maxDrawdown = drawdown
                }
            }
            
            self.riskMetrics["maxDrawdown"] = UFix64(maxDrawdown)
            self.riskMetrics["volatility"] = UFix64(self.sqrt(variance))
            
            self.updatedAt = getCurrentBlock().timestamp

            emit RiskMetricsCalculated(
                userAddress: self.userAddress,
                sharpeRatio: self.riskMetrics["sharpeRatio"] ?? 0.0,
                maxDrawdown: self.riskMetrics["maxDrawdown"] ?? 0.0
            )
        }

        pub fun getOverallPerformance(): {String: AnyStruct} {
            let winRate = self.totalTrades > 0 ? 
                UFix64(self.strategyPerformances.values.map(fun (perf: StrategyPerformance): UInt64 { return perf.successfulTrades }).reduce(0, fun (acc: UInt64, val: UInt64): UInt64 { return acc + val })) / UFix64(self.totalTrades) : 0.0

            return {
                "totalTrades": self.totalTrades,
                "totalProfit": self.totalProfit,
                "totalVolume": self.totalVolume,
                "averageReturn": self.totalTrades > 0 ? self.totalProfit / Fix64(self.totalTrades) : 0.0,
                "winRate": winRate,
                "sharpeRatio": self.riskMetrics["sharpeRatio"] ?? 0.0,
                "maxDrawdown": self.riskMetrics["maxDrawdown"] ?? 0.0,
                "volatility": self.riskMetrics["volatility"] ?? 0.0
            }
        }

        // Helper function for square root calculation
        pub fun sqrt(value: Fix64): Fix64 {
            if value <= 0.0 {
                return 0.0
            }
            var x: Fix64 = value / 2.0
            var prev: Fix64 = 0.0
            
            while x != prev {
                prev = x
                x = (x + value / x) / 2.0
            }
            
            return x
        }
    }

    /// Leaderboard Entry
    pub struct LeaderboardEntry {
        pub let userAddress: Address
        pub let rank: UInt64
        pub let totalReturn: Fix64
        pub let winRate: UFix64
        pub let sharpeRatio: UFix64
        pub let totalTrades: UInt64
        pub let period: PerformancePeriod
        pub let timestamp: UFix64

        init(
            userAddress: Address,
            rank: UInt64,
            totalReturn: Fix64,
            winRate: UFix64,
            sharpeRatio: UFix64,
            totalTrades: UInt64,
            period: PerformancePeriod
        ) {
            self.userAddress = userAddress
            self.rank = rank
            self.totalReturn = totalReturn
            self.winRate = winRate
            self.sharpeRatio = sharpeRatio
            self.totalTrades = totalTrades
            self.period = period
            self.timestamp = getCurrentBlock().timestamp
        }
    }

    /// Market Benchmarks
    pub struct MarketBenchmarks {
        pub var topShotIndex: UFix64
        pub var rookieIndex: UFix64
        pub var veteranIndex: UFix64
        pub var averageMarketReturn: UFix64
        pub var marketVolatility: UFix64
        pub let lastUpdated: UFix64

        init() {
            self.topShotIndex = 100.0
            self.rookieIndex = 100.0
            self.veteranIndex = 100.0
            self.averageMarketReturn = 0.0
            self.marketVolatility = 0.0
            self.lastUpdated = getCurrentBlock().timestamp
        }

        pub fun updateBenchmark(benchmarkType: String, value: UFix64) {
            switch benchmarkType {
                case "topShotIndex":
                    self.topShotIndex = value
                case "rookieIndex":
                    self.rookieIndex = value
                case "veteranIndex":
                    self.veteranIndex = value
                case "averageMarketReturn":
                    self.averageMarketReturn = value
                case "marketVolatility":
                    self.marketVolatility = value
            }

            emit BenchmarkUpdated(benchmarkType: benchmarkType, value: value)
        }
    }

    /// Analytics Admin Resource
    pub resource AnalyticsAdmin {
        pub fun updateBenchmark(benchmarkType: String, value: UFix64) {
            TradeAnalytics.marketBenchmarks.updateBenchmark(benchmarkType: benchmarkType, value: value)
        }

        pub fun generateLeaderboard(period: PerformancePeriod, limit: Int): [LeaderboardEntry] {
            // This would typically query all user analytics and sort by performance
            // For now, returning empty array as placeholder
            let leaderboard: [LeaderboardEntry] = []
            
            emit LeaderboardUpdated(
                period: period.rawValue.toString(),
                topPerformers: leaderboard.map(fun (entry: LeaderboardEntry): Address { return entry.userAddress })
            )
            
            return leaderboard
        }

        pub fun analyzeStrategyPerformance(strategyType: String): {String: AnyStruct} {
            // This would aggregate performance across all users for a strategy type
            let analysis = {
                "strategyType": strategyType,
                "totalUsers": 0,
                "averageReturn": 0.0,
                "successRate": 0.0,
                "totalTrades": 0
            }

            emit StrategyPerformanceAnalyzed(
                strategyType: strategyType,
                averageReturn: analysis["averageReturn"] as! Fix64,
                successRate: analysis["successRate"] as! UFix64
            )

            return analysis
        }
    }

    /// Analytics Resource for Users
    pub resource UserAnalyticsResource {
        pub let analytics: UserAnalytics

        init(userAddress: Address) {
            self.analytics = UserAnalytics(userAddress: userAddress)
        }

        pub fun recordTrade(
            strategyId: UInt64,
            strategyType: String,
            profit: Fix64,
            volume: UFix64,
            holdingPeriod: UFix64
        ) {
            self.analytics.recordTrade(
                strategyId: strategyId,
                strategyType: strategyType,
                profit: profit,
                volume: volume,
                holdingPeriod: holdingPeriod
            )
        }

        pub fun calculateRiskMetrics(riskFreeRate: UFix64) {
            self.analytics.calculateRiskMetrics(riskFreeRate: riskFreeRate)
        }

        pub fun getPerformanceSummary(): {String: AnyStruct} {
            return self.analytics.getOverallPerformance()
        }

        pub fun getStrategyPerformance(strategyId: UInt64): StrategyPerformance? {
            return self.analytics.strategyPerformances[strategyId]
        }

        pub fun getAllStrategyPerformances(): {UInt64: StrategyPerformance} {
            return self.analytics.strategyPerformances
        }
    }

    /// Global analytics data
    pub var marketBenchmarks: MarketBenchmarks

    /// Public functions
    pub fun createUserAnalytics(userAddress: Address): @UserAnalyticsResource {
        return <- create UserAnalyticsResource(userAddress: userAddress)
    }

    pub fun getMarketBenchmarks(): MarketBenchmarks {
        return self.marketBenchmarks
    }

    pub fun getBenchmarkComparison(userReturn: Fix64, benchmarkType: String): Fix64 {
        var benchmark: UFix64 = 0.0
        
        switch benchmarkType {
            case "topShotIndex":
                benchmark = self.marketBenchmarks.topShotIndex
            case "rookieIndex":
                benchmark = self.marketBenchmarks.rookieIndex
            case "veteranIndex":
                benchmark = self.marketBenchmarks.veteranIndex
            case "averageMarketReturn":
                benchmark = self.marketBenchmarks.averageMarketReturn
            default:
                benchmark = self.marketBenchmarks.averageMarketReturn
        }

        return userReturn - Fix64(benchmark)
    }

    /// Contract initialization
    init() {
        // Set storage paths
        self.AdminStoragePath = /storage/TradeAnalyticsAdmin
        self.AnalyticsStoragePath = /storage/TradeAnalytics

        // Initialize market benchmarks
        self.marketBenchmarks = MarketBenchmarks()

        // Create and store admin resource
        let admin <- create AnalyticsAdmin()
        self.account.save(<-admin, to: self.AdminStoragePath)

        emit AnalyticsInitialized()
    }
}