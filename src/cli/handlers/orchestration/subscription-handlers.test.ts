import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_SUBSCRIPTION_HANDLERS } from './subscription-handlers'
import { TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY } from '../../../shared/terminal-mailbox-subscription'
import { RuntimeClient } from '../../runtime-client'

describe('terminal subscription CLI capability negotiation', () => {
  afterEach(() => vi.restoreAllMocks())
  it.each(Object.keys(ORCHESTRATION_SUBSCRIPTION_HANDLERS))(
    'does not mutate an old host: %s',
    async (command) => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const call = vi.fn().mockResolvedValue({
        id: 'r',
        ok: true,
        result: { capabilities: [] },
        _meta: { runtimeId: 'r' }
      })
      await ORCHESTRATION_SUBSCRIPTION_HANDLERS[command]({
        client: Object.assign(new RuntimeClient(), { call }),
        cwd: process.cwd(),
        flags: new Map(),
        json: true
      })
      expect(call).toHaveBeenCalledTimes(1)
      expect(call).toHaveBeenCalledWith('status.get', {})
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('host_capability_missing'))
    }
  )
  it('sends no caller-supplied recipient selector', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi
      .fn()
      .mockResolvedValueOnce({
        result: { capabilities: [TERMINAL_MAILBOX_SUBSCRIPTION_CAPABILITY] }
      })
      .mockResolvedValueOnce({
        result: {
          subscribed: true,
          wake: 'deferred',
          reason: 'awaiting_mail_or_idle',
          messageIds: []
        }
      })
    await ORCHESTRATION_SUBSCRIPTION_HANDLERS['orchestration subscribe']({
      client: Object.assign(new RuntimeClient(), { call }),
      cwd: process.cwd(),
      flags: new Map(),
      json: true
    })
    expect(call).toHaveBeenLastCalledWith('orchestration.subscribe', {})
  })
})
