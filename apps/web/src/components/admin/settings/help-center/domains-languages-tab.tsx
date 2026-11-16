import { INLINE_LINK } from '@/components/admin/settings/inline-link'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { IntlShape } from 'react-intl'
import { TrashIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { SettingRow, SettingRows } from '@/components/admin/settings/setting-row'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  DnsRecordTable,
  FULL_NAMES_NOTE,
  type DnsRecordRow,
} from '@/components/shared/dns-record-table'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InlineSpinner } from '@/components/admin/settings/inline-spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { settingsQueries } from '@/lib/client/queries/settings'
import { helpCenterQueries } from '@/lib/client/queries/help-center'
import {
  useUpdateHelpCenterSeo,
  useUpdateHelpCenterDomain,
  useVerifyHelpCenterDomain,
  useCreateHelpCenterRedirectRule,
  useDeleteHelpCenterRedirectRule,
  useEnableHelpCenterLocale,
  useDisableHelpCenterLocale,
  useUpdateHelpCenterLocaleChrome,
} from '@/lib/client/mutations/settings'
import { listArticlesFn } from '@/lib/server/functions/help-center'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/shared/i18n'
import type { HelpCenterConfig } from '@/lib/shared/types/settings'

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  'zh-cn': '简体中文',
  'zh-tw': '繁體中文',
}

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

/**
 * The stored form of a hostname: trimmed, one trailing dot dropped, IDN labels
 * as punycode, lower case. Null when the value is not a bare hostname. The
 * server canonicalises the same way, so the two agree on what is already saved.
 */
