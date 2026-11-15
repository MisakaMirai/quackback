/** Quackback AI removal shim: no embeddings are generated. */
export async function generateEmbedding(_text: string): Promise<number[] | null> {
  return null
}

export async function generatePostEmbedding(
  _postId: string,
  _title: string,
  _content: string
): Promise<void> {}

export async function generateArticleEmbedding(
  _articleId: string,
  _title: string,
  _content: string,
  _category?: string
): Promise<void> {}

export async function generateChangelogEmbedding(
  _entryId: string,
  _title: string,
  _content: string
): Promise<void> {}
