import { GET, POST } from '@/app/api/admin/institutions/[id]/admins/route'
import { PATCH, DELETE } from '@/app/api/admin/institutions/[id]/admins/[userId]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/admin/institutions/[id]/admins', () => {
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

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins')
      const response = await GET(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        supabase_user_id: 'user-123',
        role: 'institution_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins')
      const response = await GET(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      supabase_user_id: 'user-123',
      role: 'system_admin',
    })
    const mockAdmins = [
      testFactories.user({ role: 'institution_admin', full_name: 'Admin 1' }),
      testFactories.user({ role: 'institution_admin', full_name: 'Admin 2' }),
    ]

    it('should list admins for institution', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockAdmins,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins')
      const response = await GET(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.admins).toHaveLength(2)
      expect(body.admins[0].full_name).toBe('Admin 1')
    })
  })
})

describe('POST /api/admin/institutions/[id]/admins', () => {
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

  describe('Validation', () => {
    it('should return 400 if name is missing', async () => {
      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@test.com', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('required')
    })

    it('should return 400 if email is missing', async () => {
      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({ name: 'Admin User', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('required')
    })

    it('should return 400 if password is missing', async () => {
      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({ name: 'Admin User', email: 'admin@test.com' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('required')
    })
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({ name: 'Admin', email: 'admin@test.com', password: 'pass123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        supabase_user_id: 'user-123',
        role: 'institution_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({ name: 'Admin', email: 'admin@test.com', password: 'pass123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Creation', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      supabase_user_id: 'user-123',
      role: 'system_admin',
    })

    it('should create admin user with valid data', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.auth = {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'new-auth-user-id' } },
            error: null,
          }),
        },
      }

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Admin',
          email: 'newadmin@institution.com',
          password: 'securepass123',
          phone: '+256700000000',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.user_id).toBe('new-auth-user-id')
    })

    it('should return 409 for duplicate email', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.auth = {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'User already exists', status: 422 },
          }),
        },
      }

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSystemUser,
          error: null,
        }),
      }
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Duplicate Admin',
          email: 'existing@institution.com',
          password: 'password123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'inst-1' } })
      const body = await response.json()

      expect(response.status).toBe(409)
      expect(body.error).toContain('already exists')
    })
  })
})

describe('PATCH /api/admin/institutions/[id]/admins/[userId]', () => {
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

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        supabase_user_id: 'user-123',
        role: 'institution_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      supabase_user_id: 'user-123',
      role: 'system_admin',
    })

    it.skip('should update admin user with valid data', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          const mockQuery: any = {}
          mockQuery.update = jest.fn().mockReturnValue(mockQuery)
          mockQuery.eq = jest.fn().mockResolvedValue({
            error: null,
          })
          return mockQuery
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: 'Updated Admin Name',
          phone_number: '+256700111111',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('should return 400 if no valid fields to update', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('No valid fields')
    })
  })
})

describe('DELETE /api/admin/institutions/[id]/admins/[userId]', () => {
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

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'DELETE',
      })

      const response = await DELETE(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        supabase_user_id: 'user-123',
        role: 'institution_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'DELETE',
      })

      const response = await DELETE(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Deletion', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      supabase_user_id: 'user-123',
      role: 'system_admin',
    })

    it.skip('should delete admin user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.auth = {
        admin: {
          deleteUser: jest.fn().mockResolvedValue({ error: null }),
        },
      }

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'user-1', supabase_user_id: 'auth-user-1' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_users') {
          const mockQuery: any = {}
          mockQuery.delete = jest.fn().mockReturnValue(mockQuery)
          mockQuery.eq = jest.fn().mockResolvedValue({
            error: null,
          })
          return mockQuery
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/user-1', {
        method: 'DELETE',
      })

      const response = await DELETE(request, { params: { id: 'inst-1', userId: 'user-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('should return 404 for non-existent user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'User not found' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/inst-1/admins/non-existent', {
        method: 'DELETE',
      })

      const response = await DELETE(request, { params: { id: 'inst-1', userId: 'non-existent' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBeDefined()
    })
  })
})
