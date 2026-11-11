'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRightIcon } from '@heroicons/react/16/solid'
import { ChevronUpIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusBadge } from '@/components/ui/status-badge'
import { useMergePost, useUnmergePost } from '@/lib/client/mutations/post-merge'
import { findSimilarPostsFn, type SimilarPost } from '@/lib/server/functions/public-posts'
import { getMergedPostsFn } from '@/lib/server/functions/post-merge'
import { mergeSuggestionQueries } from '@/lib/client/queries/signals'
import { inboxKeys } from '@/lib/client/hooks/use-inbox-query'
import type { PostId } from '@quackback/ids'
import type { MergedPostItem } from '@/lib/shared/types/inbox'

// ============================================================================
// Merged Posts List (shown on canonical posts)
// ============================================================================

interface MergedPostsListProps {
  postId: PostId
  mergedPosts?: MergedPostItem[]
}

export function MergedPostsList({ postId, mergedPosts: initialMergedPosts }: MergedPostsListProps) {
  const queryClient = useQueryClient()
  const unmerge = useUnmergePost()
  const [confirmUnmergeId, setConfirmUnmergeId] = useState<PostId | null>(null)

  const { data: mergedPosts } = useQuery({
    queryKey: ['merged-posts', postId],
    queryFn: async () => {
      const result = await getMergedPostsFn({ data: { canonicalPostId: postId } })
      return result as MergedPostItem[]
    },
    initialData: initialMergedPosts,
    staleTime: 30_000,
  })
  const confirmTarget = mergedPosts?.find((p) => p.id === confirmUnmergeId)

  if (!mergedPosts || mergedPosts.length === 0) return null

  const handleUnmerge = async () => {
    if (!confirmUnmergeId) return
    try {
      await unmerge.mutateAsync(confirmUnmergeId)
      queryClient.invalidateQueries({ queryKey: ['merged-posts', postId] })
      toast.success('帖子已取消合并')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '取消合并帖子失败')
    } finally {
      setConfirmUnmergeId(null)
    }
  }

  return (
    <div className="border-t border-border/40 px-6 py-4">
      <h3 className="text-sm font-medium text-foreground mb-3">
        已合并的反馈（{mergedPosts.length}）
      </h3>
      <div className="space-y-2">
        {mergedPosts.map((merged) => (
          <div
            key={merged.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{merged.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {merged.voteCount} 票{merged.authorName ? ` · 来自 ${merged.authorName}` : ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmUnmergeId(merged.id)}
              disabled={unmerge.isPending}
              className="shrink-0"
            >
              取消合并
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!confirmUnmergeId}
        onOpenChange={(open) => !open && setConfirmUnmergeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消合并此帖子？</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget ? (
                <>
                  <span className="font-medium text-foreground">{confirmTarget.title}</span>{' '}
                  将恢复为独立反馈，其票数不再计入此帖子。
                </>
              ) : (
                '此帖子将恢复为独立反馈。'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unmerge.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnmerge} disabled={unmerge.isPending}>
              {unmerge.isPending ? '正在取消合并…' : '取消合并'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================================
// Merge Into Dialog (shown when admin wants to merge current post into another)
// ============================================================================

interface MergeIntoDialogProps {
  postId: PostId
  postTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MergeIntoDialog({ postId, postTitle, open, onOpenChange }: MergeIntoDialogProps) {
  const [searchQuery, setSearchQuery] = useState(postTitle)
  const [confirmTarget, setConfirmTarget] = useState<SimilarPost | null>(null)
  const [mergingId, setMergingId] = useState<string | null>(null)
  const merge = useMergePost()
  const queryClient = useQueryClient()

  // Reset search when dialog opens with current post title
  useEffect(() => {
    if (open) {
      setSearchQuery(postTitle)
      setConfirmTarget(null)
    }
  }, [open, postTitle])

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['merge-suggestions', 'search-into', postId, searchQuery],
    queryFn: async () => {
      const result = await findSimilarPostsFn({ data: { title: searchQuery, limit: 8 } })
      return result.filter((p) => p.id !== postId)
    },
    enabled: open && searchQuery.length >= 3,
    staleTime: 30_000,
  })

  const handleMerge = async () => {
    if (!confirmTarget) return
    setMergingId(confirmTarget.id)
    try {
      await merge.mutateAsync({
        duplicatePostId: postId,
        canonicalPostId: confirmTarget.id as PostId,
      })
      queryClient.invalidateQueries({ queryKey: ['merged-posts'] })
      toast.success('帖子已合并')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '合并帖子失败')
    } finally {
      setMergingId(null)
      setConfirmTarget(null)
    }
  }

  return (
    <>
      <Dialog open={open && !confirmTarget} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base">合并到其他帖子</DialogTitle>
            <DialogDescription>选择要合并此反馈的目标帖子。</DialogDescription>
          </DialogHeader>

          <div className="px-5 pb-3">
            <Input
              type="text"
              placeholder="搜索相似反馈…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="min-h-[200px] max-h-[400px] overflow-y-auto border-t border-border/50">
            {isLoading && searchQuery.length >= 3 && (
              <p className="text-sm text-muted-foreground py-6 text-center">搜索中…</p>
            )}

            {suggestions && suggestions.length > 0 && (
              <div className="divide-y divide-border/50">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => setConfirmTarget(suggestion)}
                    disabled={merge.isPending}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    {/* Vote count column - matches PostCard style */}
                    <div className="flex flex-col items-center justify-center shrink-0 w-11 py-1.5 rounded-lg border text-muted-foreground bg-muted/40 border-border/50">
                      <ChevronUpIcon className="h-4 w-4" />
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {suggestion.voteCount}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {suggestion.status && (
                          <StatusBadge
                            name={suggestion.status.name}
                            color={suggestion.status.color}
                          />
                        )}
                        <h3 className="font-medium text-sm text-foreground line-clamp-1 flex-1">
                          {suggestion.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-muted-foreground/60">
                          {suggestion.matchStrength === 'strong'
                            ? '高度匹配'
                            : suggestion.matchStrength === 'good'
                              ? '较匹配'
                              : '可能匹配'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {suggestions && suggestions.length === 0 && searchQuery.length >= 3 && !isLoading && (
              <p className="text-sm text-muted-foreground py-6 text-center">未找到相似反馈。</p>
            )}

            {searchQuery.length < 3 && !isLoading && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                至少输入 3 个字符开始搜索。
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge confirmation dialog */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>合并此帖子？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>此帖子将合并到所选帖子，票数会合并计算。</p>
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm overflow-hidden">
                  <span className="truncate flex-1 min-w-0 font-medium text-foreground">
                    {postTitle}
                  </span>
                  <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 min-w-0 font-medium text-foreground">
                    {confirmTarget?.title}
                  </span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merge.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleMerge} disabled={merge.isPending}>
              {mergingId ? '正在合并…' : '合并'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// Merge Others Dialog (merge other posts INTO the current one)
// ============================================================================

interface MergeOthersDialogProps {
  postId: PostId
  postTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MergeOthersDialog({
  postId,
  postTitle,
  open,
  onOpenChange,
}: MergeOthersDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isMerging, setIsMerging] = useState(false)
  const merge = useMergePost()
  const queryClient = useQueryClient()

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearchQuery('')
      setSelectedIds(new Set())
    }
  }, [open])

  // AI-suggested duplicates
  const { data: aiSuggestions } = useQuery({
    ...mergeSuggestionQueries.forPost(postId),
    enabled: open,
  })

  // Manual search results
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['merge-suggestions', 'search-others', postId, searchQuery],
    queryFn: async () => {
      const result = await findSimilarPostsFn({ data: { title: searchQuery, limit: 8 } })
      return result.filter((p) => p.id !== postId)
    },
    enabled: open && searchQuery.length >= 3,
    staleTime: 30_000,
  })

  // Build AI suggestion post list (deduplicated against search results)
  const aiPosts: Array<{
    id: string
    title: string
    voteCount: number
    status: { name: string; color: string } | null
    reasoning?: string
  }> = (aiSuggestions ?? [])
    .filter((suggestion) => suggestion.targetPostId === postId)
    .map((suggestion) => ({
      id: suggestion.sourcePostId,
      title: suggestion.sourcePostTitle,
      voteCount: suggestion.sourcePostVoteCount,
      status: suggestion.sourcePostStatusName
        ? {
            name: suggestion.sourcePostStatusName,
            color: suggestion.sourcePostStatusColor ?? '',
          }
        : null,
      reasoning: suggestion.llmReasoning ?? undefined,
    }))

  // Filter out AI-suggested IDs from search results to avoid duplication
  const aiPostIds = new Set(aiPosts.map((p) => p.id))
  const filteredSearchResults = searchResults?.filter((p) => !aiPostIds.has(p.id))

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleMerge = async () => {
    if (selectedIds.size === 0) return
    setIsMerging(true)
    try {
      await Promise.all(
        [...selectedIds].map((duplicateId) =>
          merge.mutateAsync({
            duplicatePostId: duplicateId as PostId,
            canonicalPostId: postId,
          })
        )
      )
      queryClient.invalidateQueries({ queryKey: ['merged-posts'] })
      queryClient.invalidateQueries({ queryKey: inboxKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['merge-suggestions'] })
      toast.success(`已合并 ${selectedIds.size} 个帖子`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '合并帖子失败')
    } finally {
      setIsMerging(false)
    }
  }

  const hasAiSuggestions = aiPosts.length > 0
  const hasSearchResults = filteredSearchResults && filteredSearchResults.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">合并到此帖子</DialogTitle>
          <DialogDescription>
            选择要合并到“{postTitle}”的帖子。票数和评论会合并计算。
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3">
          <Input
            type="text"
            placeholder="搜索相似反馈…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="min-h-[200px] max-h-[400px] overflow-y-auto border-t border-border/50">
          {/* AI Suggested section */}
          {hasAiSuggestions && (
            <>
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider bg-muted/20">
                AI 推荐
              </div>
              <div className="divide-y divide-border/50">
                {aiPosts.map((post) => (
                  <MergeOthersRow
                    key={post.id}
                    title={post.title}
                    voteCount={post.voteCount}
                    status={post.status}
                    subtitle={post.reasoning}
                    selected={selectedIds.has(post.id)}
                    disabled={isMerging}
                    onToggle={() => toggleSelection(post.id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Search results section */}
          {isLoading && searchQuery.length >= 3 && (
            <p className="text-sm text-muted-foreground py-6 text-center">搜索中…</p>
          )}

          {hasSearchResults && (
            <>
              {(hasAiSuggestions || searchQuery.length >= 3) && (
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider bg-muted/20">
                  搜索结果
                </div>
              )}
              <div className="divide-y divide-border/50">
                {filteredSearchResults.map((post) => (
                  <MergeOthersRow
                    key={post.id}
                    title={post.title}
                    voteCount={post.voteCount}
                    status={post.status}
                    subtitle={
                      post.matchStrength === 'strong'
                        ? '高度匹配'
                        : post.matchStrength === 'good'
                          ? '较匹配'
                          : '可能匹配'
                    }
                    selected={selectedIds.has(post.id)}
                    disabled={isMerging}
                    onToggle={() => toggleSelection(post.id)}
                  />
                ))}
              </div>
            </>
          )}

          {!hasAiSuggestions && !hasSearchResults && searchQuery.length >= 3 && !isLoading && (
            <p className="text-sm text-muted-foreground py-6 text-center">未找到相似反馈。</p>
          )}

          {!hasAiSuggestions && searchQuery.length < 3 && !isLoading && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              至少输入 3 个字符开始搜索。
            </p>
          )}
        </div>

        {/* Footer with merge button */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            取消
          </Button>
          <Button size="sm" onClick={handleMerge} disabled={selectedIds.size === 0 || isMerging}>
            {isMerging
              ? '正在合并…'
              : selectedIds.size === 0
                ? '选择要合并的帖子'
                : `合并 ${selectedIds.size} 个帖子`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Shared row component for MergeOthersDialog results */
function MergeOthersRow({
  title,
  voteCount,
  status,
  subtitle,
  selected,
  disabled,
  onToggle,
}: {
  title: string
  voteCount: number
  status: { name: string; color: string } | null
  subtitle?: string
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
    >
      <Checkbox checked={selected} className="shrink-0" tabIndex={-1} />

      <div className="flex flex-col items-center justify-center shrink-0 w-11 py-1.5 rounded-lg border text-muted-foreground bg-muted/40 border-border/50">
        <ChevronUpIcon className="h-4 w-4" />
        <span className="text-sm font-semibold tabular-nums text-foreground">{voteCount}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {status && <StatusBadge name={status.name} color={status.color} />}
          <h3 className="font-medium text-sm text-foreground line-clamp-1 flex-1">{title}</h3>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground/60 line-clamp-1">{subtitle}</p>}
      </div>
    </button>
  )
}

// ============================================================================
// Merge Info Banner (shown on posts that have been merged into another)
// ============================================================================

interface MergeInfoBannerProps {
  mergeInfo: {
    canonicalPostId: string
    canonicalPostTitle: string
    canonicalPostBoardSlug: string
    mergedAt: Date | string
  }
  onNavigateToPost?: (postId: string) => void
}

export function MergeInfoBanner({ mergeInfo, onNavigateToPost }: MergeInfoBannerProps) {
  return (
    <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
      <p className="text-sm text-amber-800 dark:text-amber-200">
        此反馈已合并到{' '}
        <button
          type="button"
          onClick={() => onNavigateToPost?.(mergeInfo.canonicalPostId)}
          className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
        >
          {mergeInfo.canonicalPostTitle}
        </button>
      </p>
    </div>
  )
}

// ============================================================================
// Merge Actions Button (triggers the merge dialog)
// ============================================================================

interface MergeActionsProps {
  postId: PostId
  postTitle: string
  canonicalPostId?: PostId | null
  mergedPosts?: MergedPostItem[]
  /** Controlled dialog state (optional — falls back to internal state) */
  showDialog?: boolean
  onShowDialogChange?: (show: boolean) => void
}

export function MergeActions({
  postId,
  postTitle,
  canonicalPostId,
  mergedPosts,
  showDialog,
  onShowDialogChange,
}: MergeActionsProps) {
  const [internalShowDialog, setInternalShowDialog] = useState(false)
  const isDialogOpen = showDialog ?? internalShowDialog
  const setDialogOpen = onShowDialogChange ?? setInternalShowDialog

  const hasMergedPosts = mergedPosts && mergedPosts.length > 0

  return (
    <>
      {hasMergedPosts && <MergedPostsList postId={postId} mergedPosts={mergedPosts} />}

      {!canonicalPostId && (
        <MergeIntoDialog
          postId={postId}
          postTitle={postTitle}
          open={isDialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </>
  )
}
