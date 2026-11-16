/**
 * Per-provider verified-domain list. A verified domain routes its users to
 * this provider and can be enforced (SSO-only for that domain).
 *
 * Enforcement is the one control here that can lock a workspace out, so it
 * stays behind three preconditions, all of which survive the move to a page:
 * the domain must be DNS-verified, the provider must carry a test sign-in
 * that postdates its last connection change, and the server refuses the write
 * until recovery codes exist (surfaced inline as `recovery_codes_required`).
 *
 * Domains save themselves through their own server functions, so this section
 * has no Save button of its own — every action here is immediate.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import type { IntlShape } from 'react-intl'
import { CheckCircleIcon, ClockIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/solid'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WarningBox } from '@/components/shared/warning-box'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DnsRecordTable, type DnsRecordRow } from '@/components/shared/dns-record-table'
import {
  addProviderDomainFn,
  getSsoDomainProofsFn,
  removeVerifiedDomainFn,
  setDomainEnforcedFn,
  verifyProviderDomainFn,
  type VerifyDomainResult,
} from '@/lib/server/functions/sso'
import type { IdentityProvider } from '@/lib/server/domains/settings/identity-providers.service'
import type { VerifiedDomain } from '@/lib/server/domains/settings/settings.types'
import {
  SSO_VERIFY_RECORD_HOST,
  pendingProvenLabel,
  ssoVerifyRecordValue,
  verifiedThroughLabel,
  type ShownProofSource,
} from '@/lib/shared/domain-proof'
import { IDENTITY_PROVIDERS_KEY, getConnectionTestState } from './provider-shared'
import { errorText } from '@/lib/client/error-text'

const VERIFY_REASON_MESSAGES: Record<
  Exclude<VerifyDomainResult, { verified: true }>['reason'],
  { id: string; defaultMessage: string }
> = {
  'no-record': {
    id: 'admin.settings.security.idp.domains.verify.noRecord',
    defaultMessage:
      "Couldn't find a TXT record at that name. Add the record above and wait for DNS propagation, then try again.",
  },
  mismatch: {
    id: 'admin.settings.security.idp.domains.verify.mismatch',
    defaultMessage:
      "Found a TXT record but the value didn't match. Double-check the value (it should start with `qb-domain-verify=`).",
  },
  'lookup-failed': {
    id: 'admin.settings.security.idp.domains.verify.lookupFailed',
    defaultMessage: 'DNS lookup failed. Try again in a moment.',
  },
  'no-pending-domain': {
    id: 'admin.settings.security.idp.domains.verify.noPending',
    defaultMessage: 'No pending domain to verify.',
  },
}

const SSO_DOMAIN_PROOFS_KEY = ['settings', 'ssoDomainProofs'] as const

/** The TXT record a pending domain needs, with what the last Verify found. */
export function ssoTxtRecord(
  domain: Pick<VerifiedDomain, 'name' | 'verificationToken'>,
  result: VerifyDomainResult | null,
  intl?: IntlShape
): DnsRecordRow {
  const record = {
    label: intl
      ? intl.formatMessage({
          id: 'admin.settings.security.idp.domains.verificationRecord',
          defaultMessage: 'Verification',
        })
      : 'Verification',
    type: 'TXT',
    name: SSO_VERIFY_RECORD_HOST,
    value: ssoVerifyRecordValue(domain.verificationToken),
  }
  return result && !result.verified
    ? {
        ...record,
        state: 'problem',
        problem: intl
          ? intl.formatMessage(VERIFY_REASON_MESSAGES[result.reason])
          : VERIFY_REASON_MESSAGES[result.reason].defaultMessage,
      }
    : { ...record, state: 'waiting' }
}

