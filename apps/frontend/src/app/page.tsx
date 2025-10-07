'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface StrategyTemplate {
  id: string
  name: string
  type: string
  description: string
  category: string
  difficulty: string
  riskLevel: string
  expectedReturn: {
    min: number
    max: number
    timeframe: string
  }
  tags: string[]
  isActive: boolean
}

interface ServiceStats {
  totalStrategies: number
  activeStrategies: number
  totalTemplates: number
}

export default function Dashboard() {
  const [templates, setTemplates] = useState<StrategyTemplate[]>([])
  const [stats, setStats] = useState<ServiceStats>({ totalStrategies: 0, activeStrategies: 0, totalTemplates: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Mock data for now - in real app this would call the strategy service API
    const mockTemplates: StrategyTemplate[] = [
      {
        id: 'rookie_risers_basic',
        name: 'Rookie Risers - Basic',
        type: 'rookie_risers',
        description: 'Identifies promising rookie players with strong early performance indicators and growth potential.',
        category: 'performance_based',
        difficulty: 'beginner',
        riskLevel: 'medium',
        expectedReturn: { min: 10, max: 50, timeframe: '3-6 months' },
        tags: ['rookie', 'growth', 'performance', 'beginner-friendly'],
        isActive: true
      },
      {
        id: 'post_game_spikes_aggressive',
        name: 'Post-Game Spikes - Aggressive',
        type: 'post_game_spikes',
        description: 'Capitalizes on immediate price movements following exceptional game performances.',
        category: 'time_based',
        difficulty: 'intermediate',
        riskLevel: 'high',
        expectedReturn: { min: 5, max: 30, timeframe: '1-7 days' },
        tags: ['momentum', 'short-term', 'performance', 'aggressive'],
        isActive: true
      },
      {
        id: 'arbitrage_conservative',
        name: 'Arbitrage - Conservative',
        type: 'arbitrage_mode',
        description: 'Low-risk arbitrage opportunities across multiple marketplaces with strict safety controls.',
        category: 'market_based',
        difficulty: 'advanced',
        riskLevel: 'low',
        expectedReturn: { min: 3, max: 15, timeframe: 'Minutes to hours' },
        tags: ['arbitrage', 'low-risk', 'market-neutral', 'advanced'],
        isActive: true
      }
    ]

    setTemplates(mockTemplates)
    setStats({ totalStrategies: 0, activeStrategies: 0, totalTemplates: mockTemplates.length })
    setLoading(false)
  }, [])

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'text-green-600 bg-green-100'
      case 'medium': return 'text-yellow-600 bg-yellow-100'
      case 'high': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'text-blue-600 bg-blue-100'
      case 'intermediate': return 'text-purple-600 bg-purple-100'
      case 'advanced': return 'text-orange-600 bg-orange-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">FastBreak Dashboard</h1>
        <p className="mt-2 text-gray-600">AI-powered NBA Top Shot auto-collector</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">S</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Strategies</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalStrategies}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">A</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Strategies</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.activeStrategies}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-bold">T</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Available Templates</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalTemplates}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Connection Status</h3>
          <p className="text-gray-600">WebSocket and service connections will be displayed here.</p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Wallet Connection</h3>
          <p className="text-gray-600">Flow wallet connection status will be displayed here.</p>
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="mb-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Portfolio Overview</h3>
          <p className="text-gray-600">Portfolio value and holdings will be displayed here.</p>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
              Strategies
            </button>
            <button className="border-blue-500 text-blue-600 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
              Trade History
            </button>
            <button className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
              Budget Controls
            </button>
          </nav>
        </div>
        
        <div className="mt-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Trade History</h3>
            <p className="text-gray-600">Recent trades and transaction history will be displayed here.</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg mb-8">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/strategies/create" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              Create Strategy
            </Link>
            <Link href="/templates" className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
              Browse Templates
            </Link>
            <Link href="/strategies" className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
              Manage Strategies
            </Link>
            <Link href="/test" className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
              Test Validation
            </Link>
          </div>
        </div>
      </div>

      {/* Available Templates Preview */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Available Strategy Templates</h3>
            <Link href="/templates" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.slice(0, 3).map((template) => (
              <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-900">{template.name}</h4>
                  <div className="flex space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(template.riskLevel)}`}>
                      {template.riskLevel}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(template.difficulty)}`}>
                      {template.difficulty}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Return: {template.expectedReturn.min}-{template.expectedReturn.max}%</span>
                  <span>{template.expectedReturn.timeframe}</span>
                </div>
                <div className="mt-3">
                  <Link 
                    href={`/templates/${template.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-500"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}