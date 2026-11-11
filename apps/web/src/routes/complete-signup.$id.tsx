import { nameInitial } from '@/lib/shared/utils/initial'
import { createFileRoute, isRedirect } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/solid'
import { Spinner } from '@/components/shared/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  acceptInvitationFn,
  getInvitationDetailsFn,
  getInviteBrandingFn,
  setPasswordFn,
} from '@/lib/server/functions/invitations'

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: '此邀请链接无效，可能已被使用。请联系管理员重新发送邀请。',
  EXPIRED_TOKEN: '此邀请链接已过期，请联系管理员重新发送邀请。',
  failed_to_create_user: '无法创建你的账户，请重试或联系管理员。',
  new_user_signup_disabled: '当前已关闭新账户创建，请联系管理员。',
  failed_to_create_session: '无法为你登录，请重试。',
}

export interface InviteBranding {
  workspaceName: string
  logoUrl: string | null
  inviterName: string | null
}

const DEFAULT_BRANDING: InviteBranding = {
  workspaceName: 'Quackback',
  logoUrl: null,
  inviterName: null,
}

export const Route = createFileRoute('/complete-signup/$id')({
  validateSearch: (search: Record<string, unknown>) => ({
    error: (search.error as string) || undefined,
  }),
  loader: async ({ params, context }) => {
    const { id } = params
    const { session } = context

    const branding = await getInviteBrandingFn({ data: id }).catch(() => DEFAULT_BRANDING)

    if (!session?.user) {
      return { state: 'not-authenticated' as const, branding }
    }

    try {
      const data = await getInvitationDetailsFn({ data: id })
      return { state: 'welcome' as const, ...data, branding }
    } catch (err) {
      if (isRedirect(err)) throw err
      const message = err instanceof Error ? err.message : '无法加载邀请'
      return { state: 'error' as const, error: message, branding }
    }
  },
  component: AcceptInvitationPage,
})

