import Test
import BlockchainHelpers
import "TradeAnalytics"

pub let admin = Test.createAccount()
pub let user1 = Test.createAccount()
pub let user2 = Test.createAccount()

pub fun setup() {
    // Deploy the TradeAnalytics contract
    let err = Test.deployContract(
        name: "TradeAnalytics",
        path: "../TradeAnalytics.cdc",
        arguments: []
    )
    Test.expect(err, Test.beNil())
}

pub fun testContractInitialization() {
    // Test that contract was initialized properly
    let events = Test.eventsOfType(Type<TradeAnalytics.AnalyticsInitialized>())
    Test.assertEqual(1, events.length)

    // Test initial market benchmarks
    let benchmarks = Test.executeScript(
        "../scripts/get_market_benchmarks.cdc",
        []
    ) as! TradeAnalytics.MarketBenchmarks

    Test.assertEqual(100.0, benchmarks.topShotIndex)
    Test.assertEqual(100.0, benchmarks.rookieIndex)
    Test.assertEqual(100.0, benchmarks.veteranIndex)
}

pub fun testUserAnalyticsCreation() {
    // Create user analytics resource
    Test.executeTransaction(
        "../transactions/create_user_analytics.cdc",
        [],
        user1
    )

    // Verify analytics resource was created (would check storage in practice)
    // This is a simplified test
}

