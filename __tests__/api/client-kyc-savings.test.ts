import { GET as GET_KYC, POST as POST_KYC } from '@/app/api/client/kyc-docs/route'
import { GET as GET_SAVINGS } from '@/app/api/client/savings/route'
import { GET as GET_SAVINGS_BY_ID } from '@/app/api/client/savings/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// Mock audit logger
jest.mock('@/lib/audit/audit-logger', () => ({
  auditLogger: {
    logInsert: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock notification service
jest.mock('@/lib/notifications/notification-service', () => ({
  notificationService: {
    createBulk: jest.fn().mockResolvedValue({ ok: true, count: 1 }),
  },
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/client/kyc-docs', () => {
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

      const response = await GET_KYC()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 404 if client record not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const response = await GET_KYC()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should fetch KYC document status', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        kyc_status: 'Approved',
        passport_photo: 'https://example.com/photo.jpg',
        national_id_front: 'https://example.com/id-front.jpg',
        national_id_back: null,
        updated_at: '2024-01-01',
      }

      const mockKycDocs = [
        {
          id: 'doc-1',
          doc_type: 'national_id_back',
          url: 'https://example.com/id-back-pending.jpg',
          status: 'pending_review',
          rejection_reason: null,
          created_at: '2024-01-02',
          reviewed_at: null,
        },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockKycDocs,
              error: null,
            }),
          }
        }
        return {}
      })

      const response = await GET_KYC()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.kycStatus).toBe('Approved')
      expect(body.docs.passport_photo.current_verified).toBeTruthy()
      expect(body.docs.national_id_back.pending).toBeTruthy()
    })
  })
})

describe('POST /api/client/kyc-docs', () => {
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

      const request = new Request('http://localhost:3000/api/client/kyc-docs', {
        method: 'POST',
        body: JSON.stringify({ docType: 'passport_photo', url: 'https://example.com/photo.jpg' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should return 400 for invalid doc type', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs', {
        method: 'POST',
        body: JSON.stringify({ docType: 'invalid_type', url: 'https://example.com/photo.jpg' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_doc_type')
    })

    it('should return 400 if url is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs', {
        method: 'POST',
        body: JSON.stringify({ docType: 'passport_photo' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('url_required')
    })
  })

  describe('Successful Upload', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should upload KYC document', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'senteloans_client_kyc_docs') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'doc-123', created_at: '2024-01-01' },
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { full_name: 'John Doe' },
              error: null,
            }),
          }
        }
        if (table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: [{ id: 'admin-1' }],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs', {
        method: 'POST',
        body: JSON.stringify({ docType: 'passport_photo', url: 'https://example.com/photo.jpg' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.pendingId).toBe('doc-123')
    })
  })
})

describe('GET /api/client/savings', () => {
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

      const response = await GET_SAVINGS()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 404 if client record not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const response = await GET_SAVINGS()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should list client savings accounts', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockAccounts = [
        {
          id: 'acc-1',
          account_number: 'SAV001',
          account_type: 'Regular Savings',
          available_balance: 100000,
          total_balance: 100000,
          status: 'Active',
          open_date: '2024-01-01',
          last_transaction_date: '2024-01-15',
        },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockAccounts,
              error: null,
            }),
          }
        }
        return {}
      })

      const response = await GET_SAVINGS()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.accounts).toHaveLength(1)
      expect(body.accounts[0].account_number).toBe('SAV001')
    })
  })
})

describe('GET /api/client/savings/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/client/savings/acc-1')
      const response = await GET_SAVINGS_BY_ID(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should fetch single savings account with transactions', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockAccount = {
        id: 'acc-1',
        account_number: 'SAV001',
        account_type: 'Regular Savings',
        available_balance: 100000,
        total_balance: 100000,
        status: 'Active',
        open_date: '2024-01-01',
        last_transaction_date: '2024-01-15',
      }

      const mockTransactions = [
        {
          id: 'tx-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
          description: 'Initial deposit',
          balance_after: 50000,
          transaction_date: '2024-01-01',
        },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: mockTransactions,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/savings/acc-1')
      const response = await GET_SAVINGS_BY_ID(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.account.account_number).toBe('SAV001')
      expect(body.transactions).toHaveLength(1)
      expect(body.transactions[0].type).toBe('Deposit')
    })

    it('should return 404 for non-existent account', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/savings/non-existent')
      const response = await GET_SAVINGS_BY_ID(request, { params: { id: 'non-existent' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })
})
