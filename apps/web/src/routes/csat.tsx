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
import { z } from 'zod'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { recordCsatViaTokenFn, validateCsatEmailTokenFn } from '@/lib/server/functions/csat-email'
import { CSAT_FACES } from '@/lib/shared/db-types'
import { cn } from '@/lib/shared/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const searchSchema = z.object({
  token: z.string().optional(),
  // Kept as a raw string (not z.coerce.number()) so a malformed value fails
  // gracefully into the same friendly error state below, instead of throwing
  // out of search validation itself — mirrors unsubscribe.tsx's own
  // validate-then-degrade-to-an-error-view pattern for its token param.
  rating: z.string().optional(),
})

type CsatLoaderResult = { ok: true } | { ok: false; error: 'missing' | 'invalid' }

export const Route = createFileRoute('/csat')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }): Promise<CsatLoaderResult> => {
    if (!deps.token) return { ok: false, error: 'missing' }
    const { valid } = await validateCsatEmailTokenFn({ data: { token: deps.token } })
    return valid ? { ok: true } : { ok: false, error: 'invalid' }
  },
  component: CsatPage,
})

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
            {recorded ? '感谢你的反馈' : '我们做得怎么样？'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {recorded ? '你的评分已记录。' : '点击表情确认你的评分。'}
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
                    aria-label={`评分 ${rating} 分（满分 5 分）`}
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
              <p className="text-center text-sm text-red-600 dark:text-red-400">出错了，请重试。</p>
            )}
          </div>
        )}

        {recorded && !commentSaved && (
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder="还有什么想补充的吗？（可选）"
              className="min-h-24"
            />
            {commentError && (
              <p className="text-center text-sm text-red-600 dark:text-red-400">出错了，请重试。</p>
            )}
            <div className="flex justify-center">
              <Button
                type="button"
                onClick={submitComment}
                disabled={!comment.trim() || submitting}
              >
                {submitting ? '发送中…' : '发送评论'}
              </Button>
            </div>
          </div>
        )}

        {commentSaved && (
          <p className="text-center text-sm text-muted-foreground">谢谢，你的评论已添加。</p>
        )}
      </div>
    </div>
  )
}

function ErrorView({ error }: { error: string }) {
  const { title, message } = getErrorContent(error)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}

function getErrorContent(error: string): { title: string; message: string } {
  switch (error) {
    case 'missing':
      return {
        title: '链接不完整',
        message: '此链接缺少部分信息，请使用邮件中的链接。',
      }
    case 'invalid':
    default:
      return {
        title: '链接已过期',
        message: '此评分链接已过期或不再有效。',
      }
  }
}
