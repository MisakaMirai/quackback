/** Quackback AI removal shim. */
export async function suggestTicketFieldValues(
  _conversationId: string,
  _ticketTypeId: string
): Promise<{ unavailable: boolean; suggestions: Record<string, string> }> {
  return { unavailable: true, suggestions: {} }
}
