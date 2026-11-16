import { useMemo, useState } from 'react'
import { type IntlShape, type MessageDescriptor } from 'react-intl'
import { toggleItem } from '@/components/shared/filter-utils'
import {
  Squares2X2Icon,
  TagIcon,
  UserIcon,
  UserGroupIcon,
  CalendarIcon,
  ArrowTrendingUpIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftIcon,
  Square2StackIcon,
  TrashIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/solid'
import { cn } from '@/lib/shared/utils'
import { formatCalendarDate } from '@/lib/shared/utils/date'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { FilterAddButton, FilterChip, type FilterOption } from '@/components/shared/filter-chip'
import {
  VOTE_THRESHOLDS,
  DATE_PRESETS,
  getDateFromDaysAgo,
} from '@/components/shared/filter-presets'
import { CircleIcon, MenuButton } from '@/components/shared/filter-menu'
import type { InboxFilters } from './use-inbox-filters'
import type { Board, PostTag as TagType, PostStatusEntity } from '@/lib/shared/db-types'
import type { TeamMember } from '@/lib/shared/types'
import type { SegmentListItem } from '@/lib/client/hooks/use-segments-queries'

interface ActiveFilter {
  key: string
  type:
    | 'status'
    | 'board'
    | 'tags'
    | 'segment'
    | 'owner'
    | 'date'
    | 'minVotes'
    | 'minComments'
    | 'responded'
    | 'hasDuplicates'
    | 'deleted'
  label: string
  value: string
  valueId: string
  color?: string
  onRemove: () => void
  onChange?: (newId: string) => void
  options?: FilterOption[]
}

interface ActiveFiltersBarProps {
  filters: InboxFilters
  onFiltersChange: (updates: Partial<InboxFilters>) => void
  onClearAll: () => void
  boards: Board[]
  tags: TagType[]
  statuses: PostStatusEntity[]
  members: TeamMember[]
  segments?: SegmentListItem[]
}

type FilterCategory =
  | 'status'
  | 'board'
  | 'tags'
  | 'segment'
  | 'owner'
  | 'date'
  | 'votes'
  | 'comments'
  | 'response'
  | 'duplicates'

type IconComponent = React.ComponentType<{ className?: string }>

interface FilterCategoryDef {
  key: FilterCategory
  label: MessageDescriptor
  icon: IconComponent
}

const FILTER_CATEGORIES: FilterCategoryDef[] = [
  {
    key: 'status',
    label: { id: 'portal.feedback.filter.category.status', defaultMessage: 'Status' },
    icon: CircleIcon,
  },
  {
    key: 'board',
    label: { id: 'portal.roadmap.filter.category.board', defaultMessage: 'Board' },
    icon: Squares2X2Icon,
  },
  {
    key: 'tags',
    label: { id: 'portal.roadmap.filter.category.tag', defaultMessage: 'Tag' },
    icon: TagIcon,
  },
  {
    key: 'segment',
    label: { id: 'portal.feedback.filter.category.segment', defaultMessage: 'Segment' },
    icon: UserGroupIcon,
  },
  {
    key: 'owner',
    label: { id: 'admin.feedback.filters.categoryOwner', defaultMessage: 'Assigned to' },
    icon: UserIcon,
  },
  {
    key: 'date',
    label: { id: 'portal.feedback.filter.category.date', defaultMessage: 'Created date' },
    icon: CalendarIcon,
  },
  {
    key: 'votes',
    label: { id: 'portal.feedback.filter.category.votes', defaultMessage: 'Vote count' },
    icon: ArrowTrendingUpIcon,
  },
  {
    key: 'comments',
    label: { id: 'admin.feedback.filters.categoryComments', defaultMessage: 'Comment count' },
    icon: ChatBubbleOvalLeftIcon,
  },
  {
    key: 'response',
    label: { id: 'portal.feedback.filter.category.response', defaultMessage: 'Team response' },
    icon: ChatBubbleLeftRightIcon,
  },
  {
    key: 'duplicates',
    label: { id: 'admin.feedback.filters.hasDuplicates', defaultMessage: 'Has duplicates' },
    icon: Square2StackIcon,
  },
]

const COMMENT_THRESHOLDS = [{ value: 1 }, { value: 5 }, { value: 10 }, { value: 25 }, { value: 50 }]

/** Date presets derive their labels from the public filter ids. */
const DATE_PRESET_LABELS: Record<string, MessageDescriptor> = {
  today: { id: 'portal.feedback.filter.date.today', defaultMessage: 'Today' },
  '7days': { id: 'portal.feedback.filter.date.last7Days', defaultMessage: 'Last 7 days' },
  '30days': { id: 'portal.feedback.filter.date.last30Days', defaultMessage: 'Last 30 days' },
  '90days': { id: 'portal.feedback.filter.date.last90Days', defaultMessage: 'Last 90 days' },
}

function datePresetLabel(intl: IntlShape, preset: (typeof DATE_PRESETS)[number]): string {
  return intl.formatMessage(DATE_PRESET_LABELS[preset.value])
}

type ThresholdKey = 'minVotes' | 'minComments'

/** A vote/comment threshold as both a menu option and a chip value ("5+ votes"). */
function thresholdLabel(intl: IntlShape, key: ThresholdKey, value: number): string {
  return key === 'minVotes'
    ? intl.formatMessage(
        { id: 'portal.feedback.filter.votes.min', defaultMessage: '{count}+ votes' },
        { count: value }
      )
    : intl.formatMessage(
        { id: 'admin.feedback.filters.comments.min', defaultMessage: '{count}+ comments' },
        { count: value }
      )
}

/** The Filter control that opens the category menu; lives in the list toolbar. */
export function AddFilterButton({
  filters,
  boards,
  tags,
  statuses,
  members,
  segments,
  onToggleStatus,
  onToggleBoard,
  onToggleSegment,
  onFiltersChange,
}: {
  filters: InboxFilters
  boards: Board[]
  tags: TagType[]
  statuses: PostStatusEntity[]
  members: TeamMember[]
  segments?: SegmentListItem[]
  onToggleStatus: (slug: string) => void
  onToggleBoard: (id: string) => void
  onToggleSegment?: (id: string) => void
  onFiltersChange: (updates: Partial<InboxFilters>) => void
}) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null)
  const intl = useOptionalIntl()

  const closePopover = () => {
    setOpen(false)
    setActiveCategory(null)
  }

  const handleSelectStatus = (slug: string) => {
    onToggleStatus(slug)
    closePopover()
  }

  const handleSelectBoard = (id: string) => {
    onToggleBoard(id)
    closePopover()
  }

  const handleSelectTag = (tagId: string) => {
    onFiltersChange({ tags: toggleItem(filters.tags, tagId) })
    closePopover()
  }

  const handleSelectSegment = (segmentId: string) => {
    onToggleSegment?.(segmentId)
    closePopover()
  }

  const handleSelectOwner = (ownerId: string | 'unassigned') => {
    onFiltersChange({ owner: ownerId })
    closePopover()
  }

  const handleSelectDate = (daysAgo: number) => {
    onFiltersChange({ dateFrom: getDateFromDaysAgo(daysAgo) })
    closePopover()
  }

  const handleSelectThreshold = (key: 'minVotes' | 'minComments', value: number) => {
    onFiltersChange({ [key]: value })
    closePopover()
  }

  const handleSelectResponse = (value: 'responded' | 'unresponded') => {
    onFiltersChange({ responded: value })
    closePopover()
  }

  const handleDirectToggle = (key: FilterCategory) => {
    if (key === 'duplicates') onFiltersChange({ hasDuplicates: true })
    closePopover()
  }

  // Categories that act as direct toggles (no submenu)
  const directToggleCategories = new Set<FilterCategory>(['duplicates'])

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) setActiveCategory(null)
      }}
    >
      <PopoverTrigger asChild>
        <FilterAddButton />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-0">
        {activeCategory === null ? (
          <div className="py-1">
            {FILTER_CATEGORIES.filter((c) => {
              // Hide direct toggles that are already active
              if (c.key === 'duplicates' && filters.hasDuplicates) return false
              return true
            }).map((category) => {
              const Icon = category.icon
              const isDirect = directToggleCategories.has(category.key)
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => {
                    if (isDirect) {
                      handleDirectToggle(category.key)
                    } else {
                      setActiveCategory(category.key)
                    }
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-2.5 py-1.5',
                    'text-[13px] text-left',
                    'hover:bg-muted/50 transition-colors'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    {intl.formatMessage(category.label)}
                  </span>
                  {!isDirect && <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />}
                </button>
              )
            })}
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground border-b border-border/50"
            >
              <ChevronRightIcon className="h-2.5 w-2.5 rotate-180" />
              {intl.formatMessage({ id: 'portal.feedback.filter.back', defaultMessage: 'Back' })}
            </button>
            <div className="max-h-[250px] overflow-y-auto py-1">
              {activeCategory === 'status' &&
                statuses.map((status) => (
                  <MenuButton key={status.id} onClick={() => handleSelectStatus(status.slug)}>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </MenuButton>
                ))}

              {activeCategory === 'board' &&
                boards.map((board) => (
                  <MenuButton key={board.id} onClick={() => handleSelectBoard(board.id)}>
                    {board.name}
                  </MenuButton>
                ))}

              {activeCategory === 'tags' &&
                tags.map((tag) => (
                  <MenuButton key={tag.id} onClick={() => handleSelectTag(tag.id)}>
                    {tag.name}
                  </MenuButton>
                ))}

              {activeCategory === 'segment' &&
                segments?.map((segment) => (
                  <MenuButton key={segment.id} onClick={() => handleSelectSegment(segment.id)}>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: segment.color }}
                    />
                    {segment.name}
                  </MenuButton>
                ))}

              {activeCategory === 'owner' && (
                <>
                  <MenuButton
                    onClick={() => handleSelectOwner('unassigned')}
                    className="text-muted-foreground"
                  >
                    {intl.formatMessage({
                      id: 'portal.feedback.filter.owner.unassigned',
                      defaultMessage: 'Unassigned',
                    })}
                  </MenuButton>
                  {members.map((member) => (
                    <MenuButton key={member.id} onClick={() => handleSelectOwner(member.id)}>
                      {member.name || member.email}
                    </MenuButton>
                  ))}
                </>
              )}

              {activeCategory === 'date' &&
                DATE_PRESETS.map((preset) => (
                  <MenuButton key={preset.value} onClick={() => handleSelectDate(preset.daysAgo)}>
                    {datePresetLabel(intl, preset)}
                  </MenuButton>
                ))}

              {activeCategory === 'votes' &&
                VOTE_THRESHOLDS.map((threshold) => (
                  <MenuButton
                    key={threshold.value}
                    onClick={() => handleSelectThreshold('minVotes', threshold.value)}
                  >
                    {thresholdLabel(intl, 'minVotes', threshold.value)}
                  </MenuButton>
                ))}

              {activeCategory === 'comments' &&
                COMMENT_THRESHOLDS.map((threshold) => (
                  <MenuButton
                    key={threshold.value}
                    onClick={() => handleSelectThreshold('minComments', threshold.value)}
                  >
                    {thresholdLabel(intl, 'minComments', threshold.value)}
                  </MenuButton>
                ))}

              {activeCategory === 'response' && (
                <>
                  <MenuButton onClick={() => handleSelectResponse('responded')}>
                    {intl.formatMessage({
                      id: 'admin.feedback.filterPanel.responded',
                      defaultMessage: 'Responded',
                    })}
                  </MenuButton>
                  <MenuButton onClick={() => handleSelectResponse('unresponded')}>
                    {intl.formatMessage({
                      id: 'admin.feedback.filterPanel.unresponded',
                      defaultMessage: 'Unresponded',
                    })}
                  </MenuButton>
                </>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function getFilterIcon(type: ActiveFilter['type']): IconComponent {
  const icons: Record<ActiveFilter['type'], IconComponent> = {
    status: CircleIcon,
    board: Squares2X2Icon,
    tags: TagIcon,
    segment: UserGroupIcon,
    owner: UserIcon,
    date: CalendarIcon,
    minVotes: ArrowTrendingUpIcon,
    minComments: ChatBubbleOvalLeftIcon,
    responded: ChatBubbleLeftRightIcon,
    hasDuplicates: Square2StackIcon,
    deleted: TrashIcon,
  }
  return icons[type]
}

/** A date filter ("2026-10-01") as the calendar day it names, for every viewer. */
function formatDate(dateStr: string): string {
  return formatCalendarDate(dateStr) ?? dateStr
}

function computeActiveFilters(
  filters: InboxFilters,
  boards: Board[],
  tags: TagType[],
  statuses: PostStatusEntity[],
  members: TeamMember[],
  segments: SegmentListItem[] | undefined,
  onFiltersChange: (updates: Partial<InboxFilters>) => void,
  intl: IntlShape
): ActiveFilter[] {
  const result: ActiveFilter[] = []

  // Build options arrays for dropdowns
  const statusOptions: FilterOption[] = statuses.map((s) => ({
    id: s.slug,
    label: s.name,
    color: s.color,
  }))
  const boardOptions: FilterOption[] = boards.map((b) => ({
    id: b.id,
    label: b.name,
  }))
  const tagOptions: FilterOption[] = tags.map((t) => ({
    id: t.id,
    label: t.name,
  }))
  const ownerOptions: FilterOption[] = [
    {
      id: 'unassigned',
      label: intl.formatMessage({
        id: 'portal.feedback.filter.owner.unassigned',
        defaultMessage: 'Unassigned',
      }),
    },
    ...members.map((m) => ({
      id: m.id,
      label:
        m.name ||
        m.email ||
        intl.formatMessage({ id: 'common.authorSelector.unnamed', defaultMessage: 'Unnamed' }),
    })),
  ]

  // Status filters
  if (filters.status?.length) {
    filters.status.forEach((slug) => {
      const status = statuses.find((s) => s.slug === slug)
      if (status) {
        result.push({
          key: `status-${slug}`,
          type: 'status',
          label: intl.formatMessage({
            id: 'portal.feedback.filter.chip.status',
            defaultMessage: 'Status:',
          }),
          value: status.name,
          valueId: slug,
          color: status.color,
          options: statusOptions,
          onChange: (newSlug) => {
            const otherStatuses = filters.status?.filter((s) => s !== slug) || []
            onFiltersChange({
              status: [...otherStatuses, newSlug],
            })
          },
          onRemove: () => {
            const newStatus = filters.status?.filter((s) => s !== slug)
            onFiltersChange({
              status: newStatus?.length ? newStatus : undefined,
            })
          },
        })
      }
    })
  }

  // Board filters
  if (filters.board?.length) {
    filters.board.forEach((id) => {
      const board = boards.find((b) => b.id === id)
      if (board) {
        result.push({
          key: `board-${id}`,
          type: 'board',
          label: intl.formatMessage({
            id: 'portal.feedback.filter.chip.board',
            defaultMessage: 'Board:',
          }),
          value: board.name,
          valueId: id,
          options: boardOptions,
          onChange: (newId) => {
            const otherBoards = filters.board?.filter((b) => b !== id) || []
            onFiltersChange({
              board: [...otherBoards, newId],
            })
          },
          onRemove: () => {
            const newBoards = filters.board?.filter((b) => b !== id)
            onFiltersChange({
              board: newBoards?.length ? newBoards : undefined,
            })
          },
        })
      }
    })
  }

  // Tags (always include mode, combine if many)
  if (filters.tags?.length) {
    const tagNames = filters.tags
      .map((id) => tags.find((t) => t.id === id)?.name)
      .filter(Boolean) as string[]

    if (tagNames.length <= 2) {
      // Individual chips for 1-2 tags
      filters.tags.forEach((id) => {
        const tag = tags.find((t) => t.id === id)
        if (tag) {
          result.push({
            key: `tag-${id}`,
            type: 'tags',
            label: intl.formatMessage({
              id: 'portal.feedback.filter.chip.tag',
              defaultMessage: 'Tag:',
            }),
            value: tag.name,
            valueId: id,
            options: tagOptions,
            onChange: (newId) => {
              const otherTags = filters.tags?.filter((t) => t !== id) || []
              onFiltersChange({ tags: [...otherTags, newId] })
            },
            onRemove: () => {
              const newTags = filters.tags?.filter((t) => t !== id)
              onFiltersChange({ tags: newTags?.length ? newTags : undefined })
            },
          })
        }
      })
    } else {
      // Combined chip for 3+ tags - no dropdown
      result.push({
        key: 'tags-combined',
        type: 'tags',
        label: intl.formatMessage({
          id: 'portal.feedback.filter.chip.tags',
          defaultMessage: 'Tags:',
        }),
        value: `${tagNames.slice(0, 2).join(', ')} +${tagNames.length - 2}`,
        valueId: 'combined',
        onRemove: () => onFiltersChange({ tags: undefined }),
      })
    }
  }

  // Segment filters
  if (filters.segmentIds?.length && segments) {
    const segmentOptions: FilterOption[] = segments.map((s) => ({
      id: s.id,
      label: s.name,
      color: s.color,
    }))

    filters.segmentIds.forEach((id) => {
      const segment = segments.find((s) => s.id === id)
      if (segment) {
        result.push({
          key: `segment-${id}`,
          type: 'segment',
          label: intl.formatMessage({
            id: 'portal.feedback.filter.chip.segment',
            defaultMessage: 'Segment:',
          }),
          value: segment.name,
          valueId: id,
          color: segment.color,
          options: segmentOptions,
          onChange: (newId) => {
            const otherSegments = filters.segmentIds?.filter((s) => s !== id) || []
            onFiltersChange({ segmentIds: [...otherSegments, newId] })
          },
          onRemove: () => {
            const newSegments = filters.segmentIds?.filter((s) => s !== id)
            onFiltersChange({ segmentIds: newSegments?.length ? newSegments : undefined })
          },
        })
      }
    })
  }

  // Owner filter
  if (filters.owner) {
    const ownerName =
      filters.owner === 'unassigned'
        ? intl.formatMessage({
            id: 'portal.feedback.filter.owner.unassigned',
            defaultMessage: 'Unassigned',
          })
        : members.find((m) => m.id === filters.owner)?.name ||
          intl.formatMessage({
            id: 'admin.feedback.filters.unknownOwner',
            defaultMessage: 'Unknown',
          })

    result.push({
      key: 'owner',
      type: 'owner',
      label: intl.formatMessage({
        id: 'admin.feedback.filters.chip.owner',
        defaultMessage: 'Assigned:',
      }),
      value: ownerName,
      valueId: filters.owner,
      options: ownerOptions,
      onChange: (newId) => onFiltersChange({ owner: newId }),
      onRemove: () => onFiltersChange({ owner: undefined }),
    })
  }

  // Date range - dropdown with presets
  const dateOptions: FilterOption[] = DATE_PRESETS.map((p) => ({
    id: p.value,
    label: datePresetLabel(intl, p),
  }))

  if (filters.dateFrom) {
    // Try to match current date to a preset for display
    const matchedPreset = DATE_PRESETS.find(
      (p) => getDateFromDaysAgo(p.daysAgo) === filters.dateFrom
    )

    result.push({
      key: 'date',
      type: 'date',
      label: intl.formatMessage({
        id: 'portal.feedback.filter.chip.date',
        defaultMessage: 'Date:',
      }),
      value: matchedPreset ? datePresetLabel(intl, matchedPreset) : formatDate(filters.dateFrom),
      valueId: matchedPreset?.value || filters.dateFrom,
      options: dateOptions,
      onChange: (presetId) => {
        const preset = DATE_PRESETS.find((p) => p.value === presetId)
        if (preset) {
          onFiltersChange({ dateFrom: getDateFromDaysAgo(preset.daysAgo) })
        }
      },
      onRemove: () => onFiltersChange({ dateFrom: undefined }),
    })
  }

  // Numeric threshold filters (votes, comments)
  const thresholdFilters: Array<{
    key: ThresholdKey
    label: string
    thresholds: ReadonlyArray<{ value: number }>
  }> = [
    {
      key: 'minVotes',
      label: intl.formatMessage({
        id: 'portal.feedback.filter.chip.votes',
        defaultMessage: 'Min votes:',
      }),
      thresholds: VOTE_THRESHOLDS,
    },
    {
      key: 'minComments',
      label: intl.formatMessage({
        id: 'admin.feedback.filters.chip.minComments',
        defaultMessage: 'Min comments:',
      }),
      thresholds: COMMENT_THRESHOLDS,
    },
  ]

  for (const { key, label, thresholds } of thresholdFilters) {
    const current = filters[key]
    if (!current) continue

    const options: FilterOption[] = thresholds.map((t) => ({
      id: t.value.toString(),
      label: thresholdLabel(intl, key, t.value),
    }))
    const matched = thresholds.find((t) => t.value === current)

    result.push({
      key,
      type: key,
      label,
      value: matched ? thresholdLabel(intl, key, matched.value) : `${current}+`,
      valueId: current.toString(),
      options,
      onChange: (newValue) => onFiltersChange({ [key]: parseInt(newValue, 10) }),
      onRemove: () => onFiltersChange({ [key]: undefined }),
    })
  }

  // Response filter
  const respondedOptions: FilterOption[] = [
    {
      id: 'responded',
      label: intl.formatMessage({
        id: 'admin.feedback.filterPanel.responded',
        defaultMessage: 'Responded',
      }),
    },
    {
      id: 'unresponded',
      label: intl.formatMessage({
        id: 'admin.feedback.filterPanel.unresponded',
        defaultMessage: 'Unresponded',
      }),
    },
  ]

  if (filters.responded && filters.responded !== 'all') {
    result.push({
      key: 'responded',
      type: 'responded',
      label: intl.formatMessage({
        id: 'portal.feedback.filter.chip.response',
        defaultMessage: 'Team response:',
      }),
      value:
        filters.responded === 'responded'
          ? intl.formatMessage({
              id: 'admin.feedback.filterPanel.responded',
              defaultMessage: 'Responded',
            })
          : intl.formatMessage({
              id: 'admin.feedback.filterPanel.unresponded',
              defaultMessage: 'Unresponded',
            }),
      valueId: filters.responded,
      options: respondedOptions,
      onChange: (newValue) =>
        onFiltersChange({ responded: newValue as 'responded' | 'unresponded' }),
      onRemove: () => onFiltersChange({ responded: undefined }),
    })
  }

  // Duplicates filter
  if (filters.hasDuplicates) {
    result.push({
      key: 'hasDuplicates',
      type: 'hasDuplicates',
      label: '',
      value: intl.formatMessage({
        id: 'admin.feedback.filters.hasDuplicates',
        defaultMessage: 'Has duplicates',
      }),
      valueId: 'hasDuplicates',
      onRemove: () => onFiltersChange({ hasDuplicates: undefined }),
    })
  }

  // Deleted posts filter
  if (filters.showDeleted) {
    result.push({
      key: 'deleted',
      type: 'deleted',
      label: '',
      value: intl.formatMessage({
        id: 'admin.feedback.filterPanel.deletedPosts',
        defaultMessage: 'Deleted posts',
      }),
      valueId: 'deleted',
      onRemove: () => onFiltersChange({ showDeleted: undefined }),
    })
  }

  return result
}

export function ActiveFiltersBar({
  filters,
  onFiltersChange,
  onClearAll,
  boards,
  tags,
  statuses,
  members,
  segments,
}: ActiveFiltersBarProps) {
  const intl = useOptionalIntl()
  const activeFilters = useMemo(
    () =>
      computeActiveFilters(
        filters,
        boards,
        tags,
        statuses,
        members,
        segments,
        onFiltersChange,
        intl
      ),
    [filters, boards, tags, statuses, members, segments, onFiltersChange, intl]
  )

  if (activeFilters.length === 0) return null

  return (
    <div
      className="mt-2 bg-card/50"
      role="region"
      aria-label={intl.formatMessage({
        id: 'portal.feedback.filter.activeFilters',
        defaultMessage: 'Active filters',
      })}
    >
      <div className="flex flex-wrap gap-1 items-center">
        {activeFilters.map(({ key, type, ...filterProps }) => (
          <FilterChip key={key} icon={getFilterIcon(type)} {...filterProps} />
        ))}

        {activeFilters.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className={cn(
              'text-[13px] text-muted-foreground hover:text-foreground',
              'px-1.5 py-0.5 rounded',
              'hover:bg-muted/50',
              'transition-colors'
            )}
          >
            {intl.formatMessage({
              id: 'portal.feedback.filter.clearAll',
              defaultMessage: 'Clear all',
            })}
          </button>
        )}
      </div>
    </div>
  )
}
