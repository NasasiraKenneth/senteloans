/**
 * Savings Plan Next Billing Date Calculation Engine.
 */

export interface CalculateNextBillingDateParams {
  startDate: string | Date | null | undefined
  frequencyUnit: "DAY" | "WEEK" | "MONTH" | "YEAR" | string
  frequencyValue: number | string
  autoSavingsDay?: string | null
  currentDate?: string | Date | null
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

export const ORDINAL_PREFIXES = ["1st", "2nd", "3rd", "4th"] as const

function toDateOnly(d: string | Date | null | undefined): Date | null {
  if (!d) return null
  if (typeof d === "string") {
    const trimmed = d.trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
    const [y, m, day] = trimmed.split("-").map(Number)
    const dateObj = new Date(y, m - 1, day, 12, 0, 0)
    if (isNaN(dateObj.getTime())) return null
    return dateObj
  }
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0)
  }
  return null
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/**
 * Finds the Nth occurrence of a weekday in a given month.
 * ordinal: 1 for 1st, 2 for 2nd, 3 for 3rd, 4 for 4th.
 * dayIndex: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 */
function getNthWeekdayOfMonth(year: number, monthIndex: number, dayIndex: number, ordinal: number): Date {
  const daysInMonth = getDaysInMonth(year, monthIndex)
  let count = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const dt = new Date(year, monthIndex, day, 12, 0, 0)
    if (dt.getDay() === dayIndex) {
      count++
      if (count === ordinal) {
        return dt
      }
    }
  }
  // Fallback to last matching day of month if 4th is requested but fewer exist
  for (let day = daysInMonth; day >= 1; day--) {
    const dt = new Date(year, monthIndex, day, 12, 0, 0)
    if (dt.getDay() === dayIndex) {
      return dt
    }
  }
  return new Date(year, monthIndex, daysInMonth, 12, 0, 0)
}

/**
 * Calculates the next billing date for a savings plan based on
 * start date, frequency unit, frequency value, and auto savings day configuration.
 *
 * Ensures the next billing date is never in the past relative to today (or the provided currentDate).
 * If the computed cycle date is in the past, advances to the corresponding next billing day in the future.
 */
