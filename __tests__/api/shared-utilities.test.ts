import { POST as POST_LOGOUT, GET as GET_LOGOUT } from '@/app/api/logout/route'
import { POST as POST_UPLOAD } from '@/app/api/vercel_blob/upload/route'
import { createMockSupabaseClient } from '../utils/supabase-mock'

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

// Mock Vercel Blob
jest.mock('@vercel/blob/client', () => ({
  handleUpload: jest.fn(),
}))

// Mock Supabase JS client for service role
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

const { createClient } = require('@/lib/supabase/server')
const { handleUpload } = require('@vercel/blob/client')
const { createClient: createSupabaseClient } = require('@supabase/supabase-js')

describe('POST /api/logout', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    createClient.mockResolvedValue(mockSupabase)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should logout and clear session', async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })

    const response = await POST_LOGOUT()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
  })

  it('should handle logout errors', async () => {
    mockSupabase.auth.signOut.mockRejectedValue(new Error('Logout failed'))

    const response = await POST_LOGOUT()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('Logout failed')
  })

  it('should support GET method for logout', async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })

    const response = await GET_LOGOUT()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
  })
})

describe('POST /api/vercel_blob/upload', () => {
  let mockSupabaseService: any

  beforeEach(() => {
    mockSupabaseService = createMockSupabaseClient()
    createSupabaseClient.mockReturnValue(mockSupabaseService)
    
    // Set environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })

  afterEach(() => {
    jest.clearAllMocks()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('should handle file upload with valid file', async () => {
    const mockBlob = {
      url: 'https://blob.vercel-storage.com/client-kyc/client-123/passport_photo-abc.png',
      pathname: 'client-kyc/client-123/passport_photo-abc.png',
    }

    handleUpload.mockImplementation(async ({ onUploadCompleted }: any) => {
      // Simulate upload completion
      if (onUploadCompleted) {
        await onUploadCompleted({ blob: mockBlob })
      }
      return { url: mockBlob.url }
    })

    mockSupabaseService.from.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'client-123' },
        error: null,
      }),
    })

    const request = new Request('http://localhost:3000/api/vercel_blob/upload', {
      method: 'POST',
      body: JSON.stringify({
        pathname: 'client-kyc/client-123/passport_photo-test.png',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST_UPLOAD(request as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toBe(mockBlob.url)
  })

  it('should call handleUpload with proper configuration', async () => {
    handleUpload.mockResolvedValue({ url: 'https://blob.vercel-storage.com/test.png' })

    const request = new Request('http://localhost:3000/api/vercel_blob/upload', {
      method: 'POST',
      body: JSON.stringify({
        pathname: 'client-kyc/client-123/passport_photo-test.png',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST_UPLOAD(request as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(handleUpload).toHaveBeenCalled()
    expect(body.url).toBe('https://blob.vercel-storage.com/test.png')
  })

  it('should update client record for admin flow', async () => {
    const mockBlob = {
      url: 'https://blob.vercel-storage.com/client-kyc/client-123/passport_photo-abc.png',
      pathname: 'client-kyc/client-123/passport_photo-abc.png',
    }

    let updateCalled = false
    handleUpload.mockImplementation(async ({ onUploadCompleted }: any) => {
      if (onUploadCompleted) {
        await onUploadCompleted({ blob: mockBlob })
      }
      return { url: mockBlob.url }
    })

    mockSupabaseService.from.mockReturnValue({
      update: jest.fn().mockImplementation((data: any) => {
        updateCalled = true
        expect(data.passport_photo).toBe(mockBlob.url)
        return {
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'client-123' },
            error: null,
          }),
        }
      }),
    })

    const request = new Request('http://localhost:3000/api/vercel_blob/upload', {
      method: 'POST',
      body: JSON.stringify({
        pathname: 'client-kyc/client-123/passport_photo-test.png',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST_UPLOAD(request as any)

    expect(updateCalled).toBe(true)
  })

  it('should not update client record for pending flow', async () => {
    const mockBlob = {
      url: 'https://blob.vercel-storage.com/client-kyc-pending/client-123/passport_photo-abc.png',
      pathname: 'client-kyc-pending/client-123/passport_photo-abc.png',
    }

    let updateCalled = false
    handleUpload.mockImplementation(async ({ onUploadCompleted }: any) => {
      if (onUploadCompleted) {
        await onUploadCompleted({ blob: mockBlob })
      }
      return { url: mockBlob.url }
    })

    mockSupabaseService.from.mockReturnValue({
      update: jest.fn().mockImplementation(() => {
        updateCalled = true
        return {
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: 'client-123' },
            error: null,
          }),
        }
      }),
    })

    const request = new Request('http://localhost:3000/api/vercel_blob/upload', {
      method: 'POST',
      body: JSON.stringify({
        pathname: 'client-kyc-pending/client-123/passport_photo-test.png',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST_UPLOAD(request as any)

    // Should not update for pending flow
    expect(updateCalled).toBe(false)
  })

  it('should handle upload errors', async () => {
    handleUpload.mockRejectedValue(new Error('Upload failed'))

    const request = new Request('http://localhost:3000/api/vercel_blob/upload', {
      method: 'POST',
      body: JSON.stringify({
        pathname: 'client-kyc/client-123/passport_photo-test.png',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST_UPLOAD(request as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Upload failed')
  })
})
