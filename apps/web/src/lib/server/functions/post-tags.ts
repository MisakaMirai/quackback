/**
 * Server functions for tag operations
 */

import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import type { PostTagId } from '@quackback/ids'
import { requireAuth } from './auth-helpers'
import { PERMISSIONS } from '@/lib/shared/permissions'
import {
  EntityIdSchema,
  HexColorWithDefaultSchema,
  OptionalHexColorPatternSchema,
  TaxonomyNameSchema,
} from '@/lib/shared/schemas/taxonomy'
import {
  listPostTags,
  getTagById,
  createPostTag,
  updatePostTag,
  deletePostTag,
} from '@/lib/server/domains/post-tags/post-tag.service'
import { logger } from '@/lib/server/logger'

const log = logger.child({ component: 'tags' })

// ============================================
// Schemas
// ============================================

const createTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  color: HexColorWithDefaultSchema,
  description: z.string().max(200).optional(),
  isPublic: z.boolean().optional(),
})

const getTagSchema = EntityIdSchema

const updateTagSchema = z.object({
  id: z.string(),
  name: TaxonomyNameSchema.optional(),
  color: OptionalHexColorPatternSchema,
  description: z.string().max(200).optional().nullable(),
  isPublic: z.boolean().optional(),
})

const deleteTagSchema = EntityIdSchema

// ============================================
// Type Exports
// ============================================

export type CreateTagInput = z.infer<typeof createTagSchema>
export type GetTagInput = z.infer<typeof getTagSchema>
export type UpdateTagInput = z.infer<typeof updateTagSchema>
export type DeleteTagInput = z.infer<typeof deleteTagSchema>

// ============================================
// Read Operations
// ============================================

/**
 * List all tags for the workspace
 */
export const fetchTags = createServerFn({ method: 'GET' }).handler(async () => {
  log.debug({}, 'fetch tags')
  await requireAuth({ permission: PERMISSIONS.TAG_VIEW })

  const tags = await listPostTags()
  log.debug({ count: tags.length }, 'fetch tags')
  return tags
})

/**
 * Get a single tag by ID
 */
export const fetchTag = createServerFn({ method: 'GET' })
  .validator(getTagSchema)
  .handler(async ({ data }) => {
    log.debug({ tag_id: data.id }, 'fetch tag')
    await requireAuth({ permission: PERMISSIONS.TAG_VIEW })

    const tag = await getTagById(data.id as PostTagId)
    log.debug({ found: !!tag }, 'fetch tag')
    return tag
  })

// ============================================
// Write Operations
// ============================================

/**
 * Create a new tag
 */
export const createPostTagFn = createServerFn({ method: 'POST' })
  .validator(createTagSchema)
  .handler(async ({ data }) => {
    log.debug({ name: data.name }, 'create tag')
    await requireAuth({ permission: PERMISSIONS.TAG_MANAGE })

    const tag = await createPostTag({
      name: data.name,
      color: data.color,
      description: data.description,
      isPublic: data.isPublic,
    })
    log.info({ tag_id: tag.id }, 'tag created')
    return tag
  })

/**
 * Update an existing tag
 */
export const updatePostTagFn = createServerFn({ method: 'POST' })
  .validator(updateTagSchema)
  .handler(async ({ data }) => {
    log.debug({ tag_id: data.id }, 'update tag')
    await requireAuth({ permission: PERMISSIONS.TAG_MANAGE })

    const tag = await updatePostTag(data.id as PostTagId, {
      name: data.name,
      color: data.color,
      description: data.description,
      isPublic: data.isPublic,
    })
    log.info({ tag_id: tag.id }, 'tag updated')

    return tag
  })

/**
 * Delete a tag
 */
export const deletePostTagFn = createServerFn({ method: 'POST' })
  .validator(deleteTagSchema)
  .handler(async ({ data }) => {
    log.debug({ tag_id: data.id }, 'delete tag')
    await requireAuth({ permission: PERMISSIONS.TAG_MANAGE })

    await deletePostTag(data.id as PostTagId)
    log.info({ tag_id: data.id }, 'tag deleted')
    return { id: data.id as PostTagId }
  })
