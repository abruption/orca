import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalMailboxSubscriptions } from './terminal-mailbox-subscriptions'
import { OrchestrationDb } from './db'
import { OrchestrationMailboxPointerDelivery } from './mailbox-pointer-delivery'
import {
  WRITE_ACCEPTED,
  writeUnverifiable,
  type WriteSettlement
} from '../../../shared/pty-write-settlement'
import type { OrchestrationMailboxLeaf } from './mailbox-owner'

function fixture() {
  const db = new OrchestrationDb(':memory:')
  const leaf: OrchestrationMailboxLeaf = {
    tabId: 'tab-1',
    leafId: 'leaf-1',
    ptyId: 'pty-1',
    writable: true,
    lastAgentStatus: 'idle',
    lastAgentStatusObservedLive: true,
    lastOscTitle: null
  }
  let incarnation = 'inc-1'
  let authority = true
  let settled = true
  const registry = new TerminalMailboxSubscriptions()
  const target = () => ({ leaf, terminalHandle: 'term_recipient', processIncarnation: incarnation })
  const write = vi.fn((_pty: string, _data: string): WriteSettlement => WRITE_ACCEPTED)
  const deps = {
    terminalSubscriptions: registry,
    mailboxOwner: { resolve: () => 'term_recipient' },
    deliveryTarget: {
      resolveTerminalHandle: () => 'term_recipient',
      deferForAbsenceProbe: () => false
    },
    getDb: () => db,
    getLeaf: () => leaf,
    getLeafKey: () => 'tab-1:leaf-1',
    getLiveLeafForHandle: () => leaf,
    isAgentSettledForDelivery: () => settled,
    getMessageWaiters: () => undefined,
    getTabTitle: () => null,
    getCliCommand: () => 'orca' as const,
    getTerminalHandleForLeafKey: () => 'term_recipient',
    resolveSubmitTarget: target,
    isLeafPtyProvenAbsent: async () => false,
    redriveMailbox: vi.fn(),
    writePty: write
  }
  const delivery = new OrchestrationMailboxPointerDelivery(deps)
  const subscribe = () => {
    const current = incarnation
    registry.register(target(), () => authority && current === incarnation)
  }
  const mail = () =>
    db.insertMessage({
      runId: 'run_legacy_local',
      from: 'sender',
      to: 'term_recipient',
      subject: 'test',
      body: 'DO_NOT_INJECT_BODY'
    })
  return {
    db,
    leaf,
    registry,
    delivery,
    write,
    mail,
    subscribe,
    target,
    replace: () => {
      incarnation = 'inc-2'
    },
    revoke: () => {
      authority = false
    },
    setSettled: (value: boolean) => {
      settled = value
    }
  }
}

