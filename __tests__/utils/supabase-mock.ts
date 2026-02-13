import { createClient } from '@supabase/supabase-js'

export function createMockSupabaseClient() {
  const mockClient = {
    auth: {
      getUser: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      updateUser: jest.fn(),
      admin: {
        createUser: jest.fn(),
        updateUserById: jest.fn(),
        deleteUser: jest.fn(),
      },
    },
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      containedBy: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    })),
    rpc: jest.fn(),
  }

  return mockClient
}

export function mockSupabaseResponse<T>(data: T, error: any = null) {
  return {
    data,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? 'Bad Request' : 'OK',
  }
}

export function mockSupabaseError(message: string, code: string = 'PGRST116') {
  return {
    message,
    code,
    details: '',
    hint: '',
  }
}

// Mock RLS helper functions
export const mockAuthHelpers = {
  get_current_institution_id: jest.fn(() => 'test-institution-id'),
  get_current_user_id: jest.fn(() => 'test-user-id'),
  get_current_client_id: jest.fn(() => 'test-client-id'),
  is_system_admin: jest.fn(() => false),
  is_institution_admin: jest.fn(() => true),
}
