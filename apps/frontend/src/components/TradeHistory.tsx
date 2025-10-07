'use client'

import React, { useState, useEffect } from 'react'

interface Trade {
  id: string
  timestamp: Date
  type: 'buy' | 'sell'
  playerName: string
  team: string
  series: string
  serialNumber: number
  price: number
  currentValue?: number
  profitLoss?: number
  profitLossPercent?: number
  strategy: string
  aiReasoning: {
    confidence: number
    factors: Array<{
      type: 'performance' | 'market' | 'scarcity' | 'social'
      description: string
      weight: number
      impact: 'positive' | 'negative' | 'neutral'
    }>
    summary: string
  }
  status: 'completed' | 'pending' | 'failed'
}

const TradeHistory = () => {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')

  useEffect(() => {
    // Mock trade data - in real app this would come from API
    const mockTrades: Trade[] = [
      {
        id: '1',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        type: 'buy',
        playerName: 'LeBron James',
        team: 'Lakers',
        series: 'Series 3',
        serialNumber: 1234,
        price: 2400,
        currentValue: 2500,
        profitLoss: 100,
        profitLossPercent: 4.17,
        strategy: 'Post-Game Spikes',
        aiReasoning: {
          confidence: 0.87,
          factors: [
            {
              type: 'performance',
              description: 'LeBron scored 35 points with 8 assists in last game',
              weight: 0.4,
              impact: 'positive'
            },
            {
              type: 'market',
              description: 'Price 15% below recent average for similar moments',
              weight: 0.3,
              impact: 'positive'
            },
            {
              type: 'scarcity',
              description: 'Low serial number (#1234) increases collectible value',
              weight: 0.2,
              impact: 'positive'
            },
            {
              type: 'social',
              description: 'Increased social media mentions after game',
              weight: 0.1,
              impact: 'positive'
            }
          ],
          summary: 'Strong buy signal based on exceptional performance and undervalued market price'
        },
        status: 'completed'
      },
      {
        id: '2',
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
        type: 'sell',
        playerName: 'Stephen Curry',
        team: 'Warriors',
        series: 'Series 2',
        serialNumber: 5678,
        price: 2250,
        profitLoss: 150,
        profitLossPercent: 7.14,
        strategy: 'Profit Taking',
        aiReasoning: {
          confidence: 0.92,
          factors: [
            {
              type: 'market',
              description: 'Moment reached target price of $2250',
              weight: 0.5,
              impact: 'positive'
            },
            {
              type: 'performance',
              description: 'Curry had average performance in recent games',
              weight: 0.3,
              impact: 'neutral'
            },
            {
              type: 'market',
              description: 'Market showing signs of cooling for Warriors moments',
              weight: 0.2,
              impact: 'negative'
            }
          ],
          summary: 'Optimal time to take profits based on target price achievement'
        },
        status: 'completed'
      },
      {
        id: '3',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        type: 'buy',
        playerName: 'Luka Dončić',
        team: 'Mavericks',
        series: 'Series 3',
        serialNumber: 9012,
        price: 1800,
        currentValue: 1750,
        profitLoss: -50,
        profitLossPercent: -2.78,
        strategy: 'Rookie Risers',
        aiReasoning: {
          confidence: 0.75,
          factors: [
            {
              type: 'performance',
              description: 'Triple-double in previous game',
              weight: 0.4,
              impact: 'positive'
            },
            {
              type: 'market',
              description: 'Recent price dip created buying opportunity',
              weight: 0.3,
              impact: 'positive'
            },
            {
              type: 'social',
              description: 'Decreased social engagement recently',
              weight: 0.2,
              impact: 'negative'
            },
            {
              type: 'market',
              description: 'Overall market sentiment slightly bearish',
              weight: 0.1,
              impact: 'negative'
            }
          ],
          summary: 'Moderate buy signal based on performance, but market conditions are challenging'
        },
        status: 'completed'
      }
    ]

    setTrades(mockTrades)
    setLoading(false)
  }, [])

  const filteredTrades = trades.filter(trade => 
    filter === 'all' || trade.type === filter
  )

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Less than 1 hour ago'
    if (diffInHours < 24) return `${diffInHours} hours ago`
    return `${Math.floor(diffInHours / 24)} days ago`
  }

  const getFactorIcon = (type: string) => {
    switch (type) {
      case 'performance': return '🏀'
      case 'market': return '📈'
      case 'scarcity': return '💎'
      case 'social': return '💬'
      default: return '📊'
    }
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'positive': return 'text-green-600 bg-green-100'
      case 'negative': return 'text-red-600 bg-red-100'
      case 'neutral': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-300 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-300 rounded"></div>
            <div className="h-16 bg-gray-300 rounded"></div>
            <div className="h-16 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Trade History */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Trade History</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                filter === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('buy')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                filter === 'buy' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Buys
            </button>
            <button
              onClick={() => setFilter('sell')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                filter === 'sell' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              Sells
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredTrades.map((trade) => (
            <div 
              key={trade.id} 
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedTrade(trade)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    trade.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {trade.type.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {trade.playerName} #{trade.serialNumber}
                    </p>
                    <p className="text-sm text-gray-500">
                      {trade.team} • {trade.series} • {formatTimeAgo(trade.timestamp)}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-medium text-gray-900">${trade.price.toLocaleString()}</p>
                  {trade.profitLoss !== undefined && (
                    <p className={`text-sm ${trade.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)} 
                      ({(trade.profitLossPercent ?? 0) >= 0 ? '+' : ''}{trade.profitLossPercent?.toFixed(2)}%)
                    </p>
                  )}
                </div>
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Strategy:</span>
                  <span className="text-xs font-medium text-gray-700">{trade.strategy}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">AI Confidence:</span>
                  <span className="text-xs font-medium text-blue-600">
                    {(trade.aiReasoning.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Reasoning Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">AI Trade Reasoning</h3>
                <button
                  onClick={() => setSelectedTrade(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Trade Summary</h4>
                  <p className="text-sm text-gray-700">{selectedTrade.aiReasoning.summary}</p>
                  <div className="mt-2 flex items-center space-x-4">
                    <span className="text-sm text-gray-500">
                      Confidence: <span className="font-medium text-blue-600">
                        {(selectedTrade.aiReasoning.confidence * 100).toFixed(0)}%
                      </span>
                    </span>
                    <span className="text-sm text-gray-500">
                      Strategy: <span className="font-medium">{selectedTrade.strategy}</span>
                    </span>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Analysis Factors</h4>
                  <div className="space-y-3">
                    {selectedTrade.aiReasoning.factors.map((factor, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg">
                        <span className="text-lg">{getFactorIcon(factor.type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-900 capitalize">
                              {factor.type}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getImpactColor(factor.impact)}`}>
                                {factor.impact}
                              </span>
                              <span className="text-xs text-gray-500">
                                Weight: {(factor.weight * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-700">{factor.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TradeHistory