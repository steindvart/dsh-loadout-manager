/**
 * The `loadout` agent tool: list skills and rules with their states, and
 * switch one. It calls the same operations as the Loadout page; deleting
 * stays with the user.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { LevelView, StateView } from '../shared/api.ts'
import type { Operations } from './operations.ts'
import { cwdOf } from './shadow.ts'

const DESCRIPTION = [
  'List or switch the skills and rules the agent carries (the Loadout plugin).',
  'Skill states: "on" (in the model catalog and /name), "manual" (hidden from the model, still /name), "off" (hidden everywhere).',
  'Rules are .md files from ~/.dsh/rules, ~/.agents/rules, and <project>/.agents/rules; enabled rules are added to context next to AGENTS.md.',
  'action "list" returns global and current-workspace items. action "set" with kind "skill" takes name and state; with kind "rule" takes name (the rule id, such as "agents/commit-style") and enabled.',
  'Changes are written to loadout.json of the item\'s level and apply from the next step. Only change the loadout when the user asks for it.',
].join(' ')

interface Args {
  action?: unknown
  kind?: unknown
  name?: unknown
  state?: unknown
  enabled?: unknown
}

export function loadoutTool(ctx: Context, operations: Operations): ToolDefinition {
  return {
    name: 'loadout',
    description: DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'set'], description: 'list, or set one item' },
        kind: { type: 'string', enum: ['skill', 'rule'], description: 'Item kind for action "set".' },
        name: { type: 'string', description: 'Skill name, or rule id such as "agents/commit-style", for action "set".' },
        state: { type: 'string', enum: ['on', 'manual', 'off'], description: 'New skill state.' },
        enabled: { type: 'boolean', description: 'New rule switch.' },
      },
    },
    output: {
      schema: { type: 'object', description: 'Listing or the applied change.' },
      render(_args: unknown, value: JsonValue): ContentBlock[] {
        return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
      },
    },
    async execute(rawArgs: unknown, exec: ToolRunContext): Promise<unknown> {
      exec.signal.throwIfAborted()
      const args = (typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}) as Args
      const cwd = exec.agent === undefined ? undefined : await cwdOf(ctx, exec.agent, exec.signal)
      if (args.action === 'list') return compactListing(await operations.state({ cwd }))
      if (args.action !== 'set') throw new Error('action must be "list" or "set"')
      if (typeof args.name !== 'string' || args.name === '') throw new Error('name is required for action "set"')
      if (args.kind === 'skill') {
        if (typeof args.state !== 'string') throw new Error('state is required for a skill')
        return operations.setSkill({ cwd, name: args.name, state: args.state })
      }
      if (args.kind === 'rule') {
        if (typeof args.enabled !== 'boolean') throw new Error('enabled is required for a rule')
        return operations.setRule({ cwd, id: args.name, enabled: args.enabled })
      }
      throw new Error('kind must be "skill" or "rule" for action "set"')
    },
  }
}

function compactLevel(level: LevelView) {
  return {
    loadoutPath: level.loadoutPath,
    ...level.error !== undefined ? { error: level.error } : {},
    skills: level.skills.map(skill => ({
      name: skill.name,
      state: skill.state,
      source: skill.source,
      ...skill.fileManual ? { fileManual: true } : {},
      ...skill.overriddenBy !== undefined ? { overriddenBy: skill.overriddenBy } : {},
    })),
    rules: level.rules.map(rule => ({ id: rule.id, enabled: rule.enabled })),
    instructions: level.instructions.map(item => item.file),
  }
}

function compactListing(state: StateView) {
  return {
    global: compactLevel(state.global),
    ...state.workspace !== undefined ? { workspace: { projectRoot: state.workspace.projectRoot, ...compactLevel(state.workspace) } } : {},
  }
}
