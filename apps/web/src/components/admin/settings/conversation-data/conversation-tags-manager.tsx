/**
 * Conversation tags manager (Settings > Conversations > Tags): the
 * org-wide label taxonomy with total usage counts that click through to the
 * filtered inbox, rename/recolor (propagates everywhere by id), archive/
 * restore, and permanent delete behind archive. Archive and delete are
 * refused server-side while a live workflow or macro references the tag (the
 * error names them). The inbox keeps its inline apply + quick-create flow.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TagIcon } from '@heroicons/react/24/outline'
import type { ConversationTagId } from '@quackback/ids'
import {
  listConversationTagsForSettingsFn,
  updateConversationTagFn,
  deleteConversationTagFn,
  restoreConversationTagFn,
  hardDeleteConversationTagFn,
} from '@/lib/server/functions/conversation-tags'
import { SettingsCard } from '@/components/admin/settings/settings-card'
import { RowDot, SettingsList, SettingsListRow } from '@/components/admin/settings/settings-list'
import { EmptyState } from '@/components/shared/empty-state'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { ColorPickerGrid } from '@/components/shared/color-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/shared/utils'
import { toastError } from '@/lib/client/error-notice'

type TagRow = Awaited<ReturnType<typeof listConversationTagsForSettingsFn>>[number]

const TAGS_SETTINGS_KEY = ['admin', 'conversation-tags', 'settings']

function EditTagDialog({
  tag,
  onClose,
  onSave,
  isPending,
}: {
  tag: TagRow
  onClose: () => void
  onSave: (input: { name: string; color: string }) => Promise<void>
  isPending: boolean
}) {
  const intl = useOptionalIntl()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({
              id: 'admin.settings.conversationData.tags.editTitle',
              defaultMessage: 'Edit tag',
            })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">
              {intl.formatMessage({
                id: 'admin.settings.conversationData.tags.nameLabel',
                defaultMessage: 'Name',
              })}
            </Label>
            <Input
              id="tag-name"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {intl.formatMessage({
                id: 'admin.settings.conversationData.tags.renameHint',
                defaultMessage: 'Renaming updates the tag everywhere it is applied.',
              })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>
              {intl.formatMessage({
                id: 'admin.settings.conversationData.tags.colorLabel',
                defaultMessage: 'Color',
              })}
            </Label>
            <ColorPickerGrid selectedColor={color} onColorChange={setColor} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            {intl.formatMessage({ id: 'common.cancel', defaultMessage: 'Cancel' })}
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || isPending}
            onClick={() => void onSave({ name: name.trim(), color })}
          >
            {intl.formatMessage(
              isPending
                ? {
                    id: 'admin.settings.conversationData.tags.saving',
                    defaultMessage: 'Saving...',
                  }
                : {
                    id: 'admin.settings.conversationData.tags.save',
                    defaultMessage: 'Save',
                  }
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ConversationTagsManager() {
  const intl = useOptionalIntl()
  const queryClient = useQueryClient()
  const { data: tags } = useQuery({
    queryKey: TAGS_SETTINGS_KEY,
    queryFn: () => listConversationTagsForSettingsFn(),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'conversation-tags'] })
    // The inbox nav + pickers cache tag lists under their own keys too.
    void queryClient.invalidateQueries({ queryKey: TAGS_SETTINGS_KEY })
  }
  const onError = (fallback: string) => (e: unknown) => toastError(e, fallback)

  const updateTag = useMutation({
    mutationFn: (input: { id: ConversationTagId; name: string; color: string }) =>
      updateConversationTagFn({ data: input }),
    onSuccess: invalidate,
    onError: onError(
      intl.formatMessage({
        id: 'admin.settings.conversationData.tags.updateFailed',
        defaultMessage: 'Failed to update tag',
      })
    ),
  })
  const archiveTag = useMutation({
    mutationFn: (id: ConversationTagId) => deleteConversationTagFn({ data: { id } }),
    onSuccess: invalidate,
    onError: onError(
      intl.formatMessage({
        id: 'admin.settings.conversationData.tags.archiveFailed',
        defaultMessage: 'Failed to archive tag',
      })
    ),
  })
  const restoreTag = useMutation({
    mutationFn: (id: ConversationTagId) => restoreConversationTagFn({ data: { id } }),
    onSuccess: invalidate,
    onError: onError(
      intl.formatMessage({
        id: 'admin.settings.conversationData.tags.restoreFailed',
        defaultMessage: 'Failed to restore tag',
      })
    ),
  })
  const hardDeleteTag = useMutation({
    mutationFn: (id: ConversationTagId) => hardDeleteConversationTagFn({ data: { id } }),
    onSuccess: invalidate,
    onError: onError(
      intl.formatMessage({
        id: 'admin.settings.conversationData.tags.deleteFailed',
        defaultMessage: 'Failed to delete tag',
      })
    ),
  })

  const [editTarget, setEditTarget] = useState<TagRow | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<TagRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null)

  const live = (tags ?? []).filter((t) => !t.archived)
  const archived = (tags ?? []).filter((t) => t.archived)

  return (
    <SettingsCard
      title={intl.formatMessage({
        id: 'admin.settings.conversationData.tags.title',
        defaultMessage: 'Tags',
      })}
      description={intl.formatMessage({
        id: 'admin.settings.conversationData.tags.description',
        defaultMessage: 'Agents create tags inline from the inbox.',
      })}
      flush
    >
      {!tags || tags.length === 0 ? (
        <EmptyState
          size="compact"
          icon={TagIcon}
          title={intl.formatMessage({
            id: 'admin.settings.conversationData.tags.emptyTitle',
            defaultMessage: 'No tags yet',
          })}
          description={intl.formatMessage({
            id: 'admin.settings.conversationData.tags.emptyDescription',
            defaultMessage: 'Agents create them inline from a conversation.',
          })}
        />
      ) : (
        <SettingsList>
          {[...live, ...archived].map((tag) => {
            const count = intl.formatMessage(
              {
                id: 'admin.settings.conversationData.tags.conversationCount',
                defaultMessage: '{count, plural, one {# conversation} other {# conversations}}',
              },
              { count: tag.count }
            )
            return (
              <div key={tag.id} className={cn(tag.archived && 'opacity-60')}>
                <SettingsListRow
                  leading={<RowDot color={tag.color} />}
                  title={tag.name}
                  badges={
                    tag.archived ? (
                      <Badge size="sm" variant="secondary">
                        {intl.formatMessage({
                          id: 'admin.settings.conversationData.tags.archived',
                          defaultMessage: 'Archived',
                        })}
                      </Badge>
                    ) : undefined
                  }
                  trailing={
                    tag.archived ? (
                      count
                    ) : (
                      <Link
                        to="/admin/inbox"
                        search={{ tag: tag.id }}
                        className="hover:text-foreground hover:underline"
                        title={intl.formatMessage({
                          id: 'admin.settings.conversationData.tags.openInInbox',
                          defaultMessage: 'Open in the inbox',
                        })}
                      >
                        {count}
                      </Link>
                    )
                  }
                  actions={
                    tag.archived
                      ? [
                          {
                            label: intl.formatMessage({
                              id: 'admin.settings.conversationData.tags.restore',
                              defaultMessage: 'Restore',
                            }),
                            onSelect: () => restoreTag.mutate(tag.id),
                          },
                          {
                            label: intl.formatMessage({
                              id: 'admin.settings.conversationData.tags.deletePermanently',
                              defaultMessage: 'Delete permanently',
                            }),
                            destructive: true,
                            onSelect: () => setDeleteTarget(tag),
                          },
                        ]
                      : [
                          {
                            label: intl.formatMessage({
                              id: 'admin.settings.conversationData.tags.edit',
                              defaultMessage: 'Edit',
                            }),
                            onSelect: () => setEditTarget(tag),
                          },
                          {
                            label: intl.formatMessage({
                              id: 'admin.settings.conversationData.tags.archive',
                              defaultMessage: 'Archive',
                            }),
                            onSelect: () => setArchiveTarget(tag),
                          },
                        ]
                  }
                />
              </div>
            )
          })}
        </SettingsList>
      )}

      {editTarget && (
        <EditTagDialog
          tag={editTarget}
          onClose={() => setEditTarget(null)}
          isPending={updateTag.isPending}
          onSave={async (input) => {
            await updateTag.mutateAsync({ id: editTarget.id, ...input })
            setEditTarget(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={intl.formatMessage(
          {
            id: 'admin.settings.conversationData.tags.archiveTitle',
            defaultMessage: 'Archive "{name}"?',
          },
          { name: archiveTarget?.name ?? '' }
        )}
        description={intl.formatMessage({
          id: 'admin.settings.conversationData.tags.archiveDescription',
          defaultMessage:
            'The tag disappears from pickers and filters. Conversation history keeps it and the name stays reserved; you can restore it at any time. Tags used by live workflows or macros cannot be archived.',
        })}
        confirmLabel={intl.formatMessage({
          id: 'admin.settings.conversationData.tags.archiveConfirm',
          defaultMessage: 'Archive',
        })}
        isPending={archiveTag.isPending}
        onConfirm={async () => {
          if (!archiveTarget) return
          await archiveTag.mutateAsync(archiveTarget.id)
          setArchiveTarget(null)
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={intl.formatMessage(
          {
            id: 'admin.settings.conversationData.tags.deleteTitle',
            defaultMessage: 'Delete "{name}" permanently?',
          },
          { name: deleteTarget?.name ?? '' }
        )}
        description={intl.formatMessage(
          {
            id: 'admin.settings.conversationData.tags.deleteDescription',
            defaultMessage:
              'This removes the tag from {count, plural, one {# conversation} other {# conversations}} and cannot be undone.',
          },
          { count: deleteTarget?.count ?? 0 }
        )}
        confirmLabel={intl.formatMessage({
          id: 'admin.settings.conversationData.tags.deleteConfirm',
          defaultMessage: 'Delete permanently',
        })}
        variant="destructive"
        isPending={hardDeleteTag.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return
          await hardDeleteTag.mutateAsync(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </SettingsCard>
  )
}
