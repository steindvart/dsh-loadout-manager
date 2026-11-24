/**
 * Wire contract between the Host and the Loadout page: the Fetch routes
 * `POST /api/dsh-loadout/<op>`, their request bodies, and the views they
 * return. Both halves import these types, so a change to one side that the
 * other does not follow fails `npm run typecheck`. Types only: no values,
 * so the client bundle stays free of Host code.
 */

export type SkillState = 'on' | 'manual' | 'off'
export type Level = 'global' | 'project'
export type SkillSource = 'project-dsh' | 'project-agents' | 'custom' | 'user-dsh' | 'user-agents'
export type RuleSource = 'dsh' | 'agents' | 'project'

export interface SkillView {
  name: string
  description: string
  /** From the skill's frontmatter (`metadata.version`, else `version`), when it has one. */
  version?: string
  source: SkillSource
  state: SkillState
  /** The skill file sets `disable-model-invocation`, so it cannot be `on`. */
  fileManual: boolean
  /** Inside an application archive: can be switched, cannot be deleted. */
  readOnly: boolean
  /** `SKILL.md` or the flat `<name>.md`, for the preview. */
  file: string
  /** The directory or flat file deletion moves to the trash. */
  entry: string
  /** File of the same-named skill that wins over this one. */
  overriddenBy?: string
}

export interface RuleView {
  /** `<source>/<file name>`, the `loadout.json` key. */
  id: string
  name: string
  description?: string
  source: RuleSource
  enabled: boolean
  file: string
}

/** An instruction file DSH always loads (AGENTS.md and friends); read-only. */
export interface InstructionView {
  name: string
  /** `dsh`, `agents`, or the folder relative to the project root (`.` for the root). */
  location: string
  file: string
}

export interface LevelView {
  /** The `loadout.json` the switches of this level write to. */
  loadoutPath: string
  /** Set when that file is malformed; switches of this level are then locked. */
  error?: string
  skills: SkillView[]
  rules: RuleView[]
  instructions: InstructionView[]
}

export interface WorkspaceView extends LevelView {
  path: string
  projectRoot: string
}

export interface StateView {
  global: LevelView
  workspace?: WorkspaceView
}

/** Request bodies by operation. `workspacePath` must be a registered workspace. */
export interface Requests {
  'state': { workspacePath?: string }
  'set-skill': { workspacePath?: string, name: string, state: SkillState, level?: Level }
  'set-rule': { workspacePath?: string, id: string, enabled: boolean }
  'remove': { workspacePath?: string, path: string }
  'read': { workspacePath?: string, path: string }
}

export interface Responses {
  'state': StateView
  'set-skill': { name: string, level: Level, state: SkillState, loadoutPath: string, note?: string }
  'set-rule': { id: string, level: Level, enabled: boolean, loadoutPath: string }
  'remove': { path: string, trashed: true }
  'read': { path: string, text: string, truncated: boolean }
}

export type Operation = keyof Requests

export type Envelope<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }

/** Absolute route path of an operation. */
export const routePath = (op: Operation): string => `/api/dsh-loadout/${op}`
