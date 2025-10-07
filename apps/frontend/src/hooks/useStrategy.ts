// React hooks for strategy management
import { useState, useEffect } from 'react'
import { strategyApi } from '@/lib/api'

export interface StrategyTemplate {
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
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export const useStrategyTemplates = () => {
  const [templates, setTemplates] = useState<StrategyTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const data = await strategyApi.getTemplates()
      setTemplates(data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch templates:', err)
      setError('Failed to load strategy templates')
      // Fallback to mock data for demo
      setTemplates(getMockTemplates())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  return { templates, loading, error, refetch: fetchTemplates }
}

export const useStrategyTemplate = (id: string) => {
  const [template, setTemplate] = useState<StrategyTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setLoading(true)
        const data = await strategyApi.getTemplate(id)
        setTemplate(data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch template:', err)
        setError('Failed to load strategy template')
        // Fallback to mock data
        const mockTemplates = getMockTemplates()
        const mockTemplate = mockTemplates.find(t => t.id === id)
        setTemplate(mockTemplate || null)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchTemplate()
    }
  }, [id])

  return { template, loading, error }
}

export const useStrategyValidation = () => {
  const [loading, setLoading] = useState(false)

  const validateParameters = async (parameters: any, templateId: string): Promise<ValidationResult> => {
    try {
      setLoading(true)
      const result = await strategyApi.validateParameters(parameters, templateId)
      return result
    } catch (err) {
      console.error('Validation failed:', err)
      // Fallback to client-side validation for demo
      return performClientSideValidation(parameters, templateId)
    } finally {
      setLoading(false)
    }
  }

  const validateCompatibility = async (strategies: any[]): Promise<ValidationResult> => {
    try {
      setLoading(true)
      const result = await strategyApi.validateCompatibility(strategies)
      return result
    } catch (err) {
      console.error('Compatibility validation failed:', err)
      // Fallback to client-side validation
      return performCompatibilityValidation(strategies)
    } finally {
      setLoading(false)
    }
  }

  return { validateParameters, validateCompatibility, loading }
}

// Mock data fallback (same as what we had in the components)
const getMockTemplates = (): StrategyTemplate[] => [
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
    }
  }
  // Add more mock templates as needed
]

// Client-side validation fallback
const performClientSideValidation = (parameters: any, templateId: string): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  // Example validation for post-game spikes
  if (templateId === 'post_game_spikes_aggressive' && parameters.postGameSpikes?.performanceMetrics) {
    const totalWeight = parameters.postGameSpikes.performanceMetrics
      .reduce((sum: number, metric: any) => sum + metric.weight, 0)
    
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      errors.push('Performance metrics weights must sum to 1.0')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

const performCompatibilityValidation = (strategies: any[]): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  const activeStrategies = strategies.filter(s => s.isActive)
  const totalBudget = activeStrategies.reduce((sum, s) => sum + (s.budgetAllocation?.percentage || 0), 0)

  if (totalBudget > 1.0) {
    errors.push('Total budget allocation exceeds 100%')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}