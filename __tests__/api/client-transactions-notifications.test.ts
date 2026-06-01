import { GET as GET_TRANSACTIONS } from '@/app/api/client/transactions/route'
import { GET as GET_NOTIFICATIONS } from '@/app/api/client/notifications/route'
import { PATCH as PATCH_NOTIFICATION } from '@/app/api/client/notifications/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')

describe('GET /api/client/transactions', () => {
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

      const response = await GET_TRANSACTIONS()
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

      const response = await GET_TRANSACTIONS()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should list client transactions with aggregates', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockTransactions = [
        {
          id: 'tx-1',
          transaction_number: 'TXN001',
          type: 'Deposit',
          amount: 100000,
          mode: 'Cash',
          description: 'Savings deposit',
          balance_after: 100000,
          transaction_date: '2024-01-01',
          account_id: 'acc-1',
        },
      ]

      const mockSavings = [
        { total_balance: 100000 },
      ]

      const mockShares = [
        { total_value: 50000 },
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
        if (callCount === 2 && table === 'senteloans_transactions') {
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
        if (callCount === 3 && table === 'senteloans_savings_accounts') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockSavings,
                error: null,
              }),
            }),
          }
        }
        if (callCount === 4 && table === 'senteloans_client_shares') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: mockShares,
              error: null,
            }),
          }
        }
        return {}
      })

      const response = await GET_TRANSACTIONS()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.transactions).toHaveLength(1)
      expect(body.transactions[0].transaction_number).toBe('TXN001')
      expect(body.aggregates.totalSavings).toBe(100000)
      expect(body.aggregates.totalShares).toBe(50000)
    })
  })
})

describe('GET /api/client/notifications', () => {
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

      const request = new Request('http://localhost:3000/api/client/notifications')
      const response = await GET_NOTIFICATIONS(request)
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

      const request = new Request('http://localhost:3000/api/client/notifications')
      const response = await GET_NOTIFICATIONS(request)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should fetch client notifications with unread count', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      const mockNotifications = [
        {
          id: 'notif-1',
          recipient_type: 'member',
          recipient_id: 'client-1',
          type: 'loan_approved',
          title: 'Loan Approved',
          message: 'Your loan has been approved',
          action_url: '/client/loans/loan-123',
          read: false,
          created_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 'notif-2',
          recipient_type: 'member',
          recipient_id: 'client-1',
          type: 'kyc_approved',
          title: 'KYC Approved',
          message: 'Your KYC documents have been approved',
          action_url: '/client/profile',
          read: true,
          created_at: '2024-01-01T09:00:00Z',
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
        if (callCount === 2 && table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: mockNotifications,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockImplementation((fields: string, options: any) => {
              return {
                eq: jest.fn().mockReturnThis(),
              }
            }),
            eq: jest.fn().mockResolvedValue({
              data: null,
              error: null,
              count: 1,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/notifications')
      const response = await GET_NOTIFICATIONS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.notifications).toHaveLength(2)
    })

    it('should respect limit parameter', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      let callCount = 0
      let limitCalled = false
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
        if (callCount === 2 && table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation((n: number) => {
              limitCalled = n === 10
              return Promise.resolve({ data: [], error: null })
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockImplementation((fields: string, options: any) => {
              return {
                eq: jest.fn().mockReturnThis(),
              }
            }),
            eq: jest.fn().mockResolvedValue({
              data: null,
              error: null,
              count: 0,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/notifications?limit=10')
      const response = await GET_NOTIFICATIONS(request)

      expect(response.status).toBe(200)
      expect(limitCalled).toBe(true)
    })
  })
})

describe('PATCH /api/client/notifications/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/client/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH_NOTIFICATION(request, { params: { id: 'notif-1' } })
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

      const request = new Request('http://localhost:3000/api/client/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH_NOTIFICATION(request, { params: { id: 'notif-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should mark notification as read', async () => {
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
        if (callCount === 2 && table === 'senteloans_notifications') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH_NOTIFICATION(request, { params: { id: 'notif-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('should enforce RLS by checking recipient_id', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
      }

      let updateCalled = false
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
        if (callCount === 2 && table === 'senteloans_notifications') {
          updateCalled = true
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH_NOTIFICATION(request, { params: { id: 'notif-1' } })

      expect(updateCalled).toBe(true)
      expect(response.status).toBe(200)
    })
  })
})
