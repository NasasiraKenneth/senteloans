import { POST } from '@/app/api/admin-login/route'
import { createMockSupabaseClient, mockSupabaseResponse, mockSupabaseError } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')

describe('POST /api/admin-login', () => {
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
      const request = new Request('http://localhost:3000/api/admin-login', {
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
      const request = new Request('http://localhost:3000/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@senteloans.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Email and password are required')
    })

    it('should return 400 if both email and password are missing', async () => {
      const request = new Request('http://localhost:3000/api/admin-login', {
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

      const request = new Request('http://localhost:3000/api/admin-login', {
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

    it('should return 401 if user data is null', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@senteloans.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Invalid credentials')
    })
  })

  describe('Authorization', () => {
    it('should return 403 if user is not found in users table', async () => {
      const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
      
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'No rows found' },
        }),
      }
      mockSupabase.from.mockReturnValue(mockFrom)
      mockSupabase.auth.signOut.mockResolvedValue({ error: null })

      const request = new Request('http://localhost:3000/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@senteloans.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('User not provisioned')
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })

    it('should return 403 if user role is not system_admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
        role: 'institution_admin',
      })

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSystemUser,
          error: null,
        }),
      }
      mockSupabase.from.mockReturnValue(mockFrom)
      mockSupabase.auth.signOut.mockResolvedValue({ error: null })

      const request = new Request('http://localhost:3000/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@institution.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Not authorized')
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })
  })

  describe('Successful Login', () => {
    it('should return 200 and ok:true for valid system admin credentials', async () => {
      const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
        role: 'system_admin',
      })

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { access_token: 'token' } },
        error: null,
      })

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSystemUser,
          error: null,
        }),
      }
      mockSupabase.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@senteloans.com',
          password: 'correctpassword',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'admin@senteloans.com',
        password: 'correctpassword',
      })
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
      expect(mockSupabase.auth.signOut).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.signInWithPassword.mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = new Request('http://localhost:3000/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'admin@senteloans.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Database connection failed')
    })
  })
})
