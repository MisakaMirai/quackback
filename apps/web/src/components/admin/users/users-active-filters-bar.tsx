import { useMemo, useState } from 'react'
import { type MessageDescriptor } from 'react-intl'
import {
  EnvelopeIcon,
  CalendarIcon,
  ChevronRightIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  HandThumbUpIcon,
  ChatBubbleLeftIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/solid'
import { cn } from '@/lib/shared/utils'
import { formatCalendarDate } from '@/lib/shared/utils/date'
import { DATE_PRESETS, getDateFromDaysAgo } from '@/components/shared/filter-presets'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FilterAddButton, FilterChip, type FilterOption } from '@/components/shared/filter-chip'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useOptionalIntl } from '@/components/ui/use-optional-intl'
import { useUserAttributes } from '@/lib/client/hooks/use-user-attributes-queries'
import type { UsersFilters } from '@/lib/shared/types'

interface ActiveFilter {
  key: string
  type: string
  label: string
  value: string
  valueId: string
  onRemove: () => void
  onChange?: (newId: string) => void
  options?: FilterOption[]
}

interface UsersActiveFiltersBarProps {
  filters: UsersFilters
  onFiltersChange: (updates: Partial<UsersFilters>) => void
  onClearFilters: () => void
}

type FilterCategory =
  'verified' | 'date' | 'emailDomain' | 'postCount' | 'voteCount' | 'commentCount' | 'customAttr'

interface FilterCategoryDef {
  key: FilterCategory
  label: MessageDescriptor
  icon: typeof EnvelopeIcon
}

const FILTER_CATEGORIES: FilterCategoryDef[] = [
  {
    key: 'verified',
    label: { id: 'admin.people.filters.categoryVerified', defaultMessage: 'Email Status' },
    icon: EnvelopeIcon,
  },
  {
    key: 'emailDomain',
    label: { id: 'admin.people.filters.categoryEmailDomain', defaultMessage: 'Email Domain' },
    icon: GlobeAltIcon,
  },
  {
    key: 'date',
    label: { id: 'admin.people.filters.categoryDate', defaultMessage: 'Date Joined' },
    icon: CalendarIcon,
  },
  {
    key: 'postCount',
    label: { id: 'admin.people.filters.categoryPostCount', defaultMessage: 'Post Count' },
    icon: DocumentTextIcon,
  },
  {
    key: 'voteCount',
    label: { id: 'admin.people.filters.categoryVoteCount', defaultMessage: 'Vote Count' },
    icon: HandThumbUpIcon,
  },
  {
    key: 'commentCount',
    label: { id: 'admin.people.filters.categoryCommentCount', defaultMessage: 'Comment Count' },
    icon: ChatBubbleLeftIcon,
  },
]

const ACTIVITY_OPERATORS: { value: string; label: MessageDescriptor }[] = [
  {
    value: 'gte',
    label: { id: 'admin.segments.operator.atLeast', defaultMessage: 'at least' },
  },
  {
    value: 'gt',
    label: { id: 'admin.people.filters.moreThan', defaultMessage: 'more than' },
  },
  {
    value: 'lte',
    label: { id: 'admin.segments.operator.atMost', defaultMessage: 'at most' },
  },
  {
    value: 'lt',
    label: { id: 'admin.segments.operator.lessThan', defaultMessage: 'less than' },
  },
  {
    value: 'eq',
    label: { id: 'admin.people.filters.exactly', defaultMessage: 'exactly' },
  },
]

const BOOLEAN_OPERATORS: { value: string; label: MessageDescriptor }[] = [
  { value: 'eq', label: { id: 'admin.segments.operator.is', defaultMessage: 'is' } },
]

