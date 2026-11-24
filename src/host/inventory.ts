/**
 * Inventory of skills and rules visible to DSH for one workspace: scans the
 * same skill roots as `dsh-skill-filesystem`, the rule roots, and both
 * `loadout.json` files, and resolves each item's effective state. Also lists
 * the instruction files `dsh-agent-instructions` loads (read-only).
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { SkillInvocationPolicy, SkillSummary } from '@deepseek-ai/dsh-skill'
import { parseFrontmatter, type FrontmatterValue } from './frontmatter.ts'
import { parseLoadout, ruleEnabled, skillState, type Loadout, type SkillState } from './loadout.ts'
import type { Level, RuleSource, SkillSource } from '../shared/api.ts'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type { Level, RuleSource, SkillSource }

export interface Homes {
  /** `$DSH_HOME` */
  dshHome: string
  /** `$DSH_AGENTS_HOME` */
  agentsHome: string
}

export interface ScanOptions extends Homes {
  /** Absolute custom skill roots. */
  customSkillDirs?: readonly string[]
  /** Workspace project root; omit for the global level alone. */
  projectRoot?: string | undefined
  /** Workspace folder inside the project; instruction files are read from the project root down to it. */
  workspacePath?: string | undefined
}

export interface SkillItem {
  name: string
  description: string
  whenToUse?: string
  level: Level
  source: SkillSource
  rank: number
  state: SkillState
  /** The file itself sets `disable-model-invocation`, so the skill cannot be `on`. */
  fileManual: boolean
  invocation: SkillInvocationPolicy
  fileInvocation: SkillInvocationPolicy
  /** `SKILL.md` or the flat `<name>.md`. */
  file: string
  /** The directory or flat file that deletion moves to the trash. */
  entry: string
  /** Inside an application archive: can be switched, cannot be deleted. */
  readOnly: boolean
  /** File of the same-named skill that wins over this one. */
  overriddenBy?: string
}

export interface RuleItem {
  /** `<source>/<file name without .md>`, the `loadout.json` key. */
  id: string
  name: string
  description: string | undefined
  level: Level
  source: RuleSource
  enabled: boolean
  file: string
  /** File text without frontmatter, trimmed. */
  body: string
}

export interface InstructionItem {
  name: string
  level: Level
  /** `dsh`, `agents`, or the directory relative to the project root (`.` for the root). */
  location: string
  file: string
}

export interface LevelState {
  loadoutPath: string
  loadout: Loadout
  /** Set when `loadout.json` is malformed; the level then reads as all on. */
  error?: string
}

export interface Levels {
  global: LevelState
  project?: LevelState & { projectRoot: string }
}

export interface Inventory {
  levels: Levels
  skills: SkillItem[]
  rules: RuleItem[]
  instructions: InstructionItem[]
}

export async function scanInventory(options: ScanOptions): Promise<Inventory> {
  const levels = await readLevels(options)
  const skills: SkillItem[] = []
  for (const root of skillRoots(options)) skills.push(...await scanSkillRoot(root, levelLoadout(levels, root.level)))
  markOverridden(skills)
  return { levels, skills, rules: await scanRules(options, levels), instructions: await scanInstructions(options) }
}

/** Defaults of `dsh-agent-instructions`: global roots hold `AGENTS.md` only; project directories hold these, base files first. */
const GLOBAL_INSTRUCTION_FILE = 'AGENTS.md'
const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']

/**
 * Instruction files in the order DSH loads them: `$DSH_HOME/AGENTS.md`,
 * `$DSH_AGENTS_HOME/AGENTS.md`, then every candidate in each directory from
 * the project root down to the workspace folder.
 */
