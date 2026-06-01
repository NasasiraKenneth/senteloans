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
})
