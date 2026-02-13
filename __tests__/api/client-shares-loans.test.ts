import { GET as GET_SHARES } from '@/app/api/client/shares/route'
import { GET as GET_LOAN_PRODUCTS } from '@/app/api/client/loan-products/route'
import { GET as GET_LOANS, POST as POST_LOAN } from '@/app/api/client/loans/route'
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

describe('GET /api/client/shares', () => {
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

      const response = await GET_SHARES()
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

      const response = await GET_SHARES()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should fetch client shares summary and history', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockShares = [
        {
          id: 'share-1',
          number_of_shares: 10,
          share_value: 10000,
          total_value: 100000,
          purchase_date: '2024-01-01',
        },
        {
          id: 'share-2',
          number_of_shares: 5,
          share_value: 10000,
          total_value: 50000,
          purchase_date: '2024-02-01',
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
        if (callCount === 2 && table === 'senteloans_client_shares') {
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

      const response = await GET_SHARES()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.history).toHaveLength(2)
      expect(body.totals.units).toBe(15)
      expect(body.totals.totalValue).toBe(150000)
    })
  })
})

describe('GET /api/client/loan-products', () => {
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

      const response = await GET_LOAN_PRODUCTS()
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

      const response = await GET_LOAN_PRODUCTS()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should fetch available loan products', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockProducts = [
        {
          id: 'prod-1',
          product_name: 'Personal Loan',
          description: 'Quick personal loan',
          interest_rate: 15.5,
          minimum_amount: 100000,
          maximum_amount: 5000000,
          minimum_tenure_months: 3,
          maximum_tenure_months: 24,
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
        if (callCount === 2 && table === 'senteloans_loan_products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockProducts,
              error: null,
            }),
          }
        }
        return {}
      })

      const response = await GET_LOAN_PRODUCTS()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.products).toHaveLength(1)
      expect(body.products[0].name).toBe('Personal Loan')
    })
  })
})

describe('GET /api/client/loans', () => {
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

      const response = await GET_LOANS()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should list client loans', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockLoans = [
        {
          id: 'loan-1',
          application_id: 'LA-20240101-000001',
          principal_amount: 1000000,
          interest_rate: 15.5,
          tenure_months: 12,
          outstanding_balance: 1000000,
          status: 'Applied',
          next_payment_date: null,
          loan_product_id: 'prod-1',
          application_date: '2024-01-01',
        },
      ]

      const mockProducts = [
        { id: 'prod-1', product_name: 'Personal Loan' },
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
        if (callCount === 2 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockLoans,
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

      const response = await GET_LOANS()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.loans).toHaveLength(1)
      expect(body.loans[0].applicationId).toBe('LA-20240101-000001')
    })
  })
})

describe('POST /api/client/loans', () => {
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

      const request = new Request('http://localhost:3000/api/client/loans', {
        method: 'POST',
        body: JSON.stringify({
          loan_product_id: 'prod-1',
          principal_amount: 1000000,
          tenure_months: 12,
          purpose: 'Business expansion',
          monthly_income: 500000,
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
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should return 400 if client is not active', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        full_name: 'John Doe',
        status: 'Inactive',
        kyc_status: 'Verified',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/loans', {
        method: 'POST',
        body: JSON.stringify({
          loan_product_id: 'prod-1',
          principal_amount: 1000000,
          tenure_months: 12,
          purpose: 'Business expansion',
          monthly_income: 500000,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('not active')
    })

    it('should return 400 if KYC is not verified', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        full_name: 'John Doe',
        status: 'Active',
        kyc_status: 'Pending',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/loans', {
        method: 'POST',
        body: JSON.stringify({
          loan_product_id: 'prod-1',
          principal_amount: 1000000,
          tenure_months: 12,
          purpose: 'Business expansion',
          monthly_income: 500000,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('KYC verification required')
    })

    it('should return 400 for missing required fields', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        full_name: 'John Doe',
        status: 'Active',
        kyc_status: 'Verified',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/loans', {
        method: 'POST',
        body: JSON.stringify({
          principal_amount: 1000000,
          tenure_months: 12,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Loan product is required')
    })
  })

  describe('Successful Creation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should create loan application', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        full_name: 'John Doe',
        status: 'Active',
        kyc_status: 'Verified',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const mockProduct = {
        id: 'prod-1',
        product_name: 'Personal Loan',
        interest_rate: 15.5,
        minimum_amount: 100000,
        maximum_amount: 5000000,
        minimum_tenure_months: 3,
        maximum_tenure_months: 24,
        institution_id: 'inst-123',
      }

      const mockInstitution = {
        id: 'inst-123',
        type: 'MFI',
      }

      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'senteloans_loan_products') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockProduct,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_loans') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'loan-123', application_id: 'LA-20240101-000001' },
              error: null,
            }),
          }
        }
        if (table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            neq: jest.fn().mockResolvedValue({
              data: [{ id: 'admin-1' }],
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/loans', {
        method: 'POST',
        body: JSON.stringify({
          loan_product_id: 'prod-1',
          principal_amount: 1000000,
          tenure_months: 12,
          purpose: 'Business expansion for my shop',
          monthly_income: 500000,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_LOAN(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.loanId).toBe('loan-123')
      expect(body.applicationId).toBe('LA-20240101-000001')
    })
  })
})
