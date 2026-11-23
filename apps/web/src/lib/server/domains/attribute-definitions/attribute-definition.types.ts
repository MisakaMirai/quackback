import type { UserAttributeType, CurrencyCode } from '@/lib/server/db'

/**
 * Shape of a user attribute definition row.
 */
export interface AttributeDefinitionRecord<TId extends string = string> {
  id: TId
  key: string
  label: string
  description: string | null
  type: UserAttributeType
  currencyCode: CurrencyCode | null
  /** External key for CDP/CRM mapping. Falls back to `key` if null. */
  externalKey: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateAttributeDefinitionInput {
  key: string
  label: string
  description?: string | null
  type: UserAttributeType
  currencyCode?: CurrencyCode | null
  externalKey?: string | null
}

export interface UpdateAttributeDefinitionInput {
  label?: string
  description?: string | null
  type?: UserAttributeType
  currencyCode?: CurrencyCode | null
  externalKey?: string | null
}
