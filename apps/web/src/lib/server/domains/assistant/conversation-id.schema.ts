/** Quackback AI removal shim. */
import { z } from 'zod'

export const conversationIdSchema = z.string().min(1)
