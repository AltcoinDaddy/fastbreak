'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface PerformanceMetric {
  name: string
  threshold: number
  comparison: string
  weight: number
}

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
  defaultParameters: any
  parameterSchema?: any
}

export default function TemplateDetailPage() {
  const params = useParams()
  const [template, setTemplate] = useState<StrategyTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    // Mock template data - in real app this would fetch from API
    const mockTemplates: Record<string, StrategyTemplate> = {
      'post_game_spikes_aggressive': {
        id: 'post_game_spikes_aggressive',
        name: 'Post-Game Spikes - Aggressive',
        type: 'post_game_spikes',
        description: 'Capitalizes on immediate price movements following exceptional game performances. This strategy monitors NBA games in real-time and identifies moments where players exceed performance thresholds, then quickly purchases related moments before the market reacts.',
        category: 'time_based',
        difficulty: 'intermediate',
        riskLevel: 'high',
        expectedReturn: { min: 5, max: 30, timeframe: '1-7 days' },
        tags: ['momentum', 'short-term', 'performance', 'aggressive'],
        isActive: true,
        defaultParameters: {
          postGameSpikes: {
            performanceMetrics: [
              { name: 'points', threshold: 30, comparison: 'greater_than', weight: 0.4 },
              { name: 'rebounds', threshold: 12, comparison: 'greater_than', weight: 0.2 },
              { name: 'assists', threshold: 8, comparison: 'greater_than', weight: 0.2 },
              { name: 'efficiency', threshold: 25, comparison: 'greater_than', weight: 0.2 }
            ],
            timeWindow: 2,
            priceChangeThreshold: 0.05,
            volumeThreshold: 2.0,
            gameTypes: ['regular_season', 'playoffs'],
            playerTiers: ['superstar', 'all_star'],
            momentTypes: ['dunk', 'three_pointer', 'game_winner'],
            maxPriceMultiplier: 1.5,
            socialSentimentWeight: 0.3
          }
        },
        parameterSchema: {
          'postGameSpikes.timeWindow': {
            type: 'number',
            required: true,
            min: 0.5,
            max: 24,
            description: 'Time window after game to monitor (hours)'
          },
          'postGameSpikes.priceChangeThreshold': {
            type: 'number',
            required: true,
            min: 0.02,
            max: 0.2,
            description: 'Minimum price change threshold (5% = 0.05)'
          },
          'postGameSpikes.volumeThreshold': {
            type: 'number',
            required: true,
            min: 1.5,
            max: 5.0,
            description: 'Volume spike multiplier'
          }
        }
      },
      'rookie_risers_basic': {
        id: 'rookie_risers_basic',
        name: 'Rookie Risers - Basic',
        type: 'rookie_risers',
        description: 'Identifies promising rookie players with strong early performance indicators and growth potential. This strategy focuses on finding undervalued rookie moments before they gain mainstream attention.',
        category: 'performance_based',
        difficulty: 'beginner',
        riskLevel: 'medium',
        expectedReturn: { min: 10, max: 50, timeframe: '3-6 months' },
        tags: ['rookie', 'growth', 'performance', 'beginner-friendly'],
        isActive: true,
        defaultParameters: {
          rookieRisers: {
            performanceThreshold: 0.75,
            priceLimit: 200,
            minGamesPlayed: 10,
            maxYearsExperience: 2,
            targetPositions: ['PG', 'SG', 'SF'],
            minMinutesPerGame: 20,
            efficiencyRatingMin: 15,
            usageRateMin: 0.18,
            projectedGrowthRate: 0.15
          }
        }
      }
    }

    const templateData = mockTemplates[params.id as string]
    setTemplate(templateData || null)
    setLoading(false)
  }, [params.id])

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

  if (!template) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-lg">Template not found</div>
        <Link href="/templates" className="mt-4 text-blue-600 hover:text-blue-500 font-medium">
          ← Back to Templates
        </Link>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <Link href="/templates" className="text-blue-600 hover:text-blue-500 font-medium mb-4 inline-block">
          ← Back to Templates
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{template.name}</h1>
            <p className="mt-2 text-gray-600">{template.description}</p>
          </div>
          <div className="flex space-x-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(template.riskLevel)}`}>
              {template.riskLevel} risk
            </span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(template.difficulty)}`}>
              {template.difficulty}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('parameters')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'parameters'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Parameters
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'performance'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Performance Metrics
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Strategy Details</h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Type</dt>
                  <dd className="mt-1 text-sm text-gray-900">{template.type.replace('_', ' ')}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Category</dt>
                  <dd className="mt-1 text-sm text-gray-900">{template.category.replace('_', ' ')}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Expected Return</dt>
                  <dd className="mt-1 text-sm text-gray-900">{template.expectedReturn.min}-{template.expectedReturn.max}%</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Timeframe</dt>
                  <dd className="mt-1 text-sm text-gray-900">{template.expectedReturn.timeframe}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {template.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link
                  href={`/strategies/create?template=${template.id}`}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-center px-4 py-2 rounded-md text-sm font-medium block"
                >
                  Create Strategy
                </Link>
                <Link
                  href={`/test?template=${template.id}`}
                  className="w-full bg-white hover:bg-gray-50 text-blue-600 border border-blue-600 text-center px-4 py-2 rounded-md text-sm font-medium block"
                >
                  Test Parameters
                </Link>
                <button className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-center px-4 py-2 rounded-md text-sm font-medium">
                  Run Backtest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parameters' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Default Parameters</h3>
          <div className="space-y-6">
            {Object.entries(template.defaultParameters).map(([key, params]) => (
              <div key={key} className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-md font-medium text-gray-900 mb-3 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(params as Record<string, any>).map(([paramKey, paramValue]) => (
                    <div key={paramKey} className="bg-gray-50 p-3 rounded">
                      <dt className="text-sm font-medium text-gray-500 capitalize">
                        {paramKey.replace(/([A-Z])/g, ' $1').trim()}
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {Array.isArray(paramValue) ? (
                          <div className="space-y-1">
                            {paramValue.map((item, index) => (
                              <div key={index} className="text-xs bg-white p-1 rounded">
                                {typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)}
                              </div>
                            ))}
                          </div>
                        ) : typeof paramValue === 'object' ? (
                          <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                            {JSON.stringify(paramValue, null, 2)}
                          </pre>
                        ) : (
                          String(paramValue)
                        )}
                      </dd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'performance' && template.defaultParameters.postGameSpikes?.performanceMetrics && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Metrics Configuration</h3>
          <p className="text-sm text-gray-600 mb-6">
            This template uses the following performance metrics to identify trading opportunities. 
            The weights must sum to 1.0 for proper validation.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Metric
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Threshold
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comparison
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(template.defaultParameters.postGameSpikes.performanceMetrics as PerformanceMetric[]).map((metric, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                      {metric.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {metric.threshold}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {metric.comparison.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(metric.weight * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex">
              <div className="ml-3">
                <h4 className="text-sm font-medium text-blue-800">Weight Validation</h4>
                <div className="mt-2 text-sm text-blue-700">
                  Total weight: {((template.defaultParameters.postGameSpikes.performanceMetrics as PerformanceMetric[])
                    .reduce((sum, metric) => sum + metric.weight, 0) * 100).toFixed(1)}%
                  {Math.abs((template.defaultParameters.postGameSpikes.performanceMetrics as PerformanceMetric[])
                    .reduce((sum, metric) => sum + metric.weight, 0) - 1.0) < 0.01 ? 
                    ' ✅ Valid' : ' ❌ Must sum to 100%'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}