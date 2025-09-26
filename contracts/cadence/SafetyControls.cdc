import FastBreakController from "./FastBreakController.cdc"

/// SafetyControls contract provides additional safety mechanisms and emergency controls
/// for the FastBreak trading system, including circuit breakers and risk monitoring
pub contract SafetyControls {

    /// Events
    pub event SafetyControlsInitialized()
    pub event CircuitBreakerTriggered(reason: String, level: UInt8)
    pub event CircuitBreakerReset()
    pub event RiskThresholdExceeded(userAddress: Address, riskScore: UFix64, threshold: UFix64)
    pub event SuspiciousActivityDetected(userAddress: Address, activityType: String, details: {String: AnyStruct})
    pub event GlobalEmergencyActivated(reason: String, activatedBy: Address)
    pub event GlobalEmergencyDeactivated(deactivatedBy: Address)
    pub event UserSuspended(userAddress: Address, reason: String, suspendedBy: Address)
    pub event UserReinstated(userAddress: Address, reinstatedBy: Address)

    /// Paths
    pub let AdminStoragePath: StoragePath
    pub let MonitorStoragePath: StoragePath

    /// Circuit Breaker Levels
    pub enum CircuitBreakerLevel: UInt8 {
        pub case None        // 0 - Normal operation
        pub case Warning     // 1 - Warning level, monitoring increased
        pub case Caution     // 2 - Some restrictions applied
        pub case Critical    // 3 - Severe restrictions
        pub case Emergency   // 4 - All trading halted
    }

    /// Risk Assessment Levels
    pub enum RiskLevel: UInt8 {
        pub case Low         // 0-25
        pub case Medium      // 26-50
        pub case High        // 51-75
        pub case Critical    // 76-100
    }

    /// Activity Types for Monitoring
    pub enum ActivityType: UInt8 {
        pub case HighFrequencyTrading
        pub case LargeTransactions
        pub case UnusualPatterns
        pub case RapidStrategyChanges
        pub case BudgetLimitManipulation
    }

    /// Global Safety State
    pub struct SafetyState {
        pub var circuitBreakerLevel: CircuitBreakerLevel
        pub var isGlobalEmergencyActive: Bool
        pub var globalEmergencyReason: String?
        pub var suspendedUsers: {Address: String} // Address -> Reason
        pub var riskThresholds: {String: UFix64}
        pub var lastUpdated: UFix64

        init() {
            self.circuitBreakerLevel = CircuitBreakerLevel.None
            self.isGlobalEmergencyActive = false
            self.globalEmergencyReason = nil
            self.suspendedUsers = {}
            self.riskThresholds = {
                "dailyVolumeThreshold": 1000000.0,
                "userRiskThreshold": 75.0,
                "transactionFrequencyThreshold": 100.0,
                "priceVolatilityThreshold": 0.5
            }
            self.lastUpdated = getCurrentBlock().timestamp
        }

        pub fun updateCircuitBreaker(level: CircuitBreakerLevel, reason: String) {
            self.circuitBreakerLevel = level
            self.lastUpdated = getCurrentBlock().timestamp
            
            emit CircuitBreakerTriggered(reason: reason, level: level.rawValue)
        }

        pub fun resetCircuitBreaker() {
            self.circuitBreakerLevel = CircuitBreakerLevel.None
            self.lastUpdated = getCurrentBlock().timestamp
            
            emit CircuitBreakerReset()
        }

        pub fun activateGlobalEmergency(reason: String, activatedBy: Address) {
            self.isGlobalEmergencyActive = true
            self.globalEmergencyReason = reason
            self.circuitBreakerLevel = CircuitBreakerLevel.Emergency
            self.lastUpdated = getCurrentBlock().timestamp
            
            emit GlobalEmergencyActivated(reason: reason, activatedBy: activatedBy)
        }

        pub fun deactivateGlobalEmergency(deactivatedBy: Address) {
            self.isGlobalEmergencyActive = false
            self.globalEmergencyReason = nil
            self.circuitBreakerLevel = CircuitBreakerLevel.None
            self.lastUpdated = getCurrentBlock().timestamp
            
            emit GlobalEmergencyDeactivated(deactivatedBy: deactivatedBy)
        }

        pub fun suspendUser(userAddress: Address, reason: String, suspendedBy: Address) {
            self.suspendedUsers[userAddress] = reason
            self.lastUpdated = getCurrentBlock().timestamp
            
            emit UserSuspended(userAddress: userAddress, reason: reason, suspendedBy: suspendedBy)
        }

        pub fun reinstateUser(userAddress: Address, reinstatedBy: Address) {
            self.suspendedUsers.remove(key: userAddress)
            self.lastUpdated = getCurrentBlock().timestamp
            
            emit UserReinstated(userAddress: userAddress, reinstatedBy: reinstatedBy)
        }

        pub fun updateRiskThreshold(key: String, value: UFix64) {
            self.riskThresholds[key] = value
            self.lastUpdated = getCurrentBlock().timestamp
        }
    }

    /// Risk Assessment Data
    pub struct RiskAssessment {
        pub let userAddress: Address
        pub let riskScore: UFix64
        pub let riskLevel: RiskLevel
        pub let factors: {String: UFix64}
        pub let recommendations: [String]
        pub let timestamp: UFix64

        init(
            userAddress: Address,
            riskScore: UFix64,
            factors: {String: UFix64},
            recommendations: [String]
        ) {
            self.userAddress = userAddress
            self.riskScore = riskScore
            self.riskLevel = self.calculateRiskLevel(score: riskScore)
            self.factors = factors
            self.recommendations = recommendations
            self.timestamp = getCurrentBlock().timestamp
        }

        pub fun calculateRiskLevel(score: UFix64): RiskLevel {
            if score <= 25.0 {
                return RiskLevel.Low
            } else if score <= 50.0 {
                return RiskLevel.Medium
            } else if score <= 75.0 {
                return RiskLevel.High
            } else {
                return RiskLevel.Critical
            }
        }
    }

    /// Activity Monitor for detecting suspicious patterns
    pub struct ActivityMonitor {
        pub let userAddress: Address
        pub var transactionCount: UInt64
        pub var totalVolume: UFix64
        pub var lastTransactionTime: UFix64
        pub var strategyChanges: UInt64
        pub var budgetLimitChanges: UInt64
        pub var suspiciousActivities: [String]
        pub let monitoringStarted: UFix64
        pub var lastUpdated: UFix64

        init(userAddress: Address) {
            self.userAddress = userAddress
            self.transactionCount = 0
            self.totalVolume = 0.0
            self.lastTransactionTime = 0.0
            self.strategyChanges = 0
            self.budgetLimitChanges = 0
            self.suspiciousActivities = []
            self.monitoringStarted = getCurrentBlock().timestamp
            self.lastUpdated = getCurrentBlock().timestamp
        }

        pub fun recordTransaction(amount: UFix64) {
            let currentTime = getCurrentBlock().timestamp
            
            // Check for high-frequency trading
            if self.lastTransactionTime > 0.0 && (currentTime - self.lastTransactionTime) < 60.0 {
                self.flagSuspiciousActivity(type: "HighFrequencyTrading", details: {
                    "timeBetweenTransactions": currentTime - self.lastTransactionTime,
                    "amount": amount
                })
            }

            // Check for large transactions
            if amount > 10000.0 { // Configurable threshold
                self.flagSuspiciousActivity(type: "LargeTransaction", details: {
                    "amount": amount,
                    "timestamp": currentTime
                })
            }

            self.transactionCount = self.transactionCount + 1
            self.totalVolume = self.totalVolume + amount
            self.lastTransactionTime = currentTime
            self.lastUpdated = currentTime
        }

        pub fun recordStrategyChange() {
            self.strategyChanges = self.strategyChanges + 1
            self.lastUpdated = getCurrentBlock().timestamp

            // Check for rapid strategy changes
            if self.strategyChanges > 10 { // Configurable threshold
                self.flagSuspiciousActivity(type: "RapidStrategyChanges", details: {
                    "totalChanges": self.strategyChanges,
                    "monitoringPeriod": getCurrentBlock().timestamp - self.monitoringStarted
                })
            }
        }

        pub fun recordBudgetLimitChange() {
            self.budgetLimitChanges = self.budgetLimitChanges + 1
            self.lastUpdated = getCurrentBlock().timestamp

            // Check for frequent budget manipulations
            if self.budgetLimitChanges > 5 { // Configurable threshold
                self.flagSuspiciousActivity(type: "BudgetLimitManipulation", details: {
                    "totalChanges": self.budgetLimitChanges,
                    "monitoringPeriod": getCurrentBlock().timestamp - self.monitoringStarted
                })
            }
        }

        pub fun flagSuspiciousActivity(type: String, details: {String: AnyStruct}) {
            let activity = type.concat(" - ").concat(details.keys.length.toString()).concat(" factors")
            self.suspiciousActivities.append(activity)
            self.lastUpdated = getCurrentBlock().timestamp

            emit SuspiciousActivityDetected(
                userAddress: self.userAddress,
                activityType: type,
                details: details
            )
        }

        pub fun calculateRiskScore(): UFix64 {
            var riskScore: UFix64 = 0.0
            let currentTime = getCurrentBlock().timestamp
            let monitoringDuration = currentTime - self.monitoringStarted

            // Transaction frequency risk (0-25 points)
            let transactionRate = UFix64(self.transactionCount) / (monitoringDuration / 86400.0) // per day
            if transactionRate > 100.0 {
                riskScore = riskScore + 25.0
            } else if transactionRate > 50.0 {
                riskScore = riskScore + 15.0
            } else if transactionRate > 20.0 {
                riskScore = riskScore + 10.0
            }

            // Volume risk (0-25 points)
            let dailyVolume = self.totalVolume / (monitoringDuration / 86400.0)
            if dailyVolume > 50000.0 {
                riskScore = riskScore + 25.0
            } else if dailyVolume > 20000.0 {
                riskScore = riskScore + 15.0
            } else if dailyVolume > 10000.0 {
                riskScore = riskScore + 10.0
            }

            // Strategy change risk (0-25 points)
            if self.strategyChanges > 20 {
                riskScore = riskScore + 25.0
            } else if self.strategyChanges > 10 {
                riskScore = riskScore + 15.0
            } else if self.strategyChanges > 5 {
                riskScore = riskScore + 10.0
            }

            // Suspicious activity risk (0-25 points)
            let suspiciousCount = self.suspiciousActivities.length
            if suspiciousCount > 10 {
                riskScore = riskScore + 25.0
            } else if suspiciousCount > 5 {
                riskScore = riskScore + 15.0
            } else if suspiciousCount > 2 {
                riskScore = riskScore + 10.0
            }

            return riskScore > 100.0 ? 100.0 : riskScore
        }
    }

    /// Safety Controls Admin Resource
    pub resource SafetyAdmin {
        pub fun updateCircuitBreaker(level: CircuitBreakerLevel, reason: String) {
            SafetyControls.safetyState.updateCircuitBreaker(level: level, reason: reason)
        }

        pub fun resetCircuitBreaker() {
            SafetyControls.safetyState.resetCircuitBreaker()
        }

        pub fun activateGlobalEmergency(reason: String) {
            let adminAddress = self.owner?.address ?? panic("Admin resource has no owner")
            SafetyControls.safetyState.activateGlobalEmergency(reason: reason, activatedBy: adminAddress)
        }

        pub fun deactivateGlobalEmergency() {
            let adminAddress = self.owner?.address ?? panic("Admin resource has no owner")
            SafetyControls.safetyState.deactivateGlobalEmergency(deactivatedBy: adminAddress)
        }

        pub fun suspendUser(userAddress: Address, reason: String) {
            let adminAddress = self.owner?.address ?? panic("Admin resource has no owner")
            SafetyControls.safetyState.suspendUser(userAddress: userAddress, reason: reason, suspendedBy: adminAddress)
        }

        pub fun reinstateUser(userAddress: Address) {
            let adminAddress = self.owner?.address ?? panic("Admin resource has no owner")
            SafetyControls.safetyState.reinstateUser(userAddress: userAddress, reinstatedBy: adminAddress)
        }

        pub fun updateRiskThreshold(key: String, value: UFix64) {
            SafetyControls.safetyState.updateRiskThreshold(key: key, value: value)
        }

        pub fun createActivityMonitor(userAddress: Address): @ActivityMonitor {
            return <- create ActivityMonitor(userAddress: userAddress)
        }
    }

    /// Activity Monitor Resource
    pub resource ActivityMonitor {
        pub let monitor: ActivityMonitor

        init(userAddress: Address) {
            self.monitor = ActivityMonitor(userAddress: userAddress)
        }

        pub fun recordTransaction(amount: UFix64) {
            self.monitor.recordTransaction(amount: amount)
        }

        pub fun recordStrategyChange() {
            self.monitor.recordStrategyChange()
        }

        pub fun recordBudgetLimitChange() {
            self.monitor.recordBudgetLimitChange()
        }

        pub fun getRiskAssessment(): RiskAssessment {
            let riskScore = self.monitor.calculateRiskScore()
            let factors = {
                "transactionFrequency": UFix64(self.monitor.transactionCount),
                "totalVolume": self.monitor.totalVolume,
                "strategyChanges": UFix64(self.monitor.strategyChanges),
                "suspiciousActivities": UFix64(self.monitor.suspiciousActivities.length)
            }

            var recommendations: [String] = []
            if riskScore > 75.0 {
                recommendations.append("Consider reducing trading frequency")
                recommendations.append("Review recent strategy changes")
                recommendations.append("Contact support for account review")
            } else if riskScore > 50.0 {
                recommendations.append("Monitor trading patterns")
                recommendations.append("Consider diversifying strategies")
            }

            return RiskAssessment(
                userAddress: self.monitor.userAddress,
                riskScore: riskScore,
                factors: factors,
                recommendations: recommendations
            )
        }
    }

    /// Global safety state
    pub var safetyState: SafetyState

    /// Public functions
    pub fun getSafetyState(): SafetyState {
        return self.safetyState
    }

    pub fun isUserSuspended(userAddress: Address): Bool {
        return self.safetyState.suspendedUsers.containsKey(userAddress)
    }

    pub fun canUserTrade(userAddress: Address): Bool {
        // Check global emergency
        if self.safetyState.isGlobalEmergencyActive {
            return false
        }

        // Check user suspension
        if self.isUserSuspended(userAddress: userAddress) {
            return false
        }

        // Check circuit breaker level
        switch self.safetyState.circuitBreakerLevel {
            case CircuitBreakerLevel.Emergency:
                return false
            case CircuitBreakerLevel.Critical:
                // Only allow small transactions
                return true // Additional logic would be implemented in trading functions
            default:
                return true
        }
    }

    pub fun validateTransaction(userAddress: Address, amount: UFix64): Bool {
        // Check if user can trade
        if !self.canUserTrade(userAddress: userAddress) {
            return false
        }

        // Check circuit breaker restrictions
        switch self.safetyState.circuitBreakerLevel {
            case CircuitBreakerLevel.Critical:
                // Limit transaction size during critical level
                return amount <= 1000.0
            case CircuitBreakerLevel.Caution:
                // Limit transaction size during caution level
                return amount <= 5000.0
            case CircuitBreakerLevel.Warning:
                // Increased monitoring but no restrictions
                return true
            default:
                return true
        }
    }

    pub fun checkRiskThreshold(userAddress: Address, riskScore: UFix64) {
        let threshold = self.safetyState.riskThresholds["userRiskThreshold"] ?? 75.0
        
        if riskScore > threshold {
            emit RiskThresholdExceeded(
                userAddress: userAddress,
                riskScore: riskScore,
                threshold: threshold
            )

            // Auto-trigger circuit breaker for very high risk
            if riskScore > 90.0 {
                self.safetyState.updateCircuitBreaker(
                    level: CircuitBreakerLevel.Critical,
                    reason: "High risk user detected: ".concat(userAddress.toString())
                )
            }
        }
    }

    /// Contract initialization
    init() {
        // Set storage paths
        self.AdminStoragePath = /storage/SafetyControlsAdmin
        self.MonitorStoragePath = /storage/SafetyControlsMonitor

        // Initialize safety state
        self.safetyState = SafetyState()

        // Create and store admin resource
        let admin <- create SafetyAdmin()
        self.account.save(<-admin, to: self.AdminStoragePath)

        emit SafetyControlsInitialized()
    }
}