export function calculateNextBillingDate(params: CalculateNextBillingDateParams): string | null {
  const start = toDateOnly(params.startDate)
  if (!start) return null

  const today = toDateOnly(params.currentDate) || toDateOnly(new Date()) || new Date()
  today.setHours(12, 0, 0, 0)

  const unit = String(params.frequencyUnit || "MONTH").trim().toUpperCase()
  const rawVal = Number(params.frequencyValue)
  const val = Number.isFinite(rawVal) && rawVal > 0 ? Math.floor(rawVal) : 1
  const rawDay = typeof params.autoSavingsDay === "string" ? params.autoSavingsDay.trim() : null

  if (unit === "DAY") {
    const next = new Date(start)
    next.setDate(next.getDate() + val)
    if (next < today) {
      const diffMs = today.getTime() - next.getTime()
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
      const steps = Math.max(1, Math.ceil(diffDays / val))
      next.setDate(next.getDate() + steps * val)
      while (next < today) {
        next.setDate(next.getDate() + val)
      }
    }
    return formatDate(next)
  }

  if (unit === "WEEK") {
    const weekdayIdx = WEEKDAYS.findIndex((w) => w.toLowerCase() === (rawDay || "").toLowerCase())
    if (weekdayIdx !== -1) {
      const target = new Date(start)
      target.setDate(target.getDate() + (val - 1) * 7)
      let diff = weekdayIdx - target.getDay()
      if (diff <= 0) diff += 7
      target.setDate(target.getDate() + diff)
      while (target < today) {
        target.setDate(target.getDate() + val * 7)
      }
      return formatDate(target)
    }
    const next = new Date(start)
    next.setDate(next.getDate() + val * 7)
    while (next < today) {
      next.setDate(next.getDate() + val * 7)
    }
    return formatDate(next)
  }

  if (unit === "YEAR") {
    const next = new Date(start)
    next.setFullYear(next.getFullYear() + val)
    while (next < today) {
      next.setFullYear(next.getFullYear() + val)
    }
    return formatDate(next)
  }

  // MONTH
  const dayLower = rawDay ? rawDay.toLowerCase() : ""

  // 1) "includes X" pattern (e.g. "includes 4" -> days 4, 14, 24)
  const includesMatch = dayLower.match(/^includes\s+(\d+)$/)
  if (includesMatch) {
    const digit = parseInt(includesMatch[1], 10)
    const startYear = start.getFullYear()
    const startMonth = start.getMonth()
    let curYear = startYear
    let curMonth = startMonth
    const maxEndYear = Math.max(startYear, today.getFullYear()) + 10

    while (curYear <= maxEndYear) {
      const maxDays = getDaysInMonth(curYear, curMonth)
      for (let d = 1; d <= maxDays; d++) {
        if (d % 10 === digit) {
          const candDate = new Date(curYear, curMonth, d, 12, 0, 0)
          if (candDate > start && candDate >= today) {
            return formatDate(candDate)
          }
        }
      }
      curMonth++
      if (curMonth > 11) {
        curYear += Math.floor(curMonth / 12)
        curMonth = curMonth % 12
      }
    }
  }

  // 2) Ordinal Weekday (e.g. "1st Monday", "2nd Tuesday", "3rd Friday", "4th Saturday")
  const ordinalMatch = dayLower.match(/^(1st|2nd|3rd|4th|first|second|third|fourth)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i)
  if (ordinalMatch) {
    const ordStr = ordinalMatch[1].toLowerCase()
    const dayStr = ordinalMatch[2].toLowerCase()
    let ord = 1
    if (ordStr === "2nd" || ordStr === "second") ord = 2
    if (ordStr === "3rd" || ordStr === "third") ord = 3
    if (ordStr === "4th" || ordStr === "fourth") ord = 4

    const wIdx = WEEKDAYS.findIndex((w) => w.toLowerCase() === dayStr)
    if (wIdx !== -1) {
      let targetMonthOffset = val
      let iterations = 0
      while (iterations < 1200) {
        iterations++
        const totalMonths = start.getMonth() + targetMonthOffset
        const targetYear = start.getFullYear() + Math.floor(totalMonths / 12)
        const targetMonth = ((totalMonths % 12) + 12) % 12
        const candDate = getNthWeekdayOfMonth(targetYear, targetMonth, wIdx, ord)
        if (candDate >= today) {
          return formatDate(candDate)
        }
        targetMonthOffset += val
      }
    }
  }

  // 3) Fixed Weekday in Month (e.g. "Monday", "Tuesday", etc.)
  const fixedWIdx = WEEKDAYS.findIndex((w) => w.toLowerCase() === dayLower)
  if (fixedWIdx !== -1) {
    let targetMonthOffset = val
    let iterations = 0
    while (iterations < 1200) {
      iterations++
      const totalMonths = start.getMonth() + targetMonthOffset
      const targetYear = start.getFullYear() + Math.floor(totalMonths / 12)
      const targetMonth = ((totalMonths % 12) + 12) % 12
      const candDate = getNthWeekdayOfMonth(targetYear, targetMonth, fixedWIdx, 1)
      if (candDate >= today) {
        return formatDate(candDate)
      }
      targetMonthOffset += val
    }
  }

  // 4) Day of Month Number (e.g., "1", "2", "15", "31", "last_day", or default start day)
  let targetDay = 1
  let isLastDay = false
  if (dayLower === "last_day") {
    isLastDay = true
  } else if (!rawDay) {
    targetDay = start.getDate()
  } else {
    const parsed = parseInt(rawDay, 10)
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 31) {
      targetDay = parsed
    } else {
      targetDay = start.getDate()
    }
  }

  let targetMonthOffset = val
  let iterations = 0
  while (iterations < 1200) {
    iterations++
    const totalMonths = start.getMonth() + targetMonthOffset
    const targetYear = start.getFullYear() + Math.floor(totalMonths / 12)
    const targetMonth = ((totalMonths % 12) + 12) % 12
    const maxDays = getDaysInMonth(targetYear, targetMonth)
    const finalDay = isLastDay ? maxDays : Math.min(targetDay, maxDays)
    const candDate = new Date(targetYear, targetMonth, finalDay, 12, 0, 0)
    if (candDate >= today) {
      return formatDate(candDate)
    }
    targetMonthOffset += val
  }

  return null
}

export interface CalculatePreviousBillingDatesParams {
  financialYearStart?: string | Date | null
  startDate?: string | Date | null
  nextBillingDate?: string | Date | null
  frequencyUnit?: string | null
  frequencyValue?: number | string | null
  autoSavingsDay?: string | null
  currentDate?: string | Date | null
}

/**
 * Calculates previous billing dates for a new member starting from the financial year start date up to the current date.
 * If a billing date falls in the current month and is within 2 days (<= 2 days) from the current date, it is also included.
 */
