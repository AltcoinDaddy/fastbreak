import FastBreakController from "../FastBreakController.cdc"

pub fun main(userAddress: Address, amount: UFix64): Bool {
    let userAccount = getAccount(userAddress)
        .getCapability(FastBreakController.UserPublicPath)
        .borrow<&{FastBreakController.UserAccountPublic}>()
        ?? panic("User account not found")

    // This would need to access private methods in a real implementation
    // For testing purposes, we'll use a simplified validation
    let budgetLimits = userAccount.getBudgetLimits()
    let spendingTracker = userAccount.getSpendingTracker()

    // Check max price per moment
    if amount > budgetLimits.maxPricePerMoment {
        return false
    }

    // Check daily spending limit
    if spendingTracker.dailySpent + amount > budgetLimits.dailySpendingCap {
        return false
    }

    // Check total budget limit
    if spendingTracker.totalSpent + amount > budgetLimits.totalBudgetLimit {
        return false
    }

    return true
}