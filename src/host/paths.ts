/**
 * Filesystem locations as DSH resolves them: `$DSH_HOME`, `$DSH_AGENTS_HOME`,
 * the project root of a working directory, and model-facing rule paths.
 */

import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { Homes, RuleItem } from './inventory.ts'

/** `$DSH_HOME` from the root context when DSH provides it, `$DSH_AGENTS_HOME` resolved like `dsh-home-paths`. */
export function resolveHomes(ctx: Context, env: NodeJS.ProcessEnv = process.env): Homes {
  const dshHomePath = ctx.get('dshHomePath')
  const dshHome = typeof dshHomePath === 'function' ? dshHomePath() : resolveHome(env.DSH_HOME, '.dsh')
  return { dshHome, agentsHome: resolveHome(env.DSH_AGENTS_HOME, '.agents') }
}

/** An empty or blank variable counts as unset; `~` expands to the home directory. */
function resolveHome(value: string | undefined, fallback: string): string {
  const selected = typeof value === 'string' && value.trim() !== '' ? value : join(homedir(), fallback)
  if (selected === '~') return homedir()
  if (selected.startsWith('~/')) return resolve(homedir(), selected.slice(2))
  return resolve(selected)
}

/** Nearest ancestor of `cwd` containing `.git` (file or directory), else `cwd`. Mirrors `dsh-skill-filesystem`. */
export async function findProjectRoot(cwd: string): Promise<string> {
  const start = resolve(cwd)
  let current = start
  for (;;) {
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
export function ruleDisplayPath(rule: Pick<RuleItem, 'source' | 'file'>, { dshHome, agentsHome, projectRoot }: Homes & { projectRoot?: string | undefined }): string {
  const base = rule.source === 'dsh' ? dshHome : rule.source === 'agents' ? agentsHome : projectRoot ?? dirname(rule.file)
  const tail = relative(base, rule.file).split(sep).join('/')
  if (rule.source === 'project') return tail
  const folder = rule.source === 'dsh' ? '.dsh' : '.agents'
  if (base === join(homedir(), folder)) return `~/${folder}/${tail}`
  return `$${rule.source === 'dsh' ? 'DSH_HOME' : 'DSH_AGENTS_HOME'}/${tail}`
}
