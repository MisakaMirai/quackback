/** Quackback AI removal shim. */
export async function hasPausedTranslations(): Promise<boolean> {
  return false
}

export async function runHelpCenterTranslateResume(): Promise<void> {}
