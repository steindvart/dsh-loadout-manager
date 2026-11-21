import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLoadout, skillState, ruleEnabled, withSkillState, withRuleEnabled, serializeLoadout } from '../src/host/loadout.js'

test('a missing or empty file means everything is on', () => {
  for (const text of [undefined, '', '  \n']) {
    const loadout = parseLoadout(text)
    assert.equal(skillState(loadout, 'tdd'), 'on')
    assert.equal(ruleEnabled(loadout, 'dsh/style'), true)
  }
})

test('reads skill states and rule switches', () => {
  const loadout = parseLoadout(JSON.stringify({
    skills: { omarchy: 'off', tdd: 'manual', grilling: 'on' },
    rules: { 'dsh/russian-docs': false, 'agents/commit-style': true },
  }))
  assert.equal(skillState(loadout, 'omarchy'), 'off')
  assert.equal(skillState(loadout, 'tdd'), 'manual')
  assert.equal(skillState(loadout, 'grilling'), 'on')
  assert.equal(ruleEnabled(loadout, 'dsh/russian-docs'), false)
  assert.equal(ruleEnabled(loadout, 'agents/commit-style'), true)
})

test('ignores values it does not understand', () => {
  const loadout = parseLoadout('{"skills": {"a": "bogus", "b": false}, "rules": {"x": "no"}}')
  assert.equal(skillState(loadout, 'a'), 'on')
  assert.equal(skillState(loadout, 'b'), 'on')
  assert.equal(ruleEnabled(loadout, 'x'), true)
})

test('rejects malformed JSON with a reason', () => {
  assert.throws(() => parseLoadout('{"skills": '), /loadout\.json/)
  assert.throws(() => parseLoadout('[]'), /loadout\.json/)
})

test('setting a non-default state writes it, setting the default removes the entry', () => {
  let loadout = parseLoadout(undefined)
  loadout = withSkillState(loadout, 'tdd', 'manual')
  loadout = withRuleEnabled(loadout, 'project/style', false)
  assert.equal(serializeLoadout(loadout), '{\n  "skills": {\n    "tdd": "manual"\n  },\n  "rules": {\n    "project/style": false\n  }\n}\n')
  loadout = withSkillState(loadout, 'tdd', 'on')
  loadout = withRuleEnabled(loadout, 'project/style', true)
  assert.equal(serializeLoadout(loadout), '{}\n')
})

test('keeps keys written by someone else and does not mutate its input', () => {
  const original = parseLoadout('{"$schema": "x", "skills": {"a": "off"}, "rules": {}, "note": 1}')
  const changed = withSkillState(original, 'b', 'off')
  assert.equal(skillState(original, 'b'), 'on')
  assert.deepEqual(JSON.parse(serializeLoadout(changed)), { $schema: 'x', skills: { a: 'off', b: 'off' }, note: 1 })
})

test('rejects unknown states', () => {
  assert.throws(() => withSkillState(parseLoadout(undefined), 'a', 'maybe'), /state/)
})
