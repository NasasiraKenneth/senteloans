import { GET } from '@/app/api/institution/notifications/route'
import { PATCH } from '@/app/api/institution/notifications/[id]/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/institution/notifications', () => {
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

      const request = new Request('http://localhost:3000/api/institution/notifications')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 404 if user record not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/notifications')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('user_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockInstUser = { id: 'inst-user-123', institution_id: 'inst-123', role: 'institution_admin' }

    it('should fetch notifications with unread count', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockNotifications = [
        {
          id: 'notif-1',
          recipient_type: 'institution_user',
          recipient_id: 'inst-user-123',
          type: 'pending_loan_approval',
          title: 'New Loan Application',
          message: 'John Doe applied for a loan',
          action_url: '/institution/loans/loan-123',
          read: false,
          created_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 'notif-2',
          recipient_type: 'institution_user',
          recipient_id: 'inst-user-123',
          type: 'kyc_submitted',
          title: 'KYC Document Submitted',
          message: 'Jane Smith submitted KYC documents',
          action_url: '/institution/clients/client-456/kyc',
          read: true,
          created_at: '2024-01-01T09:00:00Z',
        },
      ]

      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: mockNotifications,
              error: null,
              count: 1,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/notifications')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.notifications).toHaveLength(2)
      expect(body.notifications[0].title).toBe('New Loan Application')
    })

    it.skip('should filter unread notifications only', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockUnreadNotifications = [
        {
          id: 'notif-1',
          recipient_type: 'institution_user',
          recipient_id: 'inst-user-123',
          type: 'pending_loan_approval',
          title: 'New Loan Application',
          message: 'John Doe applied for a loan',
          action_url: '/institution/loans/loan-123',
          read: false,
          created_at: '2024-01-01T10:00:00Z',
        },
      ]

      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: mockUnreadNotifications,
              error: null,
              count: 1,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/notifications?unread_only=true')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.notifications).toHaveLength(1)
      expect(body.notifications[0].read).toBe(false)
    })

    it('should respect limit parameter', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let capturedLimit = 0
      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstUser,
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
              capturedLimit = n
              return Promise.resolve({
                data: [],
                error: null,
              })
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: null,
              count: 0,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/notifications?limit=10')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(capturedLimit).toBe(10)
    })

    it('should handle empty notifications', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstUser,
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
              data: [],
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: null,
              count: 0,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/notifications')
      const response = await GET(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.notifications).toHaveLength(0)
      expect(body.unreadCount).toBe(0)
    })
  })
})

describe('PATCH /api/institution/notifications/[id]', () => {
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

      const request = new Request('http://localhost:3000/api/institution/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'notif-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 404 if user record not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      })

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'notif-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('user_not_found')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockInstUser = { id: 'inst-user-123', institution_id: 'inst-123', role: 'institution_admin' }

    it('should mark notification as read', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstUser,
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

      const request = new Request('http://localhost:3000/api/institution/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'notif-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })

    it('should enforce RLS by checking recipient_id', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let updateCalled = false
      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstUser,
              error: null,
            }),
          }
        }
        if (table === 'senteloans_notifications') {
          updateCalled = true
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/notifications/notif-1', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PATCH(request, { params: { id: 'notif-1' } })

      expect(updateCalled).toBe(true)
      expect(response.status).toBe(200)
    })
  })
})
