/** Quackback AI removal shim. */
export async function autoTagPost(
  _postId: string,
  _title?: string,
  _content?: string
): Promise<void> {}

export async function reevaluateAiTag(_tagId: string) {
  return { updated: 0 }
}

export async function backfillAiTagsForBoard(_boardId: string) {
  return { updated: 0, hasMore: false }
}
