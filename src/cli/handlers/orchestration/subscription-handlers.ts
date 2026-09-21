import type { CommandHandler } from '../../dispatch'
import { printResult } from '../../format'
import {
  TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY,
  type TerminalMailboxSubscriptionStatus
} from '../../../shared/terminal-mailbox-subscription'

const verbs = {
  'orchestration subscribe': 'orchestration.subscribe',
  'orchestration unsubscribe': 'orchestration.unsubscribe',
  'orchestration subscription status': 'orchestration.subscriptionStatus'
}

export const ORCHESTRATION_SUBSCRIPTION_HANDLERS: Record<string, CommandHandler> =
  Object.fromEntries(
    Object.entries(verbs).map(([command, method]) => [
      command,
      (async ({ client, json }) => {
        const status = await client.call<{ capabilities?: string[] }>('status.get', {})
        const result = status.result.capabilities?.includes(
          TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY
        )
          ? await client.call<TerminalMailboxSubscriptionStatus>(method, {})
          : {
              ...status,
              result: {
                subscribed: false,
                wake: 'unsupported' as const,
                reason: 'host_capability_missing',
                messageIds: []
              }
            }
        printResult(
          result,
          json,
          (value) =>
            `${value.subscribed ? 'Subscribed' : 'Not subscribed'}: ${value.wake} (${value.reason})`
        )
      }) satisfies CommandHandler
    ])
  )
