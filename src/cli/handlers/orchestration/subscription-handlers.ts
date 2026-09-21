import type { CommandHandler } from '../../dispatch'
import { printResult } from '../../format'
import {
  TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY,
  type TerminalMailboxSubscriptionStatus
} from '../../../shared/terminal-mailbox-subscription'
import { callOrchestrationMutation } from './mutation-request'

const verbs = {
  'orchestration subscribe': 'orchestration.subscribe',
  'orchestration unsubscribe': 'orchestration.unsubscribe',
  'orchestration subscription status': 'orchestration.subscriptionStatus'
}

const mutations = new Set(['orchestration.subscribe', 'orchestration.unsubscribe'])

export const ORCHESTRATION_SUBSCRIPTION_HANDLERS: Record<string, CommandHandler> =
  Object.fromEntries(
    Object.entries(verbs).map(([command, method]) => [
      command,
      (async ({ client, flags, json }) => {
        const status = await client.call<{ capabilities?: string[] }>('status.get', {})
        const result = status.result.capabilities?.includes(
          TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY
        )
          ? await (mutations.has(method)
              ? callOrchestrationMutation<TerminalMailboxSubscriptionStatus>(
                  client,
                  flags,
                  method,
                  {}
                )
              : client.call<TerminalMailboxSubscriptionStatus>(method, {}))
          : {
              ...status,
              result: {
                subscribed: false,
                state: 'unsubscribed' as const,
                wake: 'unsupported' as const,
                reason: 'host_capability_missing',
                messageIds: [],
                createdAt: null,
                submitPolicy: 'recognized_non_cursor' as const
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
