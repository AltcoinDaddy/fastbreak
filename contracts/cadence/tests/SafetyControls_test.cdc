import Test
import BlockchainHelpers
import "SafetyControls"

pub let admin = Test.createAccount()
pub let user1 = Test.createAccount()
pub let user2 = Test.createAccount()

pub fun setup() {
    // Deploy the SafetyControls contract
    let err = Test.deployContract(
        name: "SafetyControls",
        path: "../SafetyControls.cdc",
        arguments: []
    )
    Test.expect(err, Test.beNil())
}

pub fun testContractInitialization() {
    // Test that contract was initialized properly
    let events = Test.eventsOfType(Type<SafetyControls.SafetyControlsInitialized>())
    Test.assertEqual(1, events.length)

    // Test initial safety state
    let safetyState = Test.executeScript(
        "../scripts/get_safety_state.cdc",
        []
    ) as! SafetyControls.SafetyState

    Test.assertEqual(SafetyControls.CircuitBreakerLevel.None, safetyState.circuitBreakerLevel)
    Test.assertEqual(false, safetyState.isGlobalEmergencyActive)
    Test.assertEqual(0, safetyState.suspendedUsers.length)
}

pub fun testCircuitBreakerActivation() {
    // Test circuit breaker activation by admin
    Test.executeTransaction(
        "../transactions/update_circuit_breaker.cdc",
        [SafetyControls.CircuitBreakerLevel.Warning, "High trading volume detected"],
        admin
    )

    // Verify CircuitBreakerTriggered event was emitted
    let events = Test.eventsOfType(Type<SafetyControls.CircuitBreakerTriggered>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! SafetyControls.CircuitBreakerTriggered
    Test.assertEqual("High trading volume detected", event.reason)
    Test.assertEqual(SafetyControls.CircuitBreakerLevel.Warning.rawValue, event.level)
}

pub fun testCircuitBreakerReset() {
    // First activate circuit breaker
    testCircuitBreakerActivation()

    // Reset circuit breaker
    Test.executeTransaction(
        "../transactions/reset_circuit_breaker.cdc",
        [],
        admin
    )

    // Verify CircuitBreakerReset event was emitted
    let events = Test.eventsOfType(Type<SafetyControls.CircuitBreakerReset>())
    Test.assertEqual(1, events.length)

    // Verify state is reset
    let safetyState = Test.executeScript(
        "../scripts/get_safety_state.cdc",
        []
    ) as! SafetyControls.SafetyState

    Test.assertEqual(SafetyControls.CircuitBreakerLevel.None, safetyState.circuitBreakerLevel)
}

pub fun testGlobalEmergencyActivation() {
    // Activate global emergency
    Test.executeTransaction(
        "../transactions/activate_global_emergency.cdc",
        ["Critical system vulnerability detected"],
        admin
    )

    // Verify GlobalEmergencyActivated event was emitted
    let events = Test.eventsOfType(Type<SafetyControls.GlobalEmergencyActivated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! SafetyControls.GlobalEmergencyActivated
    Test.assertEqual("Critical system vulnerability detected", event.reason)
    Test.assertEqual(admin.address, event.activatedBy)

    // Verify state is updated
    let safetyState = Test.executeScript(
        "../scripts/get_safety_state.cdc",
        []
    ) as! SafetyControls.SafetyState

    Test.assertEqual(true, safetyState.isGlobalEmergencyActive)
    Test.assertEqual(SafetyControls.CircuitBreakerLevel.Emergency, safetyState.circuitBreakerLevel)
}

pub fun testGlobalEmergencyDeactivation() {
    // First activate global emergency
    testGlobalEmergencyActivation()

    // Deactivate global emergency
    Test.executeTransaction(
        "../transactions/deactivate_global_emergency.cdc",
        [],
        admin
    )

    // Verify GlobalEmergencyDeactivated event was emitted
    let events = Test.eventsOfType(Type<SafetyControls.GlobalEmergencyDeactivated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! SafetyControls.GlobalEmergencyDeactivated
    Test.assertEqual(admin.address, event.deactivatedBy)

    // Verify state is reset
    let safetyState = Test.executeScript(
        "../scripts/get_safety_state.cdc",
        []
    ) as! SafetyControls.SafetyState

    Test.assertEqual(false, safetyState.isGlobalEmergencyActive)
    Test.assertEqual(SafetyControls.CircuitBreakerLevel.None, safetyState.circuitBreakerLevel)
}

pub fun testUserSuspension() {
    // Suspend user
    Test.executeTransaction(
        "../transactions/suspend_user.cdc",
        [user1.address, "Suspicious trading patterns detected"],
        admin
    )

    // Verify UserSuspended event was emitted
    let events = Test.eventsOfType(Type<SafetyControls.UserSuspended>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! SafetyControls.UserSuspended
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual("Suspicious trading patterns detected", event.reason)
    Test.assertEqual(admin.address, event.suspendedBy)

    // Verify user is suspended
    let isSuspended = Test.executeScript(
        "../scripts/is_user_suspended.cdc",
        [user1.address]
    ) as! Bool

    Test.assertEqual(true, isSuspended)
}

pub fun testUserReinstatement() {
    // First suspend user
    testUserSuspension()

    // Reinstate user
    Test.executeTransaction(
        "../transactions/reinstate_user.cdc",
        [user1.address],
        admin
    )

    // Verify UserReinstated event was emitted
    let events = Test.eventsOfType(Type<SafetyControls.UserReinstated>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! SafetyControls.UserReinstated
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual(admin.address, event.reinstatedBy)

    // Verify user is no longer suspended
    let isSuspended = Test.executeScript(
        "../scripts/is_user_suspended.cdc",
        [user1.address]
    ) as! Bool

    Test.assertEqual(false, isSuspended)
}

pub fun testCanUserTrade() {
    // Test normal trading conditions
    let canTrade1 = Test.executeScript(
        "../scripts/can_user_trade.cdc",
        [user1.address]
    ) as! Bool
    Test.assertEqual(true, canTrade1)

    // Suspend user and test
    Test.executeTransaction(
        "../transactions/suspend_user.cdc",
        [user1.address, "Test suspension"],
        admin
    )

    let canTrade2 = Test.executeScript(
        "../scripts/can_user_trade.cdc",
        [user1.address]
    ) as! Bool
    Test.assertEqual(false, canTrade2)

    // Reinstate user
    Test.executeTransaction(
        "../transactions/reinstate_user.cdc",
        [user1.address],
        admin
    )

    // Activate global emergency and test
    Test.executeTransaction(
        "../transactions/activate_global_emergency.cdc",
        ["Test emergency"],
        admin
    )

    let canTrade3 = Test.executeScript(
        "../scripts/can_user_trade.cdc",
        [user1.address]
    ) as! Bool
    Test.assertEqual(false, canTrade3)
}

pub fun testTransactionValidation() {
    // Test normal transaction validation
    let isValid1 = Test.executeScript(
        "../scripts/validate_transaction.cdc",
        [user1.address, 500.0]
    ) as! Bool
    Test.assertEqual(true, isValid1)

    // Set circuit breaker to critical and test transaction limits
    Test.executeTransaction(
        "../transactions/update_circuit_breaker.cdc",
        [SafetyControls.CircuitBreakerLevel.Critical, "Testing critical level"],
        admin
    )

    // Large transaction should be rejected during critical level
    let isValid2 = Test.executeScript(
        "../scripts/validate_transaction.cdc",
        [user1.address, 2000.0]
    ) as! Bool
    Test.assertEqual(false, isValid2)

    // Small transaction should be allowed during critical level
    let isValid3 = Test.executeScript(
        "../scripts/validate_transaction.cdc",
        [user1.address, 500.0]
    ) as! Bool
    Test.assertEqual(true, isValid3)
}

pub fun testActivityMonitorCreation() {
    // Create activity monitor for user
    Test.executeTransaction(
        "../transactions/create_activity_monitor.cdc",
        [user1.address],
        user1
    )

    // Verify monitor was created (would need to check storage)
    // This is a simplified test - in practice would verify storage
}

pub fun testActivityMonitorRecording() {
    // First create activity monitor
    testActivityMonitorCreation()

    // Record transactions
    Test.executeTransaction(
        "../transactions/record_transaction_activity.cdc",
        [250.0],
        user1
    )

    Test.executeTransaction(
        "../transactions/record_transaction_activity.cdc",
        [15000.0], // Large transaction - should trigger suspicious activity
        user1
    )

    // Verify SuspiciousActivityDetected event was emitted for large transaction
    let events = Test.eventsOfType(Type<SafetyControls.SuspiciousActivityDetected>())
    Test.assertEqual(1, events.length)
    
    let event = events[0] as! SafetyControls.SuspiciousActivityDetected
    Test.assertEqual(user1.address, event.userAddress)
    Test.assertEqual("LargeTransaction", event.activityType)
}

pub fun testRiskAssessment() {
    // Create activity monitor and record some activity
    testActivityMonitorRecording()

    // Get risk assessment
    let riskAssessment = Test.executeScript(
        "../scripts/get_risk_assessment.cdc",
        [user1.address]
    ) as! SafetyControls.RiskAssessment

    Test.assertEqual(user1.address, riskAssessment.userAddress)
    Test.assert(riskAssessment.riskScore >= 0.0)
    Test.assert(riskAssessment.riskScore <= 100.0)
}

pub fun testRiskThresholdUpdate() {
    // Update risk threshold
    Test.executeTransaction(
        "../transactions/update_risk_threshold.cdc",
        ["userRiskThreshold", 80.0],
        admin
    )

    // Verify threshold was updated
    let safetyState = Test.executeScript(
        "../scripts/get_safety_state.cdc",
        []
    ) as! SafetyControls.SafetyState

    Test.assertEqual(80.0, safetyState.riskThresholds["userRiskThreshold"]!)
}

pub fun testHighFrequencyTradingDetection() {
    // Create activity monitor
    testActivityMonitorCreation()

    // Record multiple transactions in quick succession
    for i in 0..<5 {
        Test.executeTransaction(
            "../transactions/record_transaction_activity.cdc",
            [100.0],
            user1
        )
    }

    // Should trigger high frequency trading detection
    let events = Test.eventsOfType(Type<SafetyControls.SuspiciousActivityDetected>())
    
    // Filter for HighFrequencyTrading events
    var hftEvents = 0
    for event in events {
        let safetyEvent = event as! SafetyControls.SuspiciousActivityDetected
        if safetyEvent.activityType == "HighFrequencyTrading" {
            hftEvents = hftEvents + 1
        }
    }
    
    Test.assert(hftEvents > 0)
}

pub fun testRiskScoreCalculation() {
    // Create activity monitor and simulate various activities
    testActivityMonitorCreation()

    // Record high volume trading
    for i in 0..<50 {
        Test.executeTransaction(
            "../transactions/record_transaction_activity.cdc",
            [1000.0],
            user1
        )
    }

    // Record strategy changes
    for i in 0..<15 {
        Test.executeTransaction(
            "../transactions/record_strategy_change.cdc",
            [],
            user1
        )
    }

    // Get risk assessment
    let riskAssessment = Test.executeScript(
        "../scripts/get_risk_assessment.cdc",
        [user1.address]
    ) as! SafetyControls.RiskAssessment

    // Should have high risk score due to high activity
    Test.assert(riskAssessment.riskScore > 50.0)
    Test.assertEqual(SafetyControls.RiskLevel.High, riskAssessment.riskLevel)
}

// Run all tests
pub fun main() {
    setup()
    
    testContractInitialization()
    testCircuitBreakerActivation()
    testCircuitBreakerReset()
    testGlobalEmergencyActivation()
    testGlobalEmergencyDeactivation()
    testUserSuspension()
    testUserReinstatement()
    testCanUserTrade()
    testTransactionValidation()
    testActivityMonitorCreation()
    testActivityMonitorRecording()
    testRiskAssessment()
    testRiskThresholdUpdate()
    testHighFrequencyTradingDetection()
    testRiskScoreCalculation()
    
    log("All SafetyControls tests passed!")
}