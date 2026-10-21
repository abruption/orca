import { afterEach, describe, expect, it, vi } from 'vitest'

const { readFileSyncMock } = vi.hoisted(() => ({ readFileSyncMock: vi.fn() }))
vi.mock('node:fs', () => ({ readFileSync: readFileSyncMock, rmSync: vi.fn(), statSync: vi.fn() }))

import { probeDisplayLock } from './x-display-artifacts'

const originalPlatform = process.platform

afterEach(() => {
  vi.restoreAllMocks()
  readFileSyncMock.mockReset()
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

function linuxProcess(state: string): void {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  readFileSyncMock.mockImplementation((path: string) => {
    if (path === '/tmp/.X99-lock') {
      return '4321\n'
    }
    if (path === '/proc/4321/stat') {
      return `4321 (Xvfb (worker)) ${state} 1 0 0`
    }
    throw new Error(`Unexpected path: ${path}`)
  })
  vi.spyOn(process, 'kill').mockReturnValue(true)
}

describe('X display process liveness', () => {
  it('rejects an unreaped zombie even though signal 0 succeeds', () => {
    linuxProcess('Z')
    expect(probeDisplayLock(99)).toBe('dead')
  })

  it.each(['R', 'S', 'T'])('retains a process in state %s', (state) => {
    linuxProcess(state)
    expect(probeDisplayLock(99)).toBe('alive')
  })

  it.each(['EACCES', 'ENOENT'])('retains signal evidence when proc is %s', (code) => {
    linuxProcess('S')
    readFileSyncMock.mockImplementation((path: string) => {
      if (path === '/tmp/.X99-lock') {
        return '4321\n'
      }
      throw Object.assign(new Error(code), { code })
    })
    expect(probeDisplayLock(99)).toBe('alive')
  })

  it('retains signal evidence when proc is malformed', () => {
    linuxProcess('S')
    readFileSyncMock.mockImplementation((path: string) =>
      path === '/tmp/.X99-lock' ? '4321\n' : 'not a proc stat record'
    )
    expect(probeDisplayLock(99)).toBe('alive')
  })

  it.each([
    ['S', 'alive'],
    ['Z', 'dead']
  ] as const)('checks state %s even when signal 0 is permission-denied', (state, expected) => {
    linuxProcess(state)
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('not permitted'), { code: 'EPERM' })
    })
    expect(probeDisplayLock(99)).toBe(expected)
  })

  it('does not read Linux proc on other platforms', () => {
    linuxProcess('Z')
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    expect(probeDisplayLock(99)).toBe('alive')
    expect(readFileSyncMock).not.toHaveBeenCalledWith('/proc/4321/stat', 'utf8')
  })
})
