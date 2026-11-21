/**
 * The `loadout` agent tool: list skills and rules with their states, and
 * switch one. It calls the same operations as the settings page; deleting
 * stays with the user.
 */

import { cwdOf } from './shadow.js'

const DESCRIPTION = [
  'List or switch the skills and rules the agent carries (the Loadout plugin).',
  'Skill states: "on" (in the model catalog and /name), "manual" (hidden from the model, still /name), "off" (hidden everywhere).',
  'Rules are .md files from ~/.dsh/rules, ~/.agents/rules, and <project>/.agents/rules; enabled rules are added to context next to AGENTS.md.',
  'action "list" returns global and current-workspace items. action "set" with kind "skill" takes name and state; with kind "rule" takes name (the rule id, such as "agents/commit-style") and enabled.',
  'Changes are written to loadout.json of the item\'s level and apply from the next step. Only change the loadout when the user asks for it.',
].join(' ')

export const loadoutTool = (ctx, operations) => ({
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
    render(_args, value) {
      return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
    },
  },
  async execute(args, exec) {
    exec.signal?.throwIfAborted()
    const cwd = exec.agent === undefined ? undefined : await cwdOf(ctx, exec.agent, exec.signal)
    if (args.action === 'list') return compactListing(await operations.state({ cwd }))
    if (args.action !== 'set') throw new Error('action must be "list" or "set"')
    if (typeof args.name !== 'string' || args.name === '') throw new Error('name is required for action "set"')
    if (args.kind === 'skill') {
      if (args.state === undefined) throw new Error('state is required for a skill')
      return operations.setSkill({ cwd, name: args.name, state: args.state })
    }
    if (args.kind === 'rule') {
      if (typeof args.enabled !== 'boolean') throw new Error('enabled is required for a rule')
      return operations.setRule({ cwd, id: args.name, enabled: args.enabled })
    }
    throw new Error('kind must be "skill" or "rule" for action "set"')
  },
})

function compactListing(state) {
  const group = level => level === undefined ? undefined : {
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
  }
  return { global: group(state.global), ...state.workspace !== undefined ? { workspace: { projectRoot: state.workspace.projectRoot, ...group(state.workspace) } } : {} }
}
