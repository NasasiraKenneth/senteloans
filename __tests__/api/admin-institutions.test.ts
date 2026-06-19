import { POST } from '@/app/api/admin/institutions/route'
import { GET, PATCH } from '@/app/api/admin/institutions/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('POST /api/admin/institutions', () => {
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

      const request = new Request('http://localhost:3000/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Institution', type: 'SACCO' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
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

      const request = new Request('http://localhost:3000/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Institution', type: 'SACCO' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Creation', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      auth_id: 'user-123',
      role: 'system_admin',
    })

    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })
    })

    it('should create institution with valid data', async () => {
      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (table === 'institutions') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'new-institution-id' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test SACCO',
          type: 'sacco',
          email: 'info@testsacco.com',
          phone: '+256700000000',
          address: 'Kampala, Uganda',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.id).toBe('new-institution-id')
    })

    it('should normalize institution type from UI format', async () => {
      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (table === 'institutions') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'new-institution-id' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test MFI',
          type: 'mfi',
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
    it('should return 400 for database errors', async () => {
      const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
        role: 'system_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (table === 'institutions') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Duplicate institution name' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Existing Institution',
          type: 'SACCO',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Duplicate institution name')
    })

    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database connection failed'))

      const request = new Request('http://localhost:3000/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', type: 'SACCO' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Database connection failed')
    })
  })
})

describe('GET /api/admin/institutions/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id')
      const response = await GET(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
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

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id')
      const response = await GET(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      auth_id: 'user-123',
      role: 'system_admin',
    })
    const mockInstitution = testFactories.institution()

    it('should fetch institution by ID', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id')
      const response = await GET(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.institution).toBeDefined()
      expect(body.institution.name).toBe('Test SACCO')
    })

    it('should return 404 for non-existent institution', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'No rows found' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/non-existent-id')
      const response = await GET(request, { params: { id: 'non-existent-id' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBeDefined()
    })
  })
})

describe('PATCH /api/admin/institutions/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if user is not system admin', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
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

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('Forbidden')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
    const mockSystemUser = testFactories.user({
      auth_id: 'user-123',
      role: 'system_admin',
    })

    it('should update institution with valid data', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { settings: {} },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Updated SACCO Name',
          status: 'Active',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for database errors', async () => {
      const mockUser = { id: 'user-123', email: 'admin@senteloans.com' }
      const mockSystemUser = testFactories.user({
        auth_id: 'user-123',
        role: 'system_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockSystemUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { settings: {} },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: { message: 'Update failed' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/admin/institutions/test-id', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'test-id' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Update failed')
    })
  })
})
