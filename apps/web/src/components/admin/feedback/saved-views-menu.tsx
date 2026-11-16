/**
 * Saved feedback-inbox views: a menu in the inbox header that lists the
 * workspace's saved views (applying one restores its stored filter set into
 * the URL-driven inbox state) and saves the current filter set as a named
 * view. A view is a saved filter SET — the active search term rides alongside
 * and is never captured (see lib/shared/post/views.ts). The views are listed
 * only inside the dropdown, so they load when the viewer reaches for the menu
 * rather than with every page load.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookmarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { MENU_ICON, MENU_LABEL } from '@/components/ui/menu'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { postViewQueries } from '@/lib/client/queries/post-views'
import { createPostViewFn, deletePostViewFn } from '@/lib/server/functions/post-views'
import {
  inboxFiltersToPostViewFilters,
  postViewFiltersToInboxFilters,
  type PostViewDTO,
} from '@/lib/shared/post/views'
import type { InboxFilters } from '@/lib/shared/types'

interface SavedViewsMenuProps {
  filters: InboxFilters
  hasActiveFilters: boolean
  onApply: (filters: InboxFilters) => void
}

export function SavedViewsMenu({ filters, hasActiveFilters, onApply }: SavedViewsMenuProps) {
  const intl = useOptionalIntl()
  const queryClient = useQueryClient()
  const [wanted, setWanted] = useState(false)
  const viewsQuery = useQuery({ ...postViewQueries.list(), enabled: wanted })
  const want = () => setWanted(true)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'post-views'] })

  const createMutation = useMutation({
    mutationFn: (input: { name: string; filters: InboxFilters }) =>
      createPostViewFn({
        data: { name: input.name, filters: inboxFiltersToPostViewFilters(input.filters) },
      }),
    onSuccess: () => {
      void invalidate()
      setSaveOpen(false)
      setName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (viewId: string) => deletePostViewFn({ data: { viewId } }),
    onSuccess: () => void invalidate(),
  })

  const views = viewsQuery.data ?? []

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && want()}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" onPointerEnter={want} onFocus={want}>
            <BookmarkIcon className={MENU_ICON} />
            {intl.formatMessage({
              id: 'admin.feedback.views.trigger',
              defaultMessage: 'Views',
            })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className={MENU_LABEL}>
            {intl.formatMessage({
              id: 'inbox.nav.savedViews',
              defaultMessage: 'Saved views',
            })}
          </DropdownMenuLabel>
          {viewsQuery.isPending ? (
            <DropdownMenuItem disabled>
              {intl.formatMessage({
                id: 'admin.feedback.views.loading',
                defaultMessage: 'Loading views…',
              })}
            </DropdownMenuItem>
          ) : (
            views.length === 0 && (
              <DropdownMenuItem disabled>
                {intl.formatMessage({
                  id: 'admin.feedback.views.none',
                  defaultMessage: 'No saved views',
                })}
              </DropdownMenuItem>
            )
          )}
          {views.map((view: PostViewDTO) => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => onApply(postViewFiltersToInboxFilters(view.filters))}
            >
              <span className="flex-1 truncate">{view.name}</span>
              <button
                type="button"
                aria-label={intl.formatMessage(
                  {
                    id: 'admin.feedback.views.deleteAria',
                    defaultMessage: 'Delete view {name}',
                  },
                  { name: view.name }
                )}
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteMutation.mutate(view.id)
                }}
              >
                <TrashIcon className={MENU_ICON} />
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!hasActiveFilters} onClick={() => setSaveOpen(true)}>
            <PlusIcon className={MENU_ICON} />
            {intl.formatMessage({
              id: 'admin.feedback.views.saveCurrent',
              defaultMessage: 'Save current filters',
            })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage({
                id: 'admin.feedback.views.saveTitle',
                defaultMessage: 'Save current filters as a view',
              })}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = name.trim()
              if (!trimmed) return
              createMutation.mutate({ name: trimmed, filters })
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={intl.formatMessage({
                id: 'admin.feedback.views.namePlaceholder',
                defaultMessage: 'View name',
              })}
              maxLength={80}
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setSaveOpen(false)}>
                {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
              </Button>
              <Button type="submit" size="sm" disabled={!name.trim() || createMutation.isPending}>
                {intl.formatMessage({
                  id: 'admin.feedback.views.save',
                  defaultMessage: 'Save view',
                })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
