/**
 * Rule messages on `agent/pre-step`, next to the AGENTS.md baseline of
 * `dsh-agent-instructions`. State lives in the session log: the latest
 * `dsh-loadout-rules` message carries the snapshot the model has seen.
 */

import { randomUUID } from 'node:crypto'
import { scanRules } from './inventory.ts'
import { findProjectRoot, ruleDisplayPath } from './paths.ts'
import { renderBaseline, renderChanges } from './rules.ts'
import { cwdOf } from './shadow.ts'

export const SOURCE_KIND = 'dsh-loadout-rules'
const INSTRUCTIONS_MODULE = '@deepseek-ai/dsh-agent-instructions'

/**
 * @param {object} ctx - plugin root context
 * @param {{ dshHome: string, agentsHome: string }} homes
 * @param {{ maxBytes: number }} options
 */
export function registerRuleContext(ctx, homes, { maxBytes }) {
  const eligible = new WeakMap()

  ctx.on('agent/pre-step', async (event, next) => {
    const decision = await next()
    const { agent, messages, step, signal } = event
    if (decision.kind !== 'enter') return decision
    if (step === 1 && decision.messages.length === 0) return decision
    try {
      if (!hasInstructions(ctx, agent, eligible)) return decision
      const cwd = await cwdOf(ctx, agent, signal)
      const projectRoot = cwd === undefined ? undefined : await findProjectRoot(cwd)
      const rules = (await scanRules({ ...homes, projectRoot }))
        .filter(rule => rule.enabled)
        .map(rule => ({ displayPath: ruleDisplayPath(rule, { ...homes, projectRoot }), body: rule.body }))
      const previous = lastRulesSource(agent, decision.messages)
      const rendered = previous === undefined
        ? renderBaseline(rules, { maxBytes })
        : renderChanges(previous.snapshot ?? {}, rules, { maxBytes })
      if (rendered.text === '') return decision
      const message = rulesMessage(rendered, previous === undefined)
      return { ...decision, messages: insertAfterInstructions(decision.messages, messages, message) }
    } catch (error) {
      ctx.logger?.warn?.(`dsh-loadout: rules were not added to this step: ${error?.message ?? error}`)
      return decision
    }
  })
}

function hasInstructions(ctx, agent, cache) {
  if (cache.has(agent)) return cache.get(agent)
  const presets = ctx.get('agentPresets')
  const inspections = presets?.inspectCompositions(agent.ctx) ?? []
  const result = inspections.some(inspection => inspection.modules.some(module => module.moduleName === INSTRUCTIONS_MODULE))
  cache.set(agent, result)
  return result
}

/** Latest rules source among this step's messages, then on the session surface. */
function lastRulesSource(agent, stepMessages) {
  for (const message of stepMessages.toReversed()) {
    if (message.source?.kind === SOURCE_KIND) return message.source
  }
  for (const message of agent.session.deriveMessages().toReversed()) {
    if (message.role === 'user' && message.source?.kind === SOURCE_KIND) return message.source
  }
  return undefined
}

function rulesMessage({ text, snapshot }, baseline) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({
      kind: SOURCE_KIND,
      form: 'instructions',
      ...baseline ? { baseline: true } : {},
      snapshot: Object.freeze({ ...snapshot }),
    }),
  })
}

/** After the last AGENTS.md message of this step, else after the last claimed message. */
function insertAfterInstructions(entered, claimed, message) {
  let index = entered.findLastIndex(m => m.source?.kind === 'agent-instructions')
  if (index < 0) index = entered.findLastIndex(m => claimed.includes(m))
  return entered.toSpliced(index + 1, 0, message)
}
