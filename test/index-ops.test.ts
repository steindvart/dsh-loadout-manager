import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createIndexService } from '../src/host/index-ops.ts'
import { classifySource } from '../src/host/index-sources.ts'
import { cacheDir } from '../src/host/index-store.ts'

function tree(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-ops-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return base
}

const skillFile = (name: string, version = '1.0.0') => `---\nname: ${name}\ndescription: ${name} skill\nmetadata:\n  version: "${version}"\n---\n# ${name}\n`
const index = (skills: unknown[], rules: unknown[] = []) => JSON.stringify({ format: 1, title: 'Team', skills, rules })

function setup(sourceFiles: Record<string, string>) {
  const base = tree({
    'source/loadout-index.json': index(
      [{ name: 'tdd', description: 'Test first.', path: 'skills/tdd' }],
      [{ name: 'style', description: 'Short functions.', version: '1.0.0', path: 'rules/style.md' }],
    ),
    'source/skills/tdd/SKILL.md': skillFile('tdd'),
    'source/skills/tdd/refs/notes.md': 'Notes',
    'source/rules/style.md': '---\nname: Style\n---\nShort functions.\n',
    ...sourceFiles,
  })
  const homes = { dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }
  const trashed: string[] = []
  let invalidations = 0
  const service = createIndexService(homes, {
    invalidate: () => { invalidations += 1 },
    trash: async (path) => { trashed.push(path); await rm(path, { recursive: true, force: true }) },
  })
  return { base, homes, service, trashed, invalidations: () => invalidations, source: join(base, 'source') }
}

test('adds a local source, lists its entries, and installs a skill globally with provenance', async (t) => {
  const { base, homes, service, invalidations } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  assert.equal(view.sourcesError, undefined)
  assert.deepEqual(view.sources.map(source => [source.source, source.kind, source.itemCount]), [[join(base, 'source'), 'local', 2]])
  assert.deepEqual(view.entries.map(entry => [entry.kind, entry.name]), [['skill', 'tdd'], ['rule', 'style']])
  assert.deepEqual(view.entries[0]?.installs, [])

  const installed = await service.install({ source: view.sources[0]!.source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  assert.equal(installed.action, 'installed')
  assert.equal(installed.level, 'global')
  assert.equal(installed.path, join(homes.agentsHome, 'skills/tdd'))
  assert.match(await readFile(join(homes.agentsHome, 'skills/tdd/SKILL.md'), 'utf8'), /name: tdd/)
  assert.equal(await readFile(join(homes.agentsHome, 'skills/tdd/refs/notes.md'), 'utf8'), 'Notes')
  assert.equal(invalidations(), 1)

  const after = await service.state(undefined)
  assert.deepEqual(after.entries[0]?.installs.map(install => [install.level, install.version, install.updateAvailable, install.modified]), [
    ['global', '1.0.0', false, false],
  ])
  assert.match(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8'), /"source":/)
})

test('installs a rule, detects a source update, and replaces the copy', async (t) => {
  const { base, homes, service, trashed } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  const rule = await service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })
  assert.equal(rule.path, join(homes.agentsHome, 'rules/style.md'))
  assert.equal(await readFile(join(homes.agentsHome, 'rules/style.md'), 'utf8'), '---\nname: Style\n---\nShort functions.\n')

  writeFileSync(join(base, 'source/rules/style.md'), '---\nname: Style\n---\nEven shorter.\n')
  await service.refresh(undefined, {})
  const updated = await service.state(undefined)
  const ruleInstall = updated.entries.find(entry => entry.kind === 'rule')?.installs[0]
  assert.equal(ruleInstall?.updateAvailable, true)

  const second = await service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })
  assert.equal(second.action, 'updated')
  assert.equal(trashed.length, 1, 'the previous rule file is trashed')
  assert.equal(await readFile(join(homes.agentsHome, 'rules/style.md'), 'utf8'), '---\nname: Style\n---\nEven shorter.\n')
})

