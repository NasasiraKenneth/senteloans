import { GET as GET_LOANS, POST as POST_LOAN } from '@/app/api/institution/loans/route'
import { GET as GET_LOAN_BY_ID } from '@/app/api/institution/loans/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// Mock notification service
jest.mock('@/lib/notifications/notification-service', () => ({
  notificationService: {
    create: jest.fn().mockResolvedValue(undefined),
    createBulk: jest.fn().mockResolvedValue(undefined),
  },
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/institution/loans', () => {
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

      const request = new Request('http://localhost:3000/api/institution/loans')
      const response = await GET_LOANS(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should list loans with pagination', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockLoans = [
        {
          id: 'loan-1',
          institution_id: 'inst-123',
          client_id: 'client-1',
          loan_product_id: 'prod-1',
          application_id: 'LN-001',
          principal_amount: 1000000,
          interest_rate: 15.5,
          tenure_months: 12,
          outstanding_balance: 1000000,
          status: 'Applied',
          approval_date: null,
          disbursement_date: null,
          application_date: '2024-01-01',
        },
      ]

      const mockClients = [{ id: 'client-1', full_name: 'John Doe', client_number: 'CL001' }]
      const mockProducts = [{ id: 'prod-1', product_name: 'Personal Loan' }]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({
              data: mockLoans,
              error: null,
              count: 1,
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
        if (callCount === 3 && table === 'senteloans_loan_products') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockResolvedValue({
              data: mockProducts,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans?page=1&pageSize=10')
      const response = await GET_LOANS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(1)
      expect(body.items[0].application_id).toBe('LN-001')
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

      const request = new Request('http://localhost:3000/api/institution/loans')
      const response = await GET_LOANS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(0)
    })
  })
})

describe('GET /api/institution/loans/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1')
      const response = await GET_LOAN_BY_ID(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should fetch single loan with details', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockLoan = {
        id: 'loan-1',
        institution_id: 'inst-123',
        client_id: 'client-1',
        loan_product_id: 'prod-1',
        application_id: 'LN-001',
        principal_amount: 1000000,
        interest_rate: 15.5,
        tenure_months: 12,
        monthly_payment: 90000,
        total_amount: 1080000,
        outstanding_balance: 1000000,
        status: 'Applied',
        purpose: 'Business expansion',
        collateral_description: 'Land title',
        application_date: '2024-01-01',
        approval_date: null,
        disbursement_date: null,
        maturity_date: null,
        next_payment_date: null,
        overdue_days: 0,
        created_by: 'user-123',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      }

      const mockClient = { id: 'client-1', full_name: 'John Doe', client_number: 'CL001' }
      const mockProduct = { id: 'prod-1', product_name: 'Personal Loan' }

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockLoan,
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
        if (callCount === 3 && table === 'senteloans_loan_products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockProduct,
              error: null,
            }),
          }
        }
        if (callCount === 4 && table === 'senteloans_loan_guarantors') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }
        }
        if (callCount === 5 && table === 'senteloans_loan_repayments') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1')
      const response = await GET_LOAN_BY_ID(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.loan.application_id).toBe('LN-001')
      expect(body.loan.client_name).toBe('John Doe')
    })

    it('should return 404 for non-existent loan', async () => {
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

      const request = new Request('http://localhost:3000/api/institution/loans/non-existent')
      const response = await GET_LOAN_BY_ID(request, { params: { id: 'non-existent' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })
})

describe('POST /api/institution/loans', () => {
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

      const request = new Request('http://localhost:3000/api/institution/loans', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          loan_product_id: 'prod-1',
          principal_amount: 1000000,
          tenure_months: 12,
          purpose: 'Business expansion',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
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

      const request = new Request('http://localhost:3000/api/institution/loans', {
        method: 'POST',
        body: JSON.stringify({
          loan_product_id: 'prod-1',
          principal_amount: 1000000,
          tenure_months: 12,
          purpose: 'Business expansion',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('client_id_required')
    })

    it('should return 400 if principal_amount is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/loans', {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'client-1',
          loan_product_id: 'prod-1',
          principal_amount: -1000,
          tenure_months: 12,
          purpose: 'Business expansion',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_principal_amount')
    })
  })
})
