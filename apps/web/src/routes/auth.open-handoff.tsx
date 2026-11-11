import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import type { OriginTransferResult } from '@/lib/server/functions/origin-transfer'

const searchSchema = z.object({
  ott: z.string().optional(),
  returnTo: z.string().optional(),
})

/**
 * Consume on this request. An RPC server fn would drop the workspace Host;
 * a `*.server.ts` import is denied in the client-bundled route.
 */
const consumeOpenHandoffOnRequest = createServerOnlyFn(
  async (search: z.infer<typeof searchSchema>): Promise<OriginTransferResult> => {
    const { consumeOpenHandoff } = await import('@/lib/server/functions/origin-transfer')
    const result = await consumeOpenHandoff({
      ...search,
      headers: getRequestHeaders(),
    })
    if (result.kind === 'redirect') {
      ;(setResponseHeader as (name: string, value: string | string[]) => void)(
        'Set-Cookie',
        result.cookies
      )
    }
    return result
  }
)

export const Route = createFileRoute('/auth/open-handoff')({
  validateSearch: searchSchema.parse,
  loader: async ({ location }) => {
    const search = location.search as z.infer<typeof searchSchema>
    return consumeOpenHandoffOnRequest(search)
  },
  component: OpenHandoffPage,
})

function OpenHandoffPage() {
  const result = Route.useLoaderData()
  if (result.kind === 'redirect') return <HandoffContinue to={result.to} />
  return <OpenHandoffError />
}

function HandoffContinue({ to }: { to: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <meta httpEquiv="refresh" content={`0;url=${encodeURI(to)}`} />
      <p className="text-sm text-muted-foreground">正在打开你的工作区…</p>
      <script
        dangerouslySetInnerHTML={{ __html: `window.location.replace(${JSON.stringify(to)})` }}
      />
    </main>
  )
}

function OpenHandoffError() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">此登录链接已失效</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          它可能已被使用或已过期，请从控制台重新打开工作区。
        </p>
        <Link
          to="/auth/login"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          登录
        </Link>
      </section>
    </main>
  )
}
