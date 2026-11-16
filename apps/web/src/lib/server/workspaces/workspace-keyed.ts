/**
 * Cache helpers namespaced by the active workspace.
 *
 * Production is single-workspace, so the namespace is the fixed marker. Keeping
 * the namespacing shape means the test fixture's per-workspace caches stay
 * separated, and the call sites do not change.
 */
import { getCurrentWorkspace } from './workspace-context'

/** Namespace for a process with no workspace scope. Stable, never absent. */
export const SINGLE_WORKSPACE_NAMESPACE = '_'

/** The active workspace's id, or the single-workspace namespace. */
export function currentWorkspaceNamespace(): string {
  return getCurrentWorkspace()?.workspaceKey ?? SINGLE_WORKSPACE_NAMESPACE
}

/** Namespace an external key. */
export function workspaceScopedKey(key: string): string {
  return `w:${currentWorkspaceNamespace()}:${key}`
}

/** A bounded, workspace-partitioned map. */
export class WorkspaceKeyedCache<V> {
  private readonly entries = new Map<string, V>()

  constructor(private readonly maxEntries = 5_000) {}

  private static readonly SEPARATOR = '\u0000'

  private compose(key: string): string {
    return `${currentWorkspaceNamespace()}${WorkspaceKeyedCache.SEPARATOR}${key}`
  }

  get(key: string): V | undefined {
    return this.entries.get(this.compose(key))
  }

  has(key: string): boolean {
    return this.entries.has(this.compose(key))
  }

  set(key: string, value: V): void {
    const composed = this.compose(key)
    this.entries.delete(composed)
    this.entries.set(composed, value)
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(this.compose(key))
  }

  memo(key: string, factory: () => V): V {
    const existing = this.get(key)
    if (existing !== undefined) return existing
    const created = factory()
    this.set(key, created)
    return created
  }

  workspaceKeys(): string[] {
    const prefix = `${currentWorkspaceNamespace()}${WorkspaceKeyedCache.SEPARATOR}`
    const out: string[] = []
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) out.push(key.slice(prefix.length))
    }
    return out
  }

  clearWorkspace(): void {
    const prefix = `${currentWorkspaceNamespace()}${WorkspaceKeyedCache.SEPARATOR}`
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