export function DomainsSection({
  provider,
  disabled,
}: {
  provider: IdentityProvider | null
  disabled: boolean
}) {
  const queryClient = useQueryClient()
  const intl = useOptionalIntl()
  const addDomain = useServerFn(addProviderDomainFn)
  const [draftName, setDraftName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const domains = provider?.domains ?? []
  const getProofs = useServerFn(getSsoDomainProofsFn)
  const proofs = useQuery({
    queryKey: SSO_DOMAIN_PROOFS_KEY,
    queryFn: () => getProofs(),
    enabled: domains.length > 0,
  })
  const hasVerified = domains.some((d) => d.verifiedAt)
  // Enforcement is available once the provider has a fresh test sign-in — same
  // predicate that drives the connection status line (see getConnectionTestState).
  const enforceable = getConnectionTestState(provider).kind === 'verified'

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: IDENTITY_PROVIDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: SSO_DOMAIN_PROOFS_KEY }),
    ])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!provider || !draftName.trim()) return
    setAddError('')
    setAdding(true)
    try {
      await addDomain({ data: { providerId: provider.id, name: draftName.trim() } })
      await refresh()
      setDraftName('')
    } catch (err) {
      setAddError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.settings.security.idp.domains.addFailed',
            defaultMessage: 'Could not add domain.',
          })
        )
      )
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="font-medium">
          {intl.formatMessage({
            id: 'admin.settings.security.idp.domains.title',
            defaultMessage: 'Domains',
          })}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.settings.security.idp.domains.description',
            defaultMessage:
              'Users at a verified domain are sent to this provider. Require SSO to make it their only way in.',
          })}
        </p>
      </div>

      {!provider ? (
        <p className="rounded-md border border-dashed border-border/50 bg-muted/20 p-3 text-sm text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.settings.security.idp.domains.saveFirst',
            defaultMessage: 'Save the provider first to add a domain.',
          })}
        </p>
      ) : (
        <>
          {domains.length > 0 && (
            <div className="divide-y divide-border/50 rounded-md border border-border/50">
              {domains.map((d) => (
                <DomainRow
                  key={d.id}
                  domain={d}
                  provenBy={proofs.data?.[d.id] ?? null}
                  disabled={disabled}
                  enforceable={enforceable}
                  onChanged={refresh}
                />
              ))}
            </div>
          )}

          {hasVerified && enforceable && !domains.some((d) => d.enforced) && (
            <WarningBox
              variant="warning"
              title={intl.formatMessage({
                id: 'admin.settings.security.idp.domains.warningTitle',
                defaultMessage: 'Before you require SSO',
              })}
              description={intl.formatMessage({
                id: 'admin.settings.security.idp.domains.warningBody',
                defaultMessage:
                  'Generate recovery codes first. They are the only way back in if SSO breaks.',
              })}
            />
          )}

          <form onSubmit={handleAdd} className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="example.com"
                disabled={adding || disabled}
                className="h-9"
                aria-label={intl.formatMessage({
                  id: 'admin.settings.security.idp.domains.addDomain',
                  defaultMessage: 'Add domain',
                })}
              />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="h-9"
                disabled={adding || disabled || !draftName.trim()}
              >
                <PlusIcon className="mr-1 h-3.5 w-3.5" />
                {adding
                  ? intl.formatMessage({
                      id: 'admin.settings.security.idp.domains.adding',
                      defaultMessage: 'Adding…',
                    })
                  : intl.formatMessage({
                      id: 'admin.settings.security.idp.domains.addDomain',
                      defaultMessage: 'Add domain',
                    })}
              </Button>
            </div>
            {addError && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{addError}</AlertDescription>
              </Alert>
            )}
          </form>
        </>
      )}
    </div>
  )
}

