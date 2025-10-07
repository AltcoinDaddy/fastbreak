'use client'

import React, { useState } from 'react'

interface StrategyConfig {
  type: 'rookie_risers' | 'post_game_spikes' | 'arbitrage_mode'
  name: string
  isActive: boolean
  parameters: {
    maxPricePerMoment?: number
    dailyBudgetLimit?: number
    performanceThreshold?: number
    timeWindow?: number
    priceChangeThreshold?: number
    confidenceThreshold?: number
  }
}

interface ValidationErrors {
  [key: string]: string
}

const StrategyConfiguration = () => {
  const [strategies, setStrategies] = useState<StrategyConfig[]>([
    {
      type: 'rookie_risers',
      name: 'Rookie Rising Stars',
      isActive: true,
      parameters: {
        maxPricePerMoment: 500,
        dailyBudgetLimit: 1000,
        performanceThreshold: 20,
        confidenceThreshold: 0.8
      }
    }
  ])

  const [newStrategy, setNewStrategy] = useState<Partial<StrategyConfig>>({
    type: 'rookie_risers',
    name: '',
    isActive: false,
    parameters: {}
  })

  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isCreating, setIsCreating] = useState(false)

  const validateStrategy = (strategy: Partial<StrategyConfig>): ValidationErrors => {
    const errors: ValidationErrors = {}

    if (!strategy.name || strategy.name.trim().length < 3) {
      errors.name = 'Strategy name must be at least 3 characters long'
    }

    if (strategy.parameters?.maxPricePerMoment && strategy.parameters.maxPricePerMoment <= 0) {
      errors.maxPricePerMoment = 'Max price per moment must be greater than 0'
    }

    if (strategy.parameters?.dailyBudgetLimit && strategy.parameters.dailyBudgetLimit <= 0) {
      errors.dailyBudgetLimit = 'Daily budget limit must be greater than 0'
    }

    if (strategy.parameters?.performanceThreshold && 
        (strategy.parameters.performanceThreshold < 0 || strategy.parameters.performanceThreshold > 100)) {
      errors.performanceThreshold = 'Performance threshold must be between 0 and 100'
    }

    if (strategy.parameters?.confidenceThreshold && 
        (strategy.parameters.confidenceThreshold < 0 || strategy.parameters.confidenceThreshold > 1)) {
      errors.confidenceThreshold = 'Confidence threshold must be between 0 and 1'
    }

    return errors
  }

  const handleCreateStrategy = () => {
    const validationErrors = validateStrategy(newStrategy)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length === 0) {
      setStrategies([...strategies, newStrategy as StrategyConfig])
      setNewStrategy({
        type: 'rookie_risers',
        name: '',
        isActive: false,
        parameters: {}
      })
      setIsCreating(false)
    }
  }

  const handleToggleStrategy = (index: number) => {
    const updatedStrategies = [...strategies]
    updatedStrategies[index].isActive = !updatedStrategies[index].isActive
    setStrategies(updatedStrategies)
  }

  const handleDeleteStrategy = (index: number) => {
    setStrategies(strategies.filter((_, i) => i !== index))
  }

  const getStrategyTypeLabel = (type: string) => {
    switch (type) {
      case 'rookie_risers': return 'Rookie Risers'
      case 'post_game_spikes': return 'Post-Game Spikes'
      case 'arbitrage_mode': return 'Arbitrage Mode'
      default: return type
    }
  }

  const renderParameterInputs = (type: string, parameters: any, onChange: (key: string, value: any) => void) => {
    switch (type) {
      case 'rookie_risers':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Price Per Moment ($)
              </label>
              <input
                type="number"
                value={parameters.maxPricePerMoment || ''}
                onChange={(e) => onChange('maxPricePerMoment', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="500"
              />
              {errors.maxPricePerMoment && (
                <p className="text-red-500 text-xs mt-1">{errors.maxPricePerMoment}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Performance Threshold (%)
              </label>
              <input
                type="number"
                value={parameters.performanceThreshold || ''}
                onChange={(e) => onChange('performanceThreshold', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="20"
                min="0"
                max="100"
              />
              {errors.performanceThreshold && (
                <p className="text-red-500 text-xs mt-1">{errors.performanceThreshold}</p>
              )}
            </div>
          </>
        )
      case 'post_game_spikes':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Window (hours)
              </label>
              <input
                type="number"
                value={parameters.timeWindow || ''}
                onChange={(e) => onChange('timeWindow', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="24"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Change Threshold (%)
              </label>
              <input
                type="number"
                value={parameters.priceChangeThreshold || ''}
                onChange={(e) => onChange('priceChangeThreshold', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="15"
              />
            </div>
          </>
        )
      case 'arbitrage_mode':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Profit Margin (%)
            </label>
            <input
              type="number"
              value={parameters.priceChangeThreshold || ''}
              onChange={(e) => onChange('priceChangeThreshold', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="5"
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Existing Strategies */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Active Strategies</h3>
        {strategies.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No strategies configured yet</p>
        ) : (
          <div className="space-y-4">
            {strategies.map((strategy, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{strategy.name}</h4>
                    <p className="text-sm text-gray-500">{getStrategyTypeLabel(strategy.type)}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={strategy.isActive}
                        onChange={() => handleToggleStrategy(index)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <button
                      onClick={() => handleDeleteStrategy(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {Object.entries(strategy.parameters).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
                      <span className="ml-2 font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create New Strategy */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Create New Strategy</h3>
          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              Add Strategy
            </button>
          )}
        </div>

        {isCreating && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strategy Name
              </label>
              <input
                type="text"
                value={newStrategy.name || ''}
                onChange={(e) => setNewStrategy({ ...newStrategy, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="My Custom Strategy"
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strategy Type
              </label>
              <select
                value={newStrategy.type || 'rookie_risers'}
                onChange={(e) => setNewStrategy({ 
                  ...newStrategy, 
                  type: e.target.value as StrategyConfig['type'],
                  parameters: {} // Reset parameters when type changes
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="rookie_risers">Rookie Risers</option>
                <option value="post_game_spikes">Post-Game Spikes</option>
                <option value="arbitrage_mode">Arbitrage Mode</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Budget Limit ($)
              </label>
              <input
                type="number"
                value={newStrategy.parameters?.dailyBudgetLimit || ''}
                onChange={(e) => setNewStrategy({
                  ...newStrategy,
                  parameters: {
                    ...newStrategy.parameters,
                    dailyBudgetLimit: parseFloat(e.target.value) || 0
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1000"
              />
              {errors.dailyBudgetLimit && (
                <p className="text-red-500 text-xs mt-1">{errors.dailyBudgetLimit}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Confidence Threshold (0-1)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={newStrategy.parameters?.confidenceThreshold || ''}
                onChange={(e) => setNewStrategy({
                  ...newStrategy,
                  parameters: {
                    ...newStrategy.parameters,
                    confidenceThreshold: parseFloat(e.target.value) || 0
                  }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.8"
              />
              {errors.confidenceThreshold && (
                <p className="text-red-500 text-xs mt-1">{errors.confidenceThreshold}</p>
              )}
            </div>

            {renderParameterInputs(
              newStrategy.type || 'rookie_risers',
              newStrategy.parameters || {},
              (key, value) => setNewStrategy({
                ...newStrategy,
                parameters: {
                  ...newStrategy.parameters,
                  [key]: value
                }
              })
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleCreateStrategy}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Create Strategy
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewStrategy({
                    type: 'rookie_risers',
                    name: '',
                    isActive: false,
                    parameters: {}
                  })
                  setErrors({})
                }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StrategyConfiguration