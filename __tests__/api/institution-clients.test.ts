import { GET, POST } from '@/app/api/institution/clients/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// Mock audit logger
jest.mock('@/lib/audit/audit-logger', () => ({
  auditLogger: {
    logInsert: jest.fn(),
    logUpdate: jest.fn(),
    logDelete: jest.fn(),
  },
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')
const { auditLogger } = require('@/lib/audit/audit-logger')

describe('GET /api/institution/clients', () => {
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
        error: { message: 'Not authenticated' },
      })

      const request = new Request('http://localhost:3000/api/institution/clients')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Not authenticated')
    })

    it('should return 401 if user data is null', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })
  })

  describe('Authorization', () => {
    it('should return 403 if app user profile is not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      
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

      const request = new Request('http://localhost:3000/api/institution/clients')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toContain('lookup_by_uid')
    })

    it('should return 404 if app user is null', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }
      mockServiceClient.from.mockReturnValue(mockFrom)

      const request = new Request('http://localhost:3000/api/institution/clients')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toContain('no_app_user_profile')
    })
  })

  describe('Successful Queries', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({ auth_id: 'user-123' })
    const mockClients = [
      testFactories.client({ id: 'client-1', full_name: 'John Doe' }),
      testFactories.client({ id: 'client-2', full_name: 'Jane Smith' }),
    ]

    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })
    })

    it('should return list of clients for authenticated institution user', async () => {
      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: mockClients,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.clients).toHaveLength(2)
      expect(body.clients[0].full_name).toBe('John Doe')
    })

    it.skip('should filter clients by search query', async () => {
      const filteredClients = [mockClients[0]]
      
      // Reset mocks for this test
      mockSupabase = createMockSupabaseClient()
      mockServiceClient = createMockSupabaseClient()
      createClient.mockResolvedValue(mockSupabase)
      createServiceClient.mockReturnValue(mockServiceClient)
      
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients') {
          const mockQuery: any = {}
          mockQuery.select = jest.fn().mockReturnValue(mockQuery)
          mockQuery.eq = jest.fn().mockReturnValue(mockQuery)
          mockQuery.or = jest.fn().mockReturnValue(mockQuery)
          mockQuery.order = jest.fn().mockReturnValue(mockQuery)
          mockQuery.limit = jest.fn().mockResolvedValue({
            data: filteredClients,
            error: null,
          })
          return mockQuery
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients?search=John')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.clients).toHaveLength(1)
    })

    it.skip('should filter clients by status', async () => {
      // Reset mocks for this test
      mockSupabase = createMockSupabaseClient()
      mockServiceClient = createMockSupabaseClient()
      createClient.mockResolvedValue(mockSupabase)
      createServiceClient.mockReturnValue(mockServiceClient)
      
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients') {
          const mockQuery: any = {}
          mockQuery.select = jest.fn().mockReturnValue(mockQuery)
          mockQuery.eq = jest.fn().mockReturnValue(mockQuery)
          mockQuery.order = jest.fn().mockReturnValue(mockQuery)
          mockQuery.limit = jest.fn().mockResolvedValue({
            data: mockClients,
            error: null,
          })
          return mockQuery
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients?status=Active')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.clients).toBeDefined()
    })

    it.skip('should filter clients by KYC status', async () => {
      // Reset mocks for this test
      mockSupabase = createMockSupabaseClient()
      mockServiceClient = createMockSupabaseClient()
      createClient.mockResolvedValue(mockSupabase)
      createServiceClient.mockReturnValue(mockServiceClient)
      
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients') {
          const mockQuery: any = {}
          mockQuery.select = jest.fn().mockReturnValue(mockQuery)
          mockQuery.eq = jest.fn().mockReturnValue(mockQuery)
          mockQuery.order = jest.fn().mockReturnValue(mockQuery)
          mockQuery.limit = jest.fn().mockResolvedValue({
            data: mockClients,
            error: null,
          })
          return mockQuery
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients?kyc=Verified')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.clients).toBeDefined()
    })

    it('should respect pagination limit', async () => {
      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients') {
          const limitFn = jest.fn().mockResolvedValue({
            data: mockClients.slice(0, 1),
            error: null,
          })
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: limitFn,
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients?limit=1')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.clients).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should return 500 for unexpected errors', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database error'))

      const request = new Request('http://localhost:3000/api/institution/clients')

      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toBe('Database error')
    })
  })
})

describe('POST /api/institution/clients', () => {
  let mockSupabase: any
  let mockServiceClient: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    mockServiceClient = createMockSupabaseClient()
    createClient.mockResolvedValue(mockSupabase)
    createServiceClient.mockReturnValue(mockServiceClient)
    auditLogger.logInsert.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Validation', () => {
    const validPayload = {
      fullName: 'John Doe',
      phoneNumber: '0700123456',
      nationalId: 'CM12345678901234',
      dateOfBirth: '1990-01-01',
      gender: 'Male',
      clientType: 'Individual',
    }

    it('should return 400 if fullName is missing', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, fullName: '' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('fullName')
    })

    it('should return 400 if phoneNumber is missing', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, phoneNumber: '' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('phoneNumber')
    })

    it('should return 400 for invalid phone format', async () => {
      const mockUser = { id: 'user-123' }
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, phoneNumber: '1234567890' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_phone_ug_format')
    })

    it('should return 400 for invalid email format', async () => {
      const mockUser = { id: 'user-123' }
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, email: 'invalid-email' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_email')
    })
  })

  describe('Successful Creation', () => {
    const validPayload = {
      fullName: 'John Doe',
      phoneNumber: '0700123456',
      nationalId: 'CM12345678901234',
      dateOfBirth: '1990-01-01',
      gender: 'Male',
      clientType: 'Individual',
      email: 'john@example.com',
    }

    const mockUser = { id: 'user-123' }
    const mockAppUser = testFactories.user({ auth_id: 'user-123' })
    const mockInstitution = testFactories.institution({ type: 'SACCO' })

    it('should create client without savings account for Money Lender', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { ...mockInstitution, type: 'Money Lender' },
              error: null,
            }),
          }
        }
        return {}
      })

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'senteloans_clients') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'new-client-id', client_number: 'C123456-2501-ABCD' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.id).toBe('new-client-id')
      expect(body.savings_account).toBeNull()
    })

    it('should create client with savings account for SACCO', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'institutions') {
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

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'senteloans_clients') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'new-client-id', client_number: 'C123456-2501-ABCD' },
              error: null,
            }),
          }
        }
        if (table === 'senteloans_savings_accounts') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'savings-id',
                account_number: 'SA123456-2501-EFGH',
                account_type: 'Voluntary',
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.id).toBe('new-client-id')
      expect(body.savings_account).toBeDefined()
      expect(body.savings_account.account_number).toBe('SA123456-2501-EFGH')
      expect(auditLogger.logInsert).toHaveBeenCalled()
    })

    it('should rollback client creation if savings account creation fails', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (table === 'institutions') {
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

      const deleteMock = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'senteloans_clients') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'new-client-id', client_number: 'C123456-2501-ABCD' },
              error: null,
            }),
            delete: jest.fn().mockReturnThis(),
            eq: deleteMock,
          }
        }
        if (table === 'senteloans_savings_accounts') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Duplicate account number' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients', {
        method: 'POST',
        body: JSON.stringify(validPayload),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error).toContain('savings_creation_failed')
      expect(deleteMock).toHaveBeenCalled()
    })
  })
})