test('a newer index version marks a copy for update even when the files did not change', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  await service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })

  writeFileSync(join(base, 'source/loadout-index.json'), index(
    [{ name: 'tdd', description: 'Test first.', version: '1.1.0', path: 'skills/tdd' }],
    [{ name: 'style', description: 'Short functions.', version: '1.1.0', path: 'rules/style.md' }],
  ))
  await service.refresh(undefined, {})
  const bumped = await service.state(undefined)
  assert.deepEqual(bumped.entries.map(entry => [entry.name, entry.version, entry.installs[0]?.version, entry.installs[0]?.updateAvailable]), [
    ['tdd', '1.1.0', '1.0.0', true],
    ['style', '1.1.0', '1.0.0', true],
  ])

  const skill = await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  assert.equal(skill.action, 'updated')
  const rule = await service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })
  assert.equal(rule.action, 'updated')
  const updated = await service.state(undefined)
  assert.deepEqual(updated.entries.map(entry => [entry.name, entry.installs[0]?.version, entry.installs[0]?.updateAvailable]), [
    ['tdd', '1.1.0', false],
    ['style', '1.1.0', false],
  ])
  assert.match(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8'), /"version": "1\.1\.0"/)

  writeFileSync(join(base, 'source/loadout-index.json'), index(
    [{ name: 'tdd', description: 'Test first.', version: '0.9.0', path: 'skills/tdd' }],
    [{ name: 'style', description: 'Short functions.', version: '0.9.0', path: 'rules/style.md' }],
  ))
  await service.refresh(undefined, {})
  const downgraded = await service.state(undefined)
  assert.deepEqual(downgraded.entries.map(entry => [entry.name, entry.installs[0]?.updateAvailable]), [['tdd', false], ['style', false]])
})

test('refuses to overwrite local edits without force and replaces them with it', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  const file = join(homes.agentsHome, 'skills/tdd/SKILL.md')
  writeFileSync(file, skillFile('tdd', '9.0.0'))

  const state = await service.state(undefined)
  assert.equal(state.entries[0]?.installs[0]?.modified, true)
  await assert.rejects(
    service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false }),
    /local changes/,
  )
  const forced = await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: true })
  assert.equal(forced.action, 'updated')
  assert.match(await readFile(file, 'utf8'), /1\.0\.0/)
})

test('installs into a workspace, keeps the manifest there, and refuses an unmanaged copy', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const projectRoot = join(base, 'repo')
  mkdirSync(projectRoot, { recursive: true })
  const view = await service.addSource(join(base, 'source'), projectRoot)
  const source = view.sources[0]!.source
  const installed = await service.install({ source, kind: 'skill', name: 'tdd', projectRoot, force: false })
  assert.equal(installed.level, 'project')
  assert.equal(installed.path, join(projectRoot, '.agents/skills/tdd'))
  assert.match(await readFile(join(projectRoot, '.agents/.loadout-manager/installed.json'), 'utf8'), /"skill\/tdd"/)
  assert.equal(await readFile(join(projectRoot, '.agents/.loadout-manager/.gitignore'), 'utf8'), 'work/\nbackups/\n')
  writeFileSync(join(projectRoot, '.agents/.loadout-manager/.gitignore'), '*\n')
  await service.install({ source, kind: 'rule', name: 'style', projectRoot, force: false })
  assert.equal(await readFile(join(projectRoot, '.agents/.loadout-manager/.gitignore'), 'utf8'), '*\n', 'a .gitignore the user wrote stays')

  writeFileSync(join(base, 'source/loadout-index.json'), index([
    { name: 'tdd', description: 'Test first.', path: 'skills/tdd' },
    { name: 'manual', description: 'Manual copy.', path: 'skills/manual' },
  ], [{ name: 'style', description: 'Short functions.', version: '1.0.0', path: 'rules/style.md' }]))
  mkdirSync(join(base, 'source/skills/manual'), { recursive: true })
  writeFileSync(join(base, 'source/skills/manual/SKILL.md'), skillFile('manual'))
  await service.refresh(undefined, {})

  const other = join(projectRoot, '.agents/skills/manual')
  mkdirSync(other, { recursive: true })
  writeFileSync(join(other, 'SKILL.md'), skillFile('manual'))
  await assert.rejects(
    service.install({ source, kind: 'skill', name: 'manual', projectRoot, force: false }),
    /already exists and was not installed from an index/,
  )

  mkdirSync(join(homes.agentsHome, 'skills/tdd'), { recursive: true })
  writeFileSync(join(homes.agentsHome, 'skills/tdd/SKILL.md'), skillFile('tdd'))
  await assert.rejects(
    service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false }),
    /already exists and was not installed from an index/,
  )
})

test('forget drops the provenance record of the deleted path but leaves the installed files', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  await service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })

  await service.forget(join(homes.dshHome, 'skills/tdd'), undefined)
  await service.forget(join(homes.agentsHome, 'rules/tdd.md'), undefined)
  const unchanged = await service.state(undefined)
  assert.deepEqual(unchanged.entries.map(entry => entry.installs.length), [1, 1], 'a same-named item elsewhere keeps the record')

  await service.forget(join(homes.agentsHome, 'skills/tdd'), undefined)
  await service.forget(join(homes.agentsHome, 'rules/style.md'), undefined)
  assert.deepEqual((await service.state(undefined)).entries.map(entry => entry.installs), [[], []], 'a rule named Style in its frontmatter is matched by its file')
  assert.match(await readFile(join(homes.agentsHome, 'skills/tdd/SKILL.md'), 'utf8'), /name: tdd/)
  assert.doesNotMatch(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8'), /skill\/tdd/)
})

