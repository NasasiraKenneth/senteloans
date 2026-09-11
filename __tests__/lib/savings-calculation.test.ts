import { calculateNextBillingDate, calculatePreviousBillingDates } from '@/lib/members/savings-calculation'

describe('calculateNextBillingDate', () => {
  it('returns null if start date is missing or invalid', () => {
    expect(calculateNextBillingDate({ startDate: null, frequencyUnit: 'MONTH', frequencyValue: 1 })).toBeNull()
    expect(calculateNextBillingDate({ startDate: 'invalid-date', frequencyUnit: 'MONTH', frequencyValue: 1 })).toBeNull()
  })

  it('calculates next billing date for DAY frequency', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'DAY',
      frequencyValue: 2,
    })
    expect(res).toBe('2026-09-03')
  })

  it('calculates next billing date for WEEK frequency without weekday', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'WEEK',
      frequencyValue: 1,
    })
    expect(res).toBe('2026-09-08')
  })

  it('calculates next billing date for WEEK frequency with weekday (e.g. Friday)', () => {
    // 2026-09-01 is a Tuesday. The next Friday is 2026-09-04.
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'WEEK',
      frequencyValue: 1,
      autoSavingsDay: 'Friday',
    })
    expect(res).toBe('2026-09-04')
  })

  it('calculates next billing date for MONTH with "includes 4" (days 4, 14, 24)', () => {
    // Start date 2026-09-01 -> next is 2026-09-04
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 4',
      })
    ).toBe('2026-09-04')

    // Start date 2026-09-05 -> next is 2026-09-14
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-05',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 4',
      })
    ).toBe('2026-09-14')

    // Start date 2026-09-25 -> next is 2026-10-04
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-25',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 4',
      })
    ).toBe('2026-10-04')

    // Test includes 6, 7, 8, 9, 0
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 6',
      })
    ).toBe('2026-09-06')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 7',
      })
    ).toBe('2026-09-07')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 8',
      })
    ).toBe('2026-09-08')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 9',
      })
    ).toBe('2026-09-09')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 0',
      })
    ).toBe('2026-09-10')
  })

  it('calculates next billing date for MONTH with ordinal weekday (e.g. "1st Monday", "1st Sunday")', () => {
    // September 2026: 1st Monday is 2026-09-07. +1 month -> October 2026: 1st Monday is 2026-10-05
    const resMonday = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '1st Monday',
    })
    expect(resMonday).toBe('2026-10-05')

    // September 2026: 1st Sunday is 2026-09-06. +1 month -> October 2026: 1st Sunday is 2026-10-04
    const resSunday = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '1st Sunday',
    })
    expect(resSunday).toBe('2026-10-04')
  })

  it('calculates next billing date for MONTH with day number (e.g. "15")', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '15',
    })
    expect(res).toBe('2026-10-15')
  })

  it('calculates next billing date for MONTH with "last_day"', () => {
    // 2026-09-01 + 1 month -> 2026-10-31
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: 'last_day',
    })
    expect(res).toBe('2026-10-31')
  })

  it('calculates next billing date for YEAR frequency', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'YEAR',
      frequencyValue: 1,
    })
    expect(res).toBe('2027-09-01')
  })
})

describe('calculatePreviousBillingDates', () => {
  it('calculates previous billing dates from financial year start to current date', () => {
    const dates = calculatePreviousBillingDates({
      financialYearStart: '2026-01-01',
      startDate: '2026-01-10',
      autoSavingsDay: '10',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      currentDate: '2026-09-11',
    })
    expect(dates).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
      '2026-05-10',
      '2026-06-10',
      '2026-07-10',
      '2026-08-10',
      '2026-09-10',
    ])
  })

  it('includes a current-month billing date if it is within 2 days (<= 2 days) from current date', () => {
    // currentDate is 2026-09-08, autoSavingsDay is 10. 2026-09-10 is in 2 days (diff = 2 <= 2). Included!
    const datesWithin2Days = calculatePreviousBillingDates({
      financialYearStart: '2026-01-01',
      startDate: '2026-01-10',
      autoSavingsDay: '10',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      currentDate: '2026-09-08',
    })
    expect(datesWithin2Days).toContain('2026-09-10')

    // currentDate is 2026-09-07, autoSavingsDay is 10. 2026-09-10 is in 3 days (diff = 3 > 2). Excluded!
    const datesBeyond2Days = calculatePreviousBillingDates({
      financialYearStart: '2026-01-01',
      startDate: '2026-01-10',
      autoSavingsDay: '10',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      currentDate: '2026-09-07',
    })
    expect(datesBeyond2Days).not.toContain('2026-09-10')
  })
})
