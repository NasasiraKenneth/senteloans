import { POST } from '@/app/api/auth/login/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')

describe('POST /api/auth/login', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    createClient.mockResolvedValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Validation', () => {
    it('should return 400 if email is missing', async () => {
      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Email and password are required')
    })

    it('should return 400 if password is missing', async () => {
      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@institution.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Email and password are required')
    })

    it('should return 400 if both email and password are missing', async () => {
      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Email and password are required')
    })
  })

  describe('Authentication', () => {
    it('should return 401 for invalid credentials', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      })

      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'wrong@example.com',
          password: 'wrongpassword',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Invalid login credentials')
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'wrong@example.com',
        password: 'wrongpassword',
      })
    })

    it('should return 401 for incorrect password', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      })

      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@institution.com',
          password: 'wrongpassword',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Invalid login credentials')
    })
  })

  describe('Successful Login', () => {
    it('should return 200 and ok:true for valid institution admin credentials', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@institution.com',
          password: 'correctpassword',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'admin@institution.com',
        password: 'correctpassword',
      })
    })

    it('should return 200 for valid manager credentials', async () => {
      const mockUser = { id: 'user-456', email: 'manager@institution.com' }

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'manager@institution.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('should return 200 for valid loan officer credentials', async () => {
      const mockUser = { id: 'user-789', email: 'officer@institution.com' }

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'officer@institution.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.signInWithPassword.mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@institution.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Database connection failed')
    })

    it('should return 500 for JSON parsing errors', async () => {
      const request = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body).toHaveProperty('error')
    })
  })
})
