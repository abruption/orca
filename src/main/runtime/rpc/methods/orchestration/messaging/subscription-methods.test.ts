import { describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_SUBSCRIPTION_METHODS } from './subscription-methods'
import { TerminalSubscriptionParams } from '../../../../../../shared/rpc-contract/terminal-subscription-params'
import { OrcaRuntimeService } from '../../../../orca-runtime'

describe('subscription RPC identity boundary', () => {
  it('rejects arbitrary target parameters', () => {
    expect(TerminalSubscriptionParams.safeParse({ terminal: 'term_other' }).success).toBe(false)
  })
  it.each(['subscribe', 'unsubscribe', 'status'])(
    'forwards only verified envelope evidence for %s',
    (action) => {
      const method =
        ORCHESTRATION_SUBSCRIPTION_METHODS[
          action === 'subscribe' ? 0 : action === 'unsubscribe' ? 1 : 2
        ]
      const evidence = { terminalHandle: 'term_self', paneKey: 'tab:leaf', launchToken: 'secret' }
      const receipt = { subscribed: action === 'subscribe' }
      const terminalMailboxSubscription = vi.fn().mockReturnValue(receipt)
      const recordMutationReceipt = vi.fn()
      method.handler(
        {},
        {
          runtime: Object.assign(new OrcaRuntimeService(), { terminalMailboxSubscription }),
          orchestrationCompatibilityEvidence: evidence,
          recordMutationReceipt
        }
      )
      expect(terminalMailboxSubscription).toHaveBeenCalledWith(action, evidence)
      if (action === 'status') {
        expect(recordMutationReceipt).not.toHaveBeenCalled()
      } else {
        expect(recordMutationReceipt).toHaveBeenCalledWith(receipt)
      }
    }
  )
})
