export function parseLinuxProcessState(statLine: string): string | null {
  const commandEnd = statLine.lastIndexOf(')')
  if (commandEnd === -1) {
    return null
  }
  return (
    statLine
      .slice(commandEnd + 1)
      .trim()
      .split(/\s+/, 1)[0] ?? null
  )
}
