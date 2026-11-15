/**
 * Retired Quackback AI tables.
 *
 * These definitions stay importable for the application's compatibility shims,
 * but they are deliberately NOT part of `schema/index.ts`, so drizzle-kit and
 * the drift checker do not recreate the tables that migration 0312 drops.
 */
export * from './assistant'
export * from './assistant-events'
export * from './assistant-guidance'
export * from './assistant-pending-actions'
export * from './assistant-tool-calls'
export * from './assistant-web-sources'
export * from './workspace-assistant'
export * from './agent-skills'
export * from './connectors'
export * from './ai-usage-log'
export * from './conversation-summary'
export * from './ticket-summary'
export * from './sentiment'
export * from './merge-suggestions'
