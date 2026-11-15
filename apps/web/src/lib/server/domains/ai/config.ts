/** Quackback AI removal shim. */
export function isAiClientConfigured(): boolean {
  return false
}

export function getOpenAI(): never {
  throw new Error('Quackback AI is not available')
}

export function validateAiConfig(): void {}
