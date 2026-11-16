import { useState, useCallback, useEffect, useMemo, startTransition } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { InboxLayout } from '@/components/admin/feedback/inbox-layout'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { HelpCenterFiltersPanel } from './help-center-filters'
import { HelpCenterFinder } from './help-center-finder'
import { CategoryFormDialog } from './category-form-dialog'
import { useHelpCenterFilters } from './use-help-center-filters'
import type { HelpCenterStatusFilter } from './use-help-center-filters'
import type { CategoryActions, TreeCategory } from './help-center-category-tree'
import { useDeleteArticle, useDeleteCategory } from '@/lib/client/mutations/help-center'
import { helpCenterQueries } from '@/lib/client/queries/help-center'
import { collectDescendantIds } from '@/lib/shared/help-center-tree'
import { Route } from '@/routes/admin/help-center'
import type { KbArticleId, KbCategoryId } from '@quackback/ids'

type CategoryDialogState =
  { mode: 'new'; parentId: KbCategoryId | null } | { mode: 'edit'; category: TreeCategory } | null

export function HelpCenterList() {
  const intl = useOptionalIntl()
  const navigate = useNavigate({ from: Route.fullPath })
  const { filters, setFilters, hasActiveFilters } = useHelpCenterFilters()

  const [deleteArticleDialogOpen, setDeleteArticleDialogOpen] = useState(false)
  const [articleToDelete, setArticleToDelete] = useState<KbArticleId | null>(null)

  const [categoryDialogState, setCategoryDialogState] = useState<CategoryDialogState>(null)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<TreeCategory | null>(null)

  const deleteArticleMutation = useDeleteArticle()
  const deleteCategoryMutation = useDeleteCategory()

  const { data: allCategories = [] } = useQuery(helpCenterQueries.categories())

  // Keyboard "/" to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        if (e.key === 'Escape') {
          target.blur()
        }
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('[data-search-input]')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleEdit = useCallback(
    (id: KbArticleId) => {
      startTransition(() => {
        void navigate({
          search: (prev) => ({ ...prev, article: id }),
        })
      })
    },
    [navigate]
  )

  const handleDeleteArticle = (id: KbArticleId) => {
    setArticleToDelete(id)
    setDeleteArticleDialogOpen(true)
  }

  const confirmDeleteArticle = () => {
    if (articleToDelete) {
      deleteArticleMutation.mutate(articleToDelete, {
        onSuccess: () => {
          setDeleteArticleDialogOpen(false)
          setArticleToDelete(null)
        },
      })
    }
  }

  // Category CRUD actions — shared between sidebar tree and main finder.
  const categoryActions = useMemo<CategoryActions>(
    () => ({
      onNew: (parentId) => setCategoryDialogState({ mode: 'new', parentId }),
      onEdit: (category) => setCategoryDialogState({ mode: 'edit', category }),
      onDelete: (category) => setDeleteCategoryTarget(category),
    }),
    []
  )

  // Cascade impact computed lazily for the delete confirm dialog.
  const cascadeImpact = useMemo(() => {
    if (!deleteCategoryTarget) return { descendantCount: 0, articleCount: 0 }
    const flat = allCategories as Array<{
      id: string
      parentId: string | null
      articleCount: number
    }>
    const descendantIds = collectDescendantIds(flat, deleteCategoryTarget.id)
    const subtreeIds = new Set<string>([deleteCategoryTarget.id, ...descendantIds])
    let totalArticles = 0
    for (const cat of flat) {
      if (subtreeIds.has(cat.id)) totalArticles += cat.articleCount
    }
    return { descendantCount: descendantIds.size, articleCount: totalArticles }
  }, [deleteCategoryTarget, allCategories])

  const deleteDescription = useMemo(() => {
    if (!deleteCategoryTarget) return ''
    const parts: string[] = []
    if (cascadeImpact.descendantCount > 0) {
      parts.push(
        intl.formatMessage(
          {
            id: 'admin.helpCenter.category.subcategoryCount',
            defaultMessage: '{count, plural, one {# sub-category} other {# sub-categories}}',
          },
          { count: cascadeImpact.descendantCount }
        )
      )
    }
    if (cascadeImpact.articleCount > 0) {
      parts.push(
        intl.formatMessage(
          {
            id: 'admin.helpCenter.articleCount',
            defaultMessage: '{count, plural, one {# article} other {# articles}}',
          },
          { count: cascadeImpact.articleCount }
        )
      )
    }
    if (parts.length === 0) {
      return intl.formatMessage(
        {
          id: 'admin.helpCenter.category.deleteImpactEmpty',
          defaultMessage:
            'This will permanently delete "{name}". This cannot be undone from the UI.',
        },
        { name: deleteCategoryTarget.name }
      )
    }
    return intl.formatMessage(
      {
        id: 'admin.helpCenter.category.deleteImpact',
        defaultMessage:
          'This will delete "{name}" along with {items}. Everything can be restored from the database, but the UI provides no restore flow.',
      },
      {
        name: deleteCategoryTarget.name,
        items: intl.formatList(parts, { type: 'conjunction' }),
      }
    )
  }, [deleteCategoryTarget, cascadeImpact, intl])

  async function handleConfirmDeleteCategory() {
    if (!deleteCategoryTarget) return
    const deletingId = deleteCategoryTarget.id
    const parentId = deleteCategoryTarget.parentId ?? null
    await deleteCategoryMutation.mutateAsync(deletingId)
    setDeleteCategoryTarget(null)
    // If the deleted category was the currently-selected one, fall back to parent.
    if (filters.category === deletingId) {
      setFilters({ category: parentId ?? undefined })
    }
  }

  return (
    <>
      <InboxLayout
        headerTitle={intl.formatMessage({
          id: 'admin.pageTitle.helpCenter',
          defaultMessage: 'Help center',
        })}
        filters={
          <HelpCenterFiltersPanel
            status={filters.status}
            onStatusChange={(status) => setFilters({ status: status as HelpCenterStatusFilter })}
            selectedCategoryId={filters.category}
            onSelectCategory={(id) => setFilters({ category: id ?? undefined })}
            categoryActions={categoryActions}
            showDeleted={filters.showDeleted}
            onShowDeletedChange={(showDeleted) =>
              setFilters({ showDeleted: showDeleted ?? undefined })
            }
            showPerformance={filters.showPerformance}
            onShowPerformanceChange={(showPerformance) =>
              setFilters({ showPerformance: showPerformance ?? undefined })
            }
          />
        }
        hasActiveFilters={hasActiveFilters}
      >
        <HelpCenterFinder
          onEditArticle={handleEdit}
          onDeleteArticle={handleDeleteArticle}
          categoryActions={categoryActions}
        />
      </InboxLayout>

      <ConfirmDialog
        open={deleteArticleDialogOpen}
        onOpenChange={setDeleteArticleDialogOpen}
        title={intl.formatMessage({
          id: 'admin.helpCenter.list.deleteArticleTitle',
          defaultMessage: 'Delete help article?',
        })}
        description={intl.formatMessage({
          id: 'admin.helpCenter.list.deleteArticleDescription',
          defaultMessage: 'This action cannot be undone. The article will be permanently deleted.',
        })}
        confirmLabel={intl.formatMessage({ id: 'common.delete', defaultMessage: 'Delete' })}
        variant="destructive"
        isPending={deleteArticleMutation.isPending}
        onConfirm={confirmDeleteArticle}
      />

      <CategoryFormDialog
        open={categoryDialogState !== null}
        onOpenChange={(open) => {
          if (!open) setCategoryDialogState(null)
        }}
        initialValues={
          categoryDialogState?.mode === 'edit'
            ? {
                id: categoryDialogState.category.id,
                name: categoryDialogState.category.name,
                description: categoryDialogState.category.description,
                icon: categoryDialogState.category.icon,
                isPublic: categoryDialogState.category.isPublic,
                segmentIds: categoryDialogState.category.segmentIds,
                parentId: categoryDialogState.category.parentId,
              }
            : undefined
        }
        defaultParentId={
          categoryDialogState?.mode === 'new' ? categoryDialogState.parentId : undefined
        }
      />

      <ConfirmDialog
        open={deleteCategoryTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCategoryTarget(null)
        }}
        title={intl.formatMessage(
          {
            id: 'admin.helpCenter.category.deleteConfirmTitle',
            defaultMessage: 'Delete "{name}"?',
          },
          { name: deleteCategoryTarget?.name ?? '' }
        )}
        description={deleteDescription}
        confirmLabel={intl.formatMessage({ id: 'common.delete', defaultMessage: 'Delete' })}
        variant="destructive"
        isPending={deleteCategoryMutation.isPending}
        onConfirm={handleConfirmDeleteCategory}
      />
    </>
  )
}
