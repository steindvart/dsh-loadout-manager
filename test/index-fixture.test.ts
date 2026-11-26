import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIndexService } from '../src/host/index-ops.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/index', import.meta.url))

test('the fixture index installs two versioned skills and two versioned rules', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-fixture-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const homes = { dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }
  const service = createIndexService(homes, {
    invalidate: () => {},
    trash: async path => rm(path, { recursive: true, force: true }),
  })

  const view = await service.addSource(FIXTURE, undefined)
  assert.equal(view.sourcesError, undefined)
  assert.deepEqual(view.sources.map(source => [source.kind, source.title, source.itemCount]), [['local', 'Loadout Manager test index', 4]])
  assert.deepEqual(view.entries.map(entry => [entry.kind, entry.name, entry.version]), [
    ['skill', 'index-demo', '1.0.0'],
    ['skill', 'index-versioned', '2.4.0'],
    ['rule', 'index-demo-rule', '1.0.0'],
    ['rule', 'index-versioned-rule', '2.1.0'],
  ])

  for (const entry of view.entries) {
    await service.install({ source: FIXTURE, kind: entry.kind, name: entry.name, projectRoot: undefined, force: false })
  }

  assert.match(await readFile(join(homes.agentsHome, 'skills/index-demo/SKILL.md'), 'utf8'), /name: index-demo/)
  assert.match(await readFile(join(homes.agentsHome, 'skills/index-versioned/references/notes.md'), 'utf8'), /Version: 2\.4\.0/)
  assert.match(await readFile(join(homes.agentsHome, 'rules/index-demo-rule.md'), 'utf8'), /index version is 1\.0\.0/)
  assert.match(await readFile(join(homes.agentsHome, 'rules/index-versioned-rule.md'), 'utf8'), /2\.1\.0 fixture revision/)

  const state = await service.state(undefined)
  assert.deepEqual(state.entries.map(entry => [entry.name, entry.installs[0]?.version, entry.installs[0]?.updateAvailable]), [
    ['index-demo', '1.0.0', false],
    ['index-versioned', '2.4.0', false],
    ['index-demo-rule', '1.0.0', false],
    ['index-versioned-rule', '2.1.0', false],
  ])
  assert.match(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8'), /"version": "2\.4\.0"/)
})
