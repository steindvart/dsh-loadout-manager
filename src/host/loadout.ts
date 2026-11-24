/**
 * `loadout.json`: per-level skill states, rule switches, and MCP servers
 * hidden in a workspace. A missing entry
 * means "on"; writing the default state removes the entry so the file stays
 * minimal. Keys this module does not own are preserved.
 */

import type { SkillState as ApiSkillState } from '../shared/api.ts'

export const SKILL_STATES = Object.freeze(['on', 'manual', 'off'] as const)

export type SkillState = (typeof SKILL_STATES)[number] & ApiSkillState

/** Parsed `loadout.json`. Treat as opaque and read it with the accessors below. */
export type Loadout = Readonly<Record<string, unknown>>

type Section = 'skills' | 'rules' | 'mcp'

export function isSkillState(value: unknown): value is SkillState {
  return (SKILL_STATES as readonly unknown[]).includes(value)
}

/**
 * @param text - file contents, `undefined` when the file is absent
 * @throws when the text is not a JSON object
 */
export function parseLoadout(text: string | undefined): Loadout {
  if (text === undefined || text.trim() === '') return {}
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`loadout.json is not valid JSON: ${(error as Error).message}`)
  }
  if (!isRecord(value)) throw new Error('loadout.json must contain a JSON object')
  return value
}

export function skillState(loadout: Loadout, name: string): SkillState {
  const value = section(loadout, 'skills')[name]
  return isSkillState(value) ? value : 'on'
}

export function ruleEnabled(loadout: Loadout, id: string): boolean {
  return section(loadout, 'rules')[id] !== false
}

/** An MCP server is used unless its entry is `false`. */
export function mcpEnabled(loadout: Loadout, server: string): boolean {
  return section(loadout, 'mcp')[server] !== false
}

export function withMcpEnabled(loadout: Loadout, server: string, enabled: boolean): Loadout {
  return withEntry(loadout, 'mcp', server, enabled ? undefined : false)
}

export function withSkillState(loadout: Loadout, name: string, state: string): Loadout {
  if (!isSkillState(state)) throw new Error(`unknown skill state "${state}"`)
  return withEntry(loadout, 'skills', name, state === 'on' ? undefined : state)
}

export function withRuleEnabled(loadout: Loadout, id: string, enabled: boolean): Loadout {
  return withEntry(loadout, 'rules', id, enabled ? undefined : false)
}

/** Pretty JSON with a trailing newline; empty sections are dropped. */
export function serializeLoadout(loadout: Loadout): string {
  const out: Record<string, unknown> = { ...loadout }
  for (const key of ['skills', 'rules', 'mcp'] as const) {
    const value = out[key]
    if (isRecord(value) && Object.keys(value).length === 0) delete out[key]
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

function withEntry(loadout: Loadout, key: Section, id: string, value: unknown): Loadout {
  const entries: Record<string, unknown> = { ...section(loadout, key) }
  if (value === undefined) delete entries[id]
  else entries[id] = value
  return { ...loadout, [key]: entries }
}

function section(loadout: Loadout, key: Section): Readonly<Record<string, unknown>> {
  const value = loadout[key]
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