export function normalizeHelpCenterDomain(value: string): string | null {
  const trimmed = value.trim().replace(/\.$/, '')
  if (!trimmed || /[\s/:@?#\\]/.test(trimmed)) return null
  let ascii: string
  try {
    ascii = new URL(`http://${trimmed}`).hostname
  } catch {
    return null
  }
  const lower = ascii.toLowerCase()
  return HOSTNAME_PATTERN.test(lower) ? lower : null
}

/** An empty value clears the domain; anything else must be a bare hostname. */
export function isValidHelpCenterDomain(value: string): boolean {
  return value.trim() === '' || normalizeHelpCenterDomain(value) !== null
}

const MAX_PROTECTED_TERMS = 100
const MAX_TERM_LENGTH = 100

export function parseProtectedTerms(text: string): string[] {
  return text
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** A message descriptor, kept in the module so helpers can return one. */
interface MessageRef {
  id: string
  defaultMessage: string
}

/** The reason the terms cannot be saved, or null when they can. */
export function protectedTermsError(terms: string[]): MessageRef | null {
  if (terms.length > MAX_PROTECTED_TERMS) {
    return {
      id: 'admin.settings.helpCenter.domains.tooManyTerms',
      defaultMessage: 'Use at most {max} terms.',
    }
  }
  if (terms.some((t) => t.length > MAX_TERM_LENGTH)) {
    return {
      id: 'admin.settings.helpCenter.domains.termTooLong',
      defaultMessage: 'Each term can be up to {max} characters.',
    }
  }
  return null
}

interface LocaleChromeValues {
  homepageTitle: string
  homepageDescription: string
  searchPlaceholder: string
}

/** The reason the texts cannot be saved, or null when they can. */
export function localeChromeError(values: LocaleChromeValues): MessageRef | null {
  if (!values.homepageTitle.trim()) {
    return {
      id: 'admin.settings.helpCenter.domains.homepageTitleRequired',
      defaultMessage: 'Add a homepage title.',
    }
  }
  if (values.homepageTitle.length > 200) {
    return {
      id: 'admin.settings.helpCenter.domains.homepageTitleTooLong',
      defaultMessage: 'The homepage title can be up to 200 characters.',
    }
  }
  if (values.homepageDescription.length > 500) {
    return {
      id: 'admin.settings.helpCenter.domains.homepageDescriptionTooLong',
      defaultMessage: 'The homepage description can be up to 500 characters.',
    }
  }
  if (values.searchPlaceholder.length > 200) {
    return {
      id: 'admin.settings.helpCenter.domains.searchPlaceholderTooLong',
      defaultMessage: 'The search placeholder can be up to 200 characters.',
    }
  }
  return null
}

interface DomainsLanguagesTabProps {
  config: HelpCenterConfig
}

export function DomainsLanguagesTab({ config }: DomainsLanguagesTabProps) {
  return (
    <div className="space-y-6">
      <DomainCard domain={config.domain} />
      <RedirectRulesCard />
      <IndexingCard indexable={config.seo.indexable} />
      <LocalesCard locales={config.locales} />
    </div>
  )
}

// ============================================================================
// Domain
// ============================================================================

function DomainCard({ domain }: { domain: HelpCenterConfig['domain'] }) {
  const intl = useOptionalIntl()
  const [value, setValue] = useState(domain.domain ?? '')
  const [savedDomain, setSavedDomain] = useState(domain.domain ?? '')
  const [invalid, setInvalid] = useState(false)
  const updateDomain = useUpdateHelpCenterDomain()
  const verifyDomain = useVerifyHelpCenterDomain()
  const statusQuery = useQuery({
    ...settingsQueries.helpCenterDomainStatus(),
    enabled: !!domain.domain,
  })

  const busy = verifyDomain.isPending
  const verifyDisabled = busy

  useEffect(() => {
    setSavedDomain(domain.domain ?? '')
  }, [domain.domain])

  function save() {
    const next = normalizeHelpCenterDomain(value) ?? ''
    if (value.trim() !== '' && next === '') {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (next === savedDomain) return
    updateDomain.mutate(next || null, {
      onSuccess: () => {
        setSavedDomain(next)
        setValue(next)
      },
    })
  }

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.domainCardTitle',
        defaultMessage: 'Custom domain',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.domainCardDescription',
        defaultMessage: 'Serve the help center on your own subdomain.',
      })}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="hc-domain" className="text-sm font-medium">
            {intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.domainLabel',
              defaultMessage: 'Domain',
            })}
          </Label>
          <Input
            id="hc-domain"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setInvalid(false)
            }}
            onBlur={save}
            placeholder="help.acme.com"
            disabled={busy}
            aria-invalid={invalid || undefined}
          />
          {invalid && (
            <p role="alert" className="text-xs text-destructive">
              {intl.formatMessage({
                id: 'admin.settings.helpCenter.domains.invalidDomain',
                defaultMessage: 'Enter a hostname like help.acme.com, without https:// or a path.',
              })}
            </p>
          )}
        </div>

        {domain.domain && (
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
            <div className="flex items-center gap-2">
              <VerifiedChip verifiedAt={domain.verifiedAt} />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={verifyDisabled}
              onClick={() => verifyDomain.mutate()}
            >
              <InlineSpinner visible={verifyDomain.isPending} />
              {intl.formatMessage({
                id: 'admin.settings.helpCenter.domains.verify',
                defaultMessage: 'Verify',
              })}
            </Button>
          </div>
        )}

        {domain.domain && statusQuery.data?.cnameTarget && (
          <div className="space-y-1">
            <DnsRecordTable
              records={[
                helpCenterCnameRecord(
                  domain.domain,
                  statusQuery.data.cnameTarget,
                  statusQuery.data,
                  intl
                ),
              ]}
            />
            <p className="text-xs text-muted-foreground">{FULL_NAMES_NOTE}</p>
          </div>
        )}

        <Collapsible>
          <CollapsibleTrigger className={`${INLINE_LINK} text-[13px]`}>
            {intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.dnsSetup',
              defaultMessage: 'DNS setup',
            })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
              <p>
                {intl.formatMessage({
                  id: 'admin.settings.helpCenter.domains.dnsNoteProxy',
                  defaultMessage:
                    'Point a CNAME for your domain at this instance. TLS terminates at your own reverse proxy (Caddy, nginx, Traefik). Quackback does not issue certificates.',
                })}
              </p>
              <p>
                {intl.formatMessage({
                  id: 'admin.settings.helpCenter.domains.dnsNoteImages',
                  defaultMessage:
                    'Article content stores absolute image URLs. Changing the domain does not rewrite existing article images, so keep the old host reachable or re-upload affected images.',
                })}
              </p>
              <p>
                {intl.formatMessage({
                  id: 'admin.settings.helpCenter.domains.dnsNoteFonts',
                  defaultMessage:
                    'If you self-host branding fonts, keep doing so on the new domain too. Never link a Google Fonts stylesheet from the help center.',
                })}
              </p>
              <p>
                {intl.formatMessage({
                  id: 'admin.settings.helpCenter.domains.dnsNoteRedirect',
                  defaultMessage:
                    'Once verified, /hc pages on the default host redirect to this domain automatically.',
                })}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </SettingsCard>
  )
}

