import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { refreshSource, ruleContent, stageSkill } from '../src/host/index-fetch.ts'
import { createIndexService } from '../src/host/index-ops.ts'
import { classifySource } from '../src/host/index-sources.ts'

const skillFile = (name: string) => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n`

interface Package {
  name: string
  version: string
  files: Record<string, string>
  /** `package.json` fields; `loadout` defaults to the skill layout. */
  manifest?: Record<string, unknown>
}

/** Pack `files` under `package/` the way `npm pack` does. */
function pack(pkg: Package): Buffer {
  const base = mkdtempSync(join(tmpdir(), 'loadout-npm-pack-'))
  const manifest = { name: pkg.name, version: pkg.version, ...pkg.manifest }
  for (const [path, content] of Object.entries({ ...pkg.files, 'package.json': JSON.stringify(manifest) })) {
    const full = join(base, 'package', path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  execFileSync('tar', ['-czf', join(base, 'pkg.tgz'), '-C', base, 'package'])
  const bytes = readFileSync(join(base, 'pkg.tgz'))
  execFileSync('rm', ['-rf', base])
  return bytes
}

const integrity = (bytes: Buffer) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`

type Published = Package & { kind: 'skill' | 'rule', entry: string, dist?: Record<string, string> }

/**
 * A registry under `/npm/` plus a format 2 index at `/index.json`. Each
 * package is served with its packument and tarball; `dist` overrides what
 * the packument claims about the tarball. `publish` adds a version and moves
 * the index's `latest` to it.
 */
async function registry(packages: Published[]) {
  const requested: string[] = []
  const served = new Map<string, { type: string, body: Buffer | string }>()
  const server = await listen((request, response) => {
    const url = decodeURIComponent(request.url ?? '')
    requested.push(url)
    const item = served.get(url)
    if (item === undefined) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': item.type }).end(item.body)
  })
  const base = `http://127.0.0.1:${String((server.address() as { port: number }).port)}`
  const published: Published[] = []
  const state = { server, base, requested, index: '', publish }
  function publish(pkg: Published): void {
    published.push(pkg)
    const tarball = pack(pkg)
    const file = `${pkg.name.split('/').pop() ?? pkg.name}-${pkg.version}.tgz`
    served.set(`/npm/${pkg.name}/-/${file}`, { type: 'application/octet-stream', body: tarball })
    const previous = served.get(`/npm/${pkg.name}`)
    const packument: { versions: Record<string, unknown> } = previous === undefined
      ? { versions: {} }
      : JSON.parse(String(previous.body)) as { versions: Record<string, unknown> }
    packument.versions[pkg.version] = {
      name: pkg.name, version: pkg.version, dist: { tarball: `${base}/npm/${pkg.name}/-/${file}`, integrity: integrity(tarball), ...pkg.dist },
    }
    served.set(`/npm/${pkg.name}`, { type: 'application/json', body: JSON.stringify(packument) })
    const index: { format: 2, skills: unknown[], rules: unknown[] } = { format: 2, skills: [], rules: [] }
    for (const entry of new Set(published.map(item => item.entry))) {
      const versions = published.filter(item => item.entry === entry)
      const last = versions.at(-1) as Published
      ;(last.kind === 'skill' ? index.skills : index.rules).push({
        name: entry,
        'dist-tags': { latest: last.version },
        versions: versions.map(item => ({ version: item.version, publishTimestamp: 1_790_000_000, source: { type: 'npm', package: item.name, registry: `${base}/npm/` } })),
      })
    }
    state.index = JSON.stringify(index)
    served.set('/index.json', { type: 'application/json', body: state.index })
  }
  for (const pkg of packages) publish(pkg)
  return state
}

const tddSkill = (extra: Partial<Package & { dist: Record<string, string> }> = {}) => ({
  kind: 'skill' as const,
  entry: 'tdd',
  name: '@team-skills/tdd',
  version: '1.2.0',
  files: { 'README.md': '# For people', 'skill/SKILL.md': skillFile('tdd'), 'skill/refs/notes.md': 'Notes' },
  manifest: { loadout: { kind: 'skill', name: 'tdd', path: 'skill' } },
  ...extra,
})

test('stages a skill and reads a rule from npm packages a format 2 index pins', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'loadout-npm-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const npm = await registry([
    tddSkill(),
    {
      kind: 'rule', entry: 'be-brief', name: '@team-rules/be-brief', version: '1.0.0',
      files: { 'be-brief.md': 'Be brief.\n' },
      manifest: { loadout: { kind: 'rule', name: 'be-brief', path: 'be-brief.md' } },
    },
  ])
  t.after(() => close(npm.server))
  const cache = await refreshSource(classifySource(`${npm.base}/index.json`), { dshHome: home })
  assert.equal(cache.error, undefined)
  assert.deepEqual(cache.skills[0]?.npm, { package: '@team-skills/tdd', version: '1.2.0', registry: `${npm.base}/npm/` })

  const staging = join(home, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: home }, staging)
  assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: tdd/)
  assert.equal(await readFile(join(staging, 'refs/notes.md'), 'utf8'), 'Notes')
  assert.equal(existsSync(join(staging, 'package.json')), false)
  assert.equal(existsSync(join(staging, 'README.md')), false)

  assert.equal(Buffer.from(await ruleContent(cache, cache.rules[0]!, { dshHome: home })).toString('utf8'), 'Be brief.\n')
})

