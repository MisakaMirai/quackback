/** Quackback AI removal shim. */
export async function previewAttributeDetection(_input: unknown) {
  return { optionId: null, optionLabel: null, reasoning: 'AI detection is unavailable.' }
}
