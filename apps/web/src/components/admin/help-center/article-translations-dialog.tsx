import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InlineSpinner } from '@/components/admin/settings/inline-spinner'
import { settingsQueries } from '@/lib/client/queries/settings'
import {
  getArticleTranslationStatusesFn,
  upsertArticleTranslationFn,
  setArticleTranslationStatusFn,
  deleteArticleTranslationFn,
} from '@/lib/server/functions/help-center-translations'
import { getArticleFn } from '@/lib/server/functions/help-center'
import type { KbArticleId } from '@quackback/ids'
import type { SupportedLocale } from '@/lib/shared/i18n'
import { errorText } from '@/lib/client/error-text'

const LOCALE_LABELS: Record<string, string> = {
  'zh-cn': '简体中文',
  'zh-tw': '繁體中文',
}

type TranslationStatus = 'untranslated' | 'draft' | 'published'

function statusLabel(intl: ReturnType<typeof useOptionalIntl>, status: string): string {
  switch (status as TranslationStatus) {
    case 'draft':
      return intl.formatMessage({
        id: 'admin.helpCenter.status.draft',
        defaultMessage: 'Draft',
      })
    case 'published':
      return intl.formatMessage({
        id: 'admin.helpCenter.status.published',
        defaultMessage: 'Published',
      })
    default:
      return intl.formatMessage({
        id: 'admin.helpCenter.status.untranslated',
        defaultMessage: 'Untranslated',
      })
  }
}