const TEXT_OPERATORS: { value: string; label: MessageDescriptor }[] = [
  { value: 'eq', label: { id: 'admin.segments.operator.equals', defaultMessage: 'equals' } },
  {
    value: 'neq',
    label: { id: 'admin.segments.operator.notEquals', defaultMessage: 'not equals' },
  },
  {
    value: 'contains',
    label: { id: 'admin.segments.operator.contains', defaultMessage: 'contains' },
  },
  { value: 'is_set', label: { id: 'admin.segments.operator.isSet', defaultMessage: 'is set' } },
  {
    value: 'is_not_set',
    label: { id: 'admin.segments.operator.isNotSet', defaultMessage: 'is not set' },
  },
]

const CUSTOM_ATTR_OPERATOR_LABELS: Record<string, MessageDescriptor> = {
  eq: { id: 'admin.segments.operator.equals', defaultMessage: 'equals' },
  neq: { id: 'admin.segments.operator.notEquals', defaultMessage: 'not equals' },
  contains: { id: 'admin.segments.operator.contains', defaultMessage: 'contains' },
  starts_with: { id: 'admin.people.filters.startsWith', defaultMessage: 'starts with' },
  ends_with: { id: 'admin.people.filters.endsWith', defaultMessage: 'ends with' },
  is_set: { id: 'admin.segments.operator.isSet', defaultMessage: 'is set' },
  is_not_set: { id: 'admin.segments.operator.isNotSet', defaultMessage: 'is not set' },
  gt: { id: 'admin.people.filters.moreThan', defaultMessage: 'more than' },
  gte: { id: 'admin.segments.operator.atLeast', defaultMessage: 'at least' },
  lt: { id: 'admin.segments.operator.lessThan', defaultMessage: 'less than' },
  lte: { id: 'admin.segments.operator.atMost', defaultMessage: 'at most' },
}

const DATE_PRESET_LABELS: Record<(typeof DATE_PRESETS)[number]['value'], MessageDescriptor> = {
  today: { id: 'portal.feedback.filter.date.today', defaultMessage: 'Today' },
  '7days': { id: 'portal.feedback.filter.date.last7Days', defaultMessage: 'Last 7 days' },
  '30days': { id: 'portal.feedback.filter.date.last30Days', defaultMessage: 'Last 30 days' },
  '90days': { id: 'portal.feedback.filter.date.last90Days', defaultMessage: 'Last 90 days' },
}

function datePresetLabel(
  intl: ReturnType<typeof useOptionalIntl>,
  preset: (typeof DATE_PRESETS)[number]
): string {
  return intl.formatMessage(DATE_PRESET_LABELS[preset.value])
}

function parseActivityValue(raw?: string): { op: string; value: string } | null {
  if (!raw) return null
  const [op, val] = raw.split(':')
  if (!op || val === undefined) return null
  return { op, value: val }
}

function formatActivityValue(
  op: string,
  value: string,
  intl: ReturnType<typeof useOptionalIntl>
): string {
  const operator = ACTIVITY_OPERATORS.find((o) => o.value === op)
  const opLabel = operator ? intl.formatMessage(operator.label) : op
  return `${opLabel} ${value}`
}

function ActivityFilterInput({
  onApply,
  onClose,
}: {
  onApply: (opValue: string) => void
  onClose: () => void
}) {
  const intl = useOptionalIntl()
  const [op, setOp] = useState('gte')
  const [value, setValue] = useState('')

  return (
    <div className="p-2 space-y-2">
      <Select value={op} onValueChange={setOp}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIVITY_OPERATORS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {intl.formatMessage(o.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        className="h-7 text-xs"
        placeholder="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value) {
            onApply(`${op}:${value}`)
            onClose()
          }
        }}
      />
      <Button
        size="sm"
        className="w-full h-7 text-xs"
        disabled={!value}
        onClick={() => {
          if (value) {
            onApply(`${op}:${value}`)
            onClose()
          }
        }}
      >
        {intl.formatMessage({ id: 'admin.people.filters.apply', defaultMessage: 'Apply' })}
      </Button>
    </div>
  )
}

