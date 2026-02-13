import { POST as POST_CHANGE_PASSWORD } from '@/app/api/client/security/change-password/route'
import { POST as POST_REPLACE_KYC } from '@/app/api/client/kyc-docs/replace/route'
import { POST as POST_CANCEL_KYC } from '@/app/api/client/kyc-docs/cancel/route'
import { GET as GET_SEARCH_GUARANTORS } from '@/app/api/client/search-guarantors/route'
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
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock notification service
jest.mock('@/lib/notifications/notification-service', () => ({
  notificationService: {
    createBulk: jest.fn().mockResolvedValue({ ok: true, count: 1 }),
  },
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('POST /api/client/security/change-password', () => {
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

      const request = new Request('http://localhost:3000/api/client/security/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'oldpass123',
          newPassword: 'newpass123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CHANGE_PASSWORD(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should return 400 if current password is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/client/security/change-password', {
        method: 'POST',
        body: JSON.stringify({
          newPassword: 'newpass123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CHANGE_PASSWORD(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('current_password_required')
    })

    it('should return 400 if new password is too short', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/client/security/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'oldpass123',
          newPassword: 'short',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CHANGE_PASSWORD(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('new_password_too_short')
    })

    it('should return 400 if current password is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: { message: 'Invalid credentials' },
      })

      const request = new Request('http://localhost:3000/api/client/security/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'wrongpass',
          newPassword: 'newpass123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CHANGE_PASSWORD(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_current_password')
    })
  })

  describe('Successful Password Change', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should change password successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.auth.updateUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'app-user-1', institution_id: 'inst-123' },
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/security/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'oldpass123',
          newPassword: 'newpass123',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CHANGE_PASSWORD(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' })
    })
  })
})

describe('POST /api/client/kyc-docs/replace', () => {
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

      const request = new Request('http://localhost:3000/api/client/kyc-docs/replace', {
        method: 'POST',
        body: JSON.stringify({
          docType: 'passport_photo',
          url: 'https://example.com/photo.jpg',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REPLACE_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should return 400 for invalid document type', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs/replace', {
        method: 'POST',
        body: JSON.stringify({
          docType: 'invalid_type',
          url: 'https://example.com/photo.jpg',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REPLACE_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_doc_type')
    })

    it('should return 400 if URL is missing', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs/replace', {
        method: 'POST',
        body: JSON.stringify({
          docType: 'passport_photo',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REPLACE_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('url_required')
    })
  })

  describe('Successful Replace', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should replace KYC document successfully', async () => {
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

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_client_kyc_docs') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'kyc-doc-1', created_at: new Date().toISOString() },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { full_name: 'John Doe' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_users') {
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

      const request = new Request('http://localhost:3000/api/client/kyc-docs/replace', {
        method: 'POST',
        body: JSON.stringify({
          docType: 'passport_photo',
          url: 'https://example.com/new-photo.jpg',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REPLACE_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.pendingId).toBe('kyc-doc-1')
    })
  })
})

describe('POST /api/client/kyc-docs/cancel', () => {
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

      const request = new Request('http://localhost:3000/api/client/kyc-docs/cancel', {
        method: 'POST',
        body: JSON.stringify({
          pendingId: 'pending-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CANCEL_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should return 400 if pending document is not in pending_review status', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'pending-1',
                client_id: 'client-1',
                institution_id: 'inst-123',
                status: 'approved',
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs/cancel', {
        method: 'POST',
        body: JSON.stringify({
          pendingId: 'pending-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CANCEL_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('not_pending')
    })

    it('should return 403 if document belongs to different client', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'pending-1',
                client_id: 'client-2',
                institution_id: 'inst-123',
                status: 'pending_review',
              },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs/cancel', {
        method: 'POST',
        body: JSON.stringify({
          pendingId: 'pending-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CANCEL_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('forbidden')
    })
  })

  describe('Successful Cancel', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should cancel pending KYC document successfully', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_clients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'pending-1',
                client_id: 'client-1',
                institution_id: 'inst-123',
                status: 'pending_review',
              },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_kyc_docs') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/kyc-docs/cancel', {
        method: 'POST',
        body: JSON.stringify({
          pendingId: 'pending-1',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_CANCEL_KYC(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })
})

describe('GET /api/client/search-guarantors', () => {
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

      const request = new Request('http://localhost:3000/api/client/search-guarantors?q=john')
      const response = await GET_SEARCH_GUARANTORS(request)
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

      const request = new Request('http://localhost:3000/api/client/search-guarantors?q=john')
      const response = await GET_SEARCH_GUARANTORS(request)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Search Validation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should require at least 2 characters', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'client-1', institution_id: 'inst-123' },
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/search-guarantors?q=j')
      const response = await GET_SEARCH_GUARANTORS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.guarantors).toEqual([])
      expect(body.message).toContain('at least 2 characters')
    })
  })

  describe('Successful Search', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should search for guarantors and exclude self', async () => {
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

      const mockMembers = [
        {
          id: 'client-2',
          full_name: 'John Doe',
          phone_number: '+256700000001',
          client_number: 'MEM-002',
          kyc_status: 'Verified',
        },
        {
          id: 'client-3',
          full_name: 'Jane Doe',
          phone_number: '+256700000002',
          client_number: 'MEM-003',
          kyc_status: 'Verified',
        },
      ]

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/search-guarantors?q=doe')
      const response = await GET_SEARCH_GUARANTORS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.guarantors).toHaveLength(2)
      expect(body.guarantors[0].full_name).toBe('John Doe')
      expect(body.guarantors[0].member_number).toBe('MEM-002')
    })

    it('should filter to only verified KYC members', async () => {
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

      const mockMembers = [
        {
          id: 'client-2',
          full_name: 'John Doe',
          phone_number: '+256700000001',
          client_number: 'MEM-002',
          kyc_status: 'Verified',
        },
        {
          id: 'client-3',
          full_name: 'Jane Doe',
          phone_number: '+256700000002',
          client_number: 'MEM-003',
          kyc_status: 'Pending',
        },
      ]

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: mockMembers,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/search-guarantors?q=doe')
      const response = await GET_SEARCH_GUARANTORS(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.guarantors).toHaveLength(1)
      expect(body.guarantors[0].full_name).toBe('John Doe')
    })
  })
})
