'use client'

import React, { useState, useEffect } from 'react'

interface BudgetData {
  dailyLimit: number
  dailySpent: number
  monthlyLimit: number
  monthlySpent: number
  maxPricePerMoment: number
  totalBudget: number
  totalSpent: number
  emergencyStopThreshold: number
}

interface SpendingAlert {
  type: 'warning' | 'danger' | 'info'
  message: string
}

const BudgetControls = () => {
  const [budgetData, setBudgetData] = useState<BudgetData>({
    dailyLimit: 1000,
    dailySpent: 650,
    monthlyLimit: 15000,
    monthlySpent: 8750,
    maxPricePerMoment: 2500,
    totalBudget: 50000,
    totalSpent: 23400,
    emergencyStopThreshold: 0.9
  })

  const [isEditing, setIsEditing] = useState(false)
  const [tempBudget, setTempBudget] = useState<BudgetData>(budgetData)
  const [alerts, setAlerts] = useState<SpendingAlert[]>([])

  useEffect(() => {
    // Check for spending alerts
    const newAlerts: SpendingAlert[] = []
    
    const dailyPercentage = (budgetData.dailySpent / budgetData.dailyLimit) * 100
    const monthlyPercentage = (budgetData.monthlySpent / budgetData.monthlyLimit) * 100
    const totalPercentage = (budgetData.totalSpent / budgetData.totalBudget) * 100

    if (dailyPercentage >= 90) {
      newAlerts.push({
        type: 'danger',
        message: `Daily spending limit almost reached (${dailyPercentage.toFixed(1)}%)`
      })
    } else if (dailyPercentage >= 75) {
      newAlerts.push({
        type: 'warning',
        message: `Daily spending at ${dailyPercentage.toFixed(1)}% of limit`
      })
    }

    if (monthlyPercentage >= 85) {
      newAlerts.push({
        type: 'warning',
        message: `Monthly spending at ${monthlyPercentage.toFixed(1)}% of limit`
      })
    }

    if (totalPercentage >= budgetData.emergencyStopThreshold * 100) {
      newAlerts.push({
        type: 'danger',
        message: 'Emergency stop threshold reached - trading paused'
      })
    }

    setAlerts(newAlerts)
  }, [budgetData])

  const handleSave = () => {
    setBudgetData(tempBudget)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setTempBudget(budgetData)
    setIsEditing(false)
  }

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'danger': return 'bg-red-50 border-red-200 text-red-700'
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-700'
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-700'
      default: return 'bg-gray-50 border-gray-200 text-gray-700'
    }
  }

  const ProgressBar = ({ label, current, limit, showAmount = true }: {
    label: string
    current: number
    limit: number
    showAmount?: boolean
  }) => {
    const percentage = Math.min((current / limit) * 100, 100)
    
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {showAmount && (
            <span className="text-sm text-gray-500">
              ${current.toLocaleString()} / ${limit.toLocaleString()}
            </span>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(percentage)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="text-xs text-gray-500 text-right">
          {percentage.toFixed(1)}% used
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <div key={index} className={`border rounded-lg p-3 ${getAlertColor(alert.type)}`}>
              <p className="text-sm font-medium">{alert.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Budget Overview */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">Budget Controls</h3>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {isEditing ? 'Cancel' : 'Edit Limits'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Spending */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Daily Spending</h4>
            {isEditing ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily Limit ($)
                </label>
                <input
                  type="number"
                  value={tempBudget.dailyLimit}
                  onChange={(e) => setTempBudget({
                    ...tempBudget,
                    dailyLimit: parseFloat(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <ProgressBar
                label="Today's Spending"
                current={budgetData.dailySpent}
                limit={budgetData.dailyLimit}
              />
            )}
          </div>

          {/* Monthly Spending */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Monthly Spending</h4>
            {isEditing ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Limit ($)
                </label>
                <input
                  type="number"
                  value={tempBudget.monthlyLimit}
                  onChange={(e) => setTempBudget({
                    ...tempBudget,
                    monthlyLimit: parseFloat(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <ProgressBar
                label="This Month's Spending"
                current={budgetData.monthlySpent}
                limit={budgetData.monthlyLimit}
              />
            )}
          </div>
        </div>

        {/* Total Budget */}
        <div className="mt-6">
          <h4 className="font-medium text-gray-900 mb-4">Total Budget</h4>
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Budget ($)
                </label>
                <input
                  type="number"
                  value={tempBudget.totalBudget}
                  onChange={(e) => setTempBudget({
                    ...tempBudget,
                    totalBudget: parseFloat(e.target.value) || 0
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Emergency Stop Threshold (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={tempBudget.emergencyStopThreshold * 100}
                  onChange={(e) => setTempBudget({
                    ...tempBudget,
                    emergencyStopThreshold: (parseFloat(e.target.value) || 0) / 100
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : (
            <ProgressBar
              label="Total Budget Used"
              current={budgetData.totalSpent}
              limit={budgetData.totalBudget}
            />
          )}
        </div>

        {/* Max Price Per Moment */}
        <div className="mt-6">
          <h4 className="font-medium text-gray-900 mb-4">Price Limits</h4>
          {isEditing ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Price Per Moment ($)
              </label>
              <input
                type="number"
                value={tempBudget.maxPricePerMoment}
                onChange={(e) => setTempBudget({
                  ...tempBudget,
                  maxPricePerMoment: parseFloat(e.target.value) || 0
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Max Price Per Moment</span>
                <span className="text-lg font-bold text-gray-900">
                  ${budgetData.maxPricePerMoment.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Save/Cancel buttons for editing mode */}
        {isEditing && (
          <div className="mt-6 flex space-x-3">
            <button
              onClick={handleSave}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Save Changes
            </button>
            <button
              onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Safety Controls */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Safety Controls</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Auto-Trading</h4>
              <p className="text-sm text-gray-500">Enable automated trading based on AI recommendations</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Emergency Stop</h4>
              <p className="text-sm text-gray-500">Automatically pause trading when limits are reached</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Notifications</h4>
              <p className="text-sm text-gray-500">Receive alerts for budget limits and trades</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BudgetControls