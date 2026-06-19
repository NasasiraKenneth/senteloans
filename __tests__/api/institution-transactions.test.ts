import { GET as GET_TRANSACTIONS, POST as POST_TRANSACTION } from '@/app/api/institution/transactions/route'
import { GET as GET_TRANSACTION_BY_ID } from '@/app/api/institution/transactions/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')

describe('GET /api/institution/transactions', () => {
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

      const request = new Request('http://localhost:3000/api/institution/transactions')
      const response = await GET_TRANSACTIONS(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should list transactions with pagination', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockTransactions = [
        {
          id: 'tx-1',
          client_id: 'client-1',
          account_id: 'acc-1',
          loan_id: null,
          transaction_number: 'TXN-001',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
          description: 'Initial deposit',
          reference_number: '',
          balance_after: 50000,
          transaction_date: '2024-01-01',
        },
        {
          id: 'tx-2',
          client_id: 'client-2',
          account_id: 'acc-2',
          loan_id: null,
          transaction_number: 'TXN-002',
          type: 'Withdrawal',
          amount: 10000,
          mode: 'Mobile Money',
          description: 'Cash withdrawal',
          reference_number: '',
          balance_after: 40000,
          transaction_date: '2024-01-02',
        },
      ]

      const mockClients = [
        { id: 'client-1', full_name: 'John Doe' },
        { id: 'client-2', full_name: 'Jane Smith' },
      ]

      const mockAccounts = [
        { id: 'acc-1', account_number: 'SAV001' },
        { id: 'acc-2', account_number: 'SAV002' },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({
              data: mockTransactions,
              error: null,
              count: 2,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: mockClients,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: mockAccounts,
              error: null,
            }),
          }
        }
        if (callCount === 4 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions?page=1&pageSize=10')
      const response = await GET_TRANSACTIONS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.total).toBe(2)
      expect(body.items[0].transaction_number).toBe('TXN-001')
      expect(body.items[0].memberName).toBe('John Doe')
    })

    it('should handle empty results', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({
              data: [],
              error: null,
              count: 0,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions')
      const response = await GET_TRANSACTIONS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(0)
      expect(body.total).toBe(0)
    })
  })
})

describe('GET /api/institution/transactions/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/transactions/tx-1')
      const response = await GET_TRANSACTION_BY_ID(request, { params: { id: 'tx-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should fetch single transaction with context', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockTransaction = {
        id: 'tx-1',
        institution_id: 'inst-123',
        client_id: 'client-1',
        account_id: 'acc-1',
        loan_id: null,
        transaction_number: 'TXN-001',
        type: 'Deposit',
        amount: 50000,
        mode: 'Cash',
        description: 'Initial deposit',
        reference_number: '',
        balance_before: 0,
        balance_after: 50000,
        processed_by: 'user-123',
        transaction_date: '2024-01-01',
        status: 'Completed',
        created_at: '2024-01-01',
      }

      const mockClient = { id: 'client-1', full_name: 'John Doe' }
      const mockAccount = { id: 'acc-1', account_number: 'SAV001' }
      const mockProcessor = { id: 'user-123', full_name: 'Admin User' }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockTransaction,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
              error: null,
            }),
          }
        }
        if (callCount === 4 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockProcessor,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions/tx-1')
      const response = await GET_TRANSACTION_BY_ID(request, { params: { id: 'tx-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.transaction.transaction_number).toBe('TXN-001')
      expect(body.transaction.client_name).toBe('John Doe')
      expect(body.transaction.account_number).toBe('SAV001')
      expect(body.transaction.processed_by_name).toBe('Admin User')
    })

    it('should return 404 for non-existent transaction', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
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

      const request = new Request('http://localhost:3000/api/institution/transactions/non-existent')
      const response = await GET_TRANSACTION_BY_ID(request, { params: { id: 'non-existent' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })
})

describe('POST /api/institution/transactions', () => {
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

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should return 400 if client_id is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          account_id: 'acc-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('client_id_required')
    })

    it('should return 400 if account_id is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('account_id_required')
    })

    it('should return 400 if type is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'InvalidType',
          amount: 50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_type')
    })

    it('should return 400 if amount is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Deposit',
          amount: -50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_amount')
    })

    it('should return 400 if mode is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'InvalidMode',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_mode')
    })

    it('should return 400 for insufficient funds on withdrawal', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAppUser = { id: 'user-123', institution_id: 'inst-123' }
      const mockClient = { id: 'client-1', institution_id: 'inst-123', status: 'Active' }
      const mockAccount = { id: 'acc-1', institution_id: 'inst-123', status: 'Active', available_balance: 10000, total_balance: 10000 }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Withdrawal',
          amount: 50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('insufficient_funds')
    })

    it('should return 400 if account is not active', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAppUser = { id: 'user-123', institution_id: 'inst-123' }
      const mockClient = { id: 'client-1', institution_id: 'inst-123', status: 'Active' }
      const mockAccount = { id: 'acc-1', institution_id: 'inst-123', status: 'Closed', available_balance: 10000, total_balance: 10000 }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('account_not_active')
    })
  })

  describe('Successful Transaction', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should create deposit transaction', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAppUser = { id: 'user-123', institution_id: 'inst-123' }
      const mockClient = { id: 'client-1', institution_id: 'inst-123', status: 'Active' }
      const mockAccount = { id: 'acc-1', institution_id: 'inst-123', status: 'Active', available_balance: 0, total_balance: 0 }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
              error: null,
            }),
          }
        }
        if (callCount === 4 && table === 'senteloans_savings_accounts') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        if (callCount === 5 && table === 'senteloans_transactions') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'tx-123' },
              error: null,
            }),
          }
        }
        if (callCount === 6 && table === 'senteloans_audit_logs') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Deposit',
          amount: 50000,
          mode: 'Cash',
          description: 'Initial deposit',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.id).toBe('tx-123')
      expect(body.balance_after).toBe(50000)
    })

    it('should create withdrawal transaction', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAppUser = { id: 'user-123', institution_id: 'inst-123' }
      const mockClient = { id: 'client-1', institution_id: 'inst-123', status: 'Active' }
      const mockAccount = { id: 'acc-1', institution_id: 'inst-123', status: 'Active', available_balance: 100000, total_balance: 100000 }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockClient,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
              error: null,
            }),
          }
        }
        if (callCount === 4 && table === 'senteloans_savings_accounts') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        if (callCount === 5 && table === 'senteloans_transactions') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'tx-123' },
              error: null,
            }),
          }
        }
        if (callCount === 6 && table === 'senteloans_audit_logs') {
          return {
            insert: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/transactions', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          account_id: 'acc-1',
          type: 'Withdrawal',
          amount: 30000,
          mode: 'Mobile Money',
          description: 'Cash withdrawal',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_TRANSACTION(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.id).toBe('tx-123')
      expect(body.balance_after).toBe(70000)
    })
  })
})
