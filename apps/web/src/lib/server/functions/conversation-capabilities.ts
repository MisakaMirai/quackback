import { createServerFn } from '@tanstack/react-start'

/**
 * What the client should know about this deployment's realtime capabilities,
 * fetched once at portal boot. Kept deliberately small and serializable
 * so the native SDKs can consume the same shape.
 */
export interface ConversationCapabilities {
  chat: {
    /** 'live' = subscribe to the SSE stream; 'poll' = use the polling fallback
     *  (a host behind a proxy that buffers or drops event streams). */
    mode: 'live' | 'poll'
    /** Poll cadence (ms) the client uses in poll mode or after SSE degrades. */
    pollIntervalMs: number
  }
}

/** How often the polling fallback refetches the thread. */
const CHAT_POLL_INTERVAL_MS = 10_000

/**
 * Public boot handshake — no auth (it leaks nothing, and the portal calls it
 * before it has a session). Reports the realtime chat transport so the client
 * can skip SSE entirely on deployments that can't hold long-lived connections.
 */
export const getConversationCapabilitiesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ConversationCapabilities> => {
    const { config } = await import('@/lib/server/config')
    return {
      chat: { mode: config.chatTransportMode, pollIntervalMs: CHAT_POLL_INTERVAL_MS },
    }
  }
)
