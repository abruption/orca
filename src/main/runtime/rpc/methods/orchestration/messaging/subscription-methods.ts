import { TerminalSubscriptionParams } from '../../../../../../shared/rpc-contract/terminal-subscription-params'
import { defineMethod } from '../../../core'

export const ORCHESTRATION_SUBSCRIPTION_METHODS = [
  defineMethod({
    name: 'orchestration.subscribe',
    params: TerminalSubscriptionParams,
    handler: (_params, { runtime, orchestrationCompatibilityEvidence }) =>
      runtime.terminalMailboxSubscription('subscribe', orchestrationCompatibilityEvidence)
  }),
  defineMethod({
    name: 'orchestration.unsubscribe',
    params: TerminalSubscriptionParams,
    handler: (_params, { runtime, orchestrationCompatibilityEvidence }) =>
      runtime.terminalMailboxSubscription('unsubscribe', orchestrationCompatibilityEvidence)
  }),
  defineMethod({
    name: 'orchestration.subscriptionStatus',
    params: TerminalSubscriptionParams,
    handler: (_params, { runtime, orchestrationCompatibilityEvidence }) =>
      runtime.terminalMailboxSubscription('status', orchestrationCompatibilityEvidence)
  })
]