const ROUTING_LABEL: MessageRef = {
  id: 'admin.settings.helpCenter.domains.routingLabel',
  defaultMessage: 'Routing',
}

const CNAME_PROBLEM: MessageRef = {
  id: 'admin.settings.helpCenter.domains.cnameProblem',
  defaultMessage:
    'This name resolves but does not reach this instance yet. Check the CNAME and your proxy.',
}

/** The CNAME a help center domain needs, with the state its last check found. */
export function helpCenterCnameRecord(
  domain: string,
  cnameTarget: string,
  status: { dnsResolved: boolean; verified: boolean },
  intl?: IntlShape
): DnsRecordRow {
  const record = {
    label: intl ? intl.formatMessage(ROUTING_LABEL) : ROUTING_LABEL.defaultMessage,
    type: 'CNAME',
    name: domain,
    value: cnameTarget,
  }
  if (status.verified) return { ...record, state: 'found' }
  if (!status.dnsResolved) return { ...record, state: 'waiting' }
  return {
    ...record,
    state: 'problem',
    problem: intl ? intl.formatMessage(CNAME_PROBLEM) : CNAME_PROBLEM.defaultMessage,
  }
}

function VerifiedChip({ verifiedAt }: { verifiedAt: string | null }) {
  const intl = useOptionalIntl()
  return verifiedAt ? (
    <Badge variant="success" size="sm">
      {intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.verified',
        defaultMessage: 'Verified',
      })}
    </Badge>
  ) : (
    <Badge variant="warning" size="sm">
      {intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.notVerified',
        defaultMessage: 'Not verified',
      })}
    </Badge>
  )
}

// ============================================================================
// Redirect rules
// ============================================================================

