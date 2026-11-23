import { db, integrationDeliveries } from '@/lib/server/db'
import { getIntegration } from './index'
import { getPlatformCredentials } from '@/lib/server/domains/platform-credentials/platform-credential.service'

export async function readAppHookBody(request: Request, limit = 1_048_576): Promise<string> {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Body too large')
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) {
        await reader.cancel()
        throw new Error('Body too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}
export async function handleAppHook(
  request: Request,
  type: string,
  kind: string
): Promise<Response> {
  const hooks = getIntegration(type)?.appHooks
  if (!hooks || !hooks.kinds.includes(kind)) return new Response(null, { status: 404 })
  let rawBody: string
  try {
    rawBody = await readAppHookBody(request)
  } catch {
    return new Response(null, { status: 413 })
  }
  const credentials = await getPlatformCredentials(type)
  if (!credentials || !hooks.verify({ headers: request.headers, rawBody, credentials }))
    return new Response(null, { status: 401 })
  const contentType = request.headers.get('content-type')
  let deliveryId: string | null
  try {
    deliveryId = hooks.deliveryId(kind, rawBody, contentType)
  } catch {
    return new Response(null, { status: 400 })
  }
  try {
    return await db.transaction(async (tx) => {
      if (deliveryId) {
        const inserted = await tx
          .insert(integrationDeliveries)
          .values({ provider: type, deliveryId })
          .onConflictDoNothing()
          .returning()
        if (!inserted.length) return new Response(null, { status: 200 })
      }
      // Handler errors must throw: rollback must cover BOTH the receipt and job.
      const response = await hooks.handle(kind, rawBody, contentType, tx)
      if (!response.ok) throw new Error('Hook handler rejected delivery')
      return response
    })
  } catch {
    return new Response(null, { status: 503 })
  }
}
export async function sweepIntegrationDeliveries(): Promise<void> {
  const { lt } = await import('@/lib/server/db')
  await db
    .delete(integrationDeliveries)
    .where(lt(integrationDeliveries.receivedAt, new Date(Date.now() - 7 * 86400_000)))
}
