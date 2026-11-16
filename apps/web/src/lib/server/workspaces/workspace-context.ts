/**
 * The active workspace.
 *
 * Production is single-workspace: one process, one database from `DATABASE_URL`,
 * one set of secrets from the environment. The pooled hosting runtime (Host
 * resolution, per-workspace pools, registry, fingerprints) has been removed.
 *
 * A lightweight scope carrier remains for two reasons: the request code still
 * asks "is there a workspace?" in a few places, and the test fixture opens a
 * scope to exercise per-install storage/secret behaviour. Production never
 * creates one, so every accessor answers the single-workspace value.
 */
import type { Database } from '@quackback/db/client'
import type { Sql } from 'postgres'
import { getLogContext, runWithLogContext, setLogContext } from '@/lib/server/log-context'

const WORKSPACE_SCOPE_KEY = Symbol.for('quackback.workspaceScope')
const SCOPE_SECRETS_KEY = Symbol.for('quackback.workspaceScope.secrets')

export type WorkspaceScopeOrigin = 'request' | 'sweep' | 'queue' | 'script' | 'migration' | 'test'

/** The single workspace's identity, as consumers read it. */
export interface WorkspaceDescriptor {
  readonly workspaceKey: string
  readonly revision?: number
  readonly routing: {
    readonly baseUrl: string
    readonly primaryHostname: string
    readonly hostnames: string[]
  }
  readonly database?: Record<string, unknown>
  readonly fingerprint: {
    readonly expectedWorkspaceKey?: string
    readonly expectedSelfReportedWorkspaceId?: string
    readonly stampedAt?: string
    readonly [key: string]: unknown
  }
  readonly secrets?: Record<string, unknown>
  readonly storage: {
    readonly bucket: string
    readonly endpoint?: string | null
    readonly region: string
    readonly forcePathStyle: boolean
    readonly publicUrl?: string | null
    readonly provider?: string
    readonly credentialRef?: string
  }
  readonly email: {
    readonly from: string
    readonly mailSlug: string
    readonly [key: string]: unknown
  }
  readonly features?: Record<string, unknown>
  readonly physical?: Record<string, unknown>
  readonly contractVersion?: number
}

export interface ResolvedWorkspaceSecrets {
  readonly secretKey: string
  readonly provenance?: Record<string, unknown>
  readonly storage: { readonly accessKeyId: string; readonly secretAccessKey: string } | null
  readonly storageProblem?: string | null
}

export interface WorkspaceScope {
  readonly workspace: WorkspaceDescriptor
  readonly db?: Database
  readonly sql?: Sql
  readonly origin: WorkspaceScopeOrigin
}

export interface WorkspaceScopeInit extends WorkspaceScope {
  readonly secrets: ResolvedWorkspaceSecrets
}

export class WorkspaceScopeMissingError extends Error {
  constructor(detail: string) {
    super(`No workspace scope is active. ${detail}`)
    this.name = 'WorkspaceScopeMissingError'
  }
}

/** Build a scope. Refuses a scope without resolved secrets. */
export function createWorkspaceScope(init: WorkspaceScopeInit): WorkspaceScope {
  if (typeof init.secrets?.secretKey !== 'string' || init.secrets.secretKey === '') {
    throw new WorkspaceScopeMissingError(
      `workspace ${init.workspace.workspaceKey} has no secret key`
    )
  }
  const scope: WorkspaceScope = {
    workspace: init.workspace,
    ...(init.db ? { db: init.db } : {}),
    ...(init.sql ? { sql: init.sql } : {}),
    origin: init.origin,
  }
  Object.defineProperty(scope, SCOPE_SECRETS_KEY, { value: init.secrets, enumerable: false })
  return Object.freeze(scope)
}

function scopeSecrets(scope: WorkspaceScope | null): ResolvedWorkspaceSecrets | null {
  if (!scope) return null
  const held = (scope as unknown as Record<PropertyKey, unknown>)[SCOPE_SECRETS_KEY] as
    ResolvedWorkspaceSecrets | undefined
  if (!held) throw new WorkspaceScopeMissingError('the scope carries no resolved secrets')
  return held
}

export function getWorkspaceScope(): WorkspaceScope | null {
  const store = getLogContext() as Record<PropertyKey, unknown> | undefined
  return (store?.[WORKSPACE_SCOPE_KEY] as WorkspaceScope | undefined) ?? null
}

export function requireWorkspaceScope(
  detail = 'A workspace-scoped operation was attempted.'
): WorkspaceScope {
  const scope = getWorkspaceScope()
  if (!scope) throw new WorkspaceScopeMissingError(detail)
  return scope
}

/** The Drizzle handle for the active workspace, or null. */
export function getScopedDatabase(): Database | null {
  return getWorkspaceScope()?.db ?? null
}

/** The active workspace record, or null. */
export function getCurrentWorkspace(): WorkspaceDescriptor | null {
  return getWorkspaceScope()?.workspace ?? null
}

/** The active workspace's `SECRET_KEY`, or null. Callers use `config.secretKey`. */
export function getWorkspaceSecretKey(): string | null {
  return scopeSecrets(getWorkspaceScope())?.secretKey ?? null
}

export type WorkspaceStorageCredential =
  | {
      readonly ok: true
      readonly credential: { readonly accessKeyId: string; readonly secretAccessKey: string }
    }
  | { readonly ok: false; readonly problem: string }

export function getWorkspaceStorageCredential(): WorkspaceStorageCredential | null {
  const secrets = scopeSecrets(getWorkspaceScope())
  if (!secrets) return null
  if (!secrets.storage) {
    if (secrets.storageProblem == null) return null
    return { ok: false, problem: secrets.storageProblem }
  }
  return { ok: true, credential: secrets.storage }
}

/** Run `fn` with `scope` as the ambient workspace. */
export function runWithWorkspaceScope<T>(scope: WorkspaceScope, fn: () => T): T {
  scopeSecrets(scope)
  const parent = getLogContext() as Record<PropertyKey, unknown> | undefined
  const child: Record<PropertyKey, unknown> = {
    request_id: (parent?.request_id as string | undefined) ?? crypto.randomUUID(),
    route:
      (parent?.route as string | undefined) ?? `${scope.origin}:${scope.workspace.workspaceKey}`,
    ...(parent ?? {}),
    workspace_key: scope.workspace.workspaceKey,
  }
  child[WORKSPACE_SCOPE_KEY] = scope
  if (parent) setLogContext({ workspace_key: scope.workspace.workspaceKey })
  return runWithLogContext(child as never, fn)
}
