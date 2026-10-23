import { isSynchronizedOutputHeld } from '../../../src/renderer/src/lib/pane-manager/terminal-render-pause-release'

export type TerminalRevealSynchronizedOutputProbe = {
  trace: { event: string; held: boolean; time: number }[]
  prepared: boolean
  completed: boolean
  prepare: (gpu: 'on' | 'off') => Promise<void>
  start: () => void
  release: () => void
  dispose: () => Promise<void>
}

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Window augmentation requires declaration merging.
  interface Window {
    __terminalRevealSynchronizedOutputProbe?: TerminalRevealSynchronizedOutputProbe
  }
}

const tabId = window.__store?.getState().activeTabId
const manager = tabId ? window.__paneManagers?.get(tabId) : undefined
const pane = manager?.getActivePane() ?? manager?.getPanes()[0]
if (!manager || !pane) {
  throw new Error('No live pane manager for the synchronized reveal probe')
}
const terminal = pane.terminal
const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen')
if (!screen) {
  throw new Error('No terminal viewport for the synchronized reveal probe')
}
screen.dataset.revealSyncProbe = 'true'
const write = (data: string): Promise<void> =>
  new Promise((resolve) => terminal.write(data, resolve))
const originalClear = manager.clearWebglTextureAtlases
const trace = (event: string): void => {
  probe.trace.push({ event, held: isSynchronizedOutputHeld(terminal), time: performance.now() })
}
manager.clearWebglTextureAtlases = () => {
  trace('production-atlas-clear')
  originalClear.call(manager)
}
const frame = (label: string, background: number): string =>
  Array.from(
    { length: terminal.rows - 1 },
    (_, row) =>
      `\x1b[${row + 1};1H\x1b[${background}m${`${label}_${row} `.padEnd(terminal.cols - 1, '.')}\x1b[0m`
  ).join('')

const probe: TerminalRevealSynchronizedOutputProbe = {
  trace: [],
  prepared: false,
  completed: false,
  prepare: async (gpu) => {
    const settings = window.__store?.getState().settings
    if (settings) {
      window.__store?.setState({ settings: { ...settings, terminalGpuAcceleration: gpu } })
    }
    manager.setTerminalGpuAcceleration(gpu)
    terminal.options.cursorBlink = false
    await write(`\x1b[?2026l\x1b[2J\x1b[H\x1b[?25l${frame('COHERENT_FRAME', 44)}`)
    terminal.focus()
  },
  start: () => {
    // The real manager keeps its production registry and settled-frame callbacks.
    void write('\x1b[?2026h\x1b[2J\x1b[H').then(() => {
      trace('partial-frame-parsed')
      probe.prepared = true
      manager.scheduleRevealRepaint()
    })
  },
  release: () => {
    void write(`${frame('COMPLETED_FRAME', 42)}\x1b[?2026l`).then(() => {
      trace('complete-frame-parsed')
      probe.completed = true
    })
  },
  dispose: async () => {
    manager.clearWebglTextureAtlases = originalClear
    await write('\x1b[?2026l\x1b[0m\x1b[?25h')
    delete screen.dataset.revealSyncProbe
  }
}
window.__terminalRevealSynchronizedOutputProbe = probe
