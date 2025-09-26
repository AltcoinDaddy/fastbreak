import Test
import BlockchainHelpers
import "FastBreakController"

pub let admin = Test.createAccount()
pub let user1 = Test.createAccount()
pub let user2 = Test.createAccount()

pub fun setup() {
    // Deploy the FastBreakController contract
    let err = Test.deployContract(
        name: "FastBreakController",
        path: "../FastBreakController.cdc",
        arguments: []
    )
    Test.expect(err, Test.beNil())
}

pub fun testContractInitialization() {
    // Test that contract was initialized properly
    let events = Test.eventsOfType(Type<FastBreakController.ContractInitialized>())
    Test.assertEqual(1, events.length)
}

pub fun testUserAccountCreation() {
    // Create budget limits for user
    let budgetLimits = FastBreakController.BudgetLimits(
        dailySpendingCap: 1000.0,
        maxPricePerMoment: 500.0,
        totalBudgetLimit: 50000.0,
        emergencyStopThreshold: 40000.0,
        reserveAmount: 10000.0
    )

    // Test user account creation
    Test.executeTransaction(
        "../transactions/create_user_account.cdc",
        [budgetLimits],
        user1
    )

    // Verify UserRegistered event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.UserRegistered>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.UserRegistered
    Test.assertEqual(user1.address, event.userAddress)
}

pub fun testStrategyCreation() {
    // First create user account
    testUserAccountCreation()

    // Create strategy parameters
    let parameters: {String: AnyStruct} = {
        "performanceThreshold": 15.0,
        "priceLimit": 300.0,
        "minGamesPlayed": 5
    }

    // Test strategy creation
    Test.executeTransaction(
        "../transactions/create_strategy.cdc",
        [FastBreakController.StrategyType.RookieRisers, parameters],
        user1
    )

    // Verify StrategyCreated event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.StrategyCreated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.StrategyCreated
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual(1, event.strategyId)
}

pub fun testStrategyActivation() {
    // Create strategy first
    testStrategyCreation()

    // Test strategy activation
    Test.executeTransaction(
        "../transactions/activate_strategy.cdc",
        [1 as UInt64],
        user1
    )

    // Verify StrategyActivated event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.StrategyActivated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.StrategyActivated
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual(1, event.strategyId)
}

pub fun testBudgetLimitValidation() {
    // Test invalid budget limits
    let invalidBudgetLimits = FastBreakController.BudgetLimits(
        dailySpendingCap: -100.0, // Invalid: negative value
        maxPricePerMoment: 500.0,
        totalBudgetLimit: 50000.0,
        emergencyStopThreshold: 40000.0,
        reserveAmount: 10000.0
    )

    // This should fail
    Test.expectFailure(fun (): Void {
        Test.executeTransaction(
            "../transactions/create_user_account.cdc",
            [invalidBudgetLimits],
            user2
        )
    }, errorMessageContains: "Daily spending cap must be positive")
}

pub fun testSpendingValidation() {
    // Create user account first
    testUserAccountCreation()

    // Test valid spending
    let validAmount = 200.0
    let result = Test.executeScript(
        "../scripts/validate_spending.cdc",
        [user1.address, validAmount]
    )
    Test.assertEqual(true, result as! Bool)

    // Test spending that exceeds max price per moment
    let invalidAmount = 600.0 // Exceeds maxPricePerMoment (500.0)
    let result2 = Test.executeScript(
        "../scripts/validate_spending.cdc",
        [user1.address, invalidAmount]
    )
    Test.assertEqual(false, result2 as! Bool)
}

pub fun testTradeRecording() {
    // Create user account first
    testUserAccountCreation()

    // Record a trade
    Test.executeTransaction(
        "../transactions/record_trade.cdc",
        [
            123 as UInt64, // momentId
            FastBreakController.TradeAction.Buy,
            250.0, // price
            1 as UInt64?, // strategyId
            "AI recommended purchase", // reasoning
            "0x123abc" // transactionHash
        ],
        user1
    )

    // Verify TradeExecuted event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.TradeExecuted>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.TradeExecuted
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual(123, event.momentId)
    Test.assertEqual(250.0, event.price)
}

pub fun testEmergencyStop() {
    // Create user account first
    testUserAccountCreation()

    // Trigger emergency stop
    Test.executeTransaction(
        "../transactions/trigger_emergency_stop.cdc",
        ["Budget threshold exceeded"],
        user1
    )

    // Verify EmergencyStopTriggered event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.EmergencyStopTriggered>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.EmergencyStopTriggered
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual("Budget threshold exceeded", event.reason)
}

