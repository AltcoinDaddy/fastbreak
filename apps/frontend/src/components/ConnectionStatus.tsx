'use client'

import { useState, useEffect } from 'react'

interface ConnectionStatus {
  status: 'connected' | 'partial' | 'mock'
  message: string
  strategyService: boolean
  aiService?: boolean
  userService?: boolean
}

export default function ConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/test')
        const data = await response.json()
        setStatus(data)
      } catch (error) {
        setStatus({
          status: 'mock',
          message: 'Unable to check backend connection',
          strategyService: false
        })
      } finally {
        setLoading(false)
      }
    }

    checkConnection()
  }, [])

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="animate-pulse flex items-center">
          <div className="w-3 h-3 bg-gray-300 rounded-full mr-3"></div>
          <div className="h-4 bg-gray-300 rounded w-32"></div>
        </div>
      </div>
    )
  }

  if (!status) return null

  const getStatusColor = () => {
    switch (status.status) {
      case 'connected': return 'text-green-600 bg-green-100 border-green-200'
      case 'partial': return 'text-yellow-600 bg-yellow-100 border-yellow-200'
      case 'mock': return 'text-blue-600 bg-blue-100 border-blue-200'
      default: return 'text-gray-600 bg-gray-100 border-gray-200'
    }
  }

  const getStatusIcon = () => {
    switch (status.status) {
      case 'connected': return '🟢'
      case 'partial': return '🟡'
      case 'mock': return '🔵'
      default: return '⚪'
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <span className="text-lg mr-2">{getStatusIcon()}</span>
          <h3 className="font-medium">Backend Connection Status</h3>
        </div>
        <span className="text-sm font-medium uppercase">
          {status.status}
        </span>
      </div>
      
      <p className="text-sm mb-3">{status.message}</p>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Strategy Service:</span>
          <span className={`font-medium ${status.strategyService ? 'text-green-600' : 'text-red-600'}`}>
            {status.strategyService ? '✅ Connected' : '❌ Mock Data'}
          </span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span>AI Scouting Service:</span>
          <span className="font-medium text-red-600">
            ❌ Mock Data
          </span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span>User/Wallet Service:</span>
          <span className="font-medium text-red-600">
            ❌ Mock Data
          </span>
        </div>
      </div>

      {status.status === 'mock' && (
        <div className="mt-3 p-3 bg-white bg-opacity-50 rounded border">
          <p className="text-xs">
            <strong>Demo Mode:</strong> The UI is working with mock data to demonstrate the features we built. 
            To connect to real backend services, start the strategy service on port 3002.
          </p>
        </div>
      )}
    </div>
  )
}