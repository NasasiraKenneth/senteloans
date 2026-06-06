import { insertWithPrefixedNumberRetry } from "@/lib/ids/insert-with-prefixed-number-retry"

jest.mock("@/lib/ids/prefixed-number", () => ({
  makePrefixedNumber: jest
    .fn()
    .mockReturnValueOnce("INV-1-AAAA")
    .mockReturnValueOnce("INV-2-BBBB"),
}))

describe("insertWithPrefixedNumberRetry", () => {
  it("retries on unique violation 23505", async () => {
    const insertFn = jest
      .fn()
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "row-1" }] })

    const result = await insertWithPrefixedNumberRetry(insertFn, {
      prefix: "INV",
      savepointName: "sp_test",
    })
    expect(result?.row.id).toBe("row-1")
    expect(result?.number).toBe("INV-2-BBBB")
    expect(insertFn).toHaveBeenCalledTimes(2)
  })

  it("returns null after max attempts", async () => {
    const insertFn = jest.fn().mockRejectedValue({ code: "23505" })
    const result = await insertWithPrefixedNumberRetry(insertFn, {
      prefix: "TXN",
      savepointName: "sp_test2",
      maxAttempts: 2,
    })
    expect(result).toBeNull()
    expect(insertFn).toHaveBeenCalledTimes(2)
  })

  it("uses generateNumber override when supplied", async () => {
    const generateNumber = jest
      .fn()
      .mockReturnValueOnce("M-FIRST")
      .mockReturnValueOnce("M-SECOND")
    const insertFn = jest
      .fn()
      .mockRejectedValueOnce({ code: "23505" })
      .mockResolvedValueOnce({ rows: [{ id: "row-1" }] })

    const result = await insertWithPrefixedNumberRetry(insertFn, {
      prefix: "M",
      savepointName: "sp_test3",
      generateNumber,
    })

    expect(generateNumber).toHaveBeenCalledTimes(2)
    expect(result?.number).toBe("M-SECOND")
    expect(insertFn).toHaveBeenNthCalledWith(1, "M-FIRST")
    expect(insertFn).toHaveBeenNthCalledWith(2, "M-SECOND")
  })

  it("rethrows when shouldRetryOnUniqueViolation returns false", async () => {
    const err = { code: "23505", constraint: "uk_clients_national_id" }
    const insertFn = jest.fn().mockRejectedValue(err)

    await expect(
      insertWithPrefixedNumberRetry(insertFn, {
        prefix: "M",
        savepointName: "sp_test4",
        maxAttempts: 3,
        shouldRetryOnUniqueViolation: (e: unknown) =>
          (e as { constraint?: string }).constraint !== "uk_clients_national_id",
      }),
    ).rejects.toEqual(err)
    expect(insertFn).toHaveBeenCalledTimes(1)
  })
})
