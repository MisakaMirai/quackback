import { useState } from 'react'
import { defineMessages, type MessageDescriptor } from 'react-intl'
import { useQuery } from '@tanstack/react-query'
import {
  MapIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  LockClosedIcon,
} from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PaneAddButton } from '@/components/shared/pane-add-button'
import { PageHeader } from '@/components/shared/page-header'
import { FilterSection } from '@/components/shared/filter-section'
import { MENU_ICON, MENU_ROW } from '@/components/ui/menu'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { cn } from '@/lib/shared/utils'
import { useRoadmaps } from '@/lib/client/hooks/use-roadmaps-query'
import { useCreateRoadmap, useUpdateRoadmap, useDeleteRoadmap } from '@/lib/client/mutations'
import type { RoadmapView } from '@/lib/client/hooks/use-roadmaps-query'
import { adminQueries } from '@/lib/client/queries/admin'
import { useSegments } from '@/lib/client/hooks/use-segments-queries'
import { RoadmapBuilderForm, type RoadmapBuilderValue } from './roadmap-builder-form'
import { toastError } from '@/lib/client/error-notice'

const messages: Record<string, MessageDescriptor> = defineMessages({
  roadmap: { id: 'admin.nav.roadmap', defaultMessage: 'Roadmap' },
  roadmaps: { id: 'admin.roadmap.sidebar.title', defaultMessage: 'Roadmaps' },
  newRoadmap: { id: 'admin.roadmap.sidebar.new', defaultMessage: 'New roadmap' },
  edit: { id: 'admin.roadmap.action.edit', defaultMessage: 'Edit' },
  delete: { id: 'admin.roadmap.action.delete', defaultMessage: 'Delete' },
  createTitle: { id: 'admin.roadmap.create.title', defaultMessage: 'Create roadmap' },
  createDescription: {
    id: 'admin.roadmap.create.description',
    defaultMessage: 'Define a saved view over posts using statuses or ETA periods.',
  },
  createFailed: {
    id: 'admin.roadmap.create.failed',
    defaultMessage: "Couldn't create roadmap. Try again.",
  },
  editTitle: { id: 'admin.roadmap.edit.title', defaultMessage: 'Edit roadmap' },
  editDescription: {
    id: 'admin.roadmap.edit.description',
    defaultMessage: 'Update your roadmap settings.',
  },
  editSubmit: { id: 'admin.roadmap.edit.submit', defaultMessage: 'Save changes' },
  editFailed: {
    id: 'admin.roadmap.edit.failed',
    defaultMessage: "Couldn't update roadmap. Try again.",
  },
  deleteTitle: { id: 'admin.roadmap.delete.title', defaultMessage: 'Delete roadmap?' },
  deleteDescription: {
    id: 'admin.roadmap.delete.description',
    defaultMessage:
      'Are you sure you want to delete "{name}"? Posts are not changed because roadmap placement is derived from their fields.',
  },
  deleteConfirm: { id: 'admin.roadmap.delete.confirm', defaultMessage: 'Delete roadmap' },
  deleteFailed: {
    id: 'admin.roadmap.delete.failed',
    defaultMessage: "Couldn't delete roadmap. Try again.",
  },
})

interface RoadmapSidebarProps {
  selectedRoadmapId: string | null
  onSelectRoadmap: (roadmapId: string | null) => void
  /** The create dialog, when the page also opens it (from its empty state). */
  createOpen?: boolean
  onCreateOpenChange?: (open: boolean) => void
}

