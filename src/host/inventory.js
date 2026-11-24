/**
 * Inventory of skills and rules visible to DSH for one workspace: scans the
 * same skill roots as `dsh-skill-filesystem`, the rule roots, and both
 * `loadout.json` files, and resolves each item's effective state. Also lists
 * the instruction files `dsh-agent-instructions` loads (read-only).
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { parseLoadout, ruleEnabled, skillState } from './loadout.js'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * @param {object} options
 * @param {string} options.dshHome - `$DSH_HOME`
 * @param {string} options.agentsHome - `$DSH_AGENTS_HOME`
 * @param {string[]} [options.customSkillDirs] - absolute custom skill roots
 * @param {string} [options.projectRoot] - workspace project root; omit for the global level alone
 * @param {string} [options.workspacePath] - workspace folder inside the project; instruction files are read from the project root down to it
 */
export async function scanInventory(options) {
  const levels = await readLevels(options)
  const skills = []
  for (const root of skillRoots(options)) skills.push(...await scanSkillRoot(root, levels[root.level].loadout))
  markOverridden(skills)
  return { levels, skills, rules: await scanRules(options, levels), instructions: await scanInstructions(options) }
}

/** Defaults of `dsh-agent-instructions`: global roots hold `AGENTS.md` only; project directories hold these, base files first. */
const GLOBAL_INSTRUCTION_FILE = 'AGENTS.md'
const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']

/**
 * Instruction files in the order DSH loads them: `$DSH_HOME/AGENTS.md`,
 * `$DSH_AGENTS_HOME/AGENTS.md`, then every candidate in each directory from
 * the project root down to the workspace folder. `location` is `dsh`,
 * `agents`, or the directory relative to the project root (`.` for the root).
 */
export async function scanInstructions({ dshHome, agentsHome, projectRoot, workspacePath }) {
  const found = []
  for (const [location, home] of [['dsh', dshHome], ['agents', agentsHome]]) {
    const file = join(home, GLOBAL_INSTRUCTION_FILE)
    if (await isFile(file)) found.push({ name: GLOBAL_INSTRUCTION_FILE, level: 'global', location, file })
  }
  if (projectRoot === undefined) return found
  for (const dir of directoryChain(projectRoot, workspacePath ?? projectRoot)) {
    const location = relative(projectRoot, dir).split(sep).join('/') || '.'
    for (const name of PROJECT_INSTRUCTION_FILES) {
      const file = join(dir, name)
      if (await isFile(file)) found.push({ name, level: 'project', location, file })
    }
  }
  return found
}

/** Directories from `root` down to `leaf`, inclusive; `root` alone when `leaf` is outside it. */
function directoryChain(root, leaf) {
  const tail = relative(resolve(root), resolve(leaf))
  if (tail === '' || tail.startsWith('..') || tail.startsWith(sep)) return [resolve(root)]
  const chain = [resolve(root)]
  for (const part of tail.split(sep)) chain.push(join(chain.at(-1), part))
  return chain
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Rules alone, in context order (`dsh`, `agents`, then `project`).
 * @param {{ dshHome, agentsHome, projectRoot? }} options
 * @param {object} [levels] - result of {@link readLevels}; read when omitted
 */
export async function scanRules(options, levels) {
  levels ??= await readLevels(options)
  const rules = []
  for (const root of ruleRoots(options)) rules.push(...await scanRuleRoot(root, levels[root.level].loadout))
  return rules
}

/** Rule roots in context order: the global chain first, then the project. */
function ruleRoots({ dshHome, agentsHome, projectRoot }) {
  const roots = [
    { path: join(dshHome, 'rules'), source: 'dsh', level: 'global' },
    { path: join(agentsHome, 'rules'), source: 'agents', level: 'global' },
  ]
  if (projectRoot !== undefined) roots.push({ path: join(projectRoot, '.agents', 'rules'), source: 'project', level: 'project' })
  return roots
}

async function scanRuleRoot(root, loadout) {
  const rules = []
  const files = (await listEntries(root.path))
    .filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of files) {
    const text = await readText(entry.path)
    if (text === undefined) continue
    const parsed = parseFrontmatter(text)
    const data = parsed?.data ?? {}
    const fileName = entry.name.slice(0, -'.md'.length)
    const id = `${root.source}/${fileName}`
    rules.push({
      id,
      name: typeof data.name === 'string' && data.name !== '' ? data.name : fileName,
      description: typeof data.description === 'string' && data.description !== '' ? data.description : undefined,
      level: root.level,
      source: root.source,
      enabled: ruleEnabled(loadout, id),
      file: entry.path,
      body: (parsed?.body ?? text).trim(),
    })
  }
  return rules
}

/**
 * Shadow candidates for the agent-layer provider: registry winners whose
 * `loadout.json` state, read from the winner's own level, is narrower than
 * the policy the winner already has. `project-*` sources use the project
 * loadout; every other source is global.
 * @param {Array<{ name, description, whenToUse?, invocation, source, path?, resourceBase? }>} winners
 * @param {{ global: object, project?: object }} loadouts - parsed loadout objects
 * @returns shadow summaries sorted by name, with the narrowed `invocation`
 */
export function shadowsFor(winners, loadouts) {
  const shadows = []
  for (const winner of winners) {
    const loadout = winner.source.startsWith('project-') ? loadouts.project : loadouts.global
    if (loadout === undefined) continue
    const requested = POLICY[skillState(loadout, winner.name)]
    const invocation = {
      modelInvocable: winner.invocation.modelInvocable && requested.modelInvocable,
      userInvocable: winner.invocation.userInvocable && requested.userInvocable,
    }
    if (samePolicy(invocation, winner.invocation)) continue
    const { name, description, whenToUse, source, path, resourceBase } = winner
    shadows.push({
      name,
      description,
      ...whenToUse !== undefined ? { whenToUse } : {},
      invocation,
      source,
      ...path !== undefined ? { path } : {},
      ...resourceBase !== undefined ? { resourceBase } : {},
    })
  }
  return shadows.sort((a, b) => a.name.localeCompare(b.name))
}

