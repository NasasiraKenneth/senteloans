import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Polyfill for Next.js web APIs
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any

// Mock Headers
if (typeof Headers === 'undefined') {
  global.Headers = class Headers {
    private headers: Map<string, string> = new Map()
    
    append(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value)
    }
    
    get(name: string) {
      return this.headers.get(name.toLowerCase()) || null
    }
    
    set(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value)
    }
  } as any
}

// Mock Response with proper json static method
if (typeof Response === 'undefined') {
  global.Response = class Response {
    public status: number
    public statusText: string
    public headers: Headers
    private bodyContent: any

    constructor(body?: any, init?: ResponseInit) {
      this.bodyContent = body
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      this.headers = new Headers(init?.headers)
    }

    async json() {
      if (typeof this.bodyContent === 'string') {
        try {
          return JSON.parse(this.bodyContent)
        } catch {
          return this.bodyContent
        }
      }
      return this.bodyContent || {}
    }

    static json(data: any, init?: ResponseInit) {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      })
    }
  } as any
}

// Mock Request
if (typeof Request === 'undefined') {
  global.Request = class Request {
    public url: string
    public method: string
    public headers: Headers
    private bodyContent?: any

    constructor(url: string, init?: RequestInit) {
      this.url = url
      this.method = init?.method || 'GET'
      this.headers = new Headers(init?.headers)
      this.bodyContent = init?.body
    }

    async json() {
      if (typeof this.bodyContent === 'string') {
        return JSON.parse(this.bodyContent)
      }
      return this.bodyContent || {}
    }
  } as any
}

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = jest.fn()
}

// Mock NextResponse
jest.mock('next/server', () => {
  const actualModule = jest.requireActual('next/server')
  
  class MockNextResponse extends Response {
    constructor(body?: any, init?: ResponseInit) {
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body)
      super(bodyString, init)
    }

    static json(data: any, init?: ResponseInit) {
      return new MockNextResponse(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      })
    }
  }

  return {
    ...actualModule,
    NextResponse: MockNextResponse,
  }
})

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
