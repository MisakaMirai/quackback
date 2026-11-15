import { FormattedMessage, useIntl } from 'react-intl'
import { LockClosedIcon } from '@heroicons/react/24/solid'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/shared/utils'
import { getTimeAgo } from '@/components/ui/time-ago'
import { MessageMarkdown } from './message-markdown'
import { sanitizeUrl } from '@/lib/shared/utils/sanitize'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ConversationMessageCitation } from '@/lib/shared/conversation/types'

/**
 * The render path's citation shape: every persisted citation plus the
 * leak-gate's `internal` flag, which the DB-stored `ConversationMessageCitation`
 * deliberately does NOT carry (see conversation/types.ts). Only the assistant
 * ledger (AssistantCitation) and the SSE contracts (SandboxCitation,
 * CopilotCitation) produce `internal`; this component renders whichever shape
 * a caller hands it, persisted or not, so it widens to a superset rather than
 * importing from any of those contract modules.
 */
export type RenderableCitation = ConversationMessageCitation & {
  internal?: boolean
  /** ISO timestamp of the source's last update (CopilotCitation.updatedAt):
   *  drives the hovercard's "Updated 8 days ago" freshness line. Absent on
   *  persisted citations, which then render exactly as before. */
  updatedAt?: string
}

/**
 * The citation hovercard's "Updated 8 days ago" freshness line, shared by the
 * inline citation dots here and the Copilot source rows (copilot-sources.tsx).
 * Rendered statically (getTimeAgo once per render, no interval): source
 * freshness only needs days-granularity updates. Renders nothing without a
 * parseable `updatedAt` (never a dangling "Updated ").
 */
export function CitationFreshness({
  updatedAt,
  className,
}: {
  updatedAt?: string
  className?: string
}) {
  const intl = useIntl()
  const label = getTimeAgo(updatedAt, intl.locale)
  if (!label) return null
  return (
    <span className={cn('block text-[11px] text-muted-foreground', className)}>
      <FormattedMessage
        id="widget.messenger.assistant.citationUpdated"
        defaultMessage="Updated {time}"
        values={{ time: label }}
      />
    </span>
  )
}

/** The host a citation link resolves to. KB citations are relative /hc/ paths,
 *  so resolve them against the current origin (where the widget and its help
 *  center are served) to show where the link actually goes. */
function citationHost(url: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : undefined
    return new URL(url, base).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Open behaviour for a citation. Callback-driven surfaces (the help-center
 *  Ask AI) navigate in-app; without one, the dot is a new-tab link. */
export type CitationOpen = (citation: RenderableCitation) => void

const CITATION_DOT_CLASS =
  'mx-0.5 inline-grid h-[18px] w-[18px] place-items-center rounded-full bg-foreground/10 text-[10.5px] font-bold tabular-nums text-muted-foreground no-underline transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground'

// Internal-sourced citations (COPILOT-SIDEBAR-UX.md's leak-gate badge) get an
// amber tint instead of the default neutral pill. Additive: only ever applied
// when `citation.internal === true`, so every non-internal citation keeps the
// exact class list above.
const CITATION_DOT_INTERNAL_CLASS =
  'bg-amber-400/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-300 hover:bg-amber-500 hover:text-white focus-visible:bg-amber-500 focus-visible:text-white'

/** A single inline citation dot with a hover/focus source card.
 *  An internal-sourced citation (`internal === true`) additionally gets an
 *  amber tint and a small lock badge — the visual half of the Copilot leak
 *  gate (COPILOT-SIDEBAR-UX.md B.4) — and its hovercard shows an "Internal"
 *  tag instead of a URL host when there is no public url. Every other
 *  citation renders exactly as before. */
function CitationDot({
  n,
  citation,
  onOpen,
}: {
  n: number
  citation: RenderableCitation
  onOpen?: CitationOpen
}) {
  const intl = useIntl()
  const isInternal = citation.internal === true
  const url = sanitizeUrl(citation.url)
  const hasUrl = !!url
  const source = citationHost(citation.url) || citation.title
  const label = isInternal
    ? intl.formatMessage(
        {
          id: 'widget.messenger.assistant.citationInternalLabel',
          defaultMessage: 'Internal source {n}: {title}',
        },
        { n, title: citation.title }
      )
    : intl.formatMessage(
        { id: 'widget.messenger.assistant.citationLabel', defaultMessage: 'Source {n}: {title}' },
        { n, title: citation.title }
      )
  const dotClass = cn(CITATION_DOT_CLASS, isInternal && CITATION_DOT_INTERNAL_CLASS)
  return (
    <span className="relative inline-block align-[1px]">
      <Tooltip>
        <TooltipTrigger asChild>
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(citation)}
              aria-label={label}
              className={cn(dotClass, 'cursor-pointer')}
            >
              {n}
            </button>
          ) : url ? (
            <a href={url} target="_blank" rel="noreferrer" aria-label={label} className={dotClass}>
              {n}
            </a>
          ) : (
            <span aria-label={label} className={dotClass} tabIndex={0}>
              {n}
            </span>
          )}
        </TooltipTrigger>
        {isInternal && (
          <LockClosedIcon
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 p-[1.5px] text-white"
          />
        )}
        <TooltipContent
          className="w-56 max-w-[calc(100vw-1rem)] rounded-xl p-3 text-left"
          sideOffset={8}
        >
          <span className="mb-1.5 block text-[13px] font-semibold leading-snug text-foreground">
            {citation.title}
          </span>
          {isInternal && !hasUrl ? (
            <span className="flex items-center gap-1.5 text-[12px] text-amber-700 dark:text-amber-300">
              <LockClosedIcon className="h-3 w-3 shrink-0" />
              <FormattedMessage
                id="widget.messenger.assistant.citationInternal"
                defaultMessage="Internal"
              />
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <ArrowTopRightOnSquareIcon className="h-3 w-3 shrink-0" />
              {source}
            </span>
          )}
          <CitationFreshness updatedAt={citation.updatedAt} className="mt-1" />
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

/** A streaming caret trailing the answer while it's still arriving. */
function AnswerCaret() {
  return (
    <span
      aria-hidden
      className="ms-0.5 inline-block h-[1em] w-px animate-pulse bg-primary/80 align-[-0.15em]"
    />
  )
}

/** Quinn's Markdown answer, shared by the inbox, widget and Help Center.
 * Citation dots are added only to prose, after parsing links and code. */
export function AssistantAnswer({
  text,
  citations,
  caret = false,
  onCitationOpen,
}: {
  text: string
  citations: RenderableCitation[]
  caret?: boolean
  /** When set, citation dots become in-app buttons instead of new-tab links. */
  onCitationOpen?: CitationOpen
}) {
  return (
    <MessageMarkdown
      text={text}
      trailing={caret ? <AnswerCaret /> : undefined}
      renderCitation={(n) => {
        const citation = citations[n - 1]
        return citation ? (
          <CitationDot n={n} citation={citation} onOpen={onCitationOpen} />
        ) : caret ? null : (
          `[${n}]`
        )
      }}
    />
  )
}
