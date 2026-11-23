/**
 * Public CSAT-over-email landing page. The emailed links carry
 * `?token=...&rating=N`; the loader only VALIDATES the token (read-only) and
 * the page renders the five faces with the linked rating preselected — the
 * rating is recorded exclusively on an in-page face click. Recording on page
 * load would let corporate mail scanners (which prefetch every link in an
 * email) silently submit and latest-wins-overwrite ratings, so the human
 * click is the write signal, exactly like the widget's own CSAT block.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl'
import { z } from 'zod'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { PortalIntlProvider } from '@/components/portal-intl-provider'
import { recordCsatViaTokenFn, validateCsatEmailTokenFn } from '@/lib/server/functions/csat-email'
import { CSAT_FACES } from '@/lib/shared/db-types'
import { DEFAULT_LOCALE, loadPortalMessages, type SupportedLocale } from '@/lib/shared/i18n'
import { cn } from '@/lib/shared/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const searchSchema = z.object({
  token: z.string().optional(),
  // Kept as a string (not z.coerce.number()) so a malformed value fails
  // gracefully into the same friendly error state below, instead of throwing
  // out of search validation itself — mirrors unsubscribe.tsx's own
  // validate-then-degrade-to-an-error-view pattern for its token param.
  //
  // The router JSON-parses query values that look like numbers, so the
  // `?rating=4` every rating-request email carries arrives as the NUMBER 4
  // here, not "4". Accept either shape and normalize to the string the view
  // already parses; a plain z.string() rejected the emailed links with a
  // 500 on the route's search validation.
  rating: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined ? undefined : String(value))),
})

type CsatLoaderResult =
  | { ok: true; locale: SupportedLocale; messages: Record<string, string> }
  | {
      ok: false
      error: 'missing' | 'invalid'
      locale: SupportedLocale
      messages: Record<string, string>
    }

export const Route = createFileRoute('/csat')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ context, deps }): Promise<CsatLoaderResult> => {
    const locale = context.acceptLanguageLocale ?? DEFAULT_LOCALE
    const messages = await loadPortalMessages(locale)
    if (!deps.token) return { ok: false, error: 'missing', locale, messages }
    const { valid } = await validateCsatEmailTokenFn({ data: { token: deps.token } })
    return valid
      ? { ok: true, locale, messages }
      : { ok: false, error: 'invalid', locale, messages }
  },
  component: CsatRoute,
})

function CsatRoute() {
  const { locale, messages } = Route.useLoaderData()

  return (
    <PortalIntlProvider locale={locale} messages={messages}>
      <CsatPage />
    </PortalIntlProvider>
  )
}

function CsatPage() {
  const result = Route.useLoaderData()
  const { token, rating } = Route.useSearch()

  if (!result.ok) return <ErrorView error={result.error} />
  return <RateView token={token!} linkedRating={rating ? Number(rating) : undefined} />
}

/** The rate-then-thank flow: faces first (linked rating preselected but NOT
 *  recorded), a face click records, then the thanks state offers an optional
 *  comment through the same token-validated fn (recordCsat's latest-wins path
 *  covers the rating-then-comment follow-up, same as the widget's own
 *  two-POST CSAT flow). */
