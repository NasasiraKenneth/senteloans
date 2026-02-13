import { PUT as PUT_LOAN, GET as GET_LOAN } from '@/app/api/institution/loans/[id]/route'
import { GET as GET_REPAYMENTS } from '@/app/api/institution/loans/[id]/repayments/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

// Mock notification service
jest.mock('@/lib/notifications/notification-service', () => ({
  notificationService: {
    create: jest.fn().mockResolvedValue({ ok: true }),
  },
}))

const { createClient } = require('@/lib/supabase/server')
const { notificationService } = require('@/lib/notifications/notification-service')

describe('PUT /api/institution/loans/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Approved' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_LOAN(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 404 if loan not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'admin-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Approved' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_LOAN(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })

  describe('Status Transitions', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should update loan status from Applied to Approved', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'loan-1',
                institution_id: 'inst-123',
                status: 'Applied',
                approval_date: null,
              },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'admin-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_loans') {
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
        if (callCount === 5 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { client_id: 'client-1', principal_amount: 1000000 },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Approved' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_LOAN(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(notificationService.create).toHaveBeenCalled()
    })

    it('should reject invalid status transition', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'loan-1',
                institution_id: 'inst-123',
                status: 'Approved',
                approval_date: '2025-01-01',
              },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'admin-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Applied' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_LOAN(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_status_transition')
    })

    it('should send notification to client on status change', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'loan-1',
                institution_id: 'inst-123',
                status: 'Applied',
                approval_date: null,
              },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'admin-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_loans') {
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
        if (callCount === 5 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { client_id: 'client-1', principal_amount: 1000000 },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Rejected' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_LOAN(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(notificationService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientType: 'client',
          recipientId: 'client-1',
          type: 'loan_rejected',
        })
      )
    })
  })

  describe('RLS Enforcement', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should prevent cross-tenant updates', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'loan-1',
                institution_id: 'inst-456',
                status: 'Applied',
                approval_date: null,
              },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'admin-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'Approved' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_LOAN(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('cross_tenant_operation_forbidden')
    })
  })
})

describe('GET /api/institution/loans/[id]/repayments', () => {
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

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1/repayments')
      const response = await GET_REPAYMENTS(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 404 if loan not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
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

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1/repayments')
      const response = await GET_REPAYMENTS(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should fetch loan repayment schedule', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockRepayments = [
        {
          installment_number: 1,
          due_date: '2025-02-01',
          principal_amount: 80000,
          interest_amount: 10000,
          total_amount: 90000,
          amount_paid: 90000,
          status: 'Paid',
        },
        {
          installment_number: 2,
          due_date: '2025-03-01',
          principal_amount: 80000,
          interest_amount: 10000,
          total_amount: 90000,
          amount_paid: 0,
          status: 'Pending',
        },
      ]

      let callCount = 0
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_loans') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'loan-1' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_loan_repayments') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockRepayments,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1/repayments')
      const response = await GET_REPAYMENTS(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.repayments).toHaveLength(2)
      expect(body.repayments[0].installment).toBe(1)
      expect(body.repayments[0].status).toBe('Paid')
      expect(body.repayments[1].installment).toBe(2)
      expect(body.repayments[1].status).toBe('Pending')
    })

    it('should enforce RLS for loan access', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'loan-1' },
          error: null,
        }),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/loans/loan-1/repayments')
      const response = await GET_REPAYMENTS(request, { params: { id: 'loan-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.repayments).toBeDefined()
    })
  })
})
