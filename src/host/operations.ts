/**
 * Operations shared by the settings page (Fetch routes) and the `loadout`
 * tool. Every file operation re-scans and accepts only paths the scan
 * returned, so a caller cannot reach arbitrary files.
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { parseLoadout, serializeLoadout, withRuleEnabled, withSkillState, SKILL_STATES } from './loadout.ts'
import { loadoutPath, scanInventory } from './inventory.ts'
import { findProjectRoot } from './paths.ts'
import { withPresetScope } from './shadow.ts'

const READ_LIMIT = 256 * 1024

export class OperationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * @param {object} ctx - plugin root context
 * @param {{ dshHome: string, agentsHome: string }} homes
 * @param {{ invalidate(): void, trash?: (path: string) => Promise<void> }} hooks
 */
export function createOperations(ctx, homes, { invalidate, trash = gioTrash }) {
  /** `workspacePath` comes from the page and must be registered; `cwd` comes from DSH for the calling agent. */
  async function inventoryFor({ workspacePath, cwd }) {
    const projectRoot = cwd !== undefined ? await findProjectRoot(cwd)
      : workspacePath === undefined ? undefined : await workspaceRoot(workspacePath)
    const customSkillDirs = await customRoots(ctx, projectRoot ?? homedir())
    const folder = cwd ?? workspacePath
    return { projectRoot, inventory: await scanInventory({ ...homes, customSkillDirs, projectRoot, workspacePath: folder }) }
  }

  async function workspaceRoot(workspacePath) {
    if (typeof workspacePath !== 'string' || workspacePath === '') throw new OperationError('bad-request', 'workspace path is required')
    const registry = ctx.get('workspaceRegistry')
    if (registry !== undefined && !registry.list().some(workspace => resolve(workspace.path) === resolve(workspacePath))) {
      throw new OperationError('unknown-workspace', `not a registered workspace: ${workspacePath}`)
    }
    return findProjectRoot(workspacePath)
  }

  async function updateLoadout(level, projectRoot, change) {
    const path = loadoutPath({ ...homes, projectRoot }, level)
    let current
    try {
      current = parseLoadout(await readOptional(path))
    } catch (error) {
      throw new OperationError('malformed-loadout', `${path}: ${error.message}. Fix the file by hand; it was not changed.`)
    }
    await writeAtomic(path, serializeLoadout(change(current)))
    invalidate()
    return path
  }

  return {
    /** Grouped view for the settings page. */
    async state({ workspacePath, cwd } = {}) {
      const { projectRoot, inventory } = await inventoryFor({ workspacePath, cwd })
      const group = level => ({
        loadoutPath: inventory.levels[level].loadoutPath,
        ...inventory.levels[level].error !== undefined ? { error: inventory.levels[level].error } : {},
        skills: inventory.skills.filter(item => item.level === level).map(skillView),
        rules: inventory.rules.filter(item => item.level === level).map(ruleView),
        instructions: inventory.instructions.filter(item => item.level === level).map(instructionView),
      })
      return {
        global: group('global'),
        ...projectRoot !== undefined ? { workspace: { path: workspacePath ?? cwd, projectRoot, ...group('project') } } : {},
      }
    },

    /** `level` pins the loadout.json to write; omitted, the winner's level is used. */
    async setSkill({ workspacePath, cwd, name, state, level }) {
      if (!SKILL_STATES.includes(state)) throw new OperationError('bad-request', `state must be one of ${SKILL_STATES.join(', ')}`)
      const { projectRoot, inventory } = await inventoryFor({ workspacePath, cwd })
      const named = inventory.skills.filter(skill => skill.name === name && (level === undefined || skill.level === level))
      const item = named.find(skill => skill.overriddenBy === undefined) ?? named[0]
      if (item === undefined) throw new OperationError('not-found', `no skill named "${name}"`)
      const path = await updateLoadout(item.level, projectRoot, loadout => withSkillState(loadout, name, state))
      return { name, level: item.level, state, loadoutPath: path, ...item.fileManual && state === 'on' ? { note: 'the skill file sets disable-model-invocation, so it stays manual' } : {} }
    },

    async setRule({ workspacePath, cwd, id, enabled }) {
      if (typeof enabled !== 'boolean') throw new OperationError('bad-request', 'enabled must be a boolean')
      const { projectRoot, inventory } = await inventoryFor({ workspacePath, cwd })
      const item = inventory.rules.find(rule => rule.id === id)
      if (item === undefined) throw new OperationError('not-found', `no rule with id "${id}"`)
      const path = await updateLoadout(item.level, projectRoot, loadout => withRuleEnabled(loadout, id, enabled))
      return { id, level: item.level, enabled, loadoutPath: path }
    },

    /** Move a scanned skill entry or rule file to the trash. User-only. */
    async remove({ workspacePath, path }) {
      const { inventory } = await inventoryFor({ workspacePath })
      const target = [...inventory.skills.map(s => ({ path: s.entry, readOnly: s.readOnly })), ...inventory.rules.map(r => ({ path: r.file, readOnly: false }))]
        .find(item => item.path === path)
      if (target === undefined) throw new OperationError('not-found', `not a listed skill or rule: ${path}`)
      if (target.readOnly) throw new OperationError('read-only', `${path} is inside the application archive and cannot be deleted`)
      await trash(path)
      invalidate()
      return { path, trashed: true }
    },

    /** Text of a scanned skill, rule, or instruction file, for the inline preview. */
    async read({ workspacePath, path }) {
      const { inventory } = await inventoryFor({ workspacePath })
      const listed = [...inventory.skills.map(s => s.file), ...inventory.rules.map(r => r.file), ...inventory.instructions.map(i => i.file)]
      if (!listed.includes(path)) throw new OperationError('not-found', `not a listed skill, rule, or instruction file: ${path}`)
      const text = await readFile(path, 'utf8')
      return text.length > READ_LIMIT ? { path, text: text.slice(0, READ_LIMIT), truncated: true } : { path, text, truncated: false }
    },
  }
}

