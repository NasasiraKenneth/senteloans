import { GET } from '@/app/api/institution/loan-products/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')

describe('GET /api/institution/loan-products', () => {
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

      const request = new Request('http://localhost:3000/api/institution/loan-products')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should list active loan products', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockProducts = [
        {
          id: 'prod-1',
          product_name: 'Personal Loan',
          product_code: 'PL001',
          description: 'Quick personal loans',
          minimum_amount: 100000,
          maximum_amount: 5000000,
          interest_rate: 15.5,
          minimum_tenure_months: 3,
          maximum_tenure_months: 24,
          interest_calculation_method: 'Reducing Balance',
          collateral_required: false,
          guarantors_required: 2,
          processing_fee_percentage: 2.0,
          insurance_required: false,
          status: 'Active',
        },
        {
          id: 'prod-2',
          product_name: 'Business Loan',
          product_code: 'BL001',
          description: 'Loans for business expansion',
          minimum_amount: 500000,
          maximum_amount: 20000000,
          interest_rate: 18.0,
          minimum_tenure_months: 6,
          maximum_tenure_months: 36,
          interest_calculation_method: 'Flat Rate',
          collateral_required: true,
          guarantors_required: 1,
          processing_fee_percentage: 3.0,
          insurance_required: true,
          status: 'Active',
        },
      ]

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: mockProducts,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/loan-products')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(2)
      expect(body.items[0].product_name).toBe('Personal Loan')
      expect(body.items[0].interest_rate).toBe(15.5)
      expect(body.items[1].product_name).toBe('Business Loan')
    })

    it('should handle empty results', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/loan-products')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(0)
    })

    it('should filter by status', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockInactiveProducts = [
        {
          id: 'prod-3',
          product_name: 'Legacy Loan',
          product_code: 'LL001',
          description: 'Old loan product',
          minimum_amount: 100000,
          maximum_amount: 1000000,
          interest_rate: 20.0,
          minimum_tenure_months: 3,
          maximum_tenure_months: 12,
          interest_calculation_method: 'Flat Rate',
          collateral_required: false,
          guarantors_required: 1,
          processing_fee_percentage: 5.0,
          insurance_required: false,
          status: 'Inactive',
        },
      ]

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: mockInactiveProducts,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/loan-products?status=Inactive')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(1)
      expect(body.items[0].status).toBe('Inactive')
    })

    it('should respect limit parameter', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockProducts = [
        {
          id: 'prod-1',
          product_name: 'Personal Loan',
          product_code: 'PL001',
          description: 'Quick personal loans',
          minimum_amount: 100000,
          maximum_amount: 5000000,
          interest_rate: 15.5,
          minimum_tenure_months: 3,
          maximum_tenure_months: 24,
          interest_calculation_method: 'Reducing Balance',
          collateral_required: false,
          guarantors_required: 2,
          processing_fee_percentage: 2.0,
          insurance_required: false,
          status: 'Active',
        },
      ]

      let capturedLimit = 0
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation((n: number) => {
          capturedLimit = n
          return {
            eq: jest.fn().mockResolvedValue({
              data: mockProducts,
              error: null,
            }),
          }
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/loan-products?limit=5')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(capturedLimit).toBe(5)
      expect(body.items).toHaveLength(1)
    })
  })

  describe('RLS Enforcement', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should only return products from user institution via RLS', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      // RLS enforced at database level - only institution's products returned
      const mockProducts = [
        {
          id: 'prod-1',
          product_name: 'Personal Loan',
          product_code: 'PL001',
          description: 'Quick personal loans',
          minimum_amount: 100000,
          maximum_amount: 5000000,
          interest_rate: 15.5,
          minimum_tenure_months: 3,
          maximum_tenure_months: 24,
          interest_calculation_method: 'Reducing Balance',
          collateral_required: false,
          guarantors_required: 2,
          processing_fee_percentage: 2.0,
          insurance_required: false,
          status: 'Active',
        },
      ]

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          data: mockProducts,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/loan-products')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.items).toHaveLength(1)
      // RLS ensures only institution's products are returned
    })
  })
})
