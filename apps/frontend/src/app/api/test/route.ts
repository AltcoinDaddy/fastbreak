// Test API endpoint to verify backend connection
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Try to connect to the strategy service
    const strategyServiceUrl = process.env.STRATEGY_SERVICE_URL || 'http://localhost:3002'
    
    const response = await fetch(`${strategyServiceUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      return NextResponse.json({
        status: 'connected',
        message: 'Successfully connected to strategy service',
        strategyService: true
      })
    } else {
      return NextResponse.json({
        status: 'partial',
        message: 'Strategy service not available, using mock data',
        strategyService: false
      })
    }
  } catch (error) {
    return NextResponse.json({
      status: 'mock',
      message: 'Backend services not available, using mock data for demo',
      strategyService: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  
  // Mock validation endpoint for testing
  if (body.type === 'performance-metrics') {
    const { performanceMetrics } = body.data
    const totalWeight = performanceMetrics.reduce((sum: number, metric: any) => sum + metric.weight, 0)
    
    const errors: string[] = []
    const warnings: string[] = []

    if (Math.abs(totalWeight - 1.0) > 0.01) {
      errors.push('Performance metrics weights must sum to 1.0')
    }

    performanceMetrics.forEach((metric: any, index: number) => {
      if (metric.threshold <= 0) {
        errors.push(`Metric ${index + 1} (${metric.name}): Threshold must be positive`)
      }
      if (metric.weight <= 0 || metric.weight > 1) {
        errors.push(`Metric ${index + 1} (${metric.name}): Weight must be between 0 and 1`)
      }
    })

    return NextResponse.json({
      isValid: errors.length === 0,
      errors,
      warnings
    })
  }

  if (body.type === 'strategy-compatibility') {
    const { strategies } = body.data
    const errors: string[] = []
    const warnings: string[] = []

    const activeStrategies = strategies.filter((s: any) => s.isActive)
    const totalBudget = activeStrategies.reduce((sum: number, s: any) => sum + (s.budgetAllocation?.percentage || 0), 0)

    if (totalBudget > 1.0) {
      errors.push('Total budget allocation exceeds 100%')
    }

    return NextResponse.json({
      isValid: errors.length === 0,
      errors,
      warnings
    })
  }

  return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
}