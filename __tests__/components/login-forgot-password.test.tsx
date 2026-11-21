import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import LoginPage from "@/app/login/page"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockRefresh = jest.fn()
let mockSearchParams = new URLSearchParams()

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  useSearchParams: () => mockSearchParams,
}))

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  useSession: () => ({
    data: null,
    status: "unauthenticated",
    update: jest.fn(),
  }),
}))

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}))

jest.mock("framer-motion", () => {
  const actual = jest.requireActual("react")
  const stripMotionProps = (props: Record<string, unknown>) => {
    const clean = { ...props }
    delete clean.initial
    delete clean.animate
    delete clean.exit
    delete clean.transition
    delete clean.variants
    delete clean.whileHover
    delete clean.whileTap
    return clean
  }
  const createMotion = (tag: string) =>
    actual.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      actual.createElement(tag, { ...stripMotionProps(props), ref }),
    )
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: createMotion("div"),
      form: createMotion("form"),
      button: createMotion("button"),
      p: createMotion("p"),
    },
  }
})

describe("LoginPage Forgot Password toggle", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function findButtonByText(text: RegExp): HTMLButtonElement {
    const btn = Array.from(container.querySelectorAll("button")).find((el) =>
      text.test(el.textContent || ""),
    )
    if (!btn) throw new Error(`Button matching ${text} not found`)
    return btn
  }

  it("switches to forgot password panel and returns cleanly to sign in", () => {
    act(() => {
      root.render(<LoginPage />)
    })

    expect(container.querySelector('form[aria-label="Unified Login Form"]')).not.toBeNull()
    expect(container.textContent).not.toContain("Single Sign-On for Staff & Members")
    expect(container.textContent).not.toContain("Remember me")
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()

    const forgotBtn = findButtonByText(/Forgot password\?/i)
    act(() => {
      forgotBtn.click()
    })

    expect(container.querySelector('form[aria-label="Forgot Password Form"]')).not.toBeNull()
    expect(container.querySelector('form[aria-label="Unified Login Form"]')).toBeNull()

    const backBtn = findButtonByText(/Back to Sign In/i)
    act(() => {
      backBtn.click()
    })

    expect(container.querySelector('form[aria-label="Unified Login Form"]')).not.toBeNull()
    expect(container.querySelector('form[aria-label="Forgot Password Form"]')).toBeNull()
    expect(container.textContent).toContain("Welcome Back")
  })

  it("clears mode=forgot query param when returning to sign in", () => {
    mockSearchParams = new URLSearchParams("mode=forgot&portal=client")

    act(() => {
      root.render(<LoginPage />)
    })

    expect(container.querySelector('form[aria-label="Forgot Password Form"]')).not.toBeNull()

    const backBtn = findButtonByText(/Back to Sign In/i)
    act(() => {
      backBtn.click()
    })

    expect(mockReplace).toHaveBeenCalledWith("/login?portal=client")
    expect(container.querySelector('form[aria-label="Unified Login Form"]')).not.toBeNull()
  })
})
