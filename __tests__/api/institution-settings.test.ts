import { GET, PUT } from '@/app/api/institution/settings/route'
import { GET as GET_ORG, PUT as PUT_ORG } from '@/app/api/institution/organization/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'
import { testFactories } from '../utils/test-factories'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const { createClient, createServiceClient } = require('@/lib/supabase/server')

describe('GET /api/institution/settings', () => {
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

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })

    it('should return 403 if app user is not found', async () => {
      const mockUser = { id: 'user-123', email: 'admin@institution.com' }

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
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'No rows found' },
            }),
          }
        }
        return {}
      })

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error).toBe('no_app_user')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      supabase_user_id: 'user-123',
      institution_id: 'inst-123',
    })
    const mockInstitution = testFactories.institution({
      id: 'inst-123',
      type: 'SACCO',
      settings: {
        modules: {
          loans: true,
          shares: true,
          savings: true,
          mobile_money: true,
        },
        currency: 'UGX',
        share_value: 10000,
        minimum_shares: 1,
        maximum_shares: 1000,
        clientTerminology: 'Member',
      },
    })

    it('should fetch institution settings with modules config', async () => {
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
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        return {}
      })

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.config.modules.loans).toBe(true)
      expect(body.config.modules.shares).toBe(true)
      expect(body.config.modules.savings).toBe(true)
      expect(body.config.currency).toBe('UGX')
      expect(body.config.shareValue).toBe(10000)
      expect(body.config.clientTerminology).toBe('Member')
    })

    it('should return 404 if institution not found', async () => {
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
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }
        }
        return {}
      })

      const response = await GET()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('institution_not_found')
    })
  })
})

describe('PUT /api/institution/settings', () => {
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

      const request = new Request('http://localhost:3000/api/institution/settings', {
        method: 'PUT',
        body: JSON.stringify({ config: { currency: 'USD' } }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('Unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      supabase_user_id: 'user-123',
      institution_id: 'inst-123',
    })
    const mockInstitution = testFactories.institution({
      id: 'inst-123',
      type: 'SACCO',
      settings: {
        modules: { loans: true, shares: true, savings: true },
        share_value: 10000,
      },
    })

    it('should return 400 if share_value is invalid when shares enabled', async () => {
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
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/settings', {
        method: 'PUT',
        body: JSON.stringify({
          config: {
            modules: { shares: true },
            shareValue: 0,
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('share_value_required')
    })

    it('should return 400 if minimum_shares > maximum_shares', async () => {
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
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        return {}
      })

      const request = new Request('http://localhost:3000/api/institution/settings', {
        method: 'PUT',
        body: JSON.stringify({
          config: {
            modules: { shares: true },
            shareValue: 10000,
            minimumShares: 100,
            maximumShares: 50,
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('min_greater_than_max')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = testFactories.user({
      supabase_user_id: 'user-123',
      institution_id: 'inst-123',
    })
    const mockInstitution = testFactories.institution({
      id: 'inst-123',
      type: 'SACCO',
      settings: {
        modules: { loans: true, shares: false, savings: true },
      },
    })

    it('should update settings with valid data', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const updatedSettings = {
        modules: { loans: true, shares: true, savings: true, mobile_money: true },
        currency: 'UGX',
        share_value: 10000,
        minimum_shares: 1,
        maximum_shares: 1000,
        clientTerminology: 'Member',
      }

      let callCount = 0
      mockServiceClient.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1 && table === 'senteloans_users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockInstitution,
              error: null,
            }),
          }
        }
        if (callCount === 3 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { ...mockInstitution, settings: updatedSettings },
              error: null,
            }),
          }
        }
        return {}
      })

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/settings', {
        method: 'PUT',
        body: JSON.stringify({
          config: {
            modules: { shares: true },
            currency: 'UGX',
            shareValue: 10000,
            minimumShares: 1,
            maximumShares: 1000,
            clientTerminology: 'Member',
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.config.modules.shares).toBe(true)
      expect(body.config.currency).toBe('UGX')
      expect(body.config.shareValue).toBe(10000)
    })
  })
})

describe('GET /api/institution/organization', () => {
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

      const response = await GET_ORG()
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Successful Fetch', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should fetch organization details', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const mockData = {
        institution_id: 'inst-123',
        institutions: {
          id: 'inst-123',
          name: 'Test SACCO',
          type: 'SACCO',
          address: 'Kampala, Uganda',
          phone_number: '+256700000000',
          email: 'info@testsacco.com',
          license_number: 'LIC123',
          registration_number: 'REG456',
          website: 'https://testsacco.com',
          established_date: '2020-01-01',
        },
      }

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      })

      const response = await GET_ORG()
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.name).toBe('Test SACCO')
      expect(body.type).toBe('SACCO')
      expect(body.address).toBe('Kampala, Uganda')
      expect(body.email).toBe('info@testsacco.com')
    })

    it('should return 404 if institution not found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      mockServiceClient.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      })

      const response = await GET_ORG()
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body.error).toBe('not_found')
    })
  })
})

describe('PUT /api/institution/organization', () => {
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

      const request = new Request('http://localhost:3000/api/institution/organization', {
        method: 'PUT',
        body: JSON.stringify({ address: 'New Address' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_ORG(request)
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('Validation', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }

    it('should return 400 for invalid email', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/organization', {
        method: 'PUT',
        body: JSON.stringify({ email: 'invalid-email' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_ORG(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_email')
    })

    it('should return 400 for invalid phone', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/organization', {
        method: 'PUT',
        body: JSON.stringify({ phone_number: '123' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_ORG(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_phone')
    })

    it('should return 400 for invalid website', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      })

      const request = new Request('http://localhost:3000/api/institution/organization', {
        method: 'PUT',
        body: JSON.stringify({ website: 'not-a-url' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_ORG(request)
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toBe('invalid_website')
    })
  })

  describe('Successful Update', () => {
    const mockUser = { id: 'user-123', email: 'admin@institution.com' }
    const mockAppUser = { institution_id: 'inst-123' }
    const updatedInstitution = {
      id: 'inst-123',
      name: 'Test SACCO',
      type: 'SACCO',
      address: 'Updated Address',
      phone_number: '+256700111111',
      email: 'updated@testsacco.com',
      license_number: 'LIC123',
      registration_number: 'REG456',
      website: 'https://updated.com',
      established_date: '2020-01-01',
    }

    it('should update organization details with valid data', async () => {
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
              data: mockAppUser,
              error: null,
            }),
          }
        }
        if (callCount === 2 && table === 'senteloans_institutions') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: updatedInstitution,
              error: null,
            }),
          }
        }
        return {}
      })

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      })

      const request = new Request('http://localhost:3000/api/institution/organization', {
        method: 'PUT',
        body: JSON.stringify({
          address: 'Updated Address',
          phone_number: '+256700111111',
          email: 'updated@testsacco.com',
          website: 'https://updated.com',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await PUT_ORG(request)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.address).toBe('Updated Address')
      expect(body.email).toBe('updated@testsacco.com')
    })
  })
})
