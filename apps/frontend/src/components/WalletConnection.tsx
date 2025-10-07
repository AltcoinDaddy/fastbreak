'use client'

import React, { useState, useEffect } from 'react'
import { fcl, FlowUser, authenticate, unauthenticate, subscribeToUser } from '@/lib/flow'

const WalletConnection = () => {
  const [user, setUser] = useState<FlowUser | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [balance, setBalance] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToUser((user: FlowUser) => {
      setUser(user)
      setIsConnecting(false)
      
      // Fetch balance when user connects
      if (user?.loggedIn && user?.addr) {
        fetchBalance(user.addr)
      } else {
        setBalance(null)
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const fetchBalance = async (address: string) => {
    try {
      // This is a mock balance fetch - in real implementation, you'd query the Flow blockchain
      // const balance = await fcl.query({
      //   cadence: `
      //     import FlowToken from 0x1654653399040a61
      //     pub fun main(account: Address): UFix64 {
      //       let vaultRef = getAccount(account)
      //         .getCapability(/public/flowTokenBalance)
      //         .borrow<&FlowToken.Vault{FlowToken.Balance}>()
      //         ?? panic("Could not borrow Balance reference to the Vault")
      //       return vaultRef.balance
      //     }
      //   `,
      //   args: (arg, t) => [arg(address, t.Address)]
      // })
      
      // Mock balance for demo
      setBalance('100.00')
    } catch (error) {
      console.error('Failed to fetch balance:', error)
      setBalance('0.00')
    }
  }

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await authenticate()
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await unauthenticate()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    }
  }

  const isConnected = user?.loggedIn || false
  const walletAddress = user?.addr

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Flow Wallet</h3>
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
        </div>
        <div className="flex-1">
          {isConnected ? (
            <>
              <p className="text-sm font-medium text-gray-900">Wallet Connected</p>
              <p className="text-sm text-gray-500 font-mono">{walletAddress}</p>
              {balance && (
                <p className="text-sm text-gray-600 mt-1">Balance: {balance} FLOW</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900">Wallet Not Connected</p>
              <p className="text-sm text-gray-500">Connect your Flow wallet to start trading</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4">
        {isConnected ? (
          <button 
            onClick={handleDisconnect}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Disconnect Wallet
          </button>
        ) : (
          <button 
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </div>
  )
}

export default WalletConnection