interface ArticleTranslationsDialogProps {
  articleId: KbArticleId
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Per-locale translation editor for an article (domains/languages §2).
 * Deliberately plain-text (Textarea, not the full rich editor) to bound
 * scope -- the base article keeps the full TipTap editing experience;
 * translations are a fast-follow surface for now.
 */
export function ArticleTranslationsDialog({
  articleId,
  open,
  onOpenChange,
}: ArticleTranslationsDialogProps) {
  const intl = useOptionalIntl()
  const configQuery = useQuery({ ...settingsQueries.helpCenterConfig(), enabled: open })
  const additionalLocales = configQuery.data?.locales?.additional ?? []

  const [locale, setLocale] = useState<string | null>(null)
  useEffect(() => {
    if (open && !locale && additionalLocales.length > 0) setLocale(additionalLocales[0])
  }, [open, locale, additionalLocales])

  const statusesQuery = useQuery({
    queryKey: ['help-center', 'article-translation-statuses', articleId],
    queryFn: () => getArticleTranslationStatusesFn({ data: { articleId } }),
    enabled: open,
  })

  if (additionalLocales.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({
                id: 'admin.helpCenter.translations.title',
                defaultMessage: 'Translations',
              })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {intl.formatMessage({
              id: 'admin.helpCenter.translations.noLocales',
              defaultMessage:
                'No additional locales are enabled yet. Enable one under Help center settings > Domains & languages.',
            })}
          </p>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.helpCenter.translations.title',
              defaultMessage: 'Translations',
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select value={locale ?? undefined} onValueChange={setLocale}>
            <SelectTrigger className="w-48">
              <SelectValue
                placeholder={intl.formatMessage({
                  id: 'admin.helpCenter.translations.localePlaceholder',
                  defaultMessage: 'Choose a locale...',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {additionalLocales.map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCALE_LABELS[l] ?? l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {locale && (
            <span className="text-xs text-muted-foreground">
              {statusLabel(
                intl,
                statusesQuery.data?.find((s) => s.locale === locale)?.status ?? 'untranslated'
              )}
            </span>
          )}
        </div>

        {locale && (
          <TranslationForm
            key={locale}
            articleId={articleId}
            locale={locale}
            onSaved={() => statusesQuery.refetch()}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TranslationForm({
  articleId,
  locale,
  onSaved,
}: {
  articleId: KbArticleId
  locale: string
  onSaved: () => void
}) {
  const intl = useOptionalIntl()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'draft' | 'published' | 'untranslated'>('untranslated')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    async function load() {
      const [article, statuses] = await Promise.all([
        getArticleFn({ data: { id: articleId } }),
        getArticleTranslationStatusesFn({ data: { articleId } }),
      ])
      if (cancelled) return
      const existingStatus = statuses.find((s) => s.locale === locale)?.status ?? 'untranslated'
      setStatus(existingStatus)
      if (existingStatus !== 'untranslated') {
        const { listArticleTranslationsFn } =
          await import('@/lib/server/functions/help-center-translations')
        const translations = await listArticleTranslationsFn({ data: { articleId } })
        const translation = translations.find((t) => t.locale === locale)
        setTitle(translation?.title ?? '')
        setDescription(translation?.description ?? '')
        setContent(translation?.content ?? '')
      } else {
        // Seed with the base content as a starting point for the translator.
        setTitle(article.title)
        setDescription(article.description ?? '')
        setContent(article.content)
      }
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [articleId, locale])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await upsertArticleTranslationFn({
        data: { articleId, locale: locale as SupportedLocale, title, description, content },
      })
      if (status === 'untranslated') setStatus('draft')
      onSaved()
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.helpCenter.translations.saveError',
            defaultMessage: 'Could not save the translation',
          })
        )
      )
    } finally {
      setSaving(false)
    }
  }

  async function handlePublishToggle() {
    setSaving(true)
    setError(null)
    try {
      const next = status === 'published' ? 'draft' : 'published'
      await setArticleTranslationStatusFn({
        data: { articleId, locale: locale as SupportedLocale, status: next },
      })
      setStatus(next)
      onSaved()
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.helpCenter.translations.statusError',
            defaultMessage: 'Could not update the translation status',
          })
        )
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError(null)
    try {
      await deleteArticleTranslationFn({ data: { articleId, locale: locale as SupportedLocale } })
      setStatus('untranslated')
      setTitle('')
      setDescription('')
      setContent('')
      onSaved()
    } catch (err) {
      setError(
        errorText(
          err,
          intl.formatMessage({
            id: 'admin.helpCenter.translations.deleteError',
            defaultMessage: 'Could not delete the translation',
          })
        )
      )
    } finally {
      setSaving(false)
      void queryClient.invalidateQueries({
        queryKey: ['help-center', 'article-translation-statuses', articleId],
      })
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-8">
        <InlineSpinner visible />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="translation-title">
          {intl.formatMessage({
            id: 'admin.helpCenter.translations.titleLabel',
            defaultMessage: 'Title',
          })}
        </Label>
        <Input id="translation-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="translation-description">
          {intl.formatMessage({
            id: 'admin.helpCenter.form.description',
            defaultMessage: 'Description',
          })}
        </Label>
        <Input
          id="translation-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="translation-content">
          {intl.formatMessage({
            id: 'admin.helpCenter.translations.contentLabel',
            defaultMessage: 'Content (Markdown)',
          })}
        </Label>
        <Textarea
          id="translation-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter className="!justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={saving || status === 'untranslated'}
          onClick={handleDelete}
        >
          {intl.formatMessage({
            id: 'admin.helpCenter.translations.delete',
            defaultMessage: 'Delete translation',
          })}
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving || status === 'untranslated'}
            onClick={handlePublishToggle}
          >
            <InlineSpinner visible={saving} />
            {status === 'published'
              ? intl.formatMessage({
                  id: 'admin.helpCenter.translations.unpublish',
                  defaultMessage: 'Unpublish',
                })
              : intl.formatMessage({
                  id: 'admin.helpCenter.actions.publish',
                  defaultMessage: 'Publish',
                })}
          </Button>
          <Button type="button" disabled={saving} onClick={handleSave}>
            <InlineSpinner visible={saving} />
            {intl.formatMessage({
              id: 'admin.helpCenter.actions.saveDraft',
              defaultMessage: 'Save draft',
            })}
          </Button>
        </div>
      </DialogFooter>
    </div>
  )
}
