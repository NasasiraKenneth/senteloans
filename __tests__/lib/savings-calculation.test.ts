import { calculateNextBillingDate, calculatePreviousBillingDates } from '@/lib/members/savings-calculation'

describe('calculateNextBillingDate - baseline regression tests', () => {
  it('returns null if start date is missing or invalid', () => {
    expect(calculateNextBillingDate({ startDate: null, frequencyUnit: 'MONTH', frequencyValue: 1 })).toBeNull()
    expect(calculateNextBillingDate({ startDate: 'invalid-date', frequencyUnit: 'MONTH', frequencyValue: 1 })).toBeNull()
  })

  it('calculates next billing date for DAY frequency', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'DAY',
      frequencyValue: 2,
      currentDate: '2026-09-01',
    })
    expect(res).toBe('2026-09-03')
  })

  it('calculates next billing date for WEEK frequency without weekday', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'WEEK',
      frequencyValue: 1,
      currentDate: '2026-09-01',
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
      currentDate: '2026-09-01',
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
        currentDate: '2026-09-01',
      })
    ).toBe('2026-09-04')

    // Start date 2026-09-05 -> next is 2026-09-14
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-05',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 4',
        currentDate: '2026-09-05',
      })
    ).toBe('2026-09-14')

    // Start date 2026-09-25 -> next is 2026-10-04
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-25',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 4',
        currentDate: '2026-09-25',
      })
    ).toBe('2026-10-04')

    // Test includes 6, 7, 8, 9, 0
    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 6',
        currentDate: '2026-09-01',
      })
    ).toBe('2026-09-06')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 7',
        currentDate: '2026-09-01',
      })
    ).toBe('2026-09-07')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 8',
        currentDate: '2026-09-01',
      })
    ).toBe('2026-09-08')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 9',
        currentDate: '2026-09-01',
      })
    ).toBe('2026-09-09')

    expect(
      calculateNextBillingDate({
        startDate: '2026-09-01',
        frequencyUnit: 'MONTH',
        frequencyValue: 1,
        autoSavingsDay: 'includes 0',
        currentDate: '2026-09-01',
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
      currentDate: '2026-09-01',
    })
    expect(resMonday).toBe('2026-10-05')

    // September 2026: 1st Sunday is 2026-09-06. +1 month -> October 2026: 1st Sunday is 2026-10-04
    const resSunday = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '1st Sunday',
      currentDate: '2026-09-01',
    })
    expect(resSunday).toBe('2026-10-04')
  })

  it('calculates next billing date for MONTH with day number (e.g. "15")', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '15',
      currentDate: '2026-09-01',
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
      currentDate: '2026-09-01',
    })
    expect(res).toBe('2026-10-31')
  })

  it('calculates next billing date for YEAR frequency', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-09-01',
      frequencyUnit: 'YEAR',
      frequencyValue: 1,
      currentDate: '2026-09-01',
    })
    expect(res).toBe('2027-09-01')
  })
})

describe('calculateNextBillingDate - future date rollover when start date is in the past', () => {
  it('rolls forward next billing date from past to the future (e.g. 10th June start -> 10th October)', () => {
    // Start date is 2026-06-10. First billing would normally be 2026-07-10, but currentDate is 2026-10-09.
    // It should advance past July 10, Aug 10, Sep 10 to future 2026-10-10.
    const res = calculateNextBillingDate({
      startDate: '2026-06-10',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '10',
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-10-10')
  })

  it('rolls forward next billing date when autoSavingsDay is not specified', () => {
    const res = calculateNextBillingDate({
      startDate: '2026-06-10',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-10-10')
  })

  it('rolls forward for multi-month intervals (e.g. every 2 months)', () => {
    // Start 2026-06-10 -> 2026-08-10 (past) -> 2026-10-10 (future relative to 2026-10-09)
    const res = calculateNextBillingDate({
      startDate: '2026-06-10',
      frequencyUnit: 'MONTH',
      frequencyValue: 2,
      autoSavingsDay: '10',
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-10-10')
  })

  it('rolls forward for DAY frequency when start date is in the past', () => {
    // Start 2026-06-10, every 1 day, currentDate 2026-10-09 -> returns 2026-10-09
    const res = calculateNextBillingDate({
      startDate: '2026-06-10',
      frequencyUnit: 'DAY',
      frequencyValue: 1,
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-10-09')
  })

  it('rolls forward for WEEK frequency with weekday when start date is in the past', () => {
    // Start 2026-06-10 (Wednesday), autoSavingsDay Friday, currentDate 2026-10-09 (Friday)
    const res = calculateNextBillingDate({
      startDate: '2026-06-10',
      frequencyUnit: 'WEEK',
      frequencyValue: 1,
      autoSavingsDay: 'Friday',
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-10-09')
  })

  it('rolls forward for YEAR frequency when start date was multiple years ago', () => {
    // Start 2022-06-10, every 1 year, currentDate 2026-10-09 -> returns 2027-06-10
    const res = calculateNextBillingDate({
      startDate: '2022-06-10',
      frequencyUnit: 'YEAR',
      frequencyValue: 1,
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2027-06-10')
  })

  it('rolls forward for ordinal weekdays when past cycles have elapsed', () => {
    // Start 2026-06-01, autoSavingsDay 1st Monday, currentDate 2026-10-09
    // October 1st Monday was 2026-10-05 (which is before 2026-10-09)
    // Next future 1st Monday is in November: 2026-11-02
    const res = calculateNextBillingDate({
      startDate: '2026-06-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: '1st Monday',
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-11-02')
  })

  it('rolls forward for "includes X" pattern when past occurrences have elapsed', () => {
    // Start 2026-06-01, autoSavingsDay includes 4, currentDate 2026-10-09
    // Past dates: June, July, Aug, Sep, Oct 4. Next future is Oct 14: 2026-10-14
    const res = calculateNextBillingDate({
      startDate: '2026-06-01',
      frequencyUnit: 'MONTH',
      frequencyValue: 1,
      autoSavingsDay: 'includes 4',
      currentDate: '2026-10-09',
    })
    expect(res).toBe('2026-10-14')
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
