import { GET, POST } from '@/app/api/institution/clients/[id]/shares/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/institution/clients/[id]/shares', () => {
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

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if app user is not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'No rows found' },
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('no_app_user')
    })

    it('should return 404 if client not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })

    it('should return 403 if client belongs to different institution', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'different-inst' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('forbidden')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should fetch client shares', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockShares = [
        { id: 'share-1', number_of_shares: 10, share_value: 10000, total_value: 100000, date: '2024-01-01', created_at: '2024-01-01' },
        { id: 'share-2', number_of_shares: 5, share_value: 10000, total_value: 50000, date: '2024-02-01', created_at: '2024-02-01' },
      ]

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_shares') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockShares,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.shares).toHaveLength(2)
      expect(body.shares[0].number_of_shares).toBe(10)
      expect(body.shares[1].number_of_shares).toBe(5)
    })
  })
})

describe('POST /api/institution/clients/[id]/shares', () => {
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
    it('should return 400 if numberOfShares is invalid', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 0 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_number_of_shares')
    })

    it('should return 400 if numberOfShares is not an integer', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 5.5 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_number_of_shares')
    })
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 10 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if client belongs to different institution', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'different-inst' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 10 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('forbidden')
    })
  })

  describe('Business Logic Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should return 400 if shares are disabled', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { settings: { modules: { shares: false } } },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 10 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('shares_disabled')
    })

    it('should return 400 if share_value is not configured', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { settings: { modules: { shares: true } } },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 10 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('share_value_not_configured')
    })

    it('should return 400 if numberOfShares is below minimum', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                settings: {
                  modules: { shares: true },
                  share_value: 10000,
                  minimum_shares: 5,
                },
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 3 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('minimum_shares_5')
    })

    it('should return 400 if numberOfShares exceeds maximum', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                settings: {
                  modules: { shares: true },
                  share_value: 10000,
                  maximum_shares: 100,
                },
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 150 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('maximum_shares_100')
    })
  })

  describe('Successful Purchase', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should purchase shares with valid data', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: {
                settings: {
                  modules: { shares: true },
                  share_value: 10000,
                  minimum_shares: 1,
                  maximum_shares: 1000,
                },
              },
              error: null,
            }),
          }
        }
        return {}
      })

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'share-123' },
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/shares', {
        method: 'POST',
        body: JSON.stringify({ numberOfShares: 10 }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.id).toBe('share-123')
    })
  })
})