function RedirectRulesCard() {
  const intl = useOptionalIntl()
  const rulesQuery = useQuery(settingsQueries.helpCenterRedirectRules())
  const deleteRule = useDeleteHelpCenterRedirectRule()
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.redirectCardTitle',
        defaultMessage: 'Redirect rules',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.redirectCardDescription',
        defaultMessage: 'Redirect an old /hc path to a published article or category.',
      })}
    >
      <div className="space-y-3">
        {rulesQuery.isLoading ? (
          <div className="flex justify-center py-2">
            <InlineSpinner visible />
          </div>
        ) : rulesQuery.data && rulesQuery.data.length > 0 ? (
          <ul className="divide-y divide-border/50">
            {rulesQuery.data.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <code className="text-xs font-medium">{rule.path}</code>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {intl.formatMessage(
                      {
                        id: 'admin.settings.helpCenter.domains.redirectTarget',
                        defaultMessage: '→ {type} {name}',
                      },
                      {
                        type: intl.formatMessage(
                          rule.targetType === 'category'
                            ? {
                                id: 'admin.settings.helpCenter.domains.targetType.category',
                                defaultMessage: 'Category',
                              }
                            : {
                                id: 'admin.settings.helpCenter.domains.targetType.article',
                                defaultMessage: 'Article',
                              }
                        ),
                        name: rule.targetLabel
                          ? `"${rule.targetLabel}"`
                          : intl.formatMessage({
                              id: 'admin.settings.helpCenter.domains.unpublished',
                              defaultMessage: '(unpublished)',
                            }),
                      }
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage({
                    id: 'admin.settings.helpCenter.domains.deleteRedirectRule',
                    defaultMessage: 'Delete redirect rule',
                  })}
                  disabled={deleteRule.isPending}
                  onClick={() => setDeletingRuleId(rule.id)}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.noRedirectRules',
              defaultMessage: 'No redirect rules yet.',
            })}
          </p>
        )}
        <CreateRedirectRuleForm />
      </div>
      <ConfirmDialog
        open={deletingRuleId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRuleId(null)
        }}
        variant="destructive"
        title={intl.formatMessage({
          id: 'admin.settings.helpCenter.domains.deleteRedirectTitle',
          defaultMessage: 'Delete redirect rule?',
        })}
        description={intl.formatMessage({
          id: 'admin.settings.helpCenter.domains.deleteRedirectDescription',
          defaultMessage:
            'Visitors to the old path will get a not found page instead of being redirected.',
        })}
        confirmLabel={intl.formatMessage({
          id: 'admin.settings.helpCenter.domains.deleteRedirectConfirm',
          defaultMessage: 'Delete redirect rule',
        })}
        onConfirm={() => {
          if (deletingRuleId) deleteRule.mutate(deletingRuleId)
        }}
      />
    </SettingsCard>
  )
}