export function RoadmapSidebar({
  selectedRoadmapId,
  onSelectRoadmap,
  createOpen,
  onCreateOpenChange,
}: RoadmapSidebarProps) {
  const intl = useOptionalIntl()
  const [ownCreateOpen, setOwnCreateOpen] = useState(false)
  const isCreateDialogOpen = createOpen ?? ownCreateOpen
  const setIsCreateDialogOpen = onCreateOpenChange ?? setOwnCreateOpen
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingRoadmap, setEditingRoadmap] = useState<RoadmapView | null>(null)
  const [deletingRoadmap, setDeletingRoadmap] = useState<RoadmapView | null>(null)

  const { data: roadmaps, isLoading } = useRoadmaps()
  const { data: statuses = [] } = useQuery(adminQueries.statuses())
  const { data: boards = [] } = useQuery(adminQueries.boards())
  const { data: tags = [] } = useQuery(adminQueries.tags())
  const { data: segments = [] } = useSegments()
  const createRoadmap = useCreateRoadmap()
  const updateRoadmap = useUpdateRoadmap()
  const deleteRoadmap = useDeleteRoadmap()

  const handleCreateSubmit = async (value: RoadmapBuilderValue) => {
    try {
      // Loaded on demand: slugify carries large transliteration tables that
      // the roadmap page otherwise never needs.
      const { slugify } = await import('@/lib/shared/utils/slugify')
      const newRoadmap = await createRoadmap.mutateAsync({
        ...value,
        slug: slugify(value.name),
      })
      setIsCreateDialogOpen(false)
      onSelectRoadmap(newRoadmap.id)
    } catch (error) {
      toastError(error, intl.formatMessage(messages.createFailed))
    }
  }

  const handleEditSubmit = async (value: RoadmapBuilderValue) => {
    if (!editingRoadmap) return

    try {
      await updateRoadmap.mutateAsync({
        roadmapId: editingRoadmap.id,
        input: value,
      })
      setIsEditDialogOpen(false)
      setEditingRoadmap(null)
    } catch (error) {
      toastError(error, intl.formatMessage(messages.editFailed))
    }
  }

  const handleDelete = async () => {
    if (!deletingRoadmap) return

    try {
      await deleteRoadmap.mutateAsync(deletingRoadmap.id)
      setIsDeleteDialogOpen(false)
      setDeletingRoadmap(null)
      if (selectedRoadmapId === deletingRoadmap.id) {
        onSelectRoadmap(roadmaps?.[0]?.id ?? null)
      }
    } catch (error) {
      toastError(error, intl.formatMessage(messages.deleteFailed))
    }
  }

  const openEditDialog = (roadmap: RoadmapView) => {
    setEditingRoadmap(roadmap)
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (roadmap: RoadmapView) => {
    setDeletingRoadmap(roadmap)
    setIsDeleteDialogOpen(true)
  }

  return (
    <aside
      data-side-pane=""
      className="w-64 xl:w-72 shrink-0 flex flex-col border-e border-chrome-hairline bg-background overflow-hidden"
    >
      <div className="shrink-0 px-5 py-3.5">
        <PageHeader as="h2" title={intl.formatMessage(messages.roadmap)} />
      </div>

      {/* Selector + list — the "Roadmaps" subheading routes through the shared
          FilterSection (static label + create button in the action slot) so it
          matches every other admin left pane. */}
      <ScrollArea className="flex-1">
        <div className="px-2.5 pb-5">
          <FilterSection
            title={intl.formatMessage(messages.roadmaps)}
            action={
              <PaneAddButton
                label={intl.formatMessage(messages.newRoadmap)}
                onClick={() => setIsCreateDialogOpen(true)}
              />
            }
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <ArrowPathIcon className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : roadmaps?.length === 0 ? null : (
              <div className="space-y-1">
                {roadmaps?.map((roadmap) => (
                  <div
                    key={roadmap.id}
                    data-active={selectedRoadmapId === roadmap.id || undefined}
                    className={cn(
                      MENU_ROW,
                      'group w-full cursor-pointer',
                      selectedRoadmapId === roadmap.id
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                    onClick={() => onSelectRoadmap(roadmap.id)}
                  >
                    <MapIcon
                      className={cn(
                        MENU_ICON,
                        selectedRoadmapId === roadmap.id ? 'text-primary' : ''
                      )}
                    />
                    <span className="flex-1 truncate">{roadmap.name}</span>
                    {roadmap.visibility !== 'public' && (
                      <LockClosedIcon className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-5 opacity-0 group-hover:opacity-100 -mr-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EllipsisVerticalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(roadmap)}>
                          <PencilIcon className="h-4 w-4 mr-2" />
                          {intl.formatMessage(messages.edit)}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => openDeleteDialog(roadmap)}
                        >
                          <TrashIcon className="h-4 w-4 mr-2" />
                          {intl.formatMessage(messages.delete)}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </FilterSection>
        </div>
      </ScrollArea>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(messages.createTitle)}</DialogTitle>
            <DialogDescription>{intl.formatMessage(messages.createDescription)}</DialogDescription>
          </DialogHeader>
          <RoadmapBuilderForm
            statuses={statuses}
            boards={boards}
            tags={tags}
            segments={segments}
            isPending={createRoadmap.isPending}
            submitLabel={intl.formatMessage(messages.createTitle)}
            onCancel={() => setIsCreateDialogOpen(false)}
            onSubmit={handleCreateSubmit}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(messages.editTitle)}</DialogTitle>
            <DialogDescription>{intl.formatMessage(messages.editDescription)}</DialogDescription>
          </DialogHeader>
          {editingRoadmap && (
            <RoadmapBuilderForm
              key={editingRoadmap.id}
              roadmap={editingRoadmap}
              statuses={statuses}
              boards={boards}
              tags={tags}
              segments={segments}
              isPending={updateRoadmap.isPending}
              submitLabel={intl.formatMessage(messages.editSubmit)}
              onCancel={() => setIsEditDialogOpen(false)}
              onSubmit={handleEditSubmit}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={intl.formatMessage(messages.deleteTitle)}
        description={intl.formatMessage(messages.deleteDescription, {
          name: deletingRoadmap?.name ?? '',
        })}
        confirmLabel={intl.formatMessage(messages.deleteConfirm)}
        variant="destructive"
        isPending={deleteRoadmap.isPending}
        onConfirm={handleDelete}
      />
    </aside>
  )
}
