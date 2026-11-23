/**
 * DNS records someone has to publish, one row each, with what the last check
 * found shown as an icon. A record that needs fixing gets one sentence under it
 * saying what to do; nothing is said up front.
 *
 * Every page that asks for DNS records uses this table, so a person sees the
 * same columns, states and copy buttons wherever they start.
 */
import { Fragment } from 'react'
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid'
import { CopyButton } from '@/components/shared/copy-button'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useCopyToClipboard } from '@/lib/client/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/shared/utils'

export type DnsRecordState = 'found' | 'waiting' | 'problem'

/**
 * For a table whose names are full hostnames because the zone they sit in is
 * not known (most callers pass names relative to the domain, `@` for its apex).
 */
export const FULL_NAMES_NOTE =
  'Names are shown in full. If your DNS host adds your domain itself, enter only the part before it.'

export interface DnsRecordRow {
  /** What the record is for, in a word or two. */
  label: string
  /** The record type as shown, such as `CNAME`, `TXT` or `MX 10`. */
  type: string
  /** Relative to the domain (`@` for its apex), unless the caller says otherwise. */
  name: string
  value: string
  state: DnsRecordState
  /** The sentence that says how to fix it, for a record in the problem state. */
  problem?: string
}

/** The most characters one TXT string holds; a longer value is several strings of one record. */
const TXT_STRING_MAX = 255

/**
 * A value as quoted parts of at most 255 characters each, `"<part>" "<rest>"`:
 * the form DNS hosts that do not split a long TXT value themselves expect.
 */
export function txtParts(value: string): string {
  const parts: string[] = []
  for (let i = 0; i < value.length; i += TXT_STRING_MAX) {
    parts.push(`"${value.slice(i, i + TXT_STRING_MAX)}"`)
  }
  return parts.join(' ')
}

function CopyAsParts({ value, name }: { value: string; name: string }) {
  const intl = useOptionalIntl()
  const { copied, copy } = useCopyToClipboard()
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      onClick={() => copy(txtParts(value))}
      className="h-auto p-0 text-xs font-normal text-muted-foreground"
      aria-label={intl.formatMessage(
        { id: 'common.dns.copyAsPartsAria', defaultMessage: 'Copy as parts for {name}' },
        { name }
      )}
    >
      {copied
        ? intl.formatMessage({ id: 'common.dns.copied', defaultMessage: 'Copied' })
        : intl.formatMessage({ id: 'common.dns.copyAsParts', defaultMessage: 'Copy as parts' })}
    </Button>
  )
}

/**
 * Where the table has less than 36rem to itself (a phone, or a narrow column
 * beside a sidebar) four columns leave the value a few characters wide. Each
 * record then stacks: its cells one under another, named by `data-label`,
 * with the header row left out.
 */
const STACKED_CELL =
  '@max-xl:flex @max-xl:items-start @max-xl:gap-3 @max-xl:py-0.5 @max-xl:pr-0 ' +
  '@max-xl:before:w-11 @max-xl:before:shrink-0 @max-xl:before:pt-0.5 @max-xl:before:font-sans ' +
  '@max-xl:before:text-xs @max-xl:before:text-muted-foreground ' +
  '@max-xl:before:content-[attr(data-label)]'

const STATE_ICON = {
  found: { icon: CheckCircleIcon, tone: 'text-success' },
  waiting: { icon: ClockIcon, tone: 'text-muted-foreground/70' },
  problem: { icon: ExclamationCircleIcon, tone: 'text-destructive' },
} as const

const STATE_LABEL_ID = {
  found: 'common.dns.stateFound',
  waiting: 'common.dns.stateWaiting',
  problem: 'common.dns.stateNeedsFix',
} as const

const STATE_DEFAULT_LABEL = {
  found: 'Found',
  waiting: 'Waiting',
  problem: 'Needs a fix',
} as const

