// API client for connecting to backend services
import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Strategy Service API
export const strategyApi = {
  // Get available templates
  getTemplates: async () => {
    const response = await apiClient.get('/api/strategies/templates')
    return response.data
  },

  // Get template by ID
  getTemplate: async (id: string) => {
    const response = await apiClient.get(`/api/strategies/templates/${id}`)
    return response.data
  },

  // Search templates
  searchTemplates: async (query: string, filters?: any) => {
    const response = await apiClient.get('/api/strategies/templates/search', {
      params: { query, ...filters }
    })
    return response.data
  },

  // Validate strategy parameters
  validateParameters: async (parameters: any, templateId: string) => {
    try {
      const response = await apiClient.post('/api/strategies/validate', {
        parameters,
        templateId
      })
      return response.data
    } catch (error) {
      // Fallback to local test endpoint
      const response = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'performance-metrics',
          data: parameters
        })
      })
      return await response.json()
    }
  },

  // Test strategy compatibility
  validateCompatibility: async (strategies: any[]) => {
    try {
      const response = await apiClient.post('/api/strategies/validate/compatibility', {
        strategies
      })
      return response.data
    } catch (error) {
      // Fallback to local test endpoint
      const response = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'strategy-compatibility',
          data: { strategies }
        })
      })
      return await response.json()
    }
  },

  // Get service stats
  getStats: async () => {
    const response = await apiClient.get('/api/strategies/stats')
    return response.data
  }
}

// AI Scouting Service API
export const aiApi = {
  // Get AI analysis for a moment
  analyzeMoment: async (momentId: string) => {
    const response = await apiClient.get(`/api/ai/analyze/${momentId}`)
    return response.data
  },

  // Get player performance analysis
  analyzePlayer: async (playerId: string) => {
    const response = await apiClient.get(`/api/ai/player/${playerId}`)
    return response.data
  },

  // Get AI recommendations
  getRecommendations: async (userId: string) => {
    const response = await apiClient.get(`/api/ai/recommendations/${userId}`)
    return response.data
  }
}

// User Service API
export const userApi = {
  // Get user profile
  getProfile: async () => {
    const response = await apiClient.get('/api/users/profile')
    return response.data
  },

  // Update user profile
  updateProfile: async (profile: any) => {
    const response = await apiClient.put('/api/users/profile', profile)
    return response.data
  },

  // Get user strategies
  getStrategies: async () => {
    const response = await apiClient.get('/api/users/strategies')
    return response.data
  }
}

// Flow Wallet API
export const walletApi = {
  // Connect wallet
  connect: async () => {
    // This would integrate with Flow FCL
    const response = await apiClient.post('/api/auth/wallet/connect')
    return response.data
  },

  // Get wallet balance
  getBalance: async (address: string) => {
    const response = await apiClient.get(`/api/wallet/balance/${address}`)
    return response.data
  },

  // Get wallet transactions
  getTransactions: async (address: string) => {
    const response = await apiClient.get(`/api/wallet/transactions/${address}`)
    return response.data
  }
}