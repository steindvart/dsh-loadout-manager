/**
 * Operations shared by the Loadout Manager page (Fetch routes) and the `loadout`
 * tool. Every file operation re-scans and accepts only paths the scan
 * returned, so a caller cannot reach arbitrary files.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-workspace'
import type {
  IndexKind, IndexSearchView, IndexView, InstructionView, Level, LevelView, Requests, Responses, RuleView, SkillState, SkillView, StateView,
} from '../shared/api.ts'
import { isSkillState, parseLoadout, serializeLoadout, withMcpEnabled, withRuleEnabled, withSkillState, SKILL_STATES, type Loadout } from './loadout.ts'
import { McpUnavailableError, probeMcp, readMcpServers, restartMcp, setMcpEnabled } from './mcp-host.ts'
import { createIndexService, type AutoUpdateResult, type IndexService } from './index-ops.ts'
import { loadoutPath, scanInventory, type Homes, type InstructionItem, type Inventory, type RuleItem, type SkillItem } from './inventory.ts'
import { findProjectRoot } from './paths.ts'
import { messageOf, OperationError } from './errors.ts'
import { createTrash, TrashLeftoverError, type Trash } from './trash.ts'
import { withPresetScope } from './shadow.ts'

const READ_LIMIT = 256 * 1024

/** Where to look: the page passes a registered workspace, the tool passes the calling agent's cwd. */
export interface Target {
  workspacePath?: string | undefined
  cwd?: string | undefined
}

export interface Operations {
  state(target?: Target): Promise<StateView>
  /** `level` pins the loadout.json to write; omitted, the winner's level is used. */
  setSkill(request: Target & { name: string, state: string, level?: Level | undefined }): Promise<Responses['set-skill']>
  setRule(request: Target & { id: string, enabled: unknown }): Promise<Responses['set-rule']>
  /** Move a scanned skill entry or rule file to the trash, else into the DSH trash. User-only. */
  remove(request: Requests['remove']): Promise<Responses['remove']>
  /** Text of a scanned skill, rule, or instruction file, for the inline preview. */
  read(request: Requests['read']): Promise<Responses['read']>
  /** Global: start or stop the server. Workspace: show or hide its tools there (project loadout.json). */
  setMcp(request: Target & { name: string, enabled: unknown }): Promise<Responses['mcp-set']>
  restartMcp(request: Requests['mcp-restart']): Promise<Responses['mcp-restart']>
  probeMcp(request: Requests['mcp-probe']): Promise<Responses['mcp-probe']>
  /** Cached catalog for the current scope; never fetches. */
  indexState(target?: Target): Promise<IndexView>
  indexRefresh(request: Target & { source?: string | undefined, ifStale?: boolean }): Promise<IndexView>
  indexAddSource(request: Target & { source: string }): Promise<IndexView>
  indexRemoveSource(request: Target & { source: string }): Promise<IndexView>
  indexInstall(request: Target & { source: string, kind: IndexKind, name: string, force?: boolean | undefined }): Promise<Responses['index-install']>
  /** Read-only search over cached entries, for the agent tool. */
  indexSearch(request: Target & { query?: string | undefined, kind?: IndexKind | undefined, limit?: number | undefined }): Promise<IndexSearchView>
  /** Refresh every source and update the global installs with newer content. */
  autoUpdate(): Promise<AutoUpdateResult>
}

export interface OperationHooks {
  /** Called after `loadout.json` or a skill file changed. */
  invalidate(): void
  trash?: Trash
}

