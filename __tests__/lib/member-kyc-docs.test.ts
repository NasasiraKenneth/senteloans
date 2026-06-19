import {
  buildLegacyClientKycDocs,
  flattenVerifiedKycDocs,
  legacyFieldToTarget,
  mapPendingKycRows,
  pickKycDisplayUrl,
} from "@/lib/members/kyc-docs"

describe("lib/members/kyc-docs", () => {
  it("maps legacy upload fields to member_kyc_docs columns", () => {
    expect(legacyFieldToTarget("passport_photo")).toEqual({
      docType: "passport",
      column: "passport_photo",
    })
    expect(legacyFieldToTarget("national_id_front")).toEqual({
      docType: "national_id",
      column: "document_front",
    })
    expect(legacyFieldToTarget("national_id_back")).toEqual({
      docType: "national_id",
      column: "document_back",
    })
  })

  it("flattens verified docs into legacy member URLs", () => {
    const flat = flattenVerifiedKycDocs([
      {
        id: "1",
        doc_type: "passport",
        passport_photo: "https://example.com/passport.jpg",
        document_front: null,
        document_back: null,
        status: "verified",
      },
      {
        id: "2",
        doc_type: "national_id",
        passport_photo: null,
        document_front: "https://example.com/front.jpg",
        document_back: "https://example.com/back.jpg",
        status: "verified",
      },
    ])

    expect(flat).toEqual({
      passport_photo: "https://example.com/passport.jpg",
      national_id_front: "https://example.com/front.jpg",
      national_id_back: "https://example.com/back.jpg",
    })
  })

  it("builds client portal legacy doc states from member_kyc_docs rows", () => {
    const docs = buildLegacyClientKycDocs([
      {
        id: "verified-passport",
        doc_type: "passport",
        passport_photo: "https://example.com/passport.jpg",
        document_front: null,
        document_back: null,
        status: "verified",
        reviewed_at: "2024-01-02T00:00:00.000Z",
      },
      {
        id: "pending-id",
        doc_type: "national_id",
        passport_photo: null,
        document_front: "https://example.com/front-pending.jpg",
        document_back: null,
        status: "pending_review",
        created_at: "2024-01-03T00:00:00.000Z",
      },
    ])

    expect(docs.passport_photo.current_verified?.url).toBe("https://example.com/passport.jpg")
    expect(docs.national_id_front.pending?.url).toBe("https://example.com/front-pending.jpg")
    expect(docs.national_id_back.pending).toBeNull()
  })

  it("maps pending rows for staff review UI", () => {
    const pending = mapPendingKycRows([
      {
        id: "doc-1",
        doc_type: "national_id",
        passport_photo: null,
        document_front: "https://example.com/front.jpg",
        document_back: "https://example.com/back.jpg",
        status: "pending_review",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ])

    expect(pending[0]).toMatchObject({
      pendingId: "doc-1",
      docType: "national_id",
      url: "https://example.com/front.jpg",
      documentFront: "https://example.com/front.jpg",
      documentBack: "https://example.com/back.jpg",
    })
    expect(pickKycDisplayUrl({
      passport_photo: null,
      document_front: "https://example.com/front.jpg",
      document_back: "https://example.com/back.jpg",
    })).toBe("https://example.com/front.jpg")
  })
})
