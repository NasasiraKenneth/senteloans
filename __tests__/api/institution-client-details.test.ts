import { GET, PATCH } from '@/app/api/institution/clients/[id]/route'
import { POST } from '@/app/api/institution/clients/[id]/auth/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/institution/clients/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/clients/client-1')
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

      const request = new Request('http://localhost:3000/api/institution/clients/client-1')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toContain('lookup_by_uid')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })
    const mockClient = testFactories.client({
      id: 'client-1',
      institution_id: 'inst-123',
      full_name: 'John Doe',
      kyc_status: 'Approved',
    })

    it('should fetch single client by ID with shares', async () => {
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
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_shares') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [
                { number_of_shares: 10, share_value: 10000, total_value: 100000 },
                { number_of_shares: 5, share_value: 10000, total_value: 50000 },
              ],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1')
      const response = await GET(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.client.full_name).toBe('John Doe')
      expect(body.client.kyc_status).toBe('Approved')
      expect(body.client.number_of_shares).toBe(15)
      expect(body.client.total_share_value).toBe(150000)
    })

    it('should return 404 for non-existent client', async () => {
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

      const request = new Request('http://localhost:3000/api/institution/clients/non-existent')
      const response = await GET(request, { params: { id: 'non-existent' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('client_query')
    })
  })
})

describe('PATCH /api/institution/clients/[id]', () => {
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
    it('should return 400 if no updatable fields provided', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients/client-1', {
        method: 'PATCH',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('no_updatable_fields')
    })
  })

  describe('Authentication & Authorization', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should return 403 if client belongs to different institution', async () => {
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

      const request = new Request('http://localhost:3000/api/institution/clients/client-1', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toContain('forbidden')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should update client with valid data', async () => {
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
        return {}
      })

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'client-1' },
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: 'Updated Name',
          phoneNumber: '+256700111111',
          occupation: 'Farmer',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.id).toBe('client-1')
    })

    it('should return 404 if client not found after update', async () => {
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
        return {}
      })

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'Updated Name' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_updated_or_not_found')
    })
  })
})

describe('POST /api/institution/clients/[id]/auth', () => {
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
    it('should return 400 if email is missing', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients/client-1/auth', {
        method: 'POST',
        body: JSON.stringify({ password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('email_required')
    })
  })

  describe('Authentication & Authorization', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/auth', {
        method: 'POST',
        body: JSON.stringify({ email: 'client@test.com', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 403 if user is not elevated (admin/manager)', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'user-123', institution_id: 'inst-123', role: 'loan_officer' },
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/auth', {
        method: 'POST',
        body: JSON.stringify({ email: 'client@test.com', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('forbidden')
    })

    it('should return 403 for cross-tenant operation', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'user-123', institution_id: 'inst-123', role: 'institution_admin' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'different-inst', auth_id: null },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/auth', {
        method: 'POST',
        body: JSON.stringify({ email: 'client@test.com', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('cross_tenant_operation_forbidden')
    })
  })

  describe('Successful Auth User Creation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should create Supabase Auth user for client', async () => {
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
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'user-123', institution_id: 'inst-123', role: 'institution_admin' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123', auth_id: null },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_clients') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        if (callCount === 4 && table === 'senteloans_audit_logs') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/auth', {
        method: 'POST',
        body: JSON.stringify({ email: 'client@test.com', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.email).toBe('client@test.com')
      expect(body.password).toBe('password123')
    })

    it('should reset password for existing auth user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.auth = {
        admin: {
          updateUserById: jest.fn().mockResolvedValue({
            error: null,
          }),
        },
      }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'user-123', institution_id: 'inst-123', role: 'institution_admin' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123', auth_id: 'existing-auth-id' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/auth', {
        method: 'POST',
        body: JSON.stringify({ email: 'client@test.com', password: 'newpassword123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.password).toBe('newpassword123')
      expect(mockServiceClient.auth.admin.updateUserById).toHaveBeenCalledWith('existing-auth-id', {
        email_confirm: true,
        password: 'newpassword123',
      })
    })
  })
})