export function createOperations(ctx: Context, homes: Homes, { invalidate, trash = createTrash(homes.dshHome) }: OperationHooks): Operations {
  const index: IndexService = createIndexService(homes, { invalidate, trash })

  async function inventoryFor({ workspacePath, cwd }: Target): Promise<{ projectRoot: string | undefined, inventory: Inventory }> {
    const projectRoot = cwd !== undefined
      ? await findProjectRoot(cwd)
      : workspacePath === undefined ? undefined : await workspaceRoot(workspacePath)
    const customSkillDirs = await customRoots(ctx, projectRoot ?? homedir())
    const inventory = await scanInventory({ ...homes, customSkillDirs, projectRoot, workspacePath: cwd ?? workspacePath })
    return { projectRoot, inventory }
  }

  async function projectFor({ workspacePath, cwd }: Target): Promise<string | undefined> {
    if (cwd !== undefined) return await findProjectRoot(cwd)
    if (workspacePath === undefined) return undefined
    return await workspaceRoot(workspacePath)
  }

  async function workspaceRoot(workspacePath: string): Promise<string> {
    if (workspacePath === '') throw new OperationError('bad-request', 'workspace path is required')
    const registry = ctx.get('workspaceRegistry')
    if (registry !== undefined && !registry.list().some(workspace => resolve(workspace.path) === resolve(workspacePath))) {
      throw new OperationError('unknown-workspace', `not a registered workspace: ${workspacePath}`)
    }
    return findProjectRoot(workspacePath)
  }

  async function updateLoadout(level: Level, projectRoot: string | undefined, change: (loadout: Loadout) => Loadout): Promise<string> {
    const path = loadoutPath({ ...homes, projectRoot }, level)
    let current: Loadout
    try {
      current = parseLoadout(await readOptional(path))
    } catch (error) {
      throw new OperationError('malformed-loadout', `${path}: ${messageOf(error)}. Fix the file by hand; it was not changed.`)
    }
    await writeAtomic(path, serializeLoadout(change(current)))
    invalidate()
    return path
  }

  return {
    async state({ workspacePath, cwd } = {}) {
      const { projectRoot, inventory } = await inventoryFor({ workspacePath, cwd })
      const group = (level: Level): LevelView => {
        const state = level === 'project' ? inventory.levels.project : inventory.levels.global
        const mcp = readMcpServers(ctx, level === 'project' ? state?.loadout ?? {} : undefined)
        return {
          ...mcp !== undefined ? { mcp } : {},
          loadoutPath: state?.loadoutPath ?? '',
          ...state?.error !== undefined ? { error: state.error } : {},
          skills: inventory.skills.filter(item => item.level === level).map(skillView),
          rules: inventory.rules.filter(item => item.level === level).map(ruleView),
          instructions: inventory.instructions.filter(item => item.level === level).map(instructionView),
        }
      }
      return {
        global: group('global'),
        ...projectRoot !== undefined ? { workspace: { path: workspacePath ?? cwd ?? projectRoot, projectRoot, ...group('project') } } : {},
      }
    },

    async setSkill({ workspacePath, cwd, name, state, level }) {
      if (!isSkillState(state)) throw new OperationError('bad-request', `state must be one of ${SKILL_STATES.join(', ')}`)
      const { projectRoot, inventory } = await inventoryFor({ workspacePath, cwd })
      const named = inventory.skills.filter(skill => skill.name === name && (level === undefined || skill.level === level))
      const item = named.find(skill => skill.overriddenBy === undefined) ?? named[0]
      if (item === undefined) throw new OperationError('not-found', `no skill named "${name}"`)
      const path = await updateLoadout(item.level, projectRoot, loadout => withSkillState(loadout, name, state))
      const note = item.fileManual && state === 'on' ? { note: 'the skill file sets disable-model-invocation, so it stays manual' } : {}
      return { name, level: item.level, state: state satisfies SkillState, loadoutPath: path, ...note }
    },

    async setRule({ workspacePath, cwd, id, enabled }) {
      if (typeof enabled !== 'boolean') throw new OperationError('bad-request', 'enabled must be a boolean')
      const { projectRoot, inventory } = await inventoryFor({ workspacePath, cwd })
      const item = inventory.rules.find(rule => rule.id === id)
      if (item === undefined) throw new OperationError('not-found', `no rule with id "${id}"`)
      const path = await updateLoadout(item.level, projectRoot, loadout => withRuleEnabled(loadout, id, enabled))
      return { id, level: item.level, enabled, loadoutPath: path }
    },

    async setMcp({ workspacePath, cwd, name, enabled }) {
      if (typeof enabled !== 'boolean') throw new OperationError('bad-request', 'enabled must be a boolean')
      if (workspacePath === undefined && cwd === undefined) {
        try {
          return { name, level: 'global', enabled, savedTo: await setMcpEnabled(ctx, name, enabled) }
        } catch (error) {
          throw new OperationError(error instanceof McpUnavailableError ? 'mcp-unavailable' : 'mcp-failed', messageOf(error))
        }
      }
      const { projectRoot } = await inventoryFor({ workspacePath, cwd })
      const path = await updateLoadout('project', projectRoot, loadout => withMcpEnabled(loadout, name, enabled))
      return { name, level: 'project', enabled, savedTo: path }
    },

    async restartMcp({ name }) {
      try {
        await restartMcp(ctx, name)
      } catch (error) {
        throw new OperationError('mcp-failed', messageOf(error))
      }
      return { name }
    },

    async probeMcp({ name }) {
      try {
        return await probeMcp(ctx, name)
      } catch (error) {
        throw new OperationError('mcp-failed', messageOf(error))
      }
    },

    async remove({ workspacePath, path }) {
      const { projectRoot, inventory } = await inventoryFor({ workspacePath })
      const skill = inventory.skills.find(item => item.entry === path)
      const rule = inventory.rules.find(item => item.file === path)
      if (skill === undefined && rule === undefined) throw new OperationError('not-found', `not a listed skill or rule: ${path}`)
      if (skill?.readOnly === true) throw new OperationError('read-only', `${path} is inside the application archive and cannot be deleted`)
      const level = skill?.level ?? rule?.level
      const forget = async (): Promise<void> => {
        await index.forget(path, level === 'project' ? projectRoot : undefined)
        invalidate()
      }
      let movedTo: string | undefined
      try {
        movedTo = await trash(path)
      } catch (error) {
        // The entry reached the DSH trash; only a staging folder stayed behind.
        if (error instanceof TrashLeftoverError) await forget()
        throw error
      }
      await forget()
      return { path, trashed: true, ...movedTo !== undefined ? { movedTo } : {} }
    },

    async read({ workspacePath, path }) {
      const { inventory } = await inventoryFor({ workspacePath })
      const listed = [...inventory.skills.map(s => s.file), ...inventory.rules.map(r => r.file), ...inventory.instructions.map(i => i.file)]
      if (!listed.includes(path)) throw new OperationError('not-found', `not a listed skill, rule, or instruction file: ${path}`)
      const text = await readFile(path, 'utf8')
      return text.length > READ_LIMIT ? { path, text: text.slice(0, READ_LIMIT), truncated: true } : { path, text, truncated: false }
    },

    async indexState(target = {}) {
      return await index.state(await projectFor(target))
    },

    async indexRefresh({ workspacePath, cwd, source, ifStale }) {
      return await index.refresh(await projectFor({ workspacePath, cwd }), { source, ifStale })
    },

    async indexAddSource({ workspacePath, cwd, source }) {
      return await index.addSource(source, await projectFor({ workspacePath, cwd }))
    },

    async indexRemoveSource({ workspacePath, cwd, source }) {
      return await index.removeSource(source, await projectFor({ workspacePath, cwd }))
    },

    async indexInstall({ workspacePath, cwd, source, kind, name, force }) {
      if (kind !== 'skill' && kind !== 'rule') throw new OperationError('bad-request', 'kind must be "skill" or "rule"')
      return await index.install({ source, kind, name, projectRoot: await projectFor({ workspacePath, cwd }), force: force === true })
    },

    async indexSearch({ workspacePath, cwd, query, kind, limit }) {
      return await index.search({ projectRoot: await projectFor({ workspacePath, cwd }), query, kind, limit })
    },

    async autoUpdate() {
      return await index.updateAll()
    },
  }
}

function skillView(item: SkillItem): SkillView {
  return {
    name: item.name,
    description: item.description,
    ...item.version !== undefined ? { version: item.version } : {},
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
function instructionView(item: InstructionItem): InstructionView {
  return { name: item.name, location: item.location, file: item.file }
}

function ruleView(item: RuleItem): RuleView {
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
async function customRoots(ctx: Context, cwd: string): Promise<string[]> {
  const registry = ctx.get('skills')
  if (registry === undefined) return []
  try {
    const winners = await withPresetScope(ctx, undefined, scope => registry.list({ cwd, scope }))
    const roots = new Set<string>()
    for (const winner of winners) {
      if (winner.source !== 'custom' || typeof winner.path !== 'string') continue
      roots.add(basename(winner.path) === 'SKILL.md' ? dirname(dirname(winner.path)) : dirname(winner.path))
    }
    return [...roots]
  } catch (error) {
    ctx.logger.warn(`dsh-loadout-manager: custom skill roots unavailable: ${messageOf(error)}`)
    return []
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, text)
  await rename(temporary, path)
}