test('a format 2 index in a local directory is read without looking for entry paths', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'loadout-npm-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const npm = await registry([tddSkill()])
  t.after(() => close(npm.server))
  mkdirSync(join(home, 'source'))
  writeFileSync(join(home, 'source', 'loadout-index.json'), npm.index)
  const cache = await refreshSource(classifySource(join(home, 'source')), { dshHome: join(home, 'dsh') })
  assert.equal(cache.error, undefined)
  const staging = join(home, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(home, 'dsh') }, staging)
  assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: tdd/)
})

test('refuses a package whose tarball does not match the published integrity', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'loadout-npm-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const npm = await registry([tddSkill({ dist: { integrity: integrity(Buffer.from('other')) } })])
  t.after(() => close(npm.server))
  const cache = await refreshSource(classifySource(`${npm.base}/index.json`), { dshHome: home })
  await assert.rejects(stageSkill(cache, cache.skills[0]!, { dshHome: home }, join(home, 'staging')), /integrity/)
  assert.equal(existsSync(join(home, 'staging')), false)
})

test('a tarball outside the registry origin is never fetched', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'loadout-npm-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const npm = await registry([tddSkill({ dist: { tarball: 'http://evil.example/tdd-1.2.0.tgz' } })])
  t.after(() => close(npm.server))
  const cache = await refreshSource(classifySource(`${npm.base}/index.json`), { dshHome: home })
  await assert.rejects(stageSkill(cache, cache.skills[0]!, { dshHome: home }, join(home, 'staging')), /leaves/)
  assert.deepEqual(npm.requested, ['/index.json', '/npm/@team-skills/tdd'])
})

test('the package manifest must match the index and keep its payload inside the package', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'loadout-npm-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ name: '@other/tdd' }, /package\.json names "@other\/tdd@1\.2\.0"/],
    [{ version: '9.9.9' }, /package\.json names "@team-skills\/tdd@9\.9\.9"/],
    [{ loadout: undefined }, /no "loadout" field/],
    [{ loadout: { kind: 'rule', name: 'tdd', path: 'skill' } }, /loadout\.kind is "rule"/],
    [{ loadout: { kind: 'skill', name: 'other', path: 'skill' } }, /loadout\.name is "other"/],
    [{ loadout: { kind: 'skill', name: 'tdd', path: '../x' } }, /not a safe relative path/],
    [{ loadout: { kind: 'skill', name: 'tdd', path: 'missing' } }, /missing/],
  ]
  for (const [manifest, pattern] of cases) {
    const base = tddSkill()
    const npm = await registry([{ ...base, manifest: { ...base.manifest, ...manifest } }])
    try {
      const cache = await refreshSource(classifySource(`${npm.base}/index.json`), { dshHome: home })
      await assert.rejects(stageSkill(cache, cache.skills[0]!, { dshHome: home }, join(home, 'staging')), pattern)
    } finally {
      await close(npm.server)
    }
  }
})

test('installs an npm entry, records its spec, and updates when latest moves', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'loadout-npm-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const npm = await registry([tddSkill()])
  t.after(() => close(npm.server))
  const homes = { dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }
  const service = createIndexService(homes, { invalidate: () => {}, trash: async path => rm(path, { recursive: true, force: true }) })
  const source = `${npm.base}/index.json`
  await service.addSource(source, undefined)

  const first = await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  assert.equal(first.action, 'installed')
  assert.match(await readFile(join(homes.agentsHome, 'skills/tdd/SKILL.md'), 'utf8'), /name: tdd/)
  const installed = JSON.parse(await readFile(join(homes.agentsHome, '.loadout-manager/installed.json'), 'utf8')) as { items: Record<string, { path: string, version: string }> }
  assert.deepEqual([installed.items['skill/tdd']?.path, installed.items['skill/tdd']?.version], ['@team-skills/tdd@1.2.0', '1.2.0'])

  const next = tddSkill({ version: '1.3.0' })
  npm.publish({ ...next, files: { ...next.files, 'skill/refs/notes.md': 'Notes 1.3.0' } })
  const view = await service.refresh(undefined, {})
  assert.deepEqual(view.entries.map(entry => [entry.name, entry.version, entry.installs[0]?.version, entry.installs[0]?.updateAvailable]), [['tdd', '1.3.0', '1.2.0', true]])

  const second = await service.install({ source, kind: 'skill', name: 'tdd', projectRoot: undefined, force: false })
  assert.equal(second.action, 'updated')
  assert.equal(await readFile(join(homes.agentsHome, 'skills/tdd/refs/notes.md'), 'utf8'), 'Notes 1.3.0')
  const after = await service.state(undefined)
  assert.deepEqual(after.entries.map(entry => [entry.installs[0]?.version, entry.installs[0]?.updateAvailable]), [['1.3.0', false]])
})

function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { resolve(server) })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => { if (error === undefined) resolve(); else reject(error) })
  })
}