function AcceptInvitationPage() {
  const data = Route.useLoaderData()
  const { error: errorCode } = Route.useSearch()
  const { id } = Route.useParams()
  const { branding } = data

  // If the loader succeeded (state='welcome'), a stale ?error= from a previous
  // redirect attempt (e.g. Outlook Safe Links) should not override the valid invitation.
  if (errorCode && data.state !== 'welcome') {
    const message = ERROR_MESSAGES[errorCode] ?? '邀请链接出现问题，请联系管理员重新发送邀请。'
    return (
      <PageShell>
        <ErrorContent error={message} invitationId={id} errorKind="token" branding={branding} />
      </PageShell>
    )
  }

  if (data.state === 'not-authenticated') {
    return (
      <PageShell>
        <NotAuthenticatedContent invitationId={id} branding={branding} />
      </PageShell>
    )
  }

  if (data.state === 'error') {
    return (
      <PageShell>
        <ErrorContent error={data.error} invitationId={id} branding={branding} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <WelcomeContent
        invite={data.invite}
        passwordEnabled={data.passwordEnabled}
        branding={branding}
      />
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 25% 15%, var(--primary), transparent),
            radial-gradient(ellipse 50% 80% at 80% 85%, var(--primary), transparent)
          `,
        }}
      />
      <div className="relative w-full max-w-md py-12">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-sm font-medium text-muted-foreground">Quackback</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function WorkspaceIdentity({ branding }: { branding: InviteBranding }) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt={branding.workspaceName}
          className="h-8 w-8 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
          {nameInitial(branding.workspaceName)}
        </div>
      )}
      <span className="text-lg font-semibold">{branding.workspaceName}</span>
    </div>
  )
}

function NotAuthenticatedContent({
  invitationId,
  branding,
}: {
  invitationId: string
  branding: InviteBranding
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/80 p-8 text-center backdrop-blur-sm"
      style={{
        boxShadow:
          '0 0 80px -20px oklch(0.886 0.176 86 / 0.12), 0 20px 40px -12px rgb(0 0 0 / 0.08)',
      }}
    >
      <WorkspaceIdentity branding={branding} />
      <div className="mt-6 mb-6 h-px bg-border/50" />
      <h1 className="text-2xl font-bold tracking-tight">你收到了邀请！</h1>
      <p className="mt-2 text-muted-foreground">
        {branding.inviterName
          ? `${branding.inviterName} 邀请你加入团队，请登录后开始使用。`
          : '登录以接受邀请，并与团队一起开始使用。'}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <a href={`/auth/login?callbackUrl=/complete-signup/${invitationId}`}>
          <Button className="w-full h-11">登录</Button>
        </a>
        <a
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          返回首页
        </a>
      </div>
    </div>
  )
}

function WelcomeContent({
  invite,
  passwordEnabled,
  branding,
}: {
  invite: {
    name: string | null
    email: string
    workspaceName: string
    inviterName: string | null
  }
  passwordEnabled: boolean
  branding: InviteBranding
}) {
  const { id } = Route.useParams()
  const [name, setName] = useState(invite.name ?? '')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await accept(false)
  }

  async function accept(skipPassword: boolean) {
    const trimmedName = name.trim()

    if (trimmedName.length < 2) {
      setError('请输入你的姓名（至少 2 个字符）')
      return
    }
    if (!skipPassword && password && password.length < 8) {
      setError('密码至少需要 8 个字符')
      return
    }

    setError('')
    setIsLoading(true)

    try {
      await acceptInvitationFn({ data: { invitationId: id, name: trimmedName } })

      if (!skipPassword && password.length >= 8) {
        await setPasswordFn({ data: { newPassword: password } }).catch(() => {})
      }

      window.location.href = '/admin'
    } catch (err) {
      const message = err instanceof Error ? err.message : '接受邀请失败'
      if (message.includes('already been accepted')) {
        window.location.href = '/admin'
        return
      }
      setError(message)
      setIsLoading(false)
    }
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/80 backdrop-blur-sm"
      style={{
        boxShadow:
          '0 0 80px -20px oklch(0.886 0.176 86 / 0.12), 0 20px 40px -12px rgb(0 0 0 / 0.08)',
      }}
    >
      <div className="p-8">
        <WorkspaceIdentity branding={branding} />
        <div className="mt-6 mb-6 h-px bg-border/50" />
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">欢迎！</h1>
          <p className="mt-2 text-muted-foreground">
            {invite.inviterName ? `由 ${invite.inviterName} 邀请` : '完成账户设置即可开始使用'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email is fixed by the invite; a hidden username field lets
              password managers save the credential against it (and pairs
              with the password input for the a11y heuristic). */}
          <input type="hidden" name="email" value={invite.email} autoComplete="username" readOnly />

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              你的姓名
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="张三"
              autoComplete="name"
              autoFocus
              disabled={isLoading}
              className="h-11"
            />
          </div>

          {passwordEnabled && (
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                设置密码 <span className="text-muted-foreground font-normal">（可选）</span>
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 个字符"
                autoComplete="new-password"
                disabled={isLoading}
                className="h-11"
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || name.trim().length < 2}
            className="w-full h-11"
          >
            {isLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : '开始使用'}
          </Button>

          {passwordEnabled && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => accept(true)}
              disabled={isLoading}
              className="w-full text-muted-foreground"
            >
              跳过密码设置
            </Button>
          )}
        </form>
      </div>
    </div>
  )
}

type ErrorKind = 'token' | 'already-accepted' | 'generic'

function getErrorKind(error: string): ErrorKind {
  if (error.includes('already been accepted')) return 'already-accepted'
  if (error.includes('sign in') || error.includes('session has expired')) return 'token'
  return 'generic'
}

function ErrorContent({
  error,
  invitationId,
  errorKind,
  branding,
}: {
  error: string
  invitationId: string
  errorKind?: ErrorKind
  branding: InviteBranding
}) {
  const [retrying, setRetrying] = useState(false)
  const kind = errorKind ?? getErrorKind(error)

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/80 p-8 text-center backdrop-blur-sm"
      style={{
        boxShadow: '0 20px 40px -12px rgb(0 0 0 / 0.08)',
      }}
    >
      <WorkspaceIdentity branding={branding} />
      <div className="mt-6 mb-6 h-px bg-border/50" />
      {retrying ? (
        <div>
          <Spinner size="xl" className="border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">正在重试…</p>
        </div>
      ) : (
        <div>
          <div className="text-destructive text-xl font-medium tracking-tight">无法接受邀请</div>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <div className="mt-6 flex flex-col gap-3">
            {kind === 'already-accepted' ? (
              <a href="/admin">
                <Button className="w-full h-11">前往控制台</Button>
              </a>
            ) : kind === 'token' ? (
              <a href={`/auth/login?callbackUrl=/complete-signup/${invitationId}`}>
                <Button className="w-full h-11">登录</Button>
              </a>
            ) : (
              <Button
                className="h-11"
                onClick={() => {
                  setRetrying(true)
                  window.location.reload()
                }}
              >
                重试
              </Button>
            )}
            <a
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              返回首页
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