function TextFilterInput({
  placeholder,
  onApply,
  onClose,
}: {
  placeholder: string
  onApply: (value: string) => void
  onClose: () => void
}) {
  const intl = useOptionalIntl()
  const [value, setValue] = useState('')

  return (
    <div className="p-2 space-y-2">
      <Input
        className="h-7 text-xs"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onApply(value.trim())
            onClose()
          }
        }}
        autoFocus
      />
      <Button
        size="sm"
        className="w-full h-7 text-xs"
        disabled={!value.trim()}
        onClick={() => {
          if (value.trim()) {
            onApply(value.trim())
            onClose()
          }
        }}
      >
        {intl.formatMessage({ id: 'admin.people.filters.apply', defaultMessage: 'Apply' })}
      </Button>
    </div>
  )
}

function CustomAttrFilterInput({
  attrKey,
  attrType,
  onApply,
  onClose,
}: {
  attrKey: string
  attrType: string
  onApply: (encoded: string) => void
  onClose: () => void
}) {
  const intl = useOptionalIntl()
  const isNumeric = attrType === 'number' || attrType === 'currency' || attrType === 'date'
  const isBool = attrType === 'boolean'

  const [op, setOp] = useState(isNumeric ? 'gte' : isBool ? 'eq' : 'eq')
  const [value, setValue] = useState(isBool ? 'true' : '')

  const operators = isNumeric ? ACTIVITY_OPERATORS : isBool ? BOOLEAN_OPERATORS : TEXT_OPERATORS

  const isPresenceOp = op === 'is_set' || op === 'is_not_set'

  const handleApply = () => {
    const v = isPresenceOp ? '' : value
    onApply(`${attrKey}:${op}:${v}`)
    onClose()
  }

  return (
    <div className="p-2 space-y-2">
      <Select value={op} onValueChange={setOp}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {intl.formatMessage(o.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isPresenceOp &&
        (isBool ? (
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">
                {intl.formatMessage({ id: 'admin.segments.rule.true', defaultMessage: 'True' })}
              </SelectItem>
              <SelectItem value="false">
                {intl.formatMessage({ id: 'admin.segments.rule.false', defaultMessage: 'False' })}
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={isNumeric ? 'number' : 'text'}
            className="h-7 text-xs"
            placeholder={
              isNumeric
                ? '0'
                : intl.formatMessage({
                    id: 'admin.people.filters.valuePlaceholder',
                    defaultMessage: 'value',
                  })
            }
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply()
            }}
          />
        ))}
      <Button
        size="sm"
        className="w-full h-7 text-xs"
        disabled={!isPresenceOp && !value.trim()}
        onClick={handleApply}
      >
        {intl.formatMessage({ id: 'admin.people.filters.apply', defaultMessage: 'Apply' })}
      </Button>
    </div>
  )
}

