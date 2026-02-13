import { GET as GET_SAVINGS } from '@/app/api/institution/savings/route'
import { GET as GET_SAVINGS_BY_ID, PUT as PUT_SAVINGS } from '@/app/api/institution/savings/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')

describe('GET /api/institution/savings', () => {
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

      const request = new Request('http://localhost:3000/api/institution/savings')
      const response = await GET_SAVINGS(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should list savings accounts with pagination', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAccounts = [
        {
          id: 'acc-1',
          client_id: 'client-1',
          account_number: 'SAV001',
          account_type: 'Regular',
          available_balance: 100000,
          total_balance: 100000,
          status: 'Active',
          open_date: '2024-01-01',
          last_transaction_date: '2024-01-15',
        },
        {
          id: 'acc-2',
          client_id: 'client-2',
          account_number: 'SAV002',
          account_type: 'Fixed',
          available_balance: 500000,
          total_balance: 500000,
          status: 'Active',
          open_date: '2024-01-02',
          last_transaction_date: '2024-01-16',
        },
      ]

      const mockClients = [
        { id: 'client-1', full_name: 'John Doe' },
        { id: 'client-2', full_name: 'Jane Smith' },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({
              data: mockAccounts,
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
        if (callCount === 3 && table === 'senteloans_transactions') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/savings?page=1&pageSize=10')
      const response = await GET_SAVINGS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.total).toBe(2)
      expect(body.items[0].account_number).toBe('SAV001')
      expect(body.items[0].client_name).toBe('John Doe')
    })

    it('should handle empty results', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/savings')
      const response = await GET_SAVINGS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(0)
      expect(body.total).toBe(0)
    })
  })
})

describe('GET /api/institution/savings/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1')
      const response = await GET_SAVINGS_BY_ID(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should fetch single savings account with transactions', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAccount = {
        id: 'acc-1',
        client_id: 'client-1',
        institution_id: 'inst-123',
        account_number: 'SAV001',
        account_type: 'Regular',
        available_balance: 100000,
        total_balance: 100000,
        status: 'Active',
        open_date: '2024-01-01',
        last_transaction_date: '2024-01-15',
      }

      const mockClient = { id: 'client-1', full_name: 'John Doe' }

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
        {
          id: 'tx-2',
          type: 'Deposit',
          amount: 50000,
          mode: 'Mobile Money',
          description: 'Additional deposit',
          balance_after: 100000,
          transaction_date: '2024-01-15',
        },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockAccount,
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

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1')
      const response = await GET_SAVINGS_BY_ID(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.account.account_number).toBe('SAV001')
      expect(body.account.client_name).toBe('John Doe')
      expect(body.transactions).toHaveLength(2)
      expect(body.transactions[0].type).toBe('Deposit')
    })

    it('should return 404 for non-existent account', async () => {
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

      const request = new Request('http://localhost:3000/api/institution/savings/non-existent')
      const response = await GET_SAVINGS_BY_ID(request, { params: { id: 'non-existent' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })
})

describe('PUT /api/institution/savings/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Inactive' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_SAVINGS(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should return 400 if status is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'InvalidStatus' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_SAVINGS(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_status')
    })

    it('should return 400 if no changes provided', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_SAVINGS(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('no_changes')
    })

    it('should return 400 for invalid transition from Closed to Active', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'acc-1', status: 'Closed' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Active' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_SAVINGS(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_transition_closed_to_active')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should update account status', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockAccount = {
        id: 'acc-1',
        client_id: 'client-1',
        institution_id: 'inst-123',
        account_number: 'SAV001',
        account_type: 'Regular',
        available_balance: 100000,
        total_balance: 100000,
        status: 'Inactive',
        open_date: '2024-01-01',
        last_transaction_date: '2024-01-15',
      }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'acc-1', status: 'Active' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_savings_accounts') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
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

      const request = new Request('http://localhost:3000/api/institution/savings/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Inactive' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_SAVINGS(request, { params: { id: 'acc-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.account.status).toBe('Inactive')
    })
  })
})
