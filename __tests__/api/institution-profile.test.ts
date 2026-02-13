import { GET, PUT } from '@/app/api/institution/profile/route'
import { POST } from '@/app/api/institution/password/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/institution/profile', () => {
  let mockSupabase: any
  let mockServiceClient: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    mockServiceClient = createMockSupabaseClient()
    createClient.mockResolvedValue(mockSupabase)
    createServiceClient.mockReturnValue(mockServiceClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/profile')
      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 401 if auth error occurs', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      const request = new Request('http://localhost:3000/api/institution/profile')
      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Invalid token')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      supabase_user_id: 'user-123',
      role: 'institution_admin',
      full_name: 'John Admin',
      phone_number: '+256700000000',
    })

    it('should fetch current user profile', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockAppUser,
          error: null,
        }),
      }
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/institution/profile')
      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.email).toBe(mockAppUser.email)
      expect(body.name).toBe(mockAppUser.full_name)
      expect(body.phone).toBe(mockAppUser.phone_number)
      expect(body.role).toBe(mockAppUser.role)
      expect(body.institutionId).toBe(mockAppUser.institution_id)
    })

    it('should return 404 if app user profile is not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/institution/profile')
      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('no_app_user')
    })
  })

  describe('Error Handling', () => {
    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database connection failed'))

      const request = new Request('http://localhost:3000/api/institution/profile')
      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Database connection failed')
    })
  })
})

describe('PUT /api/institution/profile', () => {
  let mockSupabase: any
  let mockServiceClient: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    mockServiceClient = createMockSupabaseClient()
    createClient.mockResolvedValue(mockSupabase)
    createServiceClient.mockReturnValue(mockServiceClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should return 400 if no valid changes provided', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/profile', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('no_changes')
    })

    it('should return 400 if name is too short', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: 'A' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('no_changes')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should update profile with valid data', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockFrom = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      }
      mockSupabase.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/institution/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Admin Name',
          phone: '+256700111111',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('should update only name if phone not provided', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockFrom = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      }
      mockSupabase.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/institution/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for database errors', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockFrom = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Update failed' },
        }),
      }
      mockSupabase.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/institution/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Update failed')
    })
  })
})

describe('POST /api/institution/password', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    createClient.mockResolvedValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'oldpass',
          newPassword: 'newpass123',
          confirmPassword: 'newpass123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should return 400 if password is too short', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: 'short',
          confirmPassword: 'short',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('password_too_short')
    })

    it('should return 400 if passwords do not match', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: 'newpassword123',
          confirmPassword: 'differentpassword',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('password_mismatch')
    })
  })

  describe('Successful Password Change', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should change password with valid data', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.auth.updateUser = jest.fn().mockResolvedValue({
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for Supabase auth errors', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.auth.updateUser = jest.fn().mockResolvedValue({
        error: { message: 'Password update failed' },
      })

      const request = new Request('http://localhost:3000/api/institution/password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Password update failed')
    })

    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Unexpected error'))

      const request = new Request('http://localhost:3000/api/institution/password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Unexpected error')
    })
  })
})
