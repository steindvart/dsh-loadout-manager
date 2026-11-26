/**
 * Version strings as indexes and skill frontmatter write them: SemVer and
 * the looser numeric forms, compared without a dependency on `semver`.
 */

/**
 * Compare two version strings. Returns a positive number when `left` is
 * newer, a negative one when it is older, and `0` when they are equal.
 * `undefined` means at least one side is not a version this function reads.
 *
 * The reader accepts an optional `v` or `=` prefix, any number of numeric
 * core components (`1.2`, `1.2.0`, `1.2.3.4`), a prerelease after `-`, and
 * build metadata after `+`. Prerelease identifiers follow SemVer: numbers
 * compare numerically, a number sorts before text, and a prerelease sorts
 * before the release without one.
 */
export function compareVersions(left: string, right: string): number | undefined {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return undefined
  const length = Math.max(a.core.length, b.core.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const count = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index]
    const rightPart = b.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      if (leftPart !== rightPart) return leftPart - rightPart
    } else if (typeof leftPart === 'number') {
      return -1
    } else if (typeof rightPart === 'number') {
      return 1
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1
    }
  }
  return 0
}

/** Whether `next` is a newer version than `current`; an unreadable pair falls back to inequality. */
export function versionIsNewer(next: string | undefined, current: string | undefined): boolean {
  if (next === undefined) return false
  if (current === undefined) return true
  const order = compareVersions(next, current)
  return order === undefined ? next !== current : order > 0
}

function parseVersion(value: string): { core: number[], prerelease: (number | string)[] } | undefined {
  const text = value.trim().replace(/^[vV]/, '').replace(/^=/, '')
  const withoutBuild = text.split('+', 1)[0] ?? ''
  const dash = withoutBuild.indexOf('-')
  const coreText = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  const prereleaseText = dash === -1 ? '' : withoutBuild.slice(dash + 1)
  if (coreText === '') return undefined
  const core: number[] = []
  for (const part of coreText.split('.')) {
    if (!/^\d+$/.test(part)) return undefined
    core.push(Number(part))
  }
  const prerelease = prereleaseText === ''
    ? []
    : prereleaseText.split('.').map(part => /^\d+$/.test(part) ? Number(part) : part)
  return { core, prerelease }
}
