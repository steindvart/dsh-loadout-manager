/**
 * Rule messages on `agent/pre-step`, next to the AGENTS.md baseline of
 * `dsh-agent-instructions`. State lives in the session log: the latest
 * `dsh-loadout-manager-rules` message carries the snapshot the model has seen.
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent-instructions'
import type { MessageId, UserMessage } from '@deepseek-ai/dsh-llm'
import { scanRules, type Homes } from './inventory.ts'
import { findProjectRoot, ruleDisplayPath } from './paths.ts'
import { renderBaseline, renderChanges, type Rendered, type RuleSnapshot } from './rules.ts'
import { cwdOf, messageOf } from './shadow.ts'

export const SOURCE_KIND = 'dsh-loadout-manager-rules'
const INSTRUCTIONS_MODULE = '@deepseek-ai/dsh-agent-instructions'

/** Source of a rules message; `snapshot` is what the model has seen after it. */
export interface RulesMessageSource {
  kind: typeof SOURCE_KIND
  form: 'instructions'
  baseline?: true
  snapshot: RuleSnapshot
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-loadout-manager-rules': RulesMessageSource
  }
}

/** Adds enabled rules to the context of agents whose preset loads AGENTS.md. */
export function registerRuleContext(ctx: Context, homes: Homes, { maxBytes }: { maxBytes: number }): void {
  const eligible = new WeakMap<Agent, boolean>()

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
        : renderChanges(previous.snapshot, rules, { maxBytes })
      if (rendered.text === '') return decision
      const message = rulesMessage(rendered, previous === undefined)
      return { ...decision, messages: insertAfterInstructions(decision.messages, messages, message) }
    } catch (error) {
      ctx.logger.warn(`dsh-loadout-manager: rules were not added to this step: ${messageOf(error)}`)
      return decision
    }
  })
}

function hasInstructions(ctx: Context, agent: Agent, cache: WeakMap<Agent, boolean>): boolean {
  const known = cache.get(agent)
  if (known !== undefined) return known
  const inspections = ctx.get('agentPresets')?.inspectCompositions(agent.ctx) ?? []
  const result = inspections.some(inspection => inspection.modules.some(module => module.moduleName === INSTRUCTIONS_MODULE))
  cache.set(agent, result)
  return result
}

function isRulesSource(source: { kind: string }): source is RulesMessageSource {
  return source.kind === SOURCE_KIND
}

/** Latest rules source among this step's messages, then on the session surface. */
function lastRulesSource(agent: Agent, stepMessages: readonly UserMessage[]): RulesMessageSource | undefined {
  for (const message of stepMessages.toReversed()) {
    if (isRulesSource(message.source)) return message.source
  }
  for (const message of agent.session.deriveMessages().toReversed()) {
    if (message.role === 'user' && isRulesSource(message.source)) return message.source
  }
  return undefined
}

function rulesMessage({ text, snapshot }: Rendered, baseline: boolean): UserMessage {
  const source: RulesMessageSource = {
    kind: SOURCE_KIND,
    form: 'instructions',
    ...baseline ? { baseline: true } : {},
    snapshot: Object.freeze({ ...snapshot }),
  }
  return Object.freeze({
    id: randomUUID() as MessageId,
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze(source),
  })
}

/** After the last AGENTS.md message of this step, else after the last claimed message. */
function insertAfterInstructions(entered: UserMessage[], claimed: readonly UserMessage[], message: UserMessage): UserMessage[] {
  let index = entered.findLastIndex(item => item.source.kind === 'agent-instructions')
  if (index < 0) index = entered.findLastIndex(item => claimed.includes(item))
  return entered.toSpliced(index + 1, 0, message)
}
