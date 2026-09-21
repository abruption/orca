export const TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY = 'orchestration.terminal-subscription.v1'

export type TerminalMailboxWake = 'submitted' | 'deferred' | 'unsupported' | 'unverifiable'

export type TerminalMailboxSubscriptionStatus = {
  subscribed: boolean
  wake: TerminalMailboxWake
  reason: string
  messageIds: string[]
}