function CreateRedirectRuleForm() {
  const intl = useOptionalIntl()
  const [path, setPath] = useState('')
  const [targetType, setTargetType] = useState<'article' | 'category'>('article')
  const [targetId, setTargetId] = useState('')
  const createRule = useCreateHelpCenterRedirectRule()

  const categoriesQuery = useQuery({
    ...helpCenterQueries.categories(),
    enabled: targetType === 'category',
  })
  const articlesQuery = useQuery({
    queryKey: ['help-center', 'redirect-target-articles'],
    queryFn: () => listArticlesFn({ data: { status: 'published', limit: 100 } }),
    enabled: targetType === 'article',
  })

  const options =
    targetType === 'article'
      ? (articlesQuery.data?.items ?? []).map((a) => ({ id: a.id, label: a.title }))
      : (categoriesQuery.data ?? [])
          .filter((c) => c.isPublic)
          .map((c) => ({ id: c.id, label: c.name }))

  const canSubmit = path.trim().startsWith('/') && !!targetId

  function handleSubmit() {
    createRule.mutate(
      { path: path.trim(), targetType, targetId },
      {
        onSuccess: () => {
          setPath('')
          setTargetId('')
        },
      }
    )
  }

  return (
    <div className="space-y-2 border-t border-border/50 pt-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/old-slug"
          aria-label={intl.formatMessage({
            id: 'admin.settings.helpCenter.domains.redirectPath',
            defaultMessage: 'Redirect path',
          })}
        />
        <Select
          value={targetType}
          onValueChange={(v) => {
            setTargetType(v as 'article' | 'category')
            setTargetId('')
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="article">
              {intl.formatMessage({
                id: 'admin.settings.helpCenter.domains.targetType.article',
                defaultMessage: 'Article',
              })}
            </SelectItem>
            <SelectItem value="category">
              {intl.formatMessage({
                id: 'admin.settings.helpCenter.domains.targetType.category',
                defaultMessage: 'Category',
              })}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger>
            <SelectValue
              placeholder={intl.formatMessage(
                targetType === 'category'
                  ? {
                      id: 'admin.settings.helpCenter.domains.chooseCategory',
                      defaultMessage: 'Choose category...',
                    }
                  : {
                      id: 'admin.settings.helpCenter.domains.chooseArticle',
                      defaultMessage: 'Choose article...',
                    }
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={!canSubmit || createRule.isPending}
          onClick={handleSubmit}
        >
          <InlineSpinner visible={createRule.isPending} />
          {intl.formatMessage({
            id: 'admin.settings.helpCenter.domains.addRule',
            defaultMessage: 'Add rule',
          })}
        </Button>
      </div>
      {createRule.isError && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <XCircleIcon className="h-3.5 w-3.5" />
          {createRule.error instanceof Error
            ? createRule.error.message
            : intl.formatMessage({
                id: 'admin.settings.helpCenter.domains.createRuleFailed',
                defaultMessage: 'Could not create rule',
              })}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Indexing
// ============================================================================

function IndexingCard({ indexable }: { indexable: boolean }) {
  const intl = useOptionalIntl()
  const updateSeo = useUpdateHelpCenterSeo()
  const [checked, setChecked] = useState(indexable)

  function handleChange(next: boolean) {
    setChecked(next)
    updateSeo.mutate({ indexable: next }, { onError: () => setChecked(!next) })
  }

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.indexingCardTitle',
        defaultMessage: 'Indexing',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.indexingCardDescription',
        defaultMessage: 'Control whether search engines can crawl /hc.',
      })}
    >
      <SettingRows>
        <SettingRow
          label={intl.formatMessage({
            id: 'admin.settings.helpCenter.domains.indexableLabel',
            defaultMessage: 'Allow search engines to index the help center',
          })}
          htmlFor="hc-indexable"
          description={intl.formatMessage({
            id: 'admin.settings.helpCenter.domains.indexableDescription',
            defaultMessage:
              'Off adds a noindex tag to every /hc page and removes it from the sitemap and robots.txt',
          })}
          control={<Switch id="hc-indexable" checked={checked} onCheckedChange={handleChange} />}
        />
      </SettingRows>
    </SettingsCard>
  )
}

// ============================================================================
// Locales
// ============================================================================

function LocalesCard({ locales }: { locales: HelpCenterConfig['locales'] }) {
  const intl = useOptionalIntl()
  const enableLocale = useEnableHelpCenterLocale()
  const disableLocale = useDisableHelpCenterLocale()
  const candidates = SUPPORTED_LOCALES.filter(
    (l) => l !== locales.default && !locales.additional.includes(l)
  )
  const [pendingLocale, setPendingLocale] = useState<SupportedLocale | ''>('')

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.languagesCardTitle',
        defaultMessage: 'Languages',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.helpCenter.domains.languagesCardDescription',
        defaultMessage: 'Add a locale to translate articles and categories into it.',
      })}
    >
      <div className="space-y-4">
        <ul className="divide-y divide-border/50">
          <li className="flex items-center justify-between py-3">
            <span className="text-sm font-medium">
              {LOCALE_LABELS[locales.default] ?? locales.default}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.settings.helpCenter.domains.defaultLocale',
                defaultMessage: 'Default',
              })}
            </span>
          </li>
          {locales.additional.map((locale) => (
            <LocaleRow
              key={locale}
              locale={locale}
              chrome={locales.chrome[locale]}
              onDisable={() => disableLocale.mutate(locale as SupportedLocale)}
              disabling={disableLocale.isPending}
            />
          ))}
        </ul>

        {candidates.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={pendingLocale}
              onValueChange={(v) => setPendingLocale(v as SupportedLocale)}
            >
              <SelectTrigger className="w-48">
                <SelectValue
                  placeholder={intl.formatMessage({
                    id: 'admin.settings.helpCenter.domains.addLanguagePlaceholder',
                    defaultMessage: 'Add a language...',
                  })}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LOCALE_LABELS[l] ?? l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!pendingLocale || enableLocale.isPending}
              onClick={() => {
                if (!pendingLocale) return
                enableLocale.mutate(
                  {
                    locale: pendingLocale,
                    chrome: {
                      homepageTitle: intl.formatMessage({
                        id: 'admin.settings.helpCenter.homepageTitlePlaceholder',
                        defaultMessage: 'How can we help?',
                      }),
                      homepageDescription: '',
                      searchPlaceholder: '',
                    },
                  },
                  { onSuccess: () => setPendingLocale('') }
                )
              }}
            >
              <InlineSpinner visible={enableLocale.isPending} />
              {intl.formatMessage({ id: 'common.add', defaultMessage: 'Add' })}
            </Button>
          </div>
        )}
        {enableLocale.isError && (
          <p className="text-xs text-destructive">
            {enableLocale.error instanceof Error
              ? enableLocale.error.message
              : intl.formatMessage({
                  id: 'admin.settings.helpCenter.domains.enableLocaleFailed',
                  defaultMessage: 'Could not enable that locale',
                })}
          </p>
        )}
      </div>
    </SettingsCard>
  )
}

