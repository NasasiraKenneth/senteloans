import { GET as GET_ME } from '@/app/api/client/me/route'
import { PUT as PUT_PROFILE } from '@/app/api/client/profile/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

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

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/client/me', () => {
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

      const response = await GET_ME()
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

      const response = await GET_ME()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should fetch client profile with institution context', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        client_number: 'CL001',
        full_name: 'John Doe',
        phone_number: '+256700000000',
        email: 'john@example.com',
        kyc_status: 'Approved',
        status: 'Active',
        passport_photo: 'https://example.com/photo.jpg',
        join_date: '2024-01-01',
        date_of_birth: '1990-01-01',
        gender: 'Male',
        marital_status: 'Single',
        monthly_income: 500000,
        village: 'Kampala',
        district: 'Kampala',
        occupation: 'Teacher',
        next_of_kin_name: 'Jane Doe',
        next_of_kin_relationship: 'Sister',
        next_of_kin_phone: '+256700000001',
        mobile_money_provider: 'MTN',
        mobile_money_number: '+256700000000',
        bank_name: 'Stanbic',
        bank_account_number: '1234567890',
        bank_account_name: 'John Doe',
        bank_branch: 'Kampala',
      }

      const mockInstitution = {
        id: 'inst-123',
        name: 'Test SACCO',
        type: 'SACCO',
        settings: { clientTerminology: 'Members' },
        status: 'Active',
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
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        return {}
      })

      const response = await GET_ME()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.client.id).toBe('client-1')
      expect(body.client.fullName).toBe('John Doe')
      expect(body.client.clientNumber).toBe('CL001')
      expect(body.institution.id).toBe('inst-123')
      expect(body.institution.name).toBe('Test SACCO')
      expect(body.institution.config.clientTerminology).toBe('Members')
    })
  })
})

describe('PUT /api/client/profile', () => {
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

      const request = new Request('http://localhost:3000/api/client/profile', {
        method: 'PUT',
        body: JSON.stringify({ village: 'Kampala' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_PROFILE(request)
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

      const request = new Request('http://localhost:3000/api/client/profile', {
        method: 'PUT',
        body: JSON.stringify({ village: 'Kampala' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_PROFILE(request)
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('client_not_found')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should return 400 for invalid phone number', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        village: 'Kampala',
        district: 'Kampala',
        occupation: 'Teacher',
        next_of_kin_name: 'Jane Doe',
        next_of_kin_relationship: 'Sister',
        next_of_kin_phone: '+256700000001',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/profile', {
        method: 'PUT',
        body: JSON.stringify({ nextOfKinPhone: 'invalid-phone' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_PROFILE(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('invalid_next_of_kin_phone')
    })

    it('should return 400 for too long fields', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        village: 'Kampala',
        district: 'Kampala',
        occupation: 'Teacher',
        next_of_kin_name: 'Jane Doe',
        next_of_kin_relationship: 'Sister',
        next_of_kin_phone: '+256700000001',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/profile', {
        method: 'PUT',
        body: JSON.stringify({ village: 'a'.repeat(501) }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_PROFILE(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toContain('location_too_long')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'client@example.com' }

    it('should update profile fields', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        village: 'Kampala',
        district: 'Kampala',
        occupation: 'Teacher',
        next_of_kin_name: 'Jane Doe',
        next_of_kin_relationship: 'Sister',
        next_of_kin_phone: '+256700000001',
      }

      const updatedClient = {
        id: 'client-1',
        village: 'Entebbe',
        district: 'Wakiso',
        occupation: 'Engineer',
        next_of_kin_name: 'Jane Doe',
        next_of_kin_relationship: 'Sister',
        next_of_kin_phone: '+256700000001',
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
        return {}
      })

      mockServiceClient.from.mockImplementation((table: string) => {
        if (table === 'senteloans_clients') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  error: null,
                }),
              }),
            }),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: updatedClient,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/client/profile', {
        method: 'PUT',
        body: JSON.stringify({
          village: 'Entebbe',
          district: 'Wakiso',
          occupation: 'Engineer',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_PROFILE(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.updated).toBe(true)
      expect(body.profile.village).toBe('Entebbe')
    })

    it('should return ok without update if no changes', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockClient = {
        id: 'client-1',
        institution_id: 'inst-123',
        village: 'Kampala',
        district: 'Kampala',
        occupation: 'Teacher',
        next_of_kin_name: 'Jane Doe',
        next_of_kin_relationship: 'Sister',
        next_of_kin_phone: '+256700000001',
      }

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockClient,
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/client/profile', {
        method: 'PUT',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_PROFILE(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.updated).toBe(false)
    })
  })
})
