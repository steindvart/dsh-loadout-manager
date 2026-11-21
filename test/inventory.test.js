import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { scanInventory, shadowsFor } from '../src/host/inventory.js'

function tree(files) {
  const base = mkdtempSync(join(tmpdir(), 'loadout-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return base
}

function skill(name, description = `${name} skill`, extra = '') {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n# ${name}\n`
}

function homes(base) {
  return { dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }
}

test('lists a global skill as on when no loadout.json exists', async (t) => {
  const base = tree({ 'agents/skills/tdd/SKILL.md': skill('tdd', 'Test first.') })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory(homes(base))
  assert.equal(inventory.skills.length, 1)
  assert.deepEqual(pick(inventory.skills[0]), {
    name: 'tdd',
    description: 'Test first.',
    level: 'global',
    source: 'user-agents',
    state: 'on',
    file: join(base, 'agents/skills/tdd/SKILL.md'),
    entry: join(base, 'agents/skills/tdd'),
  })
})

test('takes skill states from the loadout.json of the level the skill lives on', async (t) => {
  const base = tree({
    'agents/skills/tdd/SKILL.md': skill('tdd'),
    'dsh/skills/omarchy.md': skill('omarchy'),
    'agents/skills/grilling/SKILL.md': skill('grilling'),
    'agents/loadout.json': JSON.stringify({ skills: { tdd: 'manual', omarchy: 'off', local: 'off' } }),
    'repo/.agents/skills/local/SKILL.md': skill('local'),
    'repo/.agents/loadout.json': JSON.stringify({ skills: { grilling: 'off' } }),
  })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory({ ...homes(base), projectRoot: join(base, 'repo') })
  assert.deepEqual(states(inventory), { local: 'on', omarchy: 'off', tdd: 'manual', grilling: 'on' })
})

test('shadows registry winners only where the loadout.json of their level narrows the policy', () => {
  const on = { modelInvocable: true, userInvocable: true }
  const winner = (name, source, invocation = on) => ({ name, description: `${name} d`, invocation, source, provider: 'filesystem', path: `/x/${name}/SKILL.md` })
  const winners = [
    winner('tdd', 'user-agents'),
    winner('off-one', 'custom'),
    winner('on-one', 'user-dsh'),
    winner('file-manual', 'user-agents', { modelInvocable: false, userInvocable: true }),
    winner('local', 'project-agents'),
    winner('global-says-off', 'project-dsh'),
  ]
  const shadows = shadowsFor(winners, {
    global: { skills: { tdd: 'manual', 'off-one': 'off', 'file-manual': 'manual', 'global-says-off': 'off' } },
    project: { skills: { local: 'off' } },
  })
  assert.deepEqual(shadows.map(s => [s.name, s.source, s.invocation]), [
    ['local', 'project-agents', { modelInvocable: false, userInvocable: false }],
    ['off-one', 'custom', { modelInvocable: false, userInvocable: false }],
    ['tdd', 'user-agents', { modelInvocable: false, userInvocable: true }],
  ])
  assert.deepEqual(shadows[2], { name: 'tdd', description: 'tdd d', invocation: { modelInvocable: false, userInvocable: true }, source: 'user-agents', path: '/x/tdd/SKILL.md' })
})

test('project skills are never shadowed without a project loadout', () => {
  const winners = [{ name: 'local', description: 'd', invocation: { modelInvocable: true, userInvocable: true }, source: 'project-agents' }]
  assert.deepEqual(shadowsFor(winners, { global: { skills: { local: 'off' } } }), [])
})

test('a skill marked disable-model-invocation in its file is manual and cannot be raised to on', async (t) => {
  const base = tree({
    'agents/skills/manual-one/SKILL.md': skill('manual-one', 'm', 'disable-model-invocation: "yes"\n'),
  })
  t.after(() => rmSync(base, { recursive: true }))
  const [item] = (await scanInventory(homes(base))).skills
  assert.equal(item.state, 'manual')
  assert.equal(item.fileManual, true)
})

test('a same-named skill with a lower rank wins; the loser is marked overridden and casts no shadow', async (t) => {
  const base = tree({
    'agents/skills/tdd/SKILL.md': skill('tdd', 'global'),
    'agents/loadout.json': JSON.stringify({ skills: { tdd: 'off' } }),
    'repo/.agents/skills/tdd/SKILL.md': skill('tdd', 'project'),
    'repo/.agents/skills/zz-tdd/SKILL.md': skill('tdd', 'same root, later entry'),
  })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory({ ...homes(base), projectRoot: join(base, 'repo') })
  const byDescription = Object.fromEntries(inventory.skills.map(s => [s.description, s]))
  assert.equal(byDescription['same root, later entry'].overriddenBy, join(base, 'repo/.agents/skills/tdd/SKILL.md'))
  assert.equal(byDescription.project.overriddenBy, undefined)
  assert.equal(byDescription.global.overriddenBy, join(base, 'repo/.agents/skills/tdd/SKILL.md'))
  assert.equal(byDescription.global.state, 'off')
  assert.equal(byDescription.project.state, 'on')
})

test('lists flat rule files from all rule roots with ids by file name and switches from their level', async (t) => {
  const base = tree({
    'dsh/rules/russian-docs.md': '---\nname: Russian docs\ndescription: Write docs in Russian.\n---\nUse Russian.\n',
    'agents/rules/russian-docs.md': 'Same file name, other root.\n',
    'agents/rules/notes.txt': 'not a rule',
    'agents/rules/nested/deep.md': 'not flat',
    'agents/loadout.json': JSON.stringify({ rules: { 'dsh/russian-docs': false, 'project/style': false } }),
    'repo/.agents/rules/style.md': 'Short functions.\n',
  })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory({ ...homes(base), projectRoot: join(base, 'repo') })
  assert.deepEqual(inventory.rules.map(({ id, name, description, level, source, enabled, file, body }) => ({ id, name, description, level, source, enabled, file, body })), [
    { id: 'dsh/russian-docs', name: 'Russian docs', description: 'Write docs in Russian.', level: 'global', source: 'dsh', enabled: false, file: join(base, 'dsh/rules/russian-docs.md'), body: 'Use Russian.' },
    { id: 'agents/russian-docs', name: 'russian-docs', description: undefined, level: 'global', source: 'agents', enabled: true, file: join(base, 'agents/rules/russian-docs.md'), body: 'Same file name, other root.' },
    { id: 'project/style', name: 'style', description: undefined, level: 'project', source: 'project', enabled: true, file: join(base, 'repo/.agents/rules/style.md'), body: 'Short functions.' },
  ])
})

test('reports a malformed loadout.json on its level and treats that level as all on', async (t) => {
  const base = tree({
    'agents/skills/tdd/SKILL.md': skill('tdd'),
    'agents/loadout.json': '{ broken',
  })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory(homes(base))
  assert.match(inventory.levels.global.error, /loadout\.json/)
  assert.equal(inventory.levels.global.loadoutPath, join(base, 'agents/loadout.json'))
  assert.equal(inventory.skills[0].state, 'on')
})

test('scans custom roots as global, flat skill files, and skips $DSH_HOME/skills/.system and invalid files', async (t) => {
  const base = tree({
    'custom/flat.md': skill('flat'),
    'dsh/skills/.system/hidden/SKILL.md': skill('hidden'),
    'dsh/skills/no-frontmatter/SKILL.md': '# nothing\n',
    'dsh/skills/Bad_Name/SKILL.md': skill('Bad_Name'),
    'dsh/skills/bad-bool/SKILL.md': skill('bad-bool', 'd', 'disable-model-invocation: maybe\n'),
  })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory({ ...homes(base), customSkillDirs: [join(base, 'custom')] })
  assert.deepEqual(inventory.skills.map(s => [s.name, s.level, s.source, s.entry]), [
    ['flat', 'global', 'custom', join(base, 'custom/flat.md')],
  ])
})

test('marks skills inside an .asar archive as read-only', async (t) => {
  const base = tree({
    'app.asar/skills/dsh-doc/SKILL.md': skill('dsh-doc'),
    'agents/skills/tdd/SKILL.md': skill('tdd'),
  })
  t.after(() => rmSync(base, { recursive: true }))
  const inventory = await scanInventory({ ...homes(base), customSkillDirs: [join(base, 'app.asar/skills')] })
  assert.deepEqual(inventory.skills.map(s => [s.name, s.readOnly]), [['dsh-doc', true], ['tdd', false]])
})

function states(inventory) {
  return Object.fromEntries(inventory.skills.map(s => [s.name, s.state]))
}

function pick(item) {
  const { name, description, level, source, state, file, entry } = item
  return { name, description, level, source, state, file, entry }
}
