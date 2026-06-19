export type GreetingPeriod = "morning" | "afternoon" | "evening"

export function getGreetingPeriod(date = new Date()): GreetingPeriod {
  const hour = date.getHours()
  if (hour < 12) return "morning"
  if (hour < 17) return "afternoon"
  return "evening"
}

export function getGreeting(date = new Date()): string {
  const period = getGreetingPeriod(date)
  if (period === "morning") return "Good morning"
  if (period === "afternoon") return "Good afternoon"
  return "Good evening"
}

type GreetingToastFn = (msg: {
  variant?: "default"
  icon?: GreetingPeriod
  title?: string
  description?: string
  duration?: number
}) => void

/** Second toast after sign-in success; slight delay so it follows the success toast. */
export function showPostLoginGreetingToast(toast: GreetingToastFn, fullName?: string) {
  const name = fullName?.trim()
  window.setTimeout(() => {
    toast({
      variant: "default",
      icon: getGreetingPeriod(),
      title: getGreeting(),
      description: name ? `${name}, great to see you again.` : "Great to see you again.",
      duration: 4500,
    })
  }, 450)
}
