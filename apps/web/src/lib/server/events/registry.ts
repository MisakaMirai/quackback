/**
 * Hook registry.
 *
 * Built-in hooks are triggered by the ordinary event queue.
 * The event processor uses getHook() to run hooks.
 *
 * Integration hooks run exclusively through the sync ledger and its registry.
 */

import type { HookHandler } from './hook-types'

// Import built-in handlers
import { emailHook } from './handlers/email'
import { notificationHook } from './handlers/notification'
import { webhookHook } from './handlers/webhook'

const builtinHooks = new Map<string, HookHandler>([
  ['email', emailHook],
  ['notification', notificationHook],
  ['webhook', webhookHook],
])

/**
 * Lazy-loaded hooks resolved via dynamic import to avoid circular dependencies.
 */
const lazyHooks: Record<string, () => Promise<HookHandler>> = {}

/**
 * Get a registered hook by type.
 * Checks built-in hooks first, then lazy hooks.
 */
export async function getHook(type: string): Promise<HookHandler | undefined> {
  const builtin = builtinHooks.get(type)
  if (builtin) return builtin

  const lazyLoader = lazyHooks[type]
  if (lazyLoader) {
    const hook = await lazyLoader()
    builtinHooks.set(type, hook) // cache for next call
    return hook
  }

  return undefined
}

/**
 * Register a hook handler.
 */
export function registerHook(type: string, handler: HookHandler): void {
  builtinHooks.set(type, handler)
}
