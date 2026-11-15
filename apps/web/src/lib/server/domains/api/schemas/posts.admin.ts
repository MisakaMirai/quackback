/**
 * Post activity, merge and merge-suggestion API Schema Registrations
 */
import 'zod-openapi'
import { z } from 'zod'
import {
  registerPath,
  TypeIdSchema,
  createItemResponseSchema,
  createRequestBodySchema,
  asSchema,
} from '../openapi'
import { TimestampSchema } from './common'
import { errorResponses } from './errors'

const ActivitySchema = z.object({
  id: TypeIdSchema,
  postId: TypeIdSchema.meta({ example: 'post_01h455vb4pex5vsknk084sn02q' }),
  principalId: TypeIdSchema.nullable().meta({ description: 'Who acted, null for system events' }),
  actorName: z.string().nullable(),
  type: z.string().meta({ description: 'Activity type', example: 'status.changed' }),
  metadata: z
    .record(z.string(), z.unknown())
    .meta({ description: 'Event details, shape depends on the type' }),
  createdAt: TimestampSchema,
})

const MergeBodySchema = createRequestBodySchema({
  canonicalPostId: TypeIdSchema.meta({
    description: 'The post that survives. Votes and comments move onto it.',
  }),
})

const MergeResultSchema = z.object({
  canonicalPost: z.object({ id: TypeIdSchema, voteCount: z.number().int() }),
  duplicatePost: z.object({ id: TypeIdSchema }),
})

const postIdParam = {
  name: 'postId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Post ID',
} as const

registerPath('/posts/{postId}/activity', {
  get: {
    tags: ['Posts'],
    summary: 'Get post activity',
    description:
      'Returns the 200 most recent activity entries for a post, newest first. Requires the post.view_private permission.',
    parameters: [postIdParam],
    responses: {
      200: {
        description: 'Activity log',
        content: { 'application/json': { schema: z.object({ data: z.array(ActivitySchema) }) } },
      },
      ...errorResponses(400, 403, 404),
    },
  },
})

registerPath('/posts/{postId}/merge', {
  post: {
    tags: ['Posts'],
    summary: 'Merge a duplicate post',
    description:
      'Merges this post (the duplicate) into a canonical post. Requires the post.merge permission.',
    parameters: [postIdParam],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: asSchema(MergeBodySchema) } },
    },
    responses: {
      200: {
        description: 'Posts merged',
        content: {
          'application/json': {
            schema: createItemResponseSchema(MergeResultSchema, 'Merge result'),
          },
        },
      },
      ...errorResponses(400, 403, 404, 409),
    },
  },
})
