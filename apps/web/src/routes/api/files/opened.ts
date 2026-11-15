import { createFileRoute } from '@tanstack/react-router'
import { isValidTypeId, type FileId } from '@quackback/ids'
import { getClientIp } from '@/lib/server/domains/api/rate-limit'
import { bucketRetryAfter, incrementBucket } from '@/lib/server/utils/rate-bucket'
import { recordFileOpen } from '@/lib/server/domains/files/files.service'

const OPENED_LIMIT_PER_MINUTE = 120

/**
 * POST /api/files/opened?fileId=<id> — the viewer opened a file.
 *
 * Counts opens per file so usage by format is measurable. Sent as a beacon
 * from every surface (inbox, portal), so it takes no session: the id is
 * an unguessable capability and the worst a caller can do is inflate a count.
 */
export async function handleFileOpened({ request }: { request: Request }): Promise<Response> {
  const bucket = {
    key: `file-opened:ip:${getClientIp(request)}`,
    windowSeconds: 60,
  }
  const { count } = await incrementBucket(bucket)
  if (count !== null && count > OPENED_LIMIT_PER_MINUTE) {
    const retryAfter = await bucketRetryAfter(bucket)
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    })
  }
  const fileId = new URL(request.url).searchParams.get('fileId')
  if (!fileId || !isValidTypeId(fileId, 'file')) return new Response(null, { status: 400 })
  await recordFileOpen(fileId as FileId)
  return new Response(null, { status: 204 })
}

export const Route = createFileRoute('/api/files/opened')({
  server: { handlers: { POST: handleFileOpened } },
})
