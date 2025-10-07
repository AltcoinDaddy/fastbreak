import '@testing-library/jest-dom'

// Mock browser APIs that are not available in Jest environment
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock FCL to avoid browser dependencies in tests
jest.mock('@onflow/fcl', () => ({
  config: jest.fn(),
  authenticate: jest.fn(),
  unauthenticate: jest.fn(),
  currentUser: {
    snapshot: jest.fn(),
    subscribe: jest.fn()
  }
}))