export function calculatePreviousBillingDates(
  params: CalculatePreviousBillingDatesParams
): string[] {
  const today = toDateOnly(params.currentDate) || new Date()
  today.setHours(12, 0, 0, 0)

  let startMonth = 1
  let startDay = 1
  if (params.financialYearStart) {
    const parsed = toDateOnly(params.financialYearStart)
    if (parsed) {
      startMonth = parsed.getMonth() + 1
      startDay = parsed.getDate()
    }
  }

  const currentYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()

  let fyYear = currentYear
  if (todayMonth < startMonth || (todayMonth === startMonth && todayDay < startDay)) {
    fyYear = currentYear - 1
  }

  const financialStart = new Date(fyYear, startMonth - 1, startDay, 12, 0, 0)
  const planStart = toDateOnly(params.startDate)

  let effectiveStart = financialStart
  if (planStart && planStart > financialStart) {
    effectiveStart = planStart
  }

  const unit = String(params.frequencyUnit || "MONTH").trim().toUpperCase()
  const rawVal = Number(params.frequencyValue)
  const val = Number.isFinite(rawVal) && rawVal > 0 ? Math.floor(rawVal) : 1
  const rawDay = typeof params.autoSavingsDay === "string" ? params.autoSavingsDay.trim() : null

  const resultDates: Date[] = []

  if (unit === "MONTH") {
    let curYear = effectiveStart.getFullYear()
    let curMonth = effectiveStart.getMonth()

    const endYear = today.getFullYear()
    const endMonth = today.getMonth()

    let m = new Date(curYear, curMonth, 1, 12, 0, 0)
    const maxEndMonth = new Date(endYear, endMonth + 1, 1, 12, 0, 0)

    while (m <= maxEndMonth) {
      const year = m.getFullYear()
      const monthIndex = m.getMonth()

      let bDate: Date | null = null

      if (!rawDay) {
        const targetDay = planStart ? planStart.getDate() : effectiveStart.getDate()
        const maxD = getDaysInMonth(year, monthIndex)
        bDate = new Date(year, monthIndex, Math.min(targetDay, maxD), 12, 0, 0)
      } else {
        const dayLower = rawDay.toLowerCase()

        const includesMatch = dayLower.match(/^includes\s+(\d+)$/)
        if (includesMatch) {
          const digit = parseInt(includesMatch[1], 10)
          const maxD = getDaysInMonth(year, monthIndex)
          for (let d = 1; d <= maxD; d++) {
            if (d % 10 === digit) {
              const cand = new Date(year, monthIndex, d, 12, 0, 0)
              if (cand >= effectiveStart) {
                resultDates.push(cand)
              }
            }
          }
          m.setMonth(m.getMonth() + val)
          continue
        }

        const ordinalMatch = dayLower.match(/^(1st|2nd|3rd|4th|first|second|third|fourth)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i)
        if (ordinalMatch) {
          const ordStr = ordinalMatch[1].toLowerCase()
          const dayStr = ordinalMatch[2].toLowerCase()
          let ord = 1
          if (ordStr === "2nd" || ordStr === "second") ord = 2
          if (ordStr === "3rd" || ordStr === "third") ord = 3
          if (ordStr === "4th" || ordStr === "fourth") ord = 4
          const wIdx = WEEKDAYS.findIndex((w) => w.toLowerCase() === dayStr)
          if (wIdx !== -1) {
            bDate = getNthWeekdayOfMonth(year, monthIndex, wIdx, ord)
          }
        } else {
          const fixedWIdx = WEEKDAYS.findIndex((w) => w.toLowerCase() === dayLower)
          if (fixedWIdx !== -1) {
            bDate = getNthWeekdayOfMonth(year, monthIndex, fixedWIdx, 1)
          } else {
            let targetDay = 1
            if (dayLower === "last_day") {
              targetDay = 31
            } else {
              const parsed = parseInt(rawDay, 10)
              if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 31) {
                targetDay = parsed
              }
            }
            const maxD = getDaysInMonth(year, monthIndex)
            bDate = new Date(year, monthIndex, Math.min(targetDay, maxD), 12, 0, 0)
          }
        }
      }

      if (bDate && bDate >= effectiveStart) {
        resultDates.push(bDate)
      }

      m.setMonth(m.getMonth() + val)
    }
  } else if (unit === "WEEK") {
    let cur = new Date(effectiveStart)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 14)

    while (cur <= limit) {
      if (cur >= effectiveStart) {
        resultDates.push(new Date(cur))
      }
      cur.setDate(cur.getDate() + val * 7)
    }
  } else if (unit === "DAY") {
    let cur = new Date(effectiveStart)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + 5)

    while (cur <= limit) {
      if (cur >= effectiveStart) {
        resultDates.push(new Date(cur))
      }
      cur.setDate(cur.getDate() + val)
    }
  } else if (unit === "YEAR") {
    let cur = new Date(effectiveStart)
    const limit = new Date(today)
    limit.setFullYear(limit.getFullYear() + 1)

    while (cur <= limit) {
      if (cur >= effectiveStart) {
        resultDates.push(new Date(cur))
      }
      cur.setFullYear(cur.getFullYear() + val)
    }
  }

  const finalFormattedDates = new Set<string>()

  for (const d of resultDates) {
    if (d < effectiveStart) continue

    const isBeforeToday = d < today
    const isSameYearMonth = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
    const diffTime = d.getTime() - today.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    const isWithin2DaysCurrentMonth = isSameYearMonth && diffDays >= 0 && diffDays <= 2

    if (isBeforeToday || isWithin2DaysCurrentMonth) {
      const formatted = formatDate(d)
      finalFormattedDates.add(formatted)
    }
  }

  return Array.from(finalFormattedDates).sort()
}