pub fun testTradeRecording() {
    // First create user analytics
    testUserAnalyticsCreation()

    // Record a trade
    Test.executeTransaction(
        "../transactions/record_analytics_trade.cdc",
        [
            1 as UInt64,        // strategyId
            "RookieRisers",     // strategyType
            150.0,              // profit
            1000.0,             // volume
            86400.0             // holdingPeriod (1 day)
        ],
        user1
    )

    // Verify PerformanceRecorded event was emitted
    let events = Test.eventsOfType(Type<TradeAnalytics.PerformanceRecorded>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! TradeAnalytics.PerformanceRecorded
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual(1, event.strategyId)
    Test.assertEqual(150.0, event.profit)
}

pub fun testStrategyPerformanceTracking() {
    // Record multiple trades for the same strategy
    testTradeRecording()

    // Record more trades
    let trades = [
        (200.0, 1500.0, 172800.0), // profit, volume, holdingPeriod
        (-50.0, 800.0, 43200.0),
        (300.0, 2000.0, 259200.0)
    ]

    for trade in trades {
        Test.executeTransaction(
            "../transactions/record_analytics_trade.cdc",
            [
                1 as UInt64,        // strategyId
                "RookieRisers",     // strategyType
                trade.0,            // profit
                trade.1,            // volume
                trade.2             // holdingPeriod
            ],
            user1
        )
    }

    // Get strategy performance
    let performance = Test.executeScript(
        "../scripts/get_strategy_performance.cdc",
        [user1.address, 1 as UInt64]
    ) as! TradeAnalytics.StrategyPerformance?

    Test.assert(performance != nil)
    Test.assertEqual(4, performance!.totalTrades) // 1 from testTradeRecording + 3 new
    Test.assertEqual(3, performance!.successfulTrades) // 3 profitable trades
    Test.assertEqual(600.0, performance!.totalProfit) // 150 + 200 - 50 + 300
}

pub fun testPerformanceSummary() {
    // Record trades first
    testStrategyPerformanceTracking()

    // Get performance summary
    let summary = Test.executeScript(
        "../scripts/get_performance_summary.cdc",
        [user1.address]
    ) as! {String: AnyStruct}

    Test.assertEqual(4 as UInt64, summary["totalTrades"]! as! UInt64)
    Test.assertEqual(600.0, summary["totalProfit"]! as! Fix64)
    Test.assertEqual(0.75, summary["winRate"]! as! UFix64) // 3/4 = 0.75
}

pub fun testRiskMetricsCalculation() {
    // Record trades first
    testStrategyPerformanceTracking()

    // Calculate risk metrics
    Test.executeTransaction(
        "../transactions/calculate_risk_metrics.cdc",
        [0.02], // riskFreeRate (2%)
        user1
    )

    // Verify RiskMetricsCalculated event was emitted
    let events = Test.eventsOfType(Type<TradeAnalytics.RiskMetricsCalculated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! TradeAnalytics.RiskMetricsCalculated
    Test.assertEqual(user1.address, event.userAddress)
    Test.assert(event.sharpeRatio >= 0.0)
    Test.assert(event.maxDrawdown >= 0.0)
}

pub fun testBenchmarkUpdates() {
    // Update benchmark by admin
    Test.executeTransaction(
        "../transactions/update_benchmark.cdc",
        ["topShotIndex", 105.5],
        admin
    )

    // Verify BenchmarkUpdated event was emitted
    let events = Test.eventsOfType(Type<TradeAnalytics.BenchmarkUpdated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! TradeAnalytics.BenchmarkUpdated
    Test.assertEqual("topShotIndex", event.benchmarkType)
    Test.assertEqual(105.5, event.value)

    // Verify benchmark was updated
    let benchmarks = Test.executeScript(
        "../scripts/get_market_benchmarks.cdc",
        []
    ) as! TradeAnalytics.MarketBenchmarks

    Test.assertEqual(105.5, benchmarks.topShotIndex)
}

pub fun testBenchmarkComparison() {
    // Update benchmark first
    testBenchmarkUpdates()

    // Test benchmark comparison
    let comparison = Test.executeScript(
        "../scripts/get_benchmark_comparison.cdc",
        [110.0, "topShotIndex"] // userReturn, benchmarkType
    ) as! Fix64

    Test.assertEqual(4.5, comparison) // 110.0 - 105.5 = 4.5
}

pub fun testMultipleStrategyPerformance() {
    // Create user analytics
    testUserAnalyticsCreation()

    // Record trades for different strategies
    let strategyTrades = [
        (1 as UInt64, "RookieRisers", 100.0, 1000.0),
        (1 as UInt64, "RookieRisers", 200.0, 1500.0),
        (2 as UInt64, "PostGameSpikes", 150.0, 1200.0),
        (2 as UInt64, "PostGameSpikes", -50.0, 800.0),
        (3 as UInt64, "ArbitrageMode", 75.0, 500.0)
    ]

    for trade in strategyTrades {
        Test.executeTransaction(
            "../transactions/record_analytics_trade.cdc",
            [
                trade.0,            // strategyId
                trade.1,            // strategyType
                trade.2,            // profit
                trade.3,            // volume
                86400.0             // holdingPeriod
            ],
            user1
        )
    }

    // Get all strategy performances
    let allPerformances = Test.executeScript(
        "../scripts/get_all_strategy_performances.cdc",
        [user1.address]
    ) as! {UInt64: TradeAnalytics.StrategyPerformance}

    Test.assertEqual(3, allPerformances.length) // 3 different strategies
    
    // Check strategy 1 performance
    let strategy1 = allPerformances[1]!
    Test.assertEqual(2, strategy1.totalTrades)
    Test.assertEqual(300.0, strategy1.totalProfit)
    Test.assertEqual(1.0, strategy1.winRate) // 2/2 = 1.0

    // Check strategy 2 performance
    let strategy2 = allPerformances[2]!
    Test.assertEqual(2, strategy2.totalTrades)
    Test.assertEqual(100.0, strategy2.totalProfit)
    Test.assertEqual(0.5, strategy2.winRate) // 1/2 = 0.5
}

pub fun testAdvancedMetricsCalculation() {
    // Create user analytics and record trades
    testMultipleStrategyPerformance()

    // Test advanced metrics calculation for a strategy
    let returns: [Fix64] = [100.0, 200.0, -50.0, 150.0, 75.0]
    
    Test.executeTransaction(
        "../transactions/calculate_advanced_metrics.cdc",
        [1 as UInt64, returns, 0.02], // strategyId, returns, riskFreeRate
        user1
    )

    // Get updated strategy performance
    let performance = Test.executeScript(
        "../scripts/get_strategy_performance.cdc",
        [user1.address, 1 as UInt64]
    ) as! TradeAnalytics.StrategyPerformance?

    Test.assert(performance != nil)
    Test.assert(performance!.sharpeRatio > 0.0)
    Test.assert(performance!.maxDrawdown >= 0.0)
}

pub fun testLeaderboardGeneration() {
    // Generate leaderboard by admin
    Test.executeTransaction(
        "../transactions/generate_leaderboard.cdc",
        [TradeAnalytics.PerformancePeriod.Monthly, 10], // period, limit
        admin
    )

    // Verify LeaderboardUpdated event was emitted
    let events = Test.eventsOfType(Type<TradeAnalytics.LeaderboardUpdated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! TradeAnalytics.LeaderboardUpdated
    Test.assertEqual("1", event.period) // Monthly.rawValue
}

pub fun testStrategyPerformanceAnalysis() {
    // Analyze strategy performance by admin
    Test.executeTransaction(
        "../transactions/analyze_strategy_performance.cdc",
        ["RookieRisers"],
        admin
    )

    // Verify StrategyPerformanceAnalyzed event was emitted
    let events = Test.eventsOfType(Type<TradeAnalytics.StrategyPerformanceAnalyzed>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! TradeAnalytics.StrategyPerformanceAnalyzed
    Test.assertEqual("RookieRisers", event.strategyType)
}

pub fun testPerformancePeriods() {
    // Test different performance periods
    let periods = [
        TradeAnalytics.PerformancePeriod.Daily,
        TradeAnalytics.PerformancePeriod.Weekly,
        TradeAnalytics.PerformancePeriod.Monthly,
        TradeAnalytics.PerformancePeriod.Quarterly,
        TradeAnalytics.PerformancePeriod.Yearly,
        TradeAnalytics.PerformancePeriod.AllTime
    ]

    for period in periods {
        Test.executeTransaction(
            "../transactions/generate_leaderboard.cdc",
            [period, 5],
            admin
        )
    }

    // Should have generated 6 leaderboard events
    let events = Test.eventsOfType(Type<TradeAnalytics.LeaderboardUpdated>())
    Test.assertEqual(6, events.length)
}

pub fun testNegativePerformanceTracking() {
    // Create user analytics
    testUserAnalyticsCreation()

    // Record losing trades
    let losingTrades = [
        (-100.0, 1000.0),
        (-200.0, 1500.0),
        (-50.0, 800.0)
    ]

    for trade in losingTrades {
        Test.executeTransaction(
            "../transactions/record_analytics_trade.cdc",
            [
                1 as UInt64,        // strategyId
                "RookieRisers",     // strategyType
                trade.0,            // profit (negative)
                trade.1,            // volume
                86400.0             // holdingPeriod
            ],
            user1
        )
    }

    // Get strategy performance
    let performance = Test.executeScript(
        "../scripts/get_strategy_performance.cdc",
        [user1.address, 1 as UInt64]
    ) as! TradeAnalytics.StrategyPerformance?

    Test.assert(performance != nil)
    Test.assertEqual(3, performance!.totalTrades)
    Test.assertEqual(0, performance!.successfulTrades)
    Test.assertEqual(-350.0, performance!.totalProfit)
    Test.assertEqual(0.0, performance!.winRate)
    Test.assertEqual(-200.0, performance!.worstTrade)
}

pub fun testZeroVolumeHandling() {
    // Test handling of zero volume trades
    testUserAnalyticsCreation()

    Test.executeTransaction(
        "../transactions/record_analytics_trade.cdc",
        [
            1 as UInt64,        // strategyId
            "RookieRisers",     // strategyType
            100.0,              // profit
            0.0,                // volume (zero)
            86400.0             // holdingPeriod
        ],
        user1
    )

    // Should handle zero volume gracefully
    let events = Test.eventsOfType(Type<TradeAnalytics.PerformanceRecorded>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! TradeAnalytics.PerformanceRecorded
    Test.assertEqual(0.0, event.returnRate) // Should be 0 for zero volume
}

// Run all tests
pub fun main() {
    setup()
    
    testContractInitialization()
    testUserAnalyticsCreation()
    testTradeRecording()
    testStrategyPerformanceTracking()
    testPerformanceSummary()
    testRiskMetricsCalculation()
    testBenchmarkUpdates()
    testBenchmarkComparison()
    testMultipleStrategyPerformance()
    testAdvancedMetricsCalculation()
    testLeaderboardGeneration()
    testStrategyPerformanceAnalysis()
    testPerformancePeriods()
    testNegativePerformanceTracking()
    testZeroVolumeHandling()
    
    log("All TradeAnalytics tests passed!")
}