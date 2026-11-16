'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { XMarkIcon, BoltIcon, PlusIcon } from '@heroicons/react/24/solid'
import { cn } from '@/lib/shared/utils'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import type { UserSegmentSummary } from '@/lib/shared/types'
import type { SegmentId, PrincipalId } from '@quackback/ids'
import { useRemoveUsersFromSegment, useAssignUsersToSegment } from '@/lib/client/mutations'
import { useSegments } from '@/lib/client/hooks/use-segments-queries'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { SegmentPickerList } from '@/components/admin/segments/segment-picker-list'

interface SegmentBadgeProps {
  segment: UserSegmentSummary
  onRemove?: (segmentId: SegmentId) => void
  isRemoving?: boolean
  readOnly?: boolean
}

export function SegmentBadge({ segment, onRemove, isRemoving, readOnly }: SegmentBadgeProps) {
  const intl = useOptionalIntl()
  const canRemove = !readOnly && segment.type === 'manual' && !!onRemove

  return (
    <span
      className={cn(
        'group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        'transition-colors'
      )}
      style={{
        backgroundColor: segment.color + '20',
        borderColor: segment.color + '40',
        color: segment.color,
      }}
      title={
        segment.type === 'dynamic'
          ? intl.formatMessage({
              id: 'admin.people.segmentBadge.autoManaged',
              defaultMessage: 'Auto-managed segment',
            })
          : segment.name
      }
    >
      {segment.type === 'dynamic' && <BoltIcon className="h-2.5 w-2.5 shrink-0 opacity-70" />}
      <span>{segment.name}</span>
      {canRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(segment.id)
          }}
          disabled={isRemoving}
          className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 disabled:opacity-50"
          aria-label={intl.formatMessage(
            {
              id: 'admin.people.segmentBadge.removeAria',
              defaultMessage: 'Remove from {segment}',
            },
            { segment: segment.name }
          )}
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

interface UserSegmentBadgesProps {
  principalId: PrincipalId
  segments: UserSegmentSummary[]
  canManage?: boolean
  onSegmentsChange?: () => void
}

export function UserSegmentBadges({
  principalId,
  segments,
  canManage = false,
  onSegmentsChange,
}: UserSegmentBadgesProps) {
  const intl = useOptionalIntl()
  const { data: allSegments } = useSegments()
  const removeUsers = useRemoveUsersFromSegment()
  const assignUsers = useAssignUsersToSegment()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [removingId, setRemovingId] = useState<SegmentId | null>(null)

  // Manual segments the user is not currently in
  const currentSegmentIds = new Set(segments.map((s) => s.id))
  const availableManualSegments = (allSegments ?? []).filter(
    (s) => s.type === 'manual' && !currentSegmentIds.has(s.id as SegmentId)
  )

  const segmentLabel = (name: string | undefined) =>
    name ??
    intl.formatMessage({
      id: 'admin.people.segments.fallbackName',
      defaultMessage: 'segment',
    })

  const handleRemove = async (segmentId: SegmentId) => {
    const segment = segments.find((s) => s.id === segmentId)
    const segmentName = segmentLabel(segment?.name)
    setRemovingId(segmentId)
    try {
      await removeUsers.mutateAsync({ segmentId, principalIds: [principalId] })
      onSegmentsChange?.()
      toast.success(
        intl.formatMessage(
          {
            id: 'admin.people.segments.removed',
            defaultMessage: 'Removed from {segment}',
          },
          { segment: segmentName }
        ),
        {
          action: {
            label: intl.formatMessage({
              id: 'admin.people.segments.undo',
              defaultMessage: 'Undo',
            }),
            onClick: () => {
              assignUsers.mutate(
                { segmentId, principalIds: [principalId] },
                {
                  onSuccess: () => onSegmentsChange?.(),
                  onError: () =>
                    toast.error(
                      intl.formatMessage(
                        {
                          id: 'admin.people.segments.undoFailed',
                          defaultMessage: 'Failed to undo: {segment} was not restored',
                        },
                        { segment: segmentName }
                      )
                    ),
                }
              )
            },
          },
        }
      )
    } catch {
      toast.error(
        intl.formatMessage(
          {
            id: 'admin.people.segments.removeFailed',
            defaultMessage: 'Failed to remove from {segment}',
          },
          { segment: segmentName }
        )
      )
    } finally {
      setRemovingId(null)
    }
  }

  const handleAssign = async (segmentId: SegmentId) => {
    const segment = availableManualSegments.find((s) => s.id === segmentId)
    const segmentName = segmentLabel(segment?.name)
    try {
      await assignUsers.mutateAsync({ segmentId, principalIds: [principalId] })
      onSegmentsChange?.()
      setPopoverOpen(false)
      toast.success(
        intl.formatMessage(
          {
            id: 'admin.people.segments.added',
            defaultMessage: 'Added to {segment}',
          },
          { segment: segmentName }
        )
      )
    } catch {
      toast.error(
        intl.formatMessage(
          {
            id: 'admin.people.segments.addFailed',
            defaultMessage: 'Failed to add to {segment}',
          },
          { segment: segmentName }
        )
      )
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {segments.map((seg) => (
        <SegmentBadge
          key={seg.id}
          segment={seg}
          onRemove={canManage ? handleRemove : undefined}
          isRemoving={removingId === seg.id}
          readOnly={!canManage}
        />
      ))}

      {canManage && availableManualSegments.length > 0 && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[13px] text-muted-foreground hover:text-foreground"
            >
              <PlusIcon className="size-3.5 mr-0.5" />
              {intl.formatMessage({ id: 'common.add', defaultMessage: 'Add' })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-0" align="start">
            <SegmentPickerList
              segments={availableManualSegments}
              onSelect={handleAssign}
              disabled={assignUsers.isPending}
            />
          </PopoverContent>
        </Popover>
      )}

      {segments.length === 0 && !canManage && (
        <span className="text-xs text-muted-foreground">
          {intl.formatMessage({
            id: 'admin.people.segments.empty',
            defaultMessage: 'No segments',
          })}
        </span>
      )}
    </div>
  )
}

interface CompactSegmentBadgesProps {
  segments: UserSegmentSummary[]
  maxVisible?: number
}

export function CompactSegmentBadges({ segments, maxVisible = 2 }: CompactSegmentBadgesProps) {
  const intl = useOptionalIntl()
  if (segments.length === 0) return null

  const visible = segments.slice(0, maxVisible)
  const overflow = segments.length - maxVisible

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((seg) => (
        <span
          key={seg.id}
          className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[11px] font-medium border leading-4"
          style={{
            backgroundColor: seg.color + '20',
            borderColor: seg.color + '40',
            color: seg.color,
          }}
          title={
            seg.type === 'dynamic'
              ? intl.formatMessage(
                  {
                    id: 'admin.people.segments.autoSuffix',
                    defaultMessage: '{segment} (auto)',
                  },
                  { segment: seg.name }
                )
              : seg.name
          }
        >
          {seg.type === 'dynamic' && <BoltIcon className="h-2 w-2 shrink-0" />}
          {seg.name}
        </span>
      ))}
      {overflow > 0 && <span className="text-xs text-muted-foreground">+{overflow}</span>}
    </div>
  )
}