test('two installs into one level keep both provenance records', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  writeFileSync(join(base, 'source/loadout-index.json'), index([
    { name: 'tdd', description: 'Test first.', path: 'skills/tdd' },
    { name: 'review', description: 'Review code.', path: 'skills/review' },
  ]))
  mkdirSync(join(base, 'source/skills/review'), { recursive: true })
  writeFileSync(join(base, 'source/skills/review/SKILL.md'), skillFile('review'))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await Promise.all([
    service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false }),
    service.install({ source, kind: 'skill', name: 'review', projectRoot: undefined, force: false }),
  ])
  const state = await service.state(undefined)
  assert.deepEqual(state.entries.find(entry => entry.name === 'review')?.installs.map(install => install.level), ['global'])
  assert.match(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8'), /"skill\/tdd"/)
  assert.match(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8'), /"skill\/review"/)
})

test('search matches names, descriptions, tags, and the kind filter', async (t) => {
  const { base, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  await service.addSource(join(base, 'source'), undefined)
  const all = await service.search({ projectRoot: undefined })
  assert.deepEqual(all.entries.map(entry => entry.name), ['tdd', 'style'])
  assert.deepEqual((await service.search({ projectRoot: undefined, query: 'test' })).entries.map(entry => entry.name), ['tdd'])
  assert.deepEqual((await service.search({ projectRoot: undefined, query: 'functions' })).entries.map(entry => entry.name), ['style'])
  assert.deepEqual((await service.search({ projectRoot: undefined, kind: 'rule' })).entries.map(entry => entry.name), ['style'])
  assert.deepEqual((await service.search({ projectRoot: undefined, query: 'nothing' })).entries, [])
})

test('removing a source keeps installed items and a bad source list is reported', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  assert.equal(existsSync(cacheDir(homes.dshHome, source)), true)
  const removed = await service.removeSource(source, undefined)
  assert.equal(existsSync(cacheDir(homes.dshHome, source)), false, 'the cache of the source goes with it')
  assert.equal(existsSync(join(homes.agentsHome, 'skills/tdd/SKILL.md')), true)
  assert.deepEqual(removed.sources, [])
  assert.equal(removed.entries.length, 0)
  const search = await service.search({ projectRoot: undefined })
  assert.deepEqual(search.entries, [])
  await assert.rejects(service.removeSource(source, undefined), /not a configured index source/)

  writeFileSync(join(base, 'agents/loadout-indexes.json'), '{ broken')
  const broken = await service.state(undefined)
  assert.match(broken.sourcesError ?? '', /not valid JSON/)
})

test('a source with an older cached read refreshes only when asked', async (t) => {
  const { base, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  await service.addSource(join(base, 'source'), undefined)
  const fresh = await service.refresh(undefined, { ifStale: true })
  assert.equal(fresh.sources[0]?.fetchedAt !== undefined, true)
  const again = await service.refresh(undefined, { ifStale: true })
  assert.equal(again.sources[0]?.fetchedAt, fresh.sources[0]?.fetchedAt)
})

test('reports a source that is not an index, and installing from it fails clearly', async (t) => {
  const { base, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const empty = join(base, 'empty')
  mkdirSync(empty)
  const view = await service.addSource(empty, undefined)
  assert.match(view.sources[0]?.error ?? '', /loadout-index\.json/)
  assert.deepEqual(view.entries, [])
  await assert.rejects(
    service.install({ source: classifySource(empty).id, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false }),
    /lists no skill named "tdd"/,
  )
})

test('a versioned skill entry still needs a SKILL.md that names it and describes it', async (t) => {
  const { base, homes, service, source } = setup({
    'source/skills/tdd/SKILL.md': '---\nname: something-else\n---\n# body\n',
  })
  t.after(() => rm(base, { recursive: true, force: true }))
  writeFileSync(join(source, 'loadout-index.json'), index([{ name: 'tdd', version: '2.0.0', path: 'skills/tdd' }]))
  await service.addSource(source, undefined)
  await assert.rejects(
    service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false }),
    /SKILL\.md names the skill "something-else"/,
  )
  writeFileSync(join(source, 'skills/tdd/SKILL.md'), '---\nname: tdd\n---\n# body\n')
  await service.refresh(undefined, {})
  await assert.rejects(
    service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false }),
    /needs a non-empty description/,
  )
  assert.equal(existsSync(join(homes.agentsHome, 'skills/tdd')), false)

  writeFileSync(join(source, 'skills/tdd/SKILL.md'), skillFile('tdd', '1.5.0'))
  await service.refresh(undefined, {})
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  const state = await service.state(undefined)
  assert.equal(state.entries[0]?.installs[0]?.version, '2.0.0', 'the index version wins over the frontmatter one')
})

