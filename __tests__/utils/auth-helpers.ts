import { User } from '@supabase/supabase-js'

export interface MockSession {
  user: User
  role: 'system_admin' | 'institution_admin' | 'manager' | 'loan_officer' | 'treasurer' | 'client'
  institutionId?: string
  clientId?: string
}

export function createMockSystemAdminSession(): MockSession {
  return {
    user: {
      id: 'system-admin-user-id',
      email: 'admin@senteloans.com',
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: {
        role: 'system_admin',
      },
      user_metadata: {},
      created_at: new Date().toISOString(),
    } as User,
    role: 'system_admin',
  }
}

export function createMockInstitutionAdminSession(
  institutionId: string = 'test-institution-id',
  role: 'institution_admin' | 'manager' | 'loan_officer' | 'treasurer' = 'institution_admin'
): MockSession {
  return {
    user: {
      id: 'institution-admin-user-id',
      email: 'admin@institution.com',
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: {
        role,
        institution_id: institutionId,
      },
      user_metadata: {},
      created_at: new Date().toISOString(),
    } as User,
    role,
    institutionId,
  }
}

export function createMockClientSession(
  clientId: string = 'test-client-id',
  institutionId: string = 'test-institution-id'
): MockSession {
  return {
    user: {
      id: 'client-user-id',
      email: 'client@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: {
        role: 'client',
        client_id: clientId,
        institution_id: institutionId,
      },
      user_metadata: {},
      created_at: new Date().toISOString(),
    } as User,
    role: 'client',
    institutionId,
    clientId,
  }
}

export function createMockUnauthenticatedSession(): null {
  return null
}
