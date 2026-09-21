import type { OrchestrationMailboxPointerSubmitTarget } from './mailbox-pointer-submit'
import type {
  TerminalMailboxSubscriptionStatus,
  TerminalMailboxWake
} from '../../../shared/terminal-mailbox-subscription'

export function isTerminalMailbox(handle: string): boolean {
  return /^term_[a-zA-Z0-9_-]+$/.test(handle)
}

type Subscription = {
  generation: number
  ptyId: string | null | undefined
  identity: string
  validate: () => boolean
  status: TerminalMailboxSubscriptionStatus
}

/** Registrations belong to this runtime; no authority is restored after restart. */
export class TerminalMailboxSubscriptions {
  private nextGeneration = 0
  private readonly entries = new Map<string, Subscription>()

  private identity(target: OrchestrationMailboxPointerSubmitTarget): string {
    return JSON.stringify([
      target.terminalHandle,
      target.leaf.tabId,
      target.leaf.leafId,
      target.leaf.ptyId,
      target.processIncarnation
    ])
  }

  register(target: OrchestrationMailboxPointerSubmitTarget, validate: () => boolean): void {
    const handle = target.terminalHandle
    const identity = this.identity(target)
    const existing = this.entries.get(handle)
    if (existing?.identity === identity && existing.validate()) {
      return
    }
    this.entries.set(handle, {
      generation: ++this.nextGeneration,
      ptyId: target.leaf.ptyId,
      identity,
      validate,
      status: {
        subscribed: true,
        wake: 'deferred',
        reason: 'awaiting_mail_or_idle',
        messageIds: []
      }
    })
  }

  generation(handle: string): number | undefined {
    return this.entries.get(handle)?.generation
  }

  hasPty(ptyId: string): boolean {
    return [...this.entries.values()].some((entry) => entry.ptyId === ptyId)
  }

  retirePty(ptyId: string): void {
    for (const [handle, entry] of this.entries) {
      if (entry.ptyId === ptyId) {
        this.entries.delete(handle)
      }
    }
  }

  remove(handle: string): void {
    this.entries.delete(handle)
  }

  matches(handle: string, target: OrchestrationMailboxPointerSubmitTarget): boolean {
    const entry = this.entries.get(handle)
    if (!entry) {
      return false
    }
    if (entry.identity !== this.identity(target) || !entry.validate()) {
      this.entries.delete(handle)
      return false
    }
    return true
  }

  record(
    handle: string,
    wake: TerminalMailboxWake,
    reason: string,
    messageIds: string[],
    generation?: number
  ): void {
    const entry = this.entries.get(handle)
    if (entry && (generation === undefined || entry.generation === generation)) {
      entry.status = { subscribed: true, wake, reason, messageIds: [...messageIds] }
    }
  }

  status(handle: string): TerminalMailboxSubscriptionStatus {
    const entry = this.entries.get(handle)
    if (entry && !entry.validate()) {
      this.entries.delete(handle)
    }
    const current = this.entries.get(handle)
    return current
      ? { ...current.status, messageIds: [...current.status.messageIds] }
      : { subscribed: false, wake: 'unsupported', reason: 'not_subscribed', messageIds: [] }
  }
}