export async function scanInstructions({ dshHome, agentsHome, projectRoot, workspacePath }: ScanOptions): Promise<InstructionItem[]> {
  const found: InstructionItem[] = []
  for (const [location, home] of [['dsh', dshHome], ['agents', agentsHome]] as const) {
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
function directoryChain(root: string, leaf: string): string[] {
  const top = resolve(root)
  const tail = relative(top, resolve(leaf))
  if (tail === '' || tail.startsWith('..') || tail.startsWith(sep)) return [top]
  const chain = [top]
  for (const part of tail.split(sep)) chain.push(join(chain.at(-1) ?? top, part))
  return chain
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Rules alone, in context order (`dsh`, `agents`, then `project`).
 * @param levels - result of {@link readLevels}; read when omitted
 */
export async function scanRules(options: ScanOptions, levels?: Levels): Promise<RuleItem[]> {
  const known = levels ?? await readLevels(options)
  const rules: RuleItem[] = []
  for (const root of ruleRoots(options)) rules.push(...await scanRuleRoot(root, levelLoadout(known, root.level)))
  return rules
}

interface RuleRoot {
  path: string
  source: RuleSource
  level: Level
}

/** Rule roots in context order: the global chain first, then the project. */
function ruleRoots({ dshHome, agentsHome, projectRoot }: ScanOptions): RuleRoot[] {
  const roots: RuleRoot[] = [
    { path: join(dshHome, 'rules'), source: 'dsh', level: 'global' },
    { path: join(agentsHome, 'rules'), source: 'agents', level: 'global' },
  ]
  if (projectRoot !== undefined) roots.push({ path: join(projectRoot, '.agents', 'rules'), source: 'project', level: 'project' })
  return roots
}

async function scanRuleRoot(root: RuleRoot, loadout: Loadout): Promise<RuleItem[]> {
  const rules: RuleItem[] = []
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
      name: nonEmptyString(data.name) ?? fileName,
      description: nonEmptyString(data.description),
      level: root.level,
      source: root.source,
      enabled: ruleEnabled(loadout, id),
      file: entry.path,
      body: (parsed?.body ?? text).trim(),
    })
  }
  return rules
}

/** The registry winner fields a shadow copies. */
export type ShadowSource = Pick<SkillSummary, 'name' | 'description' | 'whenToUse' | 'invocation' | 'source' | 'path' | 'resourceBase'>

export type Shadow = ShadowSource

/**
 * Shadow candidates for the agent-layer provider: registry winners whose
 * `loadout.json` state, read from the winner's own level, is narrower than
 * the policy the winner already has. `project-*` sources use the project
 * loadout; every other source is global.
 * @returns shadow summaries sorted by name, with the narrowed `invocation`
 */
