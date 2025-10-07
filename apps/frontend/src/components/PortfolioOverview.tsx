'use client'

import React, { useState, useEffect } from 'react'

interface PortfolioData {
  totalValue: number
  dailyChange: number
  dailyChangePercent: number
  totalMoments: number
  totalProfit: number
  totalProfitPercent: number
}

interface Moment {
  id: string
  playerName: string
  team: string
  series: string
  serialNumber: number
  purchasePrice: number
  currentValue: number
  change: number
  changePercent: number
  imageUrl: string
}

const PortfolioOverview = () => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  useEffect(() => {
    // Simulate real-time updates
    const fetchPortfolioData = () => {
      // Mock data - in real app this would come from API
      const mockPortfolio: PortfolioData = {
        totalValue: 12847.50 + (Math.random() - 0.5) * 100,
        dailyChange: 234.75 + (Math.random() - 0.5) * 50,
        dailyChangePercent: 1.87 + (Math.random() - 0.5) * 0.5,
        totalMoments: 15,
        totalProfit: 1247.30,
        totalProfitPercent: 10.75
      }

      const mockMoments: Moment[] = [
        {
          id: '1',
          playerName: 'LeBron James',
          team: 'Lakers',
          series: 'Series 3',
          serialNumber: 1234,
          purchasePrice: 2400,
          currentValue: 2500 + (Math.random() - 0.5) * 100,
          change: 100,
          changePercent: 4.17,
          imageUrl: 'https://via.placeholder.com/64x64?text=LBJ'
        },
        {
          id: '2',
          playerName: 'Stephen Curry',
          team: 'Warriors',
          series: 'Series 3',
          serialNumber: 5678,
          purchasePrice: 2300,
          currentValue: 2200 + (Math.random() - 0.5) * 100,
          change: -100,
          changePercent: -4.35,
          imageUrl: 'https://via.placeholder.com/64x64?text=SC'
        },
        {
          id: '3',
          playerName: 'Kevin Durant',
          team: 'Suns',
          series: 'Series 3',
          serialNumber: 9012,
          purchasePrice: 1900,
          currentValue: 2000 + (Math.random() - 0.5) * 100,
          change: 100,
          changePercent: 5.26,
          imageUrl: 'https://via.placeholder.com/64x64?text=KD'
        }
      ]

      setPortfolioData(mockPortfolio)
      setMoments(mockMoments)
      setLastUpdated(new Date())
      setLoading(false)
    }

    fetchPortfolioData()

    // Update every 30 seconds to simulate real-time updates
    const interval = setInterval(fetchPortfolioData, 30000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-300 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-300 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-300 rounded w-1/4"></div>
        </div>
      </div>
    )
  }

  if (!portfolioData) return null

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Portfolio Overview</h3>
          <span className="text-xs text-gray-500">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-500">Total Value</p>
            <p className="text-2xl font-bold text-gray-900">
              ${portfolioData.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={`text-sm ${portfolioData.dailyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {portfolioData.dailyChange >= 0 ? '+' : ''}${Math.abs(portfolioData.dailyChange).toFixed(2)} 
              ({portfolioData.dailyChangePercent >= 0 ? '+' : ''}{portfolioData.dailyChangePercent.toFixed(2)}%) today
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Total Moments</p>
            <p className="text-2xl font-bold text-gray-900">{portfolioData.totalMoments}</p>
            <p className="text-sm text-gray-600">Active holdings</p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Total Profit/Loss</p>
            <p className={`text-2xl font-bold ${portfolioData.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {portfolioData.totalProfit >= 0 ? '+' : ''}${Math.abs(portfolioData.totalProfit).toFixed(2)}
            </p>
            <p className={`text-sm ${portfolioData.totalProfitPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ({portfolioData.totalProfitPercent >= 0 ? '+' : ''}{portfolioData.totalProfitPercent.toFixed(2)}%)
            </p>
          </div>
        </div>
      </div>

      {/* Top Holdings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Top Holdings</h3>
        <div className="space-y-4">
          {moments.slice(0, 5).map((moment) => (
            <div key={moment.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-4">
                <img 
                  src={moment.imageUrl} 
                  alt={moment.playerName}
                  className="w-12 h-12 rounded-lg object-cover"
                />
                <div>
                  <p className="font-medium text-gray-900">{moment.playerName}</p>
                  <p className="text-sm text-gray-500">{moment.team} • #{moment.serialNumber}</p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="font-medium text-gray-900">
                  ${moment.currentValue.toFixed(2)}
                </p>
                <p className={`text-sm ${moment.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {moment.changePercent >= 0 ? '+' : ''}{moment.changePercent.toFixed(2)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PortfolioOverview