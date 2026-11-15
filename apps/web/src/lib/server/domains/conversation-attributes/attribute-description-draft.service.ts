/** Quackback AI removal shim. */
export async function draftAttributeDescriptions(_input: unknown) {
  return { attributeDescription: '', options: [] as { label: string; description: string }[] }
}
