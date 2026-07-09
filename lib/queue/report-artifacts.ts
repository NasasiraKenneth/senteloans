import { getRedis } from "./redis"

const ARTIFACT_PREFIX = "report:artifact:"
const META_PREFIX = "report:artifact:meta:"

export type ReportArtifactMeta = {
  contentType: string
  filename: string
  institutionId: string
  authUserId: string
  rowCount: number
}

const DEFAULT_TTL_SEC = 6 * 3600

function artifactKey(jobId: string) {
  return `${ARTIFACT_PREFIX}${jobId}`
}

function metaKey(jobId: string) {
  return `${META_PREFIX}${jobId}`
}

export async function storeReportArtifact(
  jobId: string,
  buffer: Buffer,
  meta: ReportArtifactMeta,
  expiresInSec = DEFAULT_TTL_SEC,
): Promise<void> {
  const redis = getRedis()
  const ttl = Math.max(expiresInSec, 60)
  await redis
    .multi()
    .set(artifactKey(jobId), buffer, "EX", ttl)
    .set(metaKey(jobId), JSON.stringify(meta), "EX", ttl)
    .exec()
}

export async function getReportArtifactMeta(jobId: string): Promise<ReportArtifactMeta | null> {
  const raw = await getRedis().get(metaKey(jobId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as ReportArtifactMeta
  } catch {
    return null
  }
}

export async function getReportArtifactBuffer(jobId: string): Promise<Buffer | null> {
  const data = await getRedis().getBuffer(artifactKey(jobId))
  return data ?? null
}

export async function deleteReportArtifact(jobId: string): Promise<void> {
  await getRedis().del(artifactKey(jobId), metaKey(jobId))
}