export function DnsRecordTable({ records }: { records: DnsRecordRow[] }) {
  const intl = useOptionalIntl()
  const columns = {
    record: intl.formatMessage({ id: 'common.dns.columnRecord', defaultMessage: 'Record' }),
    name: intl.formatMessage({ id: 'common.dns.columnName', defaultMessage: 'Name' }),
    type: intl.formatMessage({ id: 'common.dns.columnType', defaultMessage: 'Type' }),
    value: intl.formatMessage({ id: 'common.dns.columnValue', defaultMessage: 'Value' }),
  }
  return (
    <div className="@container overflow-x-auto">
      <table className="w-full text-[13px] @max-xl:block">
        <thead className="@max-xl:hidden">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">{columns.record}</th>
            <th className="py-1.5 pr-3 font-medium">{columns.name}</th>
            <th className="py-1.5 pr-3 font-medium">{columns.type}</th>
            <th className="py-1.5 font-medium">{columns.value}</th>
          </tr>
        </thead>
        <tbody className="@max-xl:block">
          {records.map((r) => {
            const { icon: Icon, tone } = STATE_ICON[r.state]
            const stateLabel = intl.formatMessage({
              id: STATE_LABEL_ID[r.state],
              defaultMessage: STATE_DEFAULT_LABEL[r.state],
            })
            return (
              <Fragment key={`${r.type} ${r.name} ${r.value}`}>
                <tr
                  data-slot="dns-record"
                  className="border-t border-border/50 align-top @max-xl:block @max-xl:py-2 @max-xl:first:border-t-0"
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap @max-xl:block @max-xl:pt-0 @max-xl:font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon className={cn('size-4 shrink-0', tone)} aria-hidden="true" />
                      <span className="sr-only">{stateLabel}: </span>
                      {r.label}
                    </span>
                  </td>
                  <td data-label={columns.name} className={cn('py-1.5 pr-3', STACKED_CELL)}>
                    <span className="flex min-w-0 items-start gap-1">
                      <span className="font-mono whitespace-nowrap @max-xl:break-all @max-xl:whitespace-normal">
                        {r.name}
                      </span>
                      <CopyButton
                        value={r.name}
                        variant="ghost"
                        className="size-6"
                        aria-label={intl.formatMessage(
                          {
                            id: 'common.dns.copyNameAria',
                            defaultMessage: 'Copy name {name}',
                          },
                          { name: r.name }
                        )}
                      />
                    </span>
                  </td>
                  <td
                    data-label={columns.type}
                    className={cn('py-1.5 pr-3 font-mono whitespace-nowrap', STACKED_CELL)}
                  >
                    {r.type}
                  </td>
                  <td data-label={columns.value} className={cn('py-1.5', STACKED_CELL)}>
                    <span className="flex min-w-0 items-start gap-1">
                      <span className="font-mono break-all">{r.value}</span>
                      <CopyButton
                        value={r.value}
                        variant="ghost"
                        className="size-6"
                        aria-label={intl.formatMessage(
                          {
                            id: 'common.dns.copyValueAria',
                            defaultMessage: 'Copy value for {name}',
                          },
                          { name: r.name }
                        )}
                      />
                    </span>
                  </td>
                </tr>
                {r.value.length > TXT_STRING_MAX && (
                  <tr data-slot="dns-record-parts" className="@max-xl:block">
                    <td colSpan={3} className="@max-xl:hidden" />
                    <td className="pb-1.5 @max-xl:block @max-xl:pl-14">
                      <CopyAsParts value={r.value} name={r.name} />
                    </td>
                  </tr>
                )}
                {r.state === 'problem' && r.problem && (
                  <tr data-slot="dns-record-fix" className="@max-xl:block">
                    <td
                      colSpan={4}
                      // A long value quoted in the sentence may break anywhere;
                      // its words break only where they must.
                      className="pb-2 text-xs text-destructive [overflow-wrap:anywhere] @max-xl:block"
                    >
                      {r.problem}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
