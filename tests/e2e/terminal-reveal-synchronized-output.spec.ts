import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { expect, test } from './helpers/orca-app'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  focusActiveTerminalInput,
  getTerminalContent,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'
import { runNodeScriptInTerminal } from './helpers/run-node-script-in-terminal'
import { compareTerminalScreenshots } from './terminal-screenshot-diff'
import type { TerminalRevealSynchronizedOutputProbe } from './fixtures/terminal-reveal-synchronized-output-probe'

test.use({ orcaAppExtraEnv: { ORCA_E2E_TERMINAL_PARKING_DELAY_MS: '120000' } })

for (const gpu of ['off', 'on'] as const) {
  test(`settled reveal preserves a synchronized frame with GPU ${gpu}`, async ({
    orcaPage
  }, testInfo) => {
    await waitForSessionReady(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage)
    await focusActiveTerminalInput(orcaPage)
    const ptyId = await waitForActivePanePtyId(orcaPage)
    const quiet = await runNodeScriptInTerminal(
      orcaPage,
      ptyId,
      "process.stdout.write('REVEAL_SYNC_READY\\r\\n'); process.stdin.resume()"
    )
    await expect.poll(() => getTerminalContent(orcaPage, 10_000)).toContain('REVEAL_SYNC_READY')
    quiet.cleanup()
    const bundle = await build({
      entryPoints: [
        path.join(process.cwd(), 'tests/e2e/fixtures/terminal-reveal-synchronized-output-probe.ts')
      ],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      alias: { '@': path.join(process.cwd(), 'src/renderer/src') },
      define: { 'import.meta.env': '{}' }
    })
    const script = bundle.outputFiles[0]?.text
    if (!script) {
      throw new Error('Synchronized reveal probe did not build')
    }
    await orcaPage.addScriptTag({ content: script })
    await orcaPage.evaluate(
      (mode) => window.__terminalRevealSynchronizedOutputProbe?.prepare(mode),
      gpu
    )
    const screen = orcaPage.locator('[data-reveal-sync-probe="true"]')
    // Pixel coverage requires a real WebGL renderer; a DOM fallback is a failure.
    await (gpu === 'on'
      ? expect(screen.locator('canvas').first()).toBeAttached()
      : expect(screen.locator('.xterm-rows')).toBeVisible())
    await orcaPage.addStyleTag({ content: '[role="tooltip"] { display: none !important; }' })
    await orcaPage.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    const bounds = await screen.boundingBox()
    if (!bounds) {
      throw new Error('Terminal viewport has no bounds')
    }
    const cdp = await orcaPage.context().newCDPSession(orcaPage)
    const capture = async (name: string): Promise<Buffer> => {
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { ...bounds, scale: 1 },
        captureBeyondViewport: false
      })
      const image = Buffer.from(data, 'base64')
      await writeFile(testInfo.outputPath(name), image)
      return image
    }
    try {
      const before = await capture('before-reveal.png')
      await orcaPage.clock.install()
      await orcaPage.clock.pauseAt(await orcaPage.evaluate(() => Date.now() + 50))
      await orcaPage.evaluate(() => window.__terminalRevealSynchronizedOutputProbe?.start())
      // Run both settled animation frames, but keep DEC 2026's timeout frozen during screenshots.
      await orcaPage.clock.runFor(100)
      const trace = await orcaPage.evaluate(
        (): TerminalRevealSynchronizedOutputProbe['trace'] | undefined =>
          window.__terminalRevealSynchronizedOutputProbe?.trace
      )
      expect(trace).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event: 'partial-frame-parsed', held: true }),
          expect.objectContaining({ event: 'production-atlas-clear', held: true })
        ])
      )
      const during = await capture('during-reveal.png')
      expect(compareTerminalScreenshots(before, during).diffRatio).toBeLessThan(0.001)
      await orcaPage.evaluate(() => window.__terminalRevealSynchronizedOutputProbe?.release())
      await orcaPage.clock.runFor(100)
      expect(
        await orcaPage.evaluate(() => window.__terminalRevealSynchronizedOutputProbe?.completed)
      ).toBe(true)
      const after = await capture('after-reveal.png')
      expect(compareTerminalScreenshots(before, after).diffRatio).toBeGreaterThan(0.01)
    } finally {
      await testInfo.attach('reveal-sync-events', {
        body: JSON.stringify(
          await orcaPage.evaluate(() => window.__terminalRevealSynchronizedOutputProbe?.trace),
          null,
          2
        ),
        contentType: 'application/json'
      })
      await orcaPage.clock.resume().catch(() => undefined)
      await orcaPage.evaluate(() => window.__terminalRevealSynchronizedOutputProbe?.dispose())
      await cdp.detach()
      await sendToTerminal(orcaPage, ptyId, '\x03').catch(() => undefined)
    }
  })
}
