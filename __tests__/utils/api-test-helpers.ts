import { createMocks as createNodeMocks, type RequestMethod } from 'node-mocks-http'
import { NextRequest, NextResponse } from 'next/server'
import { MockSession } from './auth-helpers'

export function createMocks(method: RequestMethod, url: string, body?: any, session?: MockSession) {
  const { req, res } = createNodeMocks({
    method,
    url,
    body,
    headers: {
      'content-type': 'application/json',
    },
  })

  // Attach session to request if provided
  if (session) {
    (req as any).session = session
  }

  return { req, res }
}

export function mockNextRequest(
  url: string,
  options: {
    method?: RequestMethod
    body?: any
    headers?: Record<string, string>
    session?: MockSession
  } = {}
) {
  const { method = 'GET', body, headers = {}, session } = options

  const request = new Request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as any

  // Attach session to request
  if (session) {
    request.session = session
  }

  return request as NextRequest
}

export async function assertResponseStatus(response: Response | NextResponse, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus)
}

export async function assertResponseBody(response: Response | NextResponse, expectedBody: any) {
  const body = await response.json()
  expect(body).toMatchObject(expectedBody)
  return body
}

export async function assertErrorResponse(
  response: Response | NextResponse,
  expectedStatus: number,
  expectedMessage?: string
) {
  expect(response.status).toBe(expectedStatus)
  const body = await response.json()
  expect(body).toHaveProperty('error')
  if (expectedMessage) {
    expect(body.error).toContain(expectedMessage)
  }
  return body
}

export function mockAuditLog() {
  return {
    logInsert: jest.fn(),
    logUpdate: jest.fn(),
    logDelete: jest.fn(),
    logAction: jest.fn(),
  }
}

export async function extractJsonResponse(response: Response | NextResponse) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch (e) {
    return { rawText: text }
  }
}