describe('bare terminal subscriptions', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps unsubscribed mail durable without writing', () => {
    const f = fixture()
    const message = f.mail()
    f.delivery.deliverForHandle('term_recipient')
    expect(f.write).not.toHaveBeenCalled()
    expect(f.db.getMessageById(message.id)?.read).toBe(0)
    f.db.close()
  })

  it('submits only a pointer and preserves unread', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.subscribe()
    const message = f.mail()
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    expect(f.write.mock.calls.map((call) => call[1])).toEqual([
      expect.stringContaining('orchestration inbox --terminal term_recipient --full'),
      '\r'
    ])
    expect(f.write.mock.calls[0][1]).not.toContain('DO_NOT_INJECT_BODY')
    expect(f.registry.status('term_recipient').wake).toBe('submitted')
    expect(f.db.getMessageById(message.id)?.read).toBe(0)
    f.db.close()
  })

  it.each(['unsubscribe', 'replace', 'revoke', 'reregister'] as const)(
    'fences delayed Enter on %s',
    async (action) => {
      vi.useFakeTimers()
      const f = fixture()
      f.subscribe()
      f.mail()
      f.delivery.deliverForHandle('term_recipient')
      if (action === 'unsubscribe' || action === 'reregister') {
        f.registry.remove('term_recipient')
      }
      if (action === 'reregister') {
        f.subscribe()
      }
      if (action === 'replace') {
        f.replace()
      }
      if (action === 'revoke') {
        f.revoke()
      }
      await vi.advanceTimersByTimeAsync(600)
      expect(f.write).toHaveBeenCalledTimes(1)
      f.db.close()
    }
  )

  it('defers Enter when working and submits once on idle', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.subscribe()
    f.mail()
    f.delivery.deliverForHandle('term_recipient')
    f.leaf.lastAgentStatus = 'working'
    await vi.advanceTimersByTimeAsync(600)
    expect(f.write).toHaveBeenCalledTimes(1)
    f.leaf.lastAgentStatus = 'idle'
    f.delivery.observeAgentIdle('pty-1')
    await vi.advanceTimersByTimeAsync(1)
    expect(f.write).toHaveBeenCalledTimes(2)
    f.db.close()
  })

  it('does not write through permission/settled refusal', () => {
    const f = fixture()
    f.subscribe()
    f.mail()
    f.setSettled(false)
    f.delivery.deliverForHandle('term_recipient')
    expect(f.write).not.toHaveBeenCalled()
    f.db.close()
  })

  it('does not automatically retry ambiguous pointer writes', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.subscribe()
    f.mail()
    f.write.mockReturnValue(writeUnverifiable('provider_threw_after_handoff', true))
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    f.delivery.deliverForHandle('term_recipient')
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(f.registry.status('term_recipient').wake).toBe('unverifiable')
    f.db.close()
  })

  it('preserves Cursor no-auto-Enter', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.leaf.lastOscTitle = 'Cursor Agent'
    f.subscribe()
    f.mail()
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(f.registry.status('term_recipient').reason).toBe('manual_submit_required')
    f.db.close()
  })

  it('coalesces a burst without consuming either message', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.subscribe()
    const first = f.mail()
    const second = f.mail()
    f.delivery.deliverForHandle('term_recipient')
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    expect(f.write).toHaveBeenCalledTimes(2)
    expect(f.db.getMessageById(first.id)?.read).toBe(0)
    expect(f.db.getMessageById(second.id)?.read).toBe(0)
    f.db.close()
  })

  it('keeps an ambiguous Enter fenced across idle edges', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.subscribe()
    f.mail()
    f.write
      .mockReturnValueOnce(WRITE_ACCEPTED)
      .mockReturnValue(writeUnverifiable('provider_threw_after_handoff', true))
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    f.delivery.observeAgentWorking('pty-1')
    f.delivery.observeAgentIdle('pty-1')
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    expect(f.write).toHaveBeenCalledTimes(2)
    expect(f.registry.status('term_recipient').wake).toBe('unverifiable')
    f.db.close()
  })

  it('requires re-registration after process replacement and allows later mail', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.subscribe()
    f.mail()
    f.write.mockReturnValueOnce(writeUnverifiable('provider_threw_after_handoff', true))
    f.delivery.deliverForHandle('term_recipient')
    f.replace()
    f.delivery.deliverForHandle('term_recipient')
    expect(f.write).toHaveBeenCalledTimes(1)
    f.subscribe()
    f.mail()
    f.delivery.deliverForHandle('term_recipient')
    await vi.advanceTimersByTimeAsync(600)
    expect(f.write).toHaveBeenCalledTimes(3)
    f.db.close()
  })

  it('does not restore registrations after runtime restart or PTY exit', () => {
    const f = fixture()
    f.subscribe()
    expect(new TerminalMailboxSubscriptions().status('term_recipient').subscribed).toBe(false)
    f.delivery.retirePty('pty-1')
    expect(f.registry.status('term_recipient').subscribed).toBe(false)
    f.db.close()
  })

  it('makes same-identity registration idempotent and rejects changed authority', () => {
    const f = fixture()
    f.subscribe()
    const generation = f.registry.generation('term_recipient')
    f.subscribe()
    expect(f.registry.generation('term_recipient')).toBe(generation)
    f.revoke()
    expect(f.registry.status('term_recipient').subscribed).toBe(false)
    f.db.close()
  })
})
