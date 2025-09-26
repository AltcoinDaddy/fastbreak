import NonFungibleToken from 0x1d7e57aa55817448
import MetadataViews from 0x1d7e57aa55817448
import TopShot from 0x0b2a3299cc857e29

/// FastBreakController is the main contract that manages automated NBA Top Shot trading
/// It handles user strategies, budget controls, and trade execution
pub contract FastBreakController {

    /// Events
    pub event ContractInitialized()
    pub event UserRegistered(userAddress: Address)
    pub event StrategyCreated(userAddress: Address, strategyId: UInt64, strategyType: String)
    pub event StrategyUpdated(userAddress: Address, strategyId: UInt64)
    pub event StrategyActivated(userAddress: Address, strategyId: UInt64)
    pub event StrategyDeactivated(userAddress: Address, strategyId: UInt64)
    pub event BudgetLimitsUpdated(userAddress: Address)
    pub event TradeExecuted(userAddress: Address, momentId: UInt64, action: String, price: UFix64)
    pub event EmergencyStopTriggered(userAddress: Address, reason: String)
    pub event EmergencyStopResolved(userAddress: Address)

    /// Paths
    pub let UserStoragePath: StoragePath
    pub let UserPublicPath: PublicPath
    pub let AdminStoragePath: StoragePath

    /// Strategy Types
    pub enum StrategyType: UInt8 {
        pub case RookieRisers
        pub case PostGameSpikes
        pub case ArbitrageMode
    }

    /// Trade Actions
    pub enum TradeAction: UInt8 {
        pub case Buy
        pub case Sell
        pub case Bid
    }

    /// User Strategy Configuration
    pub struct StrategyConfig {
        pub let id: UInt64
        pub let type: StrategyType
        pub let parameters: {String: AnyStruct}
        pub var isActive: Bool
        pub let createdAt: UFix64
        pub var updatedAt: UFix64

        init(id: UInt64, type: StrategyType, parameters: {String: AnyStruct}) {
            self.id = id
            self.type = type
            self.parameters = parameters
            self.isActive = false
            self.createdAt = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun activate() {
            self.isActive = true
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun deactivate() {
            self.isActive = false
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun updateParameters(newParameters: {String: AnyStruct}) {
            // Merge new parameters with existing ones
            for key in newParameters.keys {
                self.parameters[key] = newParameters[key]
            }
            self.updatedAt = getCurrentBlock().timestamp
        }
    }

    /// Budget Limits Configuration
    pub struct BudgetLimits {
        pub var dailySpendingCap: UFix64
        pub var maxPricePerMoment: UFix64
        pub var totalBudgetLimit: UFix64
        pub var emergencyStopThreshold: UFix64
        pub var reserveAmount: UFix64
        pub let createdAt: UFix64
        pub var updatedAt: UFix64

        init(
            dailySpendingCap: UFix64,
            maxPricePerMoment: UFix64,
            totalBudgetLimit: UFix64,
            emergencyStopThreshold: UFix64,
            reserveAmount: UFix64
        ) {
            pre {
                dailySpendingCap > 0.0: "Daily spending cap must be positive"
                maxPricePerMoment > 0.0: "Max price per moment must be positive"
                totalBudgetLimit > 0.0: "Total budget limit must be positive"
                emergencyStopThreshold <= totalBudgetLimit: "Emergency threshold cannot exceed total budget"
            }

            self.dailySpendingCap = dailySpendingCap
            self.maxPricePerMoment = maxPricePerMoment
            self.totalBudgetLimit = totalBudgetLimit
            self.emergencyStopThreshold = emergencyStopThreshold
            self.reserveAmount = reserveAmount
            self.createdAt = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun updateLimits(
            dailySpendingCap: UFix64?,
            maxPricePerMoment: UFix64?,
            totalBudgetLimit: UFix64?,
            emergencyStopThreshold: UFix64?,
            reserveAmount: UFix64?
        ) {
            if dailySpendingCap != nil {
                assert(dailySpendingCap! > 0.0, message: "Daily spending cap must be positive")
                self.dailySpendingCap = dailySpendingCap!
            }
            if maxPricePerMoment != nil {
                assert(maxPricePerMoment! > 0.0, message: "Max price per moment must be positive")
                self.maxPricePerMoment = maxPricePerMoment!
            }
            if totalBudgetLimit != nil {
                assert(totalBudgetLimit! > 0.0, message: "Total budget limit must be positive")
                self.totalBudgetLimit = totalBudgetLimit!
            }
            if emergencyStopThreshold != nil {
                assert(emergencyStopThreshold! <= self.totalBudgetLimit, message: "Emergency threshold cannot exceed total budget")
                self.emergencyStopThreshold = emergencyStopThreshold!
            }
            if reserveAmount != nil {
                self.reserveAmount = reserveAmount!
            }
            self.updatedAt = getCurrentBlock().timestamp
        }
    }

    /// Spending Tracker
    pub struct SpendingTracker {
        pub var dailySpent: UFix64
        pub var weeklySpent: UFix64
        pub var monthlySpent: UFix64
        pub var totalSpent: UFix64
        pub var transactionCount: UInt64
        pub var lastResetDate: UFix64
        pub let createdAt: UFix64
        pub var updatedAt: UFix64

        init() {
            self.dailySpent = 0.0
            self.weeklySpent = 0.0
            self.monthlySpent = 0.0
            self.totalSpent = 0.0
            self.transactionCount = 0
            self.lastResetDate = getCurrentBlock().timestamp
            self.createdAt = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun recordSpending(amount: UFix64) {
            self.dailySpent = self.dailySpent + amount
            self.weeklySpent = self.weeklySpent + amount
            self.monthlySpent = self.monthlySpent + amount
            self.totalSpent = self.totalSpent + amount
            self.transactionCount = self.transactionCount + 1
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun resetDaily() {
            self.dailySpent = 0.0
            self.lastResetDate = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun resetWeekly() {
            self.weeklySpent = 0.0
            self.updatedAt = getCurrentBlock().timestamp
        }

        pub fun resetMonthly() {
            self.monthlySpent = 0.0
            self.updatedAt = getCurrentBlock().timestamp
        }
    }

    /// Trade Record
    pub struct TradeRecord {
        pub let id: UInt64
        pub let momentId: UInt64
        pub let action: TradeAction
        pub let price: UFix64
        pub let strategyId: UInt64?
        pub let reasoning: String?
        pub let timestamp: UFix64
        pub let transactionHash: String?

        init(
            id: UInt64,
            momentId: UInt64,
            action: TradeAction,
            price: UFix64,
            strategyId: UInt64?,
            reasoning: String?,
            transactionHash: String?
        ) {
            self.id = id
            self.momentId = momentId
            self.action = action
            self.price = price
            self.strategyId = strategyId
            self.reasoning = reasoning
            self.timestamp = getCurrentBlock().timestamp
            self.transactionHash = transactionHash
        }
    }

    /// User Account Resource
    pub resource UserAccount {
        pub let address: Address
        pub var strategies: {UInt64: StrategyConfig}
        pub var budgetLimits: BudgetLimits
        pub var spendingTracker: SpendingTracker
        pub var tradeHistory: [TradeRecord]
        pub var isEmergencyStopActive: Bool
        pub var emergencyStopReason: String?
        pub let createdAt: UFix64
        pub var updatedAt: UFix64

        init(address: Address, budgetLimits: BudgetLimits) {
            self.address = address
            self.strategies = {}
            self.budgetLimits = budgetLimits
            self.spendingTracker = SpendingTracker()
            self.tradeHistory = []
            self.isEmergencyStopActive = false
            self.emergencyStopReason = nil
            self.createdAt = getCurrentBlock().timestamp
            self.updatedAt = getCurrentBlock().timestamp
        }

        /// Strategy Management
        pub fun createStrategy(type: StrategyType, parameters: {String: AnyStruct}): UInt64 {
            let strategyId = UInt64(self.strategies.length + 1)
            let strategy = StrategyConfig(id: strategyId, type: type, parameters: parameters)
            self.strategies[strategyId] = strategy
            self.updatedAt = getCurrentBlock().timestamp

            emit StrategyCreated(userAddress: self.address, strategyId: strategyId, strategyType: type.rawValue.toString())
            return strategyId
        }

        pub fun updateStrategy(strategyId: UInt64, parameters: {String: AnyStruct}) {
            pre {
                self.strategies.containsKey(strategyId): "Strategy does not exist"
            }

            self.strategies[strategyId]!.updateParameters(newParameters: parameters)
            self.updatedAt = getCurrentBlock().timestamp

            emit StrategyUpdated(userAddress: self.address, strategyId: strategyId)
        }

        pub fun activateStrategy(strategyId: UInt64) {
            pre {
                self.strategies.containsKey(strategyId): "Strategy does not exist"
                !self.isEmergencyStopActive: "Cannot activate strategy during emergency stop"
            }

            self.strategies[strategyId]!.activate()
            self.updatedAt = getCurrentBlock().timestamp

            emit StrategyActivated(userAddress: self.address, strategyId: strategyId)
        }

        pub fun deactivateStrategy(strategyId: UInt64) {
            pre {
                self.strategies.containsKey(strategyId): "Strategy does not exist"
            }

            self.strategies[strategyId]!.deactivate()
            self.updatedAt = getCurrentBlock().timestamp

            emit StrategyDeactivated(userAddress: self.address, strategyId: strategyId)
        }

        /// Budget Management
        pub fun updateBudgetLimits(
            dailySpendingCap: UFix64?,
            maxPricePerMoment: UFix64?,
            totalBudgetLimit: UFix64?,
            emergencyStopThreshold: UFix64?,
            reserveAmount: UFix64?
        ) {
            self.budgetLimits.updateLimits(
                dailySpendingCap: dailySpendingCap,
                maxPricePerMoment: maxPricePerMoment,
                totalBudgetLimit: totalBudgetLimit,
                emergencyStopThreshold: emergencyStopThreshold,
                reserveAmount: reserveAmount
            )
            self.updatedAt = getCurrentBlock().timestamp

            emit BudgetLimitsUpdated(userAddress: self.address)
        }

        /// Spending Validation and Recording
        pub fun validateSpending(amount: UFix64): Bool {
            // Check if emergency stop is active
            if self.isEmergencyStopActive {
                return false
            }

            // Check individual transaction limit
            if amount > self.budgetLimits.maxPricePerMoment {
                return false
            }

            // Check daily spending limit
            if self.spendingTracker.dailySpent + amount > self.budgetLimits.dailySpendingCap {
                return false
            }

            // Check total budget limit
            if self.spendingTracker.totalSpent + amount > self.budgetLimits.totalBudgetLimit {
                return false
            }

            // Check emergency stop threshold
            if self.spendingTracker.totalSpent + amount > self.budgetLimits.emergencyStopThreshold {
                self.triggerEmergencyStop(reason: "Budget threshold exceeded")
                return false
            }

            return true
        }

        pub fun recordSpending(amount: UFix64) {
            pre {
                self.validateSpending(amount: amount): "Spending validation failed"
            }

            self.spendingTracker.recordSpending(amount: amount)
            self.updatedAt = getCurrentBlock().timestamp
        }

        /// Trade Management
        pub fun recordTrade(
            momentId: UInt64,
            action: TradeAction,
            price: UFix64,
            strategyId: UInt64?,
            reasoning: String?,
            transactionHash: String?
        ) {
            let tradeId = UInt64(self.tradeHistory.length + 1)
            let trade = TradeRecord(
                id: tradeId,
                momentId: momentId,
                action: action,
                price: price,
                strategyId: strategyId,
                reasoning: reasoning,
                transactionHash: transactionHash
            )

            self.tradeHistory.append(trade)

            // Record spending for buy actions
            if action == TradeAction.Buy {
                self.recordSpending(amount: price)
            }

            self.updatedAt = getCurrentBlock().timestamp

            emit TradeExecuted(
                userAddress: self.address,
                momentId: momentId,
                action: action.rawValue.toString(),
                price: price
            )
        }

        /// Emergency Stop Management
        pub fun triggerEmergencyStop(reason: String) {
            self.isEmergencyStopActive = true
            self.emergencyStopReason = reason
            self.updatedAt = getCurrentBlock().timestamp

            // Deactivate all strategies
            for strategyId in self.strategies.keys {
                self.strategies[strategyId]!.deactivate()
            }

            emit EmergencyStopTriggered(userAddress: self.address, reason: reason)
        }

        pub fun resolveEmergencyStop() {
            self.isEmergencyStopActive = false
            self.emergencyStopReason = nil
            self.updatedAt = getCurrentBlock().timestamp

            emit EmergencyStopResolved(userAddress: self.address)
        }

        /// Getters
        pub fun getStrategies(): {UInt64: StrategyConfig} {
            return self.strategies
        }

        pub fun getStrategy(strategyId: UInt64): StrategyConfig? {
            return self.strategies[strategyId]
        }

        pub fun getBudgetLimits(): BudgetLimits {
            return self.budgetLimits
        }

        pub fun getSpendingTracker(): SpendingTracker {
            return self.spendingTracker
        }

        pub fun getTradeHistory(): [TradeRecord] {
            return self.tradeHistory
        }

        pub fun getRecentTrades(limit: Int): [TradeRecord] {
            let historyLength = self.tradeHistory.length
            if historyLength <= limit {
                return self.tradeHistory
            }
            
            let startIndex = historyLength - limit
            return self.tradeHistory.slice(from: startIndex, upTo: historyLength)
        }
    }

    /// Public interface for user accounts
    pub resource interface UserAccountPublic {
        pub fun getStrategies(): {UInt64: StrategyConfig}
        pub fun getStrategy(strategyId: UInt64): StrategyConfig?
        pub fun getBudgetLimits(): BudgetLimits
        pub fun getSpendingTracker(): SpendingTracker
        pub fun getTradeHistory(): [TradeRecord]
        pub fun getRecentTrades(limit: Int): [TradeRecord]
    }

    /// Admin Resource
    pub resource Admin {
        pub fun createUserAccount(userAddress: Address, budgetLimits: BudgetLimits): @UserAccount {
            return <- create UserAccount(address: userAddress, budgetLimits: budgetLimits)
        }

        pub fun emergencyStopUser(userAddress: Address, reason: String) {
            let userAccount = getAccount(userAddress)
                .getCapability(FastBreakController.UserPublicPath)
                .borrow<&{FastBreakController.UserAccountPublic}>()
                ?? panic("User account not found")

            // This would require additional admin capabilities in the UserAccount resource
            // For now, this is a placeholder for admin emergency stop functionality
        }
    }

    /// Global functions
    pub fun createUserAccount(budgetLimits: BudgetLimits): @UserAccount {
        let userAddress = self.account.address
        let userAccount <- create UserAccount(address: userAddress, budgetLimits: budgetLimits)

        emit UserRegistered(userAddress: userAddress)
        return <- userAccount
    }

    pub fun getUserAccount(address: Address): &{UserAccountPublic}? {
        return getAccount(address)
            .getCapability(self.UserPublicPath)
            .borrow<&{UserAccountPublic}>()
    }

    /// Contract initialization
    init() {
        // Set storage paths
        self.UserStoragePath = /storage/FastBreakUserAccount
        self.UserPublicPath = /public/FastBreakUserAccount
        self.AdminStoragePath = /storage/FastBreakAdmin

        // Create and store admin resource
        let admin <- create Admin()
        self.account.save(<-admin, to: self.AdminStoragePath)

        emit ContractInitialized()
    }
}