export function shadowsFor(winners: readonly ShadowSource[], loadouts: { global: Loadout, project?: Loadout | undefined }): Shadow[] {
  const shadows: Shadow[] = []
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
function markOverridden(skills: SkillItem[]): void {
  const winners = new Map<string, SkillItem>()
  for (const item of [...skills].sort((a, b) => a.rank - b.rank)) {
    const winner = winners.get(item.name)
    if (winner === undefined) winners.set(item.name, item)
    else item.overriddenBy = winner.file
  }
}

/** Absolute path of a level's `loadout.json`; the project level needs `projectRoot`. */
export function loadoutPath({ agentsHome, projectRoot }: Pick<ScanOptions, 'agentsHome' | 'projectRoot'>, level: Level): string {
  if (level === 'global') return join(agentsHome, 'loadout.json')
  if (projectRoot === undefined) throw new Error('the project loadout.json needs a project root')
  return join(projectRoot, '.agents', 'loadout.json')
}

/** Both `loadout.json` files. A malformed file reads as empty and carries `error`. */
export async function readLevels(options: Pick<ScanOptions, 'agentsHome' | 'projectRoot'>): Promise<Levels> {
  const levels: Levels = { global: await readLevel(loadoutPath(options, 'global')) }
  if (options.projectRoot !== undefined) {
    levels.project = { projectRoot: options.projectRoot, ...await readLevel(loadoutPath(options, 'project')) }
  }
  return levels
}

function levelLoadout(levels: Levels, level: Level): Loadout {
  return (level === 'project' ? levels.project?.loadout : levels.global.loadout) ?? {}
}

async function readLevel(path: string): Promise<LevelState> {
  try {
    return { loadoutPath: path, loadout: parseLoadout(await readText(path)) }
  } catch (error) {
    return { loadoutPath: path, loadout: {}, error: (error as Error).message }
  }
}

const POLICY: Record<SkillState, SkillInvocationPolicy> = {
  on: { modelInvocable: true, userInvocable: true },
  manual: { modelInvocable: false, userInvocable: true },
  off: { modelInvocable: false, userInvocable: false },
}

function samePolicy(a: SkillInvocationPolicy, b: SkillInvocationPolicy): boolean {
  return a.modelInvocable === b.modelInvocable && a.userInvocable === b.userInvocable
}

function stateOf(policy: SkillInvocationPolicy): SkillState {
  if (policy.modelInvocable) return 'on'
  return policy.userInvocable ? 'manual' : 'off'
}

/** Mirrors `dsh-skill-filesystem`: booleans, 1/0, and yes/no/on/off strings. */
function frontmatterBoolean(data: Record<string, FrontmatterValue>, key: string): boolean | undefined {
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

interface SkillRoot {
  path: string
  source: SkillSource
  rank: number
  level: Level
  skipSystem?: boolean
}

function skillRoots({ dshHome, agentsHome, customSkillDirs = [], projectRoot }: ScanOptions): SkillRoot[] {
  const roots: SkillRoot[] = []
  if (projectRoot !== undefined) {
    roots.push(
      { path: join(projectRoot, '.dsh/skills'), source: 'project-dsh', rank: 100, level: 'project' },
      { path: join(projectRoot, '.agents/skills'), source: 'project-agents', rank: 200, level: 'project' },
    )
  }
  roots.push(...customSkillDirs.map((path): SkillRoot => ({ path, source: 'custom', rank: 300, level: 'global' })))
  roots.push(
    { path: join(dshHome, 'skills'), source: 'user-dsh', rank: 400, level: 'global', skipSystem: true },
    { path: join(agentsHome, 'skills'), source: 'user-agents', rank: 500, level: 'global' },
  )
  return roots
}

async function scanSkillRoot(root: SkillRoot, loadout: Loadout): Promise<SkillItem[]> {
  const skills: SkillItem[] = []
  for (const entry of (await listEntries(root.path)).sort((a, b) => a.name.localeCompare(b.name))) {
    if (root.skipSystem === true && entry.name === '.system') continue
    const file = entry.kind === 'directory'
      ? join(entry.path, 'SKILL.md')
      : entry.kind === 'file' && entry.name.endsWith('.md') ? entry.path : undefined
    if (file === undefined) continue
    const parsed = parseFrontmatter(await readText(file) ?? '')
    if (parsed === undefined) continue
    const { name, description, whenToUse } = parsed.data
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) continue
    if (typeof description !== 'string' || description === '') continue
    let fileInvocation: SkillInvocationPolicy
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
    const hint = nonEmptyString(whenToUse)
    skills.push({
      name,
      description,
      ...hint !== undefined ? { whenToUse: hint } : {},
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

function nonEmptyString(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function isInsideArchive(path: string): boolean {
  return /\.asar([\\/]|$)/.test(path)
}

interface DirEntry {
  name: string
  path: string
  kind: 'directory' | 'file' | 'other'
}

async function listEntries(dir: string): Promise<DirEntry[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if (isAbsent(error)) return []
    throw error
  }
  const entries: DirEntry[] = []
  for (const name of names) {
    const path = join(dir, name)
    try {
      const info = await stat(path)
      entries.push({ name, path, kind: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other' })
    } catch {
      // a dangling symlink or a file removed during the scan: skip it
    }
  }
  return entries
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isAbsent(error)) return undefined
    throw error
  }
}

function isAbsent(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
