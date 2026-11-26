/**
 * Wire contract between the Host and the Loadout Manager page: the Fetch routes
 * `POST /api/dsh-loadout-manager/<op>`, their request bodies, and the views they
 * return. Both halves import these types, so a change to one side that the
 * other does not follow fails `npm run typecheck`. The only value here is
 * `routePath`, derived from the shared plugin identity; everything else is a
 * type, so the client bundle stays free of Host code.
 */

import { ROUTE_PREFIX } from './identity.ts'

export type SkillState = 'on' | 'manual' | 'off'
export type Level = 'global' | 'project'
export type SkillSource = 'project-dsh' | 'project-agents' | 'custom' | 'user-dsh' | 'user-agents'
export type RuleSource = 'dsh' | 'agents' | 'project'
export type IndexKind = 'skill' | 'rule'
export type IndexSourceKind = 'git' | 'local' | 'http'

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

/** Runtime status of one MCP server, reduced to what the page shows. */
export type McpStatusView =
  | { state: 'connected', toolCount: number }
  | { state: 'connecting', attempt: number }
  | { state: 'reconnecting', attempt: number, maxAttempts: number, error: string }
  | { state: 'waiting-credentials', error: string }
  | { state: 'failed', reason: string, error?: string }
  | { state: 'closed' }
  | { state: 'disabled' }

export interface McpToolView {
  /** Model-facing name, `mcp__<server>__<tool>`. */
  name: string
  /** The name without the `mcp__<server>__` prefix. */
  title: string
  description: string
}

export interface McpServerView {
  name: string
  /** `profile`: Settings or the profile patch, can be switched; `plugin`: registered by an installed plugin while it runs. */
  source: 'profile' | 'plugin'
  transport?: 'stdio' | 'streamable-http'
  /** `command args…` or the URL; credential templates stay unexpanded. */
  endpoint?: string
  /** Whether the server runs (the profile entry's `enabled`; plugin servers always run). */
  enabled: boolean
  /** Project level only: the project `loadout.json` hides this server's tools in the workspace. */
  hidden?: boolean
  status: McpStatusView
  /** Tools the server currently provides to agents (connected servers only). */
  tools: McpToolView[]
}

export type McpProbeView =
  | { ok: true, serverName?: string, serverVersion?: string, tools: string[], truncated: boolean, durationMs: number }
  | { ok: false, stage: string, message: string, durationMs: number }

export interface LevelView {
  /** The `loadout.json` the switches of this level write to. */
  loadoutPath: string
  /** Set when that file is malformed; switches of this level are then locked. */
  error?: string
  skills: SkillView[]
  rules: RuleView[]
  instructions: InstructionView[]
  /** MCP servers of the Host; absent when the profile has no MCP manager. */
  mcp?: McpServerView[]
}

export interface WorkspaceView extends LevelView {
  path: string
  projectRoot: string
}

export interface StateView {
  global: LevelView
  workspace?: WorkspaceView
}

/** One configured index source and what its last read learned. */
export interface IndexSourceView {
  /** Canonical source string as stored in the index list. */
  source: string
  kind: IndexSourceKind
  title?: string
  description?: string
  /** Last successful read, Unix milliseconds. */
  fetchedAt?: number
  /** Last read failure; cached entries stay listed. */
  error?: string
  /** Skills and rules the last successful read listed. */
  itemCount: number
}

/** An installed copy of one catalog entry in one scope. */
export interface IndexInstallView {
  level: Level
  version?: string
  installedAt: number
  /** The source lists newer content or a newer version. */
  updateAvailable: boolean
  /** The installed copy no longer matches the content that was installed. */
  modified: boolean
  /** The installed copy came from another index. */
  foreign: boolean
  /** The installed skill directory or rule file. */
  path: string
}

/** One skill or rule an index offers. */
export interface IndexEntryView {
  source: string
  kind: IndexKind
  name: string
  description?: string
  version?: string
  tags: string[]
  /** Copies installed in the scopes the page can see. */
  installs: IndexInstallView[]
}

export interface IndexView {
  /** `~/.agents/loadout-indexes.json`. */
  sourcesPath: string
  /** Set when the source list file is malformed. */
  sourcesError?: string
  /** Set when an installed-items manifest is malformed. */
  installsError?: string
  sources: IndexSourceView[]
  entries: IndexEntryView[]
}

/** Read-only catalog answer for the `loadout` tool. */
export interface IndexSearchView {
  entries: IndexEntryView[]
  sources: Array<{ source: string, error?: string }>
}

/** Request bodies by operation. `workspacePath` must be a registered workspace. */
export interface Requests {
  'state': { workspacePath?: string }
  'set-skill': { workspacePath?: string, name: string, state: SkillState, level?: Level }
  'set-rule': { workspacePath?: string, id: string, enabled: boolean }
  'remove': { workspacePath?: string, path: string }
  'read': { workspacePath?: string, path: string }
  /** Global level: start or stop the server; with `workspacePath`: show or hide its tools in that workspace. */
  'mcp-set': { workspacePath?: string, name: string, enabled: boolean }
  'mcp-restart': { name: string }
  'mcp-probe': { name: string }
  /** Cached catalog only: never fetches. */
  'index-state': { workspacePath?: string }
  /** Fetch one source or all of them; `ifStale` skips reads younger than the TTL. */
  'index-refresh': { workspacePath?: string, source?: string, ifStale?: boolean }
  'index-add-source': { workspacePath?: string, source: string }
  'index-remove-source': { workspacePath?: string, source: string }
  /** Install or update one entry into the selected scope. */
  'index-install': { workspacePath?: string, source: string, kind: IndexKind, name: string, force?: boolean }
}

export interface Responses {
  'state': StateView
  'set-skill': { name: string, level: Level, state: SkillState, loadoutPath: string, note?: string }
  'set-rule': { id: string, level: Level, enabled: boolean, loadoutPath: string }
  'remove': { path: string, trashed: true }
  'read': { path: string, text: string, truncated: boolean }
  'mcp-set': { name: string, level: Level, enabled: boolean, savedTo: string }
  'mcp-restart': { name: string }
  'mcp-probe': McpProbeView
  'index-state': IndexView
  'index-refresh': IndexView
  'index-add-source': IndexView
  'index-remove-source': IndexView
  'index-install': { source: string, kind: IndexKind, name: string, level: Level, path: string, action: 'installed' | 'updated', note?: string }
}

export type Operation = keyof Requests

export type Envelope<T> = { ok: true, value: T } | { ok: false, error: { code: string, message: string } }

/** Absolute route path of an operation. */
export const routePath = (op: Operation): string => `${ROUTE_PREFIX}${op}`