function LocaleRow({
  locale,
  chrome,
  onDisable,
  disabling,
}: {
  locale: string
  chrome: HelpCenterConfig['locales']['chrome'][string] | undefined
  onDisable: () => void
  disabling: boolean
}) {
  const intl = useOptionalIntl()
  const [editing, setEditing] = useState(false)
  const [homepageTitle, setHomepageTitle] = useState(chrome?.homepageTitle ?? '')
  const [homepageDescription, setHomepageDescription] = useState(chrome?.homepageDescription ?? '')
  const [searchPlaceholder, setSearchPlaceholder] = useState(chrome?.searchPlaceholder ?? '')
  const updateChrome = useUpdateHelpCenterLocaleChrome()
  const [invalid, setInvalid] = useState<string | null>(null)

  function save() {
    const next = { homepageTitle, homepageDescription, searchPlaceholder }
    const saved = {
      homepageTitle: chrome?.homepageTitle ?? '',
      homepageDescription: chrome?.homepageDescription ?? '',
      searchPlaceholder: chrome?.searchPlaceholder ?? '',
    }
    if (
      next.homepageTitle === saved.homepageTitle &&
      next.homepageDescription === saved.homepageDescription &&
      next.searchPlaceholder === saved.searchPlaceholder
    ) {
      setInvalid(null)
      return
    }
    const error = localeChromeError(next)
    setInvalid(error ? intl.formatMessage(error) : null)
    if (error) return
    updateChrome.mutate({ locale: locale as SupportedLocale, chrome: next })
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{LOCALE_LABELS[locale] ?? locale}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {intl.formatMessage(
              editing
                ? { id: 'ui.close', defaultMessage: 'Close' }
                : {
                    id: 'admin.settings.helpCenter.domains.editTexts',
                    defaultMessage: 'Edit texts',
                  }
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={intl.formatMessage(
              {
                id: 'admin.settings.helpCenter.domains.removeLocale',
                defaultMessage: 'Remove {name}',
              },
              { name: LOCALE_LABELS[locale] ?? locale }
            )}
            disabled={disabling}
            onClick={onDisable}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <Input
            value={homepageTitle}
            onChange={(e) => setHomepageTitle(e.target.value)}
            onBlur={save}
            placeholder={intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.homepageTitleField',
              defaultMessage: 'Homepage title',
            })}
            aria-label={intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.homepageTitleField',
              defaultMessage: 'Homepage title',
            })}
          />
          <Input
            value={homepageDescription}
            onChange={(e) => setHomepageDescription(e.target.value)}
            onBlur={save}
            placeholder={intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.homepageDescriptionField',
              defaultMessage: 'Homepage description',
            })}
            aria-label={intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.homepageDescriptionField',
              defaultMessage: 'Homepage description',
            })}
          />
          <Input
            value={searchPlaceholder}
            onChange={(e) => setSearchPlaceholder(e.target.value)}
            onBlur={save}
            placeholder={intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.searchPlaceholderField',
              defaultMessage: 'Search placeholder',
            })}
            aria-label={intl.formatMessage({
              id: 'admin.settings.helpCenter.domains.searchPlaceholderField',
              defaultMessage: 'Search placeholder',
            })}
          />
          {invalid && (
            <p role="alert" className="text-xs text-destructive">
              {invalid}
            </p>
          )}
        </div>
      )}
    </li>
  )
}
