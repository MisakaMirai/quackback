/**
 * Legacy assistant-authored rows may still carry the old "Quinn" display name.
 * Render them under the product name; every human author passes through.
 */
export function displayAssistantName(name: string): string {
  return name === 'Quinn' ? 'Quackback AI' : name
}