/** The Filter control that opens the category menu; lives in the list toolbar. */
export function UsersFilterButton({
  onFiltersChange,
  filters,
}: {
  onFiltersChange: (updates: Partial<UsersFilters>) => void
  filters: UsersFilters
}) {
  const intl = useOptionalIntl()
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<FilterCategory | null>(null)
  const [activeCustomAttr, setActiveCustomAttr] = useState<{
    key: string
    label: string
    type: string
  } | null>(null)

  const { data: userAttributes } = useUserAttributes()

  const closePopover = () => {
    setOpen(false)
    setActiveCategory(null)
    setActiveCustomAttr(null)
  }

  const handleSelectVerified = (verified: boolean) => {
    onFiltersChange({ verified })
    closePopover()
  }

  const handleSelectDate = (preset: (typeof DATE_PRESETS)[number]) => {
    onFiltersChange({ dateFrom: getDateFromDaysAgo(preset.daysAgo) })
    closePopover()
  }

  // Hide categories that are already filtered
  const availableCategories = FILTER_CATEGORIES.filter((cat) => {
    if (cat.key === 'verified' && filters.verified !== undefined) return false
    if (cat.key === 'date' && filters.dateFrom) return false
    if (cat.key === 'emailDomain' && filters.emailDomain) return false
    if (cat.key === 'postCount' && filters.postCount) return false
    if (cat.key === 'voteCount' && filters.voteCount) return false
    if (cat.key === 'commentCount' && filters.commentCount) return false
    return true
  })

  // Custom attributes not already in customAttrs filter
  const existingCustomKeys = new Set(
    (filters.customAttrs ?? '')
      .split(',')
      .filter(Boolean)
      .map((part) => part.split(':')[0])
  )
  const availableCustomAttrs = (userAttributes ?? []).filter(
    (attr) => !existingCustomKeys.has(attr.key)
  )

  const hasAvailableFilters = availableCategories.length > 0 || availableCustomAttrs.length > 0

  if (!hasAvailableFilters) return null

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) {
          setActiveCategory(null)
          setActiveCustomAttr(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <FilterAddButton />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-0">
        {activeCustomAttr ? (
          <div>
            <button
              type="button"
              onClick={() => setActiveCustomAttr(null)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground border-b border-border/50"
            >
              <ChevronRightIcon className="h-2.5 w-2.5 rotate-180" />
              {activeCustomAttr.label}
            </button>
            <CustomAttrFilterInput
              attrKey={activeCustomAttr.key}
              attrType={activeCustomAttr.type}
              onApply={(encoded) => {
                const existing = filters.customAttrs
                const newVal = existing ? `${existing},${encoded}` : encoded
                onFiltersChange({ customAttrs: newVal })
              }}
              onClose={closePopover}
            />
          </div>
        ) : activeCategory === null ? (
          <div className="py-1 max-h-[350px] overflow-y-auto">
            {availableCategories.map((category) => {
              const Icon = category.icon
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category.key)
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
                  <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />
                </button>
              )
            })}
            {availableCustomAttrs.length > 0 && (
              <>
                <div className="border-b border-border/30 my-1" />
                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {intl.formatMessage({
                    id: 'admin.segments.rule.customAttributes',
                    defaultMessage: 'Custom attributes',
                  })}
                </div>
                {availableCustomAttrs.map((attr) => (
                  <button
                    key={attr.key}
                    type="button"
                    onClick={() =>
                      setActiveCustomAttr({ key: attr.key, label: attr.label, type: attr.type })
                    }
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2.5 py-1.5',
                      'text-[13px] text-left',
                      'hover:bg-muted/50 transition-colors'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <AdjustmentsHorizontalIcon className="size-4 text-muted-foreground" />
                      {attr.label}
                    </span>
                    <ChevronRightIcon className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground border-b border-border/50"
            >
              <ChevronRightIcon className="h-2.5 w-2.5 rotate-180" />
              {intl.formatMessage({ id: 'admin.people.filters.back', defaultMessage: 'Back' })}
            </button>
            <div className="max-h-[250px] overflow-y-auto">
              {activeCategory === 'verified' && (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => handleSelectVerified(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-muted/50 transition-colors"
                  >
                    {intl.formatMessage({
                      id: 'admin.people.filters.verifiedOnly',
                      defaultMessage: 'Verified only',
                    })}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectVerified(false)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-muted/50 transition-colors"
                  >
                    {intl.formatMessage({
                      id: 'admin.people.filters.unverifiedOnly',
                      defaultMessage: 'Unverified only',
                    })}
                  </button>
                </div>
              )}

              {activeCategory === 'date' && (
                <div className="py-1">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => handleSelectDate(preset)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] hover:bg-muted/50 transition-colors"
                    >
                      {datePresetLabel(intl, preset)}
                    </button>
                  ))}
                </div>
              )}

              {activeCategory === 'emailDomain' && (
                <TextFilterInput
                  placeholder="example.com"
                  onApply={(value) => onFiltersChange({ emailDomain: value })}
                  onClose={closePopover}
                />
              )}

              {activeCategory === 'postCount' && (
                <ActivityFilterInput
                  onApply={(value) => onFiltersChange({ postCount: value })}
                  onClose={closePopover}
                />
              )}

              {activeCategory === 'voteCount' && (
                <ActivityFilterInput
                  onApply={(value) => onFiltersChange({ voteCount: value })}
                  onClose={closePopover}
                />
              )}

              {activeCategory === 'commentCount' && (
                <ActivityFilterInput
                  onApply={(value) => onFiltersChange({ commentCount: value })}
                  onClose={closePopover}
                />
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function getFilterIcon(type: string) {
  const icons: Record<string, typeof EnvelopeIcon> = {
    verified: EnvelopeIcon,
    dateFrom: CalendarIcon,
    dateTo: CalendarIcon,
    dateRange: CalendarIcon,
    emailDomain: GlobeAltIcon,
    postCount: DocumentTextIcon,
    voteCount: HandThumbUpIcon,
    commentCount: ChatBubbleLeftIcon,
    customAttr: AdjustmentsHorizontalIcon,
  }
  return icons[type] ?? AdjustmentsHorizontalIcon
}

/** A date filter ("2026-10-01") as the calendar day it names, for every viewer. */
function formatDate(dateStr: string): string {
  return formatCalendarDate(dateStr) ?? dateStr
}

function computeActiveFilters(
  filters: UsersFilters,
  onFiltersChange: (updates: Partial<UsersFilters>) => void,
  intl: ReturnType<typeof useOptionalIntl>
): ActiveFilter[] {
  const result: ActiveFilter[] = []

  // Verified filter
  const verifiedOptions: FilterOption[] = [
    {
      id: 'verified',
      label: intl.formatMessage({
        id: 'admin.people.filters.verified',
        defaultMessage: 'Verified',
      }),
    },
    {
      id: 'unverified',
      label: intl.formatMessage({
        id: 'admin.people.filters.unverified',
        defaultMessage: 'Unverified',
      }),
    },
  ]

  if (filters.verified !== undefined) {
    result.push({
      key: 'verified',
      type: 'verified',
      label: intl.formatMessage({
        id: 'admin.people.filters.chipEmail',
        defaultMessage: 'Email:',
      }),
      value: filters.verified
        ? intl.formatMessage({ id: 'admin.people.filters.verified', defaultMessage: 'Verified' })
        : intl.formatMessage({
            id: 'admin.people.filters.unverified',
            defaultMessage: 'Unverified',
          }),
      valueId: filters.verified ? 'verified' : 'unverified',
      options: verifiedOptions,
      onChange: (val) => onFiltersChange({ verified: val === 'verified' }),
      onRemove: () => onFiltersChange({ verified: undefined }),
    })
  }

  // Email domain filter
  if (filters.emailDomain) {
    result.push({
      key: 'emailDomain',
      type: 'emailDomain',
      label: intl.formatMessage({
        id: 'admin.people.filters.chipDomain',
        defaultMessage: 'Domain:',
      }),
      value: filters.emailDomain,
      valueId: filters.emailDomain,
      onRemove: () => onFiltersChange({ emailDomain: undefined }),
    })
  }

  // Date range
  const dateOptions: FilterOption[] = DATE_PRESETS.map((p) => ({
    id: p.value,
    label: datePresetLabel(intl, p),
  }))

  if (filters.dateFrom && filters.dateTo) {
    result.push({
      key: 'dateRange',
      type: 'dateRange',
      label: intl.formatMessage({
        id: 'admin.people.filters.chipJoined',
        defaultMessage: 'Joined:',
      }),
      value: `${formatDate(filters.dateFrom)} - ${formatDate(filters.dateTo)}`,
      valueId: 'custom',
      onRemove: () => onFiltersChange({ dateFrom: undefined, dateTo: undefined }),
    })
  } else if (filters.dateFrom) {
    const matchedPreset = DATE_PRESETS.find(
      (p) => getDateFromDaysAgo(p.daysAgo) === filters.dateFrom
    )
    result.push({
      key: 'dateFrom',
      type: 'dateFrom',
      label: intl.formatMessage({
        id: 'admin.people.filters.chipJoined',
        defaultMessage: 'Joined:',
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
  } else if (filters.dateTo) {
    result.push({
      key: 'dateTo',
      type: 'dateTo',
      label: intl.formatMessage({
        id: 'admin.people.filters.chipTo',
        defaultMessage: 'To:',
      }),
      value: formatDate(filters.dateTo),
      valueId: filters.dateTo,
      onRemove: () => onFiltersChange({ dateTo: undefined }),
    })
  }

  // Activity count filters
  for (const [filterKey, filterLabel] of [
    [
      'postCount',
      intl.formatMessage({ id: 'admin.people.filters.chipPosts', defaultMessage: 'Posts:' }),
    ],
    [
      'voteCount',
      intl.formatMessage({ id: 'admin.people.filters.chipVotes', defaultMessage: 'Votes:' }),
    ],
    [
      'commentCount',
      intl.formatMessage({
        id: 'admin.people.filters.chipComments',
        defaultMessage: 'Comments:',
      }),
    ],
  ] as const) {
    const parsed = parseActivityValue(filters[filterKey])
    if (parsed) {
      result.push({
        key: filterKey,
        type: filterKey,
        label: filterLabel,
        value: formatActivityValue(parsed.op, parsed.value, intl),
        valueId: filterKey,
        onRemove: () => onFiltersChange({ [filterKey]: undefined }),
      })
    }
  }

  // Custom attribute filters
  if (filters.customAttrs) {
    const parts = filters.customAttrs.split(',').filter(Boolean)
    for (const part of parts) {
      const [key, op, ...rest] = part.split(':')
      if (!key || !op) continue
      const value = rest.join(':')
      const opDescriptor = CUSTOM_ATTR_OPERATOR_LABELS[op]
      const opLabel = opDescriptor ? intl.formatMessage(opDescriptor) : op
      const displayValue = op === 'is_set' || op === 'is_not_set' ? opLabel : `${opLabel} ${value}`

      result.push({
        key: `custom_${key}`,
        type: 'customAttr',
        label: intl.formatMessage(
          { id: 'admin.people.filters.chipCustomAttr', defaultMessage: '{key}:' },
          { key }
        ),
        value: displayValue,
        valueId: key,
        onRemove: () => {
          const remaining = parts.filter((p) => !p.startsWith(`${key}:`)).join(',')
          onFiltersChange({ customAttrs: remaining || undefined })
        },
      })
    }
  }

  return result
}

export function UsersActiveFiltersBar({
  filters,
  onFiltersChange,
  onClearFilters,
}: UsersActiveFiltersBarProps) {
  const intl = useOptionalIntl()
  const activeFilters = useMemo(
    () => computeActiveFilters(filters, onFiltersChange, intl),
    [filters, onFiltersChange, intl]
  )

  if (activeFilters.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {activeFilters.map(({ key, type, ...filterProps }) => (
        <FilterChip key={key} icon={getFilterIcon(type)} {...filterProps} />
      ))}

      {activeFilters.length > 1 && (
        <button
          type="button"
          onClick={onClearFilters}
          className={cn(
            'text-[13px] text-muted-foreground hover:text-foreground',
            'px-2 py-1 rounded',
            'hover:bg-muted/50',
            'transition-colors'
          )}
        >
          {intl.formatMessage({ id: 'admin.people.filters.clearAll', defaultMessage: 'Clear all' })}
        </button>
      )}
    </div>
  )
}
