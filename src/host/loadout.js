/**
 * `loadout.json`: per-level skill states and rule switches. A missing entry
 * means "on"; writing the default state removes the entry so the file stays
 * minimal. Keys this module does not own are preserved.
 */

export const SKILL_STATES = Object.freeze(['on', 'manual', 'off'])

/**
 * @param {string | undefined} text - file contents, `undefined` when the file is absent
 * @returns {object} loadout object (treat as opaque; read it with the accessors below)
 * @throws {Error} when the text is not a JSON object
 */
export function parseLoadout(text) {
  if (text === undefined || text.trim() === '') return {}
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`loadout.json is not valid JSON: ${error.message}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('loadout.json must contain a JSON object')
  }
  return value
}

/** @returns {'on'|'manual'|'off'} */
export function skillState(loadout, name) {
  const value = section(loadout, 'skills')[name]
  return SKILL_STATES.includes(value) ? value : 'on'
}

/** @returns {boolean} */
export function ruleEnabled(loadout, id) {
  return section(loadout, 'rules')[id] !== false
}

export function withSkillState(loadout, name, state) {
  if (!SKILL_STATES.includes(state)) throw new Error(`unknown skill state "${state}"`)
  return withEntry(loadout, 'skills', name, state === 'on' ? undefined : state)
}

export function withRuleEnabled(loadout, id, enabled) {
  return withEntry(loadout, 'rules', id, enabled ? undefined : false)
}

/** @returns {string} pretty JSON with a trailing newline; empty sections are dropped */
export function serializeLoadout(loadout) {
  const out = { ...loadout }
  for (const key of ['skills', 'rules']) {
    if (isRecord(out[key]) && Object.keys(out[key]).length === 0) delete out[key]
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

function withEntry(loadout, key, id, value) {
  const entries = { ...section(loadout, key) }
  if (value === undefined) delete entries[id]
  else entries[id] = value
  return { ...loadout, [key]: entries }
}

function section(loadout, key) {
  return isRecord(loadout[key]) ? loadout[key] : {}
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
