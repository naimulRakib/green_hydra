import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from '../mocks/server'
import '@testing-library/jest-dom'

// Start MSW server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

// Reset handlers after each test to ensure test isolation
afterEach(() => {
  server.resetHandlers()
})

// Clean up after all tests
afterAll(() => {
  server.close()
})

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.GEMINI_API_KEY = 'test-gemini-key'
process.env.SKIP_SURVEY_GATE = 'true'
process.env.SKIP_EMBEDDING = 'true'
