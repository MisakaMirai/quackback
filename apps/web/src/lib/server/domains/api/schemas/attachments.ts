/**
 * Attachment ref shared by the conversation and ticket write APIs.
 *
 * Mirrors the route-side validation in `routes/api/v1/-write-validation.ts` so
 * a client generated from the OpenAPI document cannot pass locally and then get
 * a 400 at the route: a stored file id (`file_…`) or a legacy trusted URL, and
 * at least one of the two.
 */
import 'zod-openapi'
import { z } from 'zod'

export const AttachmentRefSchema = z
  .object({
    fileId: z
      .string()
      .regex(/^file_/, 'fileId must be a file ID (starts with "file_")')
      .optional()
      .meta({
        description: 'Id returned by POST /files',
        example: 'file_01h455vb4pex5vsknk084sn02q',
      }),
    url: z.string().optional().meta({
      description: 'A trusted, already-stored URL; only used when fileId is omitted',
    }),
    name: z.string().optional().meta({ example: 'screenshot.png' }),
    contentType: z.string().optional().meta({ example: 'image/png' }),
    size: z
      .number()
      .optional()
      .meta({ description: 'Size in bytes; required only when fileId is omitted', example: 48213 }),
  })
  .refine((a) => !!a.fileId || !!a.url, {
    message: 'Provide either fileId (from POST /files) or url',
    path: ['fileId'],
  })
