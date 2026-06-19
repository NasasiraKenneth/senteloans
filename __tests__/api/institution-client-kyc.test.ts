import { POST as POST_KYC } from '@/app/api/institution/clients/[id]/kyc/route'
import { GET as GET_PENDING } from '@/app/api/institution/clients/[id]/kyc/pending/route'
import { POST as POST_APPROVE } from '@/app/api/institution/clients/[id]/kyc/approve/route'
import { POST as POST_REJECT } from '@/app/api/institution/clients/[id]/kyc/reject/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// Mock audit logger
jest.mock('@/lib/audit/audit-logger', () => ({
  auditLogger: {
    logUpdate: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock notification service
jest.mock('@/lib/notifications/notification-service', () => ({
  notificationService: {
    create: jest.fn().mockResolvedValue(undefined),
  },
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('POST /api/institution/clients/[id]/kyc', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    createClient.mockReturnValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Validation', () => {
    it('should return 400 if docType is invalid', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc', {
        method: 'POST',
        body: JSON.stringify({ docType: 'invalid_type', url: 'https://example.com/doc.jpg' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Invalid payload')
    })

    it('should return 400 if url is missing', async () => {
      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc', {
        method: 'POST',
        body: JSON.stringify({ docType: 'passport_photo' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('Invalid payload')
    })
  })

  describe('Successful Update', () => {
    it.skip('should update client KYC document', async () => {
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'client-1' },
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc', {
        method: 'POST',
        body: JSON.stringify({
          docType: 'passport_photo',
          url: 'https://example.com/passport.jpg',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_KYC(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })
})

describe('GET /api/institution/clients/[id]/kyc/pending', () => {
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

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/pending')
      const response = await GET_PENDING(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 403 if app user is not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'No rows found' },
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/pending')
      const response = await GET_PENDING(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('forbidden')
    })

    it('should return 404 if client not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: null,
              error: { message: 'Not found' },
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/pending')
      const response = await GET_PENDING(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })

    it('should return 403 if client belongs to different institution', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
        role: 'institution_admin',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: { id: 'client-1', institution_id: 'different-inst' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/pending')
      const response = await GET_PENDING(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('forbidden')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should fetch pending KYC documents for client', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockPendingDocs = [
        { id: 'doc-1', doc_type: 'passport_photo', url: 'https://example.com/passport.jpg', status: 'pending_review', rejection_reason: null, created_at: '2024-01-01' },
        { id: 'doc-2', doc_type: 'national_id_front', url: 'https://example.com/id_front.jpg', status: 'pending_review', rejection_reason: null, created_at: '2024-01-02' },
      ]

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({
              data: mockPendingDocs,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/pending')
      const response = await GET_PENDING(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.pending).toHaveLength(2)
      expect(body.pending[0].doc_type).toBe('passport_photo')
    })
  })
})

describe('POST /api/institution/clients/[id]/kyc/approve', () => {
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

  describe('Validation', () => {
    it('should return 400 if pendingId is missing', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/approve', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_APPROVE(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('missing_pending_id')
    })
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/approve', {
        method: 'POST',
        body: JSON.stringify({ pendingId: 'doc-1' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_APPROVE(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 400 if document is not pending', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', client_id: 'client-1', institution_id: 'inst-123', status: 'verified', doc_type: 'passport_photo', url: 'https://example.com/doc.jpg' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/approve', {
        method: 'POST',
        body: JSON.stringify({ pendingId: 'doc-1' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_APPROVE(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('not_pending')
    })
  })

  describe('Successful Approval', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it.skip('should approve KYC document', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: { id: 'client-1', institution_id: 'inst-123', passport_photo: null },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'doc-1',
                client_id: 'client-1',
                institution_id: 'inst-123',
                status: 'pending_review',
                doc_type: 'passport_photo',
                url: 'https://example.com/passport.jpg',
              },
              error: null,
            }),
          }
        }
        if (table === 'senteloans_clients' && callCount > 3) {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        if (table === 'senteloans_client_kyc_docs' && callCount > 3) {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/approve', {
        method: 'POST',
        body: JSON.stringify({ pendingId: 'doc-1' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_APPROVE(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.column).toBe('passport_photo')
      expect(body.url).toBe('https://example.com/passport.jpg')
    })
  })
})

describe('POST /api/institution/clients/[id]/kyc/reject', () => {
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

  describe('Validation', () => {
    it('should return 400 if pendingId is missing', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/reject', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Poor quality' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REJECT(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('missing_pending_id')
    })
  })

  describe('Authentication & Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/reject', {
        method: 'POST',
        body: JSON.stringify({ pendingId: 'doc-1', reason: 'Poor quality' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REJECT(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })

    it('should return 400 if document is not pending', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }
      const mockAppUser = testFactories.user({
        auth_id: 'user-123',
        institution_id: 'inst-123',
      })

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'doc-1', client_id: 'client-1', institution_id: 'inst-123', status: 'rejected', doc_type: 'passport_photo', url: 'https://example.com/doc.jpg' },
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/reject', {
        method: 'POST',
        body: JSON.stringify({ pendingId: 'doc-1', reason: 'Poor quality' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REJECT(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('not_pending')
    })
  })

  describe('Successful Rejection', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      auth_id: 'user-123',
      institution_id: 'inst-123',
    })

    it('should reject KYC document with reason', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
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
              data: { id: 'client-1', institution_id: 'inst-123' },
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_client_kyc_docs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'doc-1',
                client_id: 'client-1',
                institution_id: 'inst-123',
                status: 'pending_review',
                doc_type: 'passport_photo',
                url: 'https://example.com/passport.jpg',
                rejection_reason: null,
              },
              error: null,
            }),
          }
        }
        if (table === 'senteloans_client_kyc_docs' && callCount > 3) {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/clients/client-1/kyc/reject', {
        method: 'POST',
        body: JSON.stringify({ pendingId: 'doc-1', reason: 'Poor image quality' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST_REJECT(request, { params: { id: 'client-1' } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
    })
  })
})
