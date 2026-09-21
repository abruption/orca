import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeWithStopRequestedPtyIds } from './orca-runtime-stop-requested-pty-ids'
import { OrcaRuntimeService } from './orca-runtime'
import { TerminalMailboxSubscriptions } from './orchestration/terminal-mailbox-subscriptions'

const method = OrcaRuntimeWithStopRequestedPtyIds.prototype.terminalMailboxSubscription
function fixture() {
  const leaf = {
    tabId: 'tab',
    leafId: 'leaf',
    ptyId: 'pty',
    writable: true,
    lastAgentStatus: 'idle',
    lastAgentStatusObservedLive: true
  }
  const authority = {
    terminalHandle: 'term_self',
    paneKey: 'tab:leaf',
    processIncarnation: 'inc',
    hostScope: { kind: 'local', hostId: 'local' }
  }
  const runtime = {
    verifyOrchestrationCompatibilityCaller: vi.fn().mockReturnValue(authority),
    getLiveLeafForHandle: vi.fn().mockReturnValue({ leaf }),
    resolveOrchestrationPointerSubmitTarget: vi
      .fn()
      .mockReturnValue({ leaf, terminalHandle: 'term_self', processIncarnation: 'inc' }),
    orchestrationMailboxOwner: { resolve: vi.fn().mockReturnValue('term_self') },
    terminalMailboxSubscriptions: new TerminalMailboxSubscriptions(),
    deliverPendingMessagesForHandle: vi.fn()
  }
  const invoke = (action: 'subscribe' | 'unsubscribe' | 'status') =>
    method.call(Object.assign(new OrcaRuntimeService(), runtime), action, {
      terminalHandle: 'term_self',
      paneKey: 'tab:leaf',
      launchToken: 'proof'
    })
  return { runtime, invoke, authority }
}

describe('receiver launch authority', () => {
  it('refuses an unverified caller before registering or writing', () => {
    const f = fixture()
    f.runtime.verifyOrchestrationCompatibilityCaller.mockReturnValue(null)
    expect(() => f.invoke('subscribe')).toThrow('verified current terminal launch')
    expect(f.runtime.deliverPendingMessagesForHandle).not.toHaveBeenCalled()
  })
  it('refuses Run/Dispatch ownership', () => {
    const f = fixture()
    f.runtime.orchestrationMailboxOwner.resolve.mockReturnValue('run:other')
    expect(() => f.invoke('subscribe')).toThrow('bare terminal')
  })
  it('registers self and immediately offers existing mail', () => {
    const f = fixture()
    expect(f.invoke('subscribe').subscribed).toBe(true)
    expect(f.runtime.verifyOrchestrationCompatibilityCaller).toHaveBeenCalledWith(
      expect.objectContaining({ launchToken: 'proof' }),
      { currentRuntimeLaunchSufficient: true }
    )
    expect(f.runtime.deliverPendingMessagesForHandle).toHaveBeenCalledWith('term_self')
    expect(f.invoke('unsubscribe').subscribed).toBe(false)
  })
  it('invalidates stored authority when SSH attachment proof is no longer verifiable', () => {
    const f = fixture()
    f.invoke('subscribe')
    f.runtime.verifyOrchestrationCompatibilityCaller.mockReturnValue(null)
    expect(f.runtime.terminalMailboxSubscriptions.status('term_self').subscribed).toBe(false)
  })
})