function RateView({ token, linkedRating }: { token: string; linkedRating?: number }) {
  const intl = useIntl()
  const preselected =
    linkedRating && Number.isInteger(linkedRating) && linkedRating >= 1 && linkedRating <= 5
      ? linkedRating
      : undefined
  const [recorded, setRecorded] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [rateError, setRateError] = useState(false)
  const [comment, setComment] = useState('')
  const [commentSaved, setCommentSaved] = useState(false)
  const [commentError, setCommentError] = useState(false)

  const rate = async (rating: number) => {
    if (submitting) return
    setSubmitting(true)
    setRateError(false)
    try {
      const result = await recordCsatViaTokenFn({ data: { token, rating } })
      if (result.success) setRecorded(rating)
      else setRateError(true)
    } catch {
      setRateError(true)
    } finally {
      setSubmitting(false)
    }
  }

  const submitComment = async () => {
    if (!recorded || !comment.trim() || submitting) return
    setSubmitting(true)
    setCommentError(false)
    try {
      const result = await recordCsatViaTokenFn({
        data: { token, rating: recorded, comment: comment.trim() },
      })
      if (result.success) setCommentSaved(true)
      else setCommentError(true)
    } catch {
      setCommentError(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        {recorded && (
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
        )}

        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            {recorded
              ? intl.formatMessage({
                  id: 'portal.csat.thanksTitle',
                  defaultMessage: 'Thanks for the feedback',
                })
              : intl.formatMessage({
                  id: 'portal.csat.howDidWeDo',
                  defaultMessage: 'How did we do?',
                })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {recorded
              ? intl.formatMessage({
                  id: 'portal.csat.ratingRecorded',
                  defaultMessage: 'Your rating has been recorded.',
                })
              : intl.formatMessage({
                  id: 'portal.csat.tapFace',
                  defaultMessage: 'Tap a face to confirm your rating.',
                })}
          </p>
        </div>

        {!recorded && (
          <div className="space-y-2">
            <div className="flex justify-center gap-3">
              {CSAT_FACES.map((face, i) => {
                const rating = i + 1
                return (
                  <button
                    key={rating}
                    type="button"
                    disabled={submitting}
                    onClick={() => rate(rating)}
                    aria-label={intl.formatMessage(
                      {
                        id: 'widget.messenger.csat.rateAria',
                        defaultMessage: 'Rate {n} of 5',
                      },
                      { n: rating }
                    )}
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-transform hover:scale-110 disabled:opacity-40',
                      preselected === rating ? 'bg-primary/10 ring-2 ring-ring' : 'hover:bg-muted'
                    )}
                  >
                    {face}
                  </button>
                )
              })}
            </div>
            {rateError && (
              <p className="text-center text-sm text-red-600 dark:text-red-400">
                <FormattedMessage
                  id="portal.auth.error.generic"
                  defaultMessage="Something went wrong. Please try again."
                />
              </p>
            )}
          </div>
        )}

        {recorded && !commentSaved && (
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder={intl.formatMessage({
                id: 'portal.csat.commentPlaceholder',
                defaultMessage: "Anything you'd like to add? (optional)",
              })}
              className="min-h-24"
            />
            {commentError && (
              <p className="text-center text-sm text-red-600 dark:text-red-400">
                <FormattedMessage
                  id="portal.auth.error.generic"
                  defaultMessage="Something went wrong. Please try again."
                />
              </p>
            )}
            <div className="flex justify-center">
              <Button
                type="button"
                onClick={submitComment}
                disabled={!comment.trim() || submitting}
              >
                {submitting ? (
                  <FormattedMessage id="portal.csat.sending" defaultMessage="Sending…" />
                ) : (
                  <FormattedMessage id="portal.csat.sendComment" defaultMessage="Send comment" />
                )}
              </Button>
            </div>
          </div>
        )}

        {commentSaved && (
          <p className="text-center text-sm text-muted-foreground">
            <FormattedMessage
              id="portal.csat.commentAdded"
              defaultMessage="Thanks, your comment has been added."
            />
          </p>
        )}
      </div>
    </div>
  )
}

const ERROR_CONTENT: Record<string, { title: MessageDescriptor; message: MessageDescriptor }> = {
  missing: {
    title: { id: 'portal.csat.missing.title', defaultMessage: 'Missing Link' },
    message: {
      id: 'portal.csat.missing.body',
      defaultMessage: 'This link is missing some information. Please use the link from your email.',
    },
  },
  invalid: {
    title: { id: 'portal.csat.expired.title', defaultMessage: 'Link Expired' },
    message: {
      id: 'portal.csat.expired.body',
      defaultMessage: 'This rating link has expired or is no longer valid.',
    },
  },
}

function ErrorView({ error }: { error: string }) {
  const intl = useIntl()
  const copy = ERROR_CONTENT[error] ?? ERROR_CONTENT.invalid

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            {intl.formatMessage(copy.title)}
          </h1>
          <p className="text-sm text-muted-foreground">{intl.formatMessage(copy.message)}</p>
        </div>
      </div>
    </div>
  )
}
