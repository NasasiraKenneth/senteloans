import {
  buildLegacyClientKycDocs,
  buildMemberKycDocumentSlots,
  buildMemberKycSnapshot,
  flattenMemberKycFormDocs,
  flattenVerifiedKycDocs,
  inferDocTypeFromUploads,
  isMemberKycDocSetComplete,
  legacyFieldToTarget,
  mapPendingKycRows,
  parseKycUploadPayload,
  pickKycDisplayUrl,
  resolveClientAvatarUrl,
  uploadFieldToTarget,
  upsertKycDocFields,
} from "@/lib/members/kyc-docs"

describe("lib/members/kyc-docs", () => {
  it("prefers verified passport for client avatar, then pending", () => {
    expect(
      resolveClientAvatarUrl([
        {
          doc_type: "national_id",
          passport_photo: "https://example.com/pending.jpg",
          document_front: null,
          document_back: null,
          status: "pending_review",
        },
      ]),
    ).toBe("https://example.com/pending.jpg")

    expect(
      resolveClientAvatarUrl([
        {
          doc_type: "national_id",
          passport_photo: "https://example.com/pending.jpg",
          document_front: null,
          document_back: null,
          status: "pending_review",
        },
        {
          doc_type: "national_id",
          passport_photo: "https://example.com/verified.jpg",
          document_front: "https://example.com/front.jpg",
          document_back: "https://example.com/back.jpg",
          status: "verified",
        },
      ]),
    ).toBe("https://example.com/verified.jpg")
  })

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

  it("maps passport biodata page to member_kyc_docs columns", () => {
    expect(uploadFieldToTarget("passport_document_front")).toEqual({
      docType: "passport",
      column: "document_front",
    })
  })

  it("infers doc type from batch uploads", () => {
    expect(
      inferDocTypeFromUploads([
        { field: "passport_photo", url: "https://example.com/p.jpg" },
        { field: "national_id_front", url: "https://example.com/f.jpg" },
      ]),
    ).toBe("national_id")
    expect(inferDocTypeFromUploads([{ field: "passport_photo", url: "https://example.com/p.jpg" }])).toBe("passport")
  })

  it("detects when a KYC doc set is complete", () => {
    expect(
      isMemberKycDocSetComplete({
        doc_type: "passport",
        passport_photo: "https://example.com/p.jpg",
        document_front: "https://example.com/front.jpg",
        document_back: null,
      }),
    ).toBe(true)
    expect(
      isMemberKycDocSetComplete({
        doc_type: "passport",
        passport_photo: "https://example.com/p.jpg",
        document_front: null,
        document_back: null,
      }),
    ).toBe(false)
    expect(
      isMemberKycDocSetComplete({
        doc_type: "national_id",
        passport_photo: "https://example.com/p.jpg",
        document_front: "https://example.com/front.jpg",
        document_back: "https://example.com/back.jpg",
      }),
    ).toBe(true)
    expect(
      isMemberKycDocSetComplete({
        doc_type: "national_id",
        passport_photo: "https://example.com/p.jpg",
        document_front: "https://example.com/front.jpg",
        document_back: null,
      }),
    ).toBe(false)
  })

  it("parses single and batch upload payloads", () => {
    expect(parseKycUploadPayload({ docType: "passport_photo", url: "https://example.com/p.jpg" })).toEqual([
      { field: "passport_photo", url: "https://example.com/p.jpg" },
    ])
    expect(
      parseKycUploadPayload({
        uploads: [
          { field: "passport_photo", url: "https://example.com/p.jpg" },
          { field: "national_id_front", url: "https://example.com/f.jpg" },
        ],
      }),
    ).toEqual([
      { field: "passport_photo", url: "https://example.com/p.jpg" },
      { field: "national_id_front", url: "https://example.com/f.jpg" },
    ])
    expect(parseKycUploadPayload({ uploads: [] })).toBeNull()
    expect(parseKycUploadPayload({ docType: "bad", url: "x" })).toBeNull()
  })

  it("flattens verified docs for the staff KYC form from one member row", () => {
    const flat = flattenMemberKycFormDocs([
      {
        id: "1",
        doc_type: "national_id",
        passport_photo: "https://example.com/photo.jpg",
        document_front: "https://example.com/front.jpg",
        document_back: "https://example.com/back.jpg",
        status: "verified",
      },
    ])

    expect(flat).toEqual({
      passportPhoto: "https://example.com/photo.jpg",
      passportBiodataPage: null,
      nationalIdFront: "https://example.com/front.jpg",
      nationalIdBack: "https://example.com/back.jpg",
      drivingLicenseFront: null,
      drivingLicenseBack: null,
    })
  })

  it("flattens pending_review docs for staff display", () => {
    const snapshot = buildMemberKycSnapshot(
      [
        {
          id: "1",
          doc_type: "national_id",
          passport_photo: "https://example.com/photo.jpg",
          document_front: "https://example.com/front.jpg",
          document_back: "https://example.com/back.jpg",
          status: "pending_review",
        },
      ],
      "staff",
    )

    expect(snapshot.docComplete).toBe(true)
    expect(snapshot.docStatus).toBe("pending_review")
    expect(snapshot.formDocs.nationalIdFront).toBe("https://example.com/front.jpg")
  })

  it("ignores pending_review for verified-only snapshot", () => {
    const snapshot = buildMemberKycSnapshot(
      [
        {
          id: "1",
          doc_type: "national_id",
          passport_photo: "https://example.com/photo.jpg",
          document_front: "https://example.com/front.jpg",
          document_back: "https://example.com/back.jpg",
          status: "pending_review",
        },
      ],
      "verified",
    )

    expect(snapshot.formDocs.nationalIdFront).toBeNull()
    expect(snapshot.docComplete).toBe(false)
  })

  it("builds document slots by doc type", () => {
    const passportSlots = buildMemberKycDocumentSlots(
      {
        passportPhoto: "p.jpg",
        passportBiodataPage: "b.jpg",
        nationalIdFront: null,
        nationalIdBack: null,
        drivingLicenseFront: null,
        drivingLicenseBack: null,
      },
      "passport",
    )
    expect(passportSlots).toHaveLength(2)
    expect(passportSlots[1].label).toContain("Biodata")
  })

  it("batch upserts all fields into one member row", async () => {
    const queries: string[] = []
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim().toLowerCase())
        if (sql.toLowerCase().includes("select id") && sql.toLowerCase().includes("member_kyc_docs")) {
          return { rows: [] }
        }
        if (sql.toLowerCase().includes("insert into member_kyc_docs")) {
          return { rows: [{ id: "doc-1" }] }
        }
        if (sql.toLowerCase().includes("update member_kyc_docs")) {
          return { rows: [{ id: "doc-1" }] }
        }
        return { rows: [] }
      }),
    }

    const result = await upsertKycDocFields(client as never, {
      memberId: "member-1",
      institutionId: "inst-1",
      branchId: "branch-1",
      uploads: [
        { field: "national_id_front", url: "https://example.com/front.jpg" },
        { field: "passport_photo", url: "https://example.com/photo.jpg" },
        { field: "national_id_back", url: "https://example.com/back.jpg" },
      ],
      status: "verified",
      reviewedBy: "staff-1",
    })

    expect(result.saved).toHaveLength(3)
    expect(result.docTypes).toEqual(["national_id"])
    expect(queries.filter((q) => q.includes("insert into member_kyc_docs"))).toHaveLength(1)
    expect(queries.filter((q) => q.includes("update member_kyc_docs"))).toHaveLength(0)
  })

  it("updates the existing member row instead of inserting another", async () => {
    const queries: string[] = []
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim().toLowerCase())
        if (sql.toLowerCase().includes("select id") && sql.toLowerCase().includes("member_kyc_docs")) {
          return { rows: [{ id: "doc-existing", doc_type: "national_id" }] }
        }
        if (sql.toLowerCase().includes("update member_kyc_docs")) {
          return { rows: [{ id: "doc-existing" }] }
        }
        return { rows: [] }
      }),
    }

    const result = await upsertKycDocFields(client as never, {
      memberId: "member-1",
      institutionId: "inst-1",
      branchId: "branch-1",
      uploads: [{ field: "national_id_front", url: "https://example.com/new-front.jpg" }],
      status: "verified",
      reviewedBy: "staff-1",
    })

    expect(result.saved[0].docId).toBe("doc-existing")
    expect(queries.filter((q) => q.includes("insert into member_kyc_docs"))).toHaveLength(0)
    expect(queries.filter((q) => q.includes("update member_kyc_docs"))).toHaveLength(1)
  })

  it("flattens verified docs into legacy member URLs", () => {
    const flat = flattenVerifiedKycDocs([
      {
        id: "1",
        doc_type: "national_id",
        passport_photo: "https://example.com/passport.jpg",
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

  it("builds client portal legacy doc states from one member row", () => {
    const docs = buildLegacyClientKycDocs([
      {
        id: "member-kyc-1",
        doc_type: "national_id",
        passport_photo: "https://example.com/passport.jpg",
        document_front: "https://example.com/front-pending.jpg",
        document_back: null,
        status: "pending_review",
        created_at: "2024-01-03T00:00:00.000Z",
      },
    ])

    expect(docs.passport_photo.pending?.url).toBe("https://example.com/passport.jpg")
    expect(docs.national_id_front.pending?.url).toBe("https://example.com/front-pending.jpg")
    expect(docs.national_id_back.pending).toBeNull()
  })

  it("maps pending rows for staff review UI", () => {
    const pending = mapPendingKycRows([
      {
        id: "doc-1",
        doc_type: "national_id",
        passport_photo: "https://example.com/photo.jpg",
        document_front: "https://example.com/front.jpg",
        document_back: "https://example.com/back.jpg",
        status: "pending_review",
        created_at: "2024-01-01T00:00:00.000Z",
      },
    ])

    expect(pending[0]).toMatchObject({
      pendingId: "doc-1",
      docType: "national_id",
      url: "https://example.com/photo.jpg",
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
