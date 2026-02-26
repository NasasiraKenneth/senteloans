export type LoanCalculationMethod = "reducing_balance" | "flat_rate" | "compound"

export const normalizeLoanMethod = (value: unknown): LoanCalculationMethod => {
  const method = String(value || "").toLowerCase()
  if (method === "flat_rate" || method === "compound") return method
  return "reducing_balance"
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export const addMonthsDateOnly = (dateStr: string, n: number): string => {
  const s = String(dateStr || "").slice(0, 10)
  const [y, m, d] = s.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return s
  let month = m + n
  let year = y
  while (month > 12) {
    month -= 12
    year += 1
  }
  while (month < 1) {
    month += 12
    year -= 1
  }
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export const calculateLoanTerms = (
  principal: number,
  annualRate: number,
  tenureMonths: number,
  methodInput: unknown
): { monthlyPayment: number; totalAmount: number; method: LoanCalculationMethod } => {
  const method = normalizeLoanMethod(methodInput)
  const P = Math.max(0, Number(principal) || 0)
  const n = Math.max(1, Math.floor(Number(tenureMonths) || 1))
  const annual = Math.max(0, Number(annualRate) || 0)
  const r = annual / 100 / 12

  if (method === "flat_rate") {
    const totalAmount = round2(P * (1 + (annual / 100) * (n / 12)))
    return { monthlyPayment: round2(totalAmount / n), totalAmount, method }
  }

  if (method === "compound") {
    const totalAmount = round2(P * Math.pow(1 + r, n))
    return { monthlyPayment: round2(totalAmount / n), totalAmount, method }
  }

  if (r <= 0) {
    return { monthlyPayment: round2(P / n), totalAmount: round2(P), method }
  }
  const payment = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  const monthlyPayment = round2(payment)
  return { monthlyPayment, totalAmount: round2(monthlyPayment * n), method }
}

export type RepaymentInstallment = {
  installmentNumber: number
  dueDate: string
  principalAmount: number
  interestAmount: number
  totalAmount: number
}

export const buildRepaymentSchedule = (args: {
  principal: number
  annualRate: number
  tenureMonths: number
  method: unknown
  startDate: string
  installmentOffset?: number
}): RepaymentInstallment[] => {
  const P = Math.max(0, Number(args.principal) || 0)
  const annual = Math.max(0, Number(args.annualRate) || 0)
  const n = Math.max(1, Math.floor(Number(args.tenureMonths) || 1))
  const method = normalizeLoanMethod(args.method)
  const start = String(args.startDate || "").slice(0, 10)
  const offset = Math.max(0, Math.floor(Number(args.installmentOffset) || 0))
  const r = annual / 100 / 12

  if (method === "flat_rate") {
    const principalPer = round2(P / n)
    const interestPer = round2((P * (annual / 100) * (n / 12)) / n)
    const rows: RepaymentInstallment[] = []
    for (let i = 1; i <= n; i++) {
      const dueDate = addMonthsDateOnly(start, i)
      const principalAmount = i === n ? round2(P - principalPer * (n - 1)) : principalPer
      const totalAmount = round2(principalAmount + interestPer)
      rows.push({
        installmentNumber: offset + i,
        dueDate,
        principalAmount,
        interestAmount: interestPer,
        totalAmount,
      })
    }
    return rows
  }

  const { monthlyPayment } = calculateLoanTerms(P, annual, n, method)
  let balance = P
  const rows: RepaymentInstallment[] = []
  for (let i = 1; i <= n; i++) {
    const dueDate = addMonthsDateOnly(start, i)
    const interestAmount = round2(balance * r)
    let principalAmount = round2(monthlyPayment - interestAmount)
    if (i === n) principalAmount = round2(balance)
    if (principalAmount < 0) principalAmount = 0
    const totalAmount = round2(principalAmount + interestAmount)
    balance = round2(Math.max(0, balance - principalAmount))
    rows.push({
      installmentNumber: offset + i,
      dueDate,
      principalAmount,
      interestAmount,
      totalAmount,
    })
  }
  return rows
}