function DomainRow({
  domain,
  provenBy,
  disabled,
  enforceable,
  onChanged,
}: {
  domain: VerifiedDomain
  /** Another proof this workspace holds that already covers the domain. */
  provenBy: ShownProofSource | null
  disabled: boolean
  /** True when the provider has a fresh test sign-in — the enforcement
   *  checkbox is enabled. False disables the checkbox to prevent setting
   *  enforcement on an unverified connection. */
  enforceable: boolean
  onChanged: () => Promise<unknown> | void
}) {
  const verify = useServerFn(verifyProviderDomainFn)
  const setEnforced = useServerFn(setDomainEnforcedFn)
  const remove = useServerFn(removeVerifiedDomainFn)
  const intl = useOptionalIntl()

  const [pending, setPending] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyDomainResult | null>(null)
  const [enforceError, setEnforceError] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const isVerified = domain.verifiedAt !== null
  const providerId = domain.providerId

  const handleRemove = async () => {
    setPending(true)
    try {
      await remove({ data: { id: domain.id } })
      await onChanged()
    } catch (err) {
      setEnforceError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.settings.security.idp.domains.removeFailed',
            defaultMessage: 'Could not remove domain.',
          })
        )
      )
    } finally {
      setPending(false)
      setRemoveOpen(false)
    }
  }

  const handleVerify = async () => {
    if (!providerId) return
    setVerifyResult(null)
    setPending(true)
    try {
      const r = await verify({ data: { providerId, id: domain.id } })
      setVerifyResult(r)
      if (r.verified) await onChanged()
    } catch {
      setVerifyResult({ verified: false, reason: 'lookup-failed' })
    } finally {
      setPending(false)
    }
  }

  const handleEnforce = async (next: boolean) => {
    setEnforceError(null)
    setPending(true)
    try {
      await setEnforced({ data: { id: domain.id, enforced: next } })
      await onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setEnforceError(
        msg === 'recovery_codes_required'
          ? intl.formatMessage({
              id: 'admin.settings.security.idp.domains.recoveryCodesRequired',
              defaultMessage:
                'Generate recovery codes before enforcing SSO. They are the only break-glass way back in.',
            })
          : msg ||
              intl.formatMessage({
                id: 'admin.settings.security.idp.domains.enforceFailed',
                defaultMessage: 'Could not update enforcement.',
              })
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {isVerified ? (
            <CheckCircleIcon className="h-4 w-4 shrink-0 text-success" />
          ) : (
            <ClockIcon className="h-4 w-4 shrink-0 text-warning" />
          )}
          <span className="truncate text-sm font-medium">{domain.name}</span>
          <span className="text-sm text-muted-foreground">
            {isVerified
              ? provenBy
                ? verifiedThroughLabel(provenBy)
                : null
              : intl.formatMessage({
                  id: 'admin.settings.security.idp.domains.pending',
                  defaultMessage: 'Pending',
                })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {isVerified && (
            <label
              className="flex items-center gap-1.5 text-sm"
              title={
                enforceable
                  ? undefined
                  : intl.formatMessage({
                      id: 'admin.settings.security.idp.domains.testFirst',
                      defaultMessage: 'Pass a connection test first.',
                    })
              }
            >
              <Checkbox
                checked={domain.enforced}
                onCheckedChange={(v) => void handleEnforce(v === true)}
                disabled={pending || disabled || !enforceable}
                aria-label={intl.formatMessage(
                  {
                    id: 'admin.settings.security.idp.domains.requireSsoAria',
                    defaultMessage: 'Require SSO for {domain}',
                  },
                  { domain: domain.name }
                )}
                data-in-label
              />
              {intl.formatMessage({
                id: 'admin.settings.security.idp.domains.requireSso',
                defaultMessage: 'Require SSO',
              })}
            </label>
          )}
          {!isVerified && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              onClick={handleVerify}
              disabled={pending || disabled}
            >
              {pending
                ? intl.formatMessage({
                    id: 'admin.settings.security.idp.domains.verifying',
                    defaultMessage: 'Verifying…',
                  })
                : intl.formatMessage({
                    id: 'admin.settings.security.idp.verify',
                    defaultMessage: 'Verify',
                  })}
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setRemoveOpen(true)}
            disabled={pending || disabled}
            aria-label={intl.formatMessage(
              {
                id: 'admin.settings.security.idp.domains.removeAria',
                defaultMessage: 'Remove {domain}',
              },
              { domain: domain.name }
            )}
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isVerified && provenBy && (
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage(
            {
              id: 'admin.settings.security.idp.domains.coveredNote',
              defaultMessage: '{proven}. Click Verify to use it.',
            },
            { proven: pendingProvenLabel(provenBy) }
          )}
        </p>
      )}
      {!isVerified && !provenBy && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage(
              {
                id: 'admin.settings.security.idp.domains.addRecordNote',
                defaultMessage: 'Add this record to {domain}, then click Verify.',
              },
              { domain: domain.name }
            )}
          </p>
          <DnsRecordTable records={[ssoTxtRecord(domain, verifyResult, intl)]} />
        </div>
      )}

      {provenBy && verifyResult && !verifyResult.verified && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">
            {intl.formatMessage(VERIFY_REASON_MESSAGES[verifyResult.reason])}
          </AlertDescription>
        </Alert>
      )}
      {enforceError && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{enforceError}</AlertDescription>
        </Alert>
      )}

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={
          isVerified
            ? intl.formatMessage({
                id: 'admin.settings.security.idp.domains.removeVerifiedTitle',
                defaultMessage: 'Remove verified domain?',
              })
            : intl.formatMessage({
                id: 'admin.settings.security.idp.domains.removePendingTitle',
                defaultMessage: 'Remove pending domain?',
              })
        }
        description={
          isVerified
            ? intl.formatMessage(
                {
                  id: 'admin.settings.security.idp.domains.removeVerifiedBody',
                  defaultMessage: 'Stops routing *@{domain} emails to this provider.',
                },
                { domain: domain.name }
              )
            : intl.formatMessage(
                {
                  id: 'admin.settings.security.idp.domains.removePendingBody',
                  defaultMessage: 'Discards the pending verification token for {domain}.',
                },
                { domain: domain.name }
              )
        }
        variant="destructive"
        confirmLabel={intl.formatMessage({ id: 'common.remove', defaultMessage: 'Remove' })}
        isPending={pending}
        onConfirm={handleRemove}
      />
    </div>
  )
}
