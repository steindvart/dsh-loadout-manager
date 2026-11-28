import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIndexService } from '../src/host/index-ops.ts'

/** Format 1: paths next to the index, readable from the directory or over HTTP. */
const FIXTURE = fileURLToPath(new URL('./fixtures/index', import.meta.url))
/** Format 2: the same skills and rules as npm packages. */
const NPM_FIXTURE = fileURLToPath(new URL('./fixtures/index-npm', import.meta.url))

interface FixtureIndex {
  skills: FixtureEntry[]
  rules: FixtureEntry[]
}

interface FixtureEntry {
  name: string
  versions: Array<{ version: string, source: { package: string, registry: string } }>
}

/** Pack `packages/<name>` under `package/` the way `npm pack` does. */
function pack(name: string, scratch: string): Buffer {
  const base = mkdtempSync(join(scratch, 'pack-'))
  cpSync(join(NPM_FIXTURE, 'packages', name), join(base, 'package'), { recursive: true })
  execFileSync('tar', ['-czf', join(base, 'pkg.tgz'), '-C', base, 'package'])
  return readFileSync(join(base, 'pkg.tgz'))
}

/**
 * Serve every package the npm fixture index lists from a local registry, and
 * copy the index into a local source that points at it, so the test reads
 * the same index and packages DSH reads from the Nexus stand.
 */
async function serveNpmFixture(scratch: string): Promise<{ server: Server, source: string }> {
  const index = JSON.parse(readFileSync(join(NPM_FIXTURE, 'loadout-index.json'), 'utf8')) as FixtureIndex
  const served = new Map<string, { type: string, body: Buffer | string }>()
  const server = createServer((request, response) => {
    const item = served.get(decodeURIComponent(request.url ?? ''))
    if (item === undefined) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': item.type }).end(item.body)
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const origin = `http://127.0.0.1:${String((server.address() as { port: number }).port)}`
  const registry = `${origin}/npm/`
  for (const entry of [...index.skills, ...index.rules]) {
    for (const item of entry.versions) {
      const tarball = pack(entry.name, scratch)
      const file = `/npm/${item.source.package}/-/${entry.name}-${item.version}.tgz`
      served.set(file, { type: 'application/octet-stream', body: tarball })
      const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
      served.set(`/npm/${item.source.package}`, {
        type: 'application/json',
        body: JSON.stringify({ versions: { [item.version]: { name: item.source.package, version: item.version, dist: { tarball: `${origin}${file}`, integrity } } } }),
      })
      item.source.registry = registry
    }
  }
  const source = join(scratch, 'index')
  mkdirSync(source)
  writeFileSync(join(source, 'loadout-index.json'), JSON.stringify(index))
  return { server, source }
}

/** Serve the format 1 fixture directory as static files, the way a raw file URL on GitHub serves it. */
async function serveDirectory(): Promise<{ server: Server, index: string }> {
  const server = createServer((request, response) => {
    const path = normalize(join(FIXTURE, decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)))
    if (!path.startsWith(`${FIXTURE}/`) || !existsSync(path)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200).end(readFileSync(path))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  return { server, index: `http://127.0.0.1:${String((server.address() as { port: number }).port)}/loadout-index.json` }
}

function serviceIn(base: string) {
  const homes = { dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }
  const service = createIndexService(homes, {
    invalidate: () => {},
    trash: async (path) => { await rm(path, { recursive: true, force: true }); return undefined },
  })
  return { homes, service }
}

/** Add `source`, install every entry globally, and check the copies and their versions. */
async function installAll(base: string, source: string, title: string, kind: string): Promise<string> {
  const { homes, service } = serviceIn(base)
  const view = await service.addSource(source, undefined)
  assert.equal(view.sourcesError, undefined)
  assert.deepEqual(view.sources.map(item => [item.kind, item.title, item.itemCount, item.error]), [[kind, title, 4, undefined]])
  assert.deepEqual(view.entries.map(entry => [entry.kind, entry.name, entry.version]), [
    ['skill', 'index-demo', '1.0.0'],
    ['skill', 'index-versioned', '2.4.0'],
    ['rule', 'index-demo-rule', '1.0.0'],
    ['rule', 'index-versioned-rule', '2.1.0'],
  ])

  for (const entry of view.entries) {
    await service.install({ source, kind: entry.kind, name: entry.name, projectRoot: undefined, force: false })
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
  return await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8')
}

test('the fixture index installs two versioned skills and two versioned rules from its directory', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-fixture-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const installed = await installAll(base, FIXTURE, 'Loadout Manager test index', 'local')
  assert.match(installed, /"version": "2\.4\.0"/)
})

test('the fixture index installs the same entries over HTTP, with every file its files lists name', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-fixture-'))
  const { server, index } = await serveDirectory()
  t.after(async () => {
    server.close()
    await rm(base, { recursive: true, force: true })
  })
  const installed = await installAll(base, index, 'Loadout Manager test index', 'http')
  assert.match(installed, /"path": "skills\/index-versioned"/)
})

test('the npm fixture index installs the same entries from their npm packages', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-fixture-'))
  const { server, source } = await serveNpmFixture(base)
  t.after(async () => {
    server.close()
    await rm(base, { recursive: true, force: true })
  })
  const installed = await installAll(base, source, 'Loadout Manager npm test index', 'local')
  assert.match(installed, /"path": "@dsh-loadout-fixtures\/index-versioned@2\.4\.0"/)
})
