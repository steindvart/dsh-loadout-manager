/**
 * Filesystem locations as DSH resolves them: `$DSH_HOME`, `$DSH_AGENTS_HOME`,
 * the project root of a working directory, and model-facing rule paths.
 */

import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

/**
 * @param {object} ctx - Cordis context; `dshHomePath` is used when provided
 * @returns {{ dshHome: string, agentsHome: string }}
 */
export function resolveHomes(ctx, env = process.env) {
  const dshHomePath = ctx.get?.('dshHomePath')
  const dshHome = typeof dshHomePath === 'function' ? dshHomePath() : resolveHome(env.DSH_HOME, '.dsh')
  return { dshHome, agentsHome: resolveHome(env.DSH_AGENTS_HOME, '.agents') }
}

function resolveHome(value, fallback) {
  const selected = typeof value === 'string' && value.trim() !== '' ? value : join(homedir(), fallback)
  if (selected === '~') return homedir()
  if (selected.startsWith('~/')) return resolve(homedir(), selected.slice(2))
  return resolve(selected)
}

/** Nearest ancestor of `cwd` containing `.git` (file or directory), else `cwd`. Mirrors `dsh-skill-filesystem`. */
export async function findProjectRoot(cwd) {
  const start = resolve(cwd)
  let current = start
  while (true) {
    try {
      await access(join(current, '.git'))
      return current
    } catch {
      // keep walking up
    }
    const parent = dirname(current)
    if (parent === current) return start
    current = parent
  }
}

/**
 * Model-facing path of a rule file: `~/.dsh/rules/x.md` (or `$DSH_HOME/...`
 * when the home is relocated) for global rules, project-relative for
 * project rules. Uses `/` separators.
 */
export function ruleDisplayPath(rule, { dshHome, agentsHome, projectRoot }) {
  const base = rule.source === 'dsh' ? dshHome : rule.source === 'agents' ? agentsHome : projectRoot
  const tail = relative(base, rule.file).split(sep).join('/')
  if (rule.source === 'project') return tail
  const defaultHome = join(homedir(), rule.source === 'dsh' ? '.dsh' : '.agents')
  if (base === defaultHome) return `~/${rule.source === 'dsh' ? '.dsh' : '.agents'}/${tail}`
  return `$${rule.source === 'dsh' ? 'DSH_HOME' : 'DSH_AGENTS_HOME'}/${tail}`
}