/** Same-named skills: the lowest rank wins, then root order, then entry order, as in `dsh-skill`. */
function markOverridden(skills) {
  const winners = new Map()
  for (const item of [...skills].sort((a, b) => a.rank - b.rank)) {
    const winner = winners.get(item.name)
    if (winner === undefined) winners.set(item.name, item)
    else item.overriddenBy = winner.file
  }
}

/** Absolute path of a level's `loadout.json`. */
export function loadoutPath({ agentsHome, projectRoot }, level) {
  return level === 'project' ? join(projectRoot, '.agents', 'loadout.json') : join(agentsHome, 'loadout.json')
}

/**
 * Both `loadout.json` files: `{ global, project? }`, each `{ loadoutPath, loadout, error? }`.
 * A malformed file reads as empty and carries `error`.
 */
export async function readLevels(options) {
  const levels = { global: await readLevel(loadoutPath(options, 'global')) }
  if (options.projectRoot !== undefined) {
    levels.project = { projectRoot: options.projectRoot, ...await readLevel(loadoutPath(options, 'project')) }
  }
  return levels
}

async function readLevel(path) {
  try {
    return { loadoutPath: path, loadout: parseLoadout(await readText(path)) }
  } catch (error) {
    return { loadoutPath: path, loadout: {}, error: error.message }
  }
}

const POLICY = {
  on: { modelInvocable: true, userInvocable: true },
  manual: { modelInvocable: false, userInvocable: true },
  off: { modelInvocable: false, userInvocable: false },
}

function samePolicy(a, b) {
  return a.modelInvocable === b.modelInvocable && a.userInvocable === b.userInvocable
}

function stateOf(policy) {
  if (policy.modelInvocable) return 'on'
  return policy.userInvocable ? 'manual' : 'off'
}

/** Mirrors `dsh-skill-filesystem`: booleans, 1/0, and yes/no/on/off strings. */
function frontmatterBoolean(data, key) {
  if (!Object.hasOwn(data, key) || data[key] === null) return undefined
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    const lower = value.toLowerCase()
    if (['true', 'yes', 'on'].includes(lower)) return true
    if (['false', 'no', 'off'].includes(lower)) return false
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`)
}

function skillRoots({ dshHome, agentsHome, customSkillDirs = [], projectRoot }) {
  const roots = []
  if (projectRoot !== undefined) {
    roots.push(
      { path: join(projectRoot, '.dsh/skills'), source: 'project-dsh', rank: 100, level: 'project' },
      { path: join(projectRoot, '.agents/skills'), source: 'project-agents', rank: 200, level: 'project' },
    )
  }
  roots.push(...customSkillDirs.map(path => ({ path, source: 'custom', rank: 300, level: 'global' })))
  roots.push(
    { path: join(dshHome, 'skills'), source: 'user-dsh', rank: 400, level: 'global', skipSystem: true },
    { path: join(agentsHome, 'skills'), source: 'user-agents', rank: 500, level: 'global' },
  )
  return roots
}

async function scanSkillRoot(root, loadout) {
  const skills = []
  for (const entry of (await listEntries(root.path)).sort((a, b) => a.name.localeCompare(b.name))) {
    if (root.skipSystem && entry.name === '.system') continue
    const file = entry.kind === 'directory'
      ? join(entry.path, 'SKILL.md')
      : entry.kind === 'file' && entry.name.endsWith('.md') ? entry.path : undefined
    if (file === undefined) continue
    const parsed = parseFrontmatter(await readText(file) ?? '')
    if (parsed === undefined) continue
    const { name, description, whenToUse } = parsed.data
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) continue
    if (typeof description !== 'string' || description === '') continue
    let fileInvocation
    try {
      fileInvocation = {
        modelInvocable: frontmatterBoolean(parsed.data, 'disable-model-invocation') !== true,
        userInvocable: frontmatterBoolean(parsed.data, 'user-invocable') !== false,
      }
    } catch {
      continue
    }
    const requested = POLICY[skillState(loadout, name)]
    const invocation = {
      modelInvocable: fileInvocation.modelInvocable && requested.modelInvocable,
      userInvocable: fileInvocation.userInvocable && requested.userInvocable,
    }
    skills.push({
      name,
      description,
      ...typeof whenToUse === 'string' && whenToUse !== '' ? { whenToUse } : {},
      level: root.level,
      source: root.source,
      rank: root.rank,
      state: stateOf(invocation),
      fileManual: !fileInvocation.modelInvocable,
      invocation,
      fileInvocation,
      file,
      entry: entry.path,
      readOnly: isInsideArchive(entry.path),
    })
  }
  return skills
}

function isInsideArchive(path) {
  return /\.asar([\\/]|$)/.test(path)
}

async function listEntries(dir) {
  let names
  try {
    names = await readdir(dir)
  } catch (error) {
    if (isAbsent(error)) return []
    throw error
  }
  const entries = []
  for (const name of names) {
    const path = join(dir, name)
    let info
    try {
      info = await stat(path)
    } catch {
      continue
    }
    entries.push({ name, path, kind: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other' })
  }
  return entries
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isAbsent(error)) return undefined
    throw error
  }
}

function isAbsent(error) {
  return error?.code === 'ENOENT' || error?.code === 'ENOTDIR'
}