test('an install waits for a running refresh of the same source', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-ops-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const service = createIndexService({ dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }, {
    invalidate: () => undefined,
    trash: async (path) => { await rm(path, { recursive: true, force: true }) },
  })
  const events: string[] = []
  let hold: Promise<void> = Promise.resolve()
  const server = createServer((request, response) => {
    events.push(`start ${request.url ?? ''}`)
    void (async () => {
      if (request.url === '/index.json') {
        await hold
        events.push('end /index.json')
        response.writeHead(200, { 'content-type': 'application/json' }).end(index([], [{ name: 'style', path: 'rules/style.md' }]))
      } else {
        response.writeHead(200).end('Rule.\n')
      }
    })()
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  t.after(() => new Promise<void>((resolve) => { server.close(() => { resolve() }) }))
  const address = server.address()
  const source = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}/index.json`
  await service.addSource(source, undefined)

  events.length = 0
  let release = (): void => undefined
  hold = new Promise((resolve) => { release = resolve })
  const refreshing = service.refresh(undefined, { source })
  while (!events.includes('start /index.json')) await new Promise(resolve => setTimeout(resolve, 5))
  const installing = service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })
  setTimeout(release, 100)
  await Promise.all([refreshing, installing])
  assert.deepEqual(events, ['start /index.json', 'end /index.json', 'start /rules/style.md'])
})

test('updateAll refreshes and updates global installs that have newer content', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  await service.install({ source, kind: 'rule', name: 'style', projectRoot: undefined, force: false })

  writeFileSync(join(base, 'source/loadout-index.json'), index(
    [{ name: 'tdd', description: 'Test first.', version: '1.1.0', path: 'skills/tdd' }],
    [{ name: 'style', description: 'Short functions.', version: '1.1.0', path: 'rules/style.md' }],
  ))
  writeFileSync(join(base, 'source/skills/tdd/SKILL.md'), skillFile('tdd', '1.1.0'))
  writeFileSync(join(base, 'source/rules/style.md'), '---\nname: Style\n---\nEven shorter.\n')

  const result = await service.updateAll()
  assert.equal(result.refreshed, 1)
  assert.equal(result.updated, 2)
  assert.equal(result.skipped, 0)
  assert.match(await readFile(join(homes.agentsHome, 'skills/tdd/SKILL.md'), 'utf8'), /1\.1\.0/)
  assert.equal(await readFile(join(homes.agentsHome, 'rules/style.md'), 'utf8'), '---\nname: Style\n---\nEven shorter.\n')

  const state = await service.state(undefined)
  assert.deepEqual(state.entries.map(entry => entry.installs[0]?.updateAvailable), [false, false], 'no updates remain after updateAll')
})

test('updateAll skips locally modified copies and leaves foreign copies alone', async (t) => {
  const { base, homes, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })

  // A local edit, then a source update: the copy is `modified`, so it must be skipped.
  writeFileSync(join(homes.agentsHome, 'skills/tdd/SKILL.md'), skillFile('tdd', '9.0.0'))
  writeFileSync(join(base, 'source/loadout-index.json'), index([{ name: 'tdd', description: 'Test first.', version: '1.1.0', path: 'skills/tdd' }]))
  writeFileSync(join(base, 'source/skills/tdd/SKILL.md'), skillFile('tdd', '1.1.0'))

  const result = await service.updateAll()
  assert.equal(result.updated, 0)
  assert.equal(result.skipped, 1)
  assert.match(await readFile(join(homes.agentsHome, 'skills/tdd/SKILL.md'), 'utf8'), /9\.0\.0/, 'the local edit stays')
})

test('updateAll with no sources or no updates reports zero work', async (t) => {
  const { base, service } = setup({})
  t.after(() => rm(base, { recursive: true, force: true }))
  assert.deepEqual(await service.updateAll(), { refreshed: 0, updated: 0, skipped: 0 })

  const view = await service.addSource(join(base, 'source'), undefined)
  const source = view.sources[0]!.source
  await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  assert.deepEqual(await service.updateAll(), { refreshed: 1, updated: 0, skipped: 0 })
})