pub fun testEmergencyStopPreventsTrading() {
    // Create user account and trigger emergency stop
    testEmergencyStop()

    // Try to validate spending during emergency stop
    let result = Test.executeScript(
        "../scripts/validate_spending.cdc",
        [user1.address, 100.0]
    )
    Test.assertEqual(false, result as! Bool)
}

pub fun testBudgetLimitUpdates() {
    // Create user account first
    testUserAccountCreation()

    // Update budget limits
    Test.executeTransaction(
        "../transactions/update_budget_limits.cdc",
        [
            1500.0, // dailySpendingCap
            750.0,  // maxPricePerMoment
            nil,    // totalBudgetLimit (no change)
            nil,    // emergencyStopThreshold (no change)
            nil     // reserveAmount (no change)
        ],
        user1
    )

    // Verify BudgetLimitsUpdated event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.BudgetLimitsUpdated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.BudgetLimitsUpdated
    Test.assertEqual(user1.address, event.userAddress)
}

pub fun testSpendingTracking() {
    // Create user account first
    testUserAccountCreation()

    // Record multiple trades to test spending tracking
    let trades = [
        (100.0, 101 as UInt64),
        (200.0, 102 as UInt64),
        (150.0, 103 as UInt64)
    ]

    for trade in trades {
        Test.executeTransaction(
            "../transactions/record_trade.cdc",
            [
                trade.1, // momentId
                FastBreakController.TradeAction.Buy,
                trade.0, // price
                nil,     // strategyId
                nil,     // reasoning
                nil      // transactionHash
            ],
            user1
        )
    }

    // Check spending tracker
    let spendingTracker = Test.executeScript(
        "../scripts/get_spending_tracker.cdc",
        [user1.address]
    ) as! FastBreakController.SpendingTracker

    Test.assertEqual(450.0, spendingTracker.dailySpent)
    Test.assertEqual(450.0, spendingTracker.totalSpent)
    Test.assertEqual(3, spendingTracker.transactionCount)
}

pub fun testDailySpendingLimitEnforcement() {
    // Create user account first
    testUserAccountCreation()

    // Try to spend more than daily limit (1000.0)
    // First spend 800.0
    Test.executeTransaction(
        "../transactions/record_trade.cdc",
        [
            201 as UInt64, // momentId
            FastBreakController.TradeAction.Buy,
            800.0, // price
            nil,   // strategyId
            nil,   // reasoning
            nil    // transactionHash
        ],
        user1
    )

    // Now try to spend another 300.0 (would exceed daily limit)
    let result = Test.executeScript(
        "../scripts/validate_spending.cdc",
        [user1.address, 300.0]
    )
    Test.assertEqual(false, result as! Bool)
}

pub fun testStrategyDeactivation() {
    // Create and activate strategy first
    testStrategyActivation()

    // Deactivate strategy
    Test.executeTransaction(
        "../transactions/deactivate_strategy.cdc",
        [1 as UInt64],
        user1
    )

    // Verify StrategyDeactivated event was emitted
    let events = Test.eventsOfType(Type<FastBreakController.StrategyDeactivated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! FastBreakController.StrategyDeactivated
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual(1, event.strategyId)
}

pub fun testGetUserAccountPublicInterface() {
    // Create user account first
    testUserAccountCreation()

    // Test public interface access
    let strategies = Test.executeScript(
        "../scripts/get_user_strategies.cdc",
        [user1.address]
    ) as! {UInt64: FastBreakController.StrategyConfig}

    // Should be empty initially
    Test.assertEqual(0, strategies.length)

    let budgetLimits = Test.executeScript(
        "../scripts/get_user_budget_limits.cdc",
        [user1.address]
    ) as! FastBreakController.BudgetLimits

    Test.assertEqual(1000.0, budgetLimits.dailySpendingCap)
    Test.assertEqual(500.0, budgetLimits.maxPricePerMoment)
}

// Run all tests
pub fun main() {
    setup()
    
    testContractInitialization()
    testUserAccountCreation()
    testStrategyCreation()
    testStrategyActivation()
    testBudgetLimitValidation()
    testSpendingValidation()
    testTradeRecording()
    testEmergencyStop()
    testEmergencyStopPreventsTrading()
    testBudgetLimitUpdates()
    testSpendingTracking()
    testDailySpendingLimitEnforcement()
    testStrategyDeactivation()
    testGetUserAccountPublicInterface()
    
    log("All FastBreakController tests passed!")
}