function skillView(item) {
  return {
    name: item.name,
    description: item.description,
    source: item.source,
    state: item.state,
    fileManual: item.fileManual,
    readOnly: item.readOnly,
    file: item.file,
    entry: item.entry,
    ...item.overriddenBy !== undefined ? { overriddenBy: item.overriddenBy } : {},
  }
}

/** Instruction files are read-only: DSH loads every one it finds, `loadout.json` does not switch them. */
function instructionView(item) {
  return { name: item.name, location: item.location, file: item.file }
}

function ruleView(item) {
  return {
    id: item.id,
    name: item.name,
    ...item.description !== undefined ? { description: item.description } : {},
    source: item.source,
    enabled: item.enabled,
    file: item.file,
  }
}

/** Custom skill roots, derived from registry winners with `source: 'custom'` (default preset scope). */
async function customRoots(ctx, cwd) {
  if (ctx.get('skills') === undefined) return []
  try {
    const winners = await withPresetScope(ctx, undefined, scope => ctx.get('skills').list({ cwd, scope }))
    const roots = new Set()
    for (const winner of winners) {
      if (winner.source !== 'custom' || typeof winner.path !== 'string') continue
      roots.add(basename(winner.path) === 'SKILL.md' ? dirname(dirname(winner.path)) : dirname(winner.path))
    }
    return [...roots]
  } catch (error) {
    ctx.logger?.warn?.(`dsh-loadout: custom skill roots unavailable: ${error?.message ?? error}`)
    return []
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, text)
  await rename(temporary, path)
}

/** `gio trash`; on any failure the file stays where it is. */
export function gioTrash(path) {
  return new Promise((resolvePromise, reject) => {
    execFile('gio', ['trash', '--', path], { timeout: 15_000 }, (error, _stdout, stderr) => {
      if (error === null) return resolvePromise()
      const reason = error.code === 'ENOENT' ? 'gio is not installed' : (stderr.trim() || error.message)
      reject(new OperationError('trash-unavailable', `could not move ${path} to the trash: ${reason}. Nothing was deleted.`))
    })
  })
}
