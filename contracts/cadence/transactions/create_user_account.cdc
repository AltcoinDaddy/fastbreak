import FastBreakController from "../FastBreakController.cdc"

transaction(budgetLimits: FastBreakController.BudgetLimits) {
    prepare(signer: AuthAccount) {
        // Create user account resource
        let userAccount <- FastBreakController.createUserAccount(budgetLimits: budgetLimits)
        
        // Store the user account resource
        signer.save(<-userAccount, to: FastBreakController.UserStoragePath)
        
        // Create public capability
        signer.link<&{FastBreakController.UserAccountPublic}>(
            FastBreakController.UserPublicPath,
            target: FastBreakController.UserStoragePath
        )
    }
}