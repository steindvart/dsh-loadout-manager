import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { isStale, refreshSource, ruleContent, stageSkill } from '../src/host/index-fetch.ts'
import { classifySource } from '../src/host/index-sources.ts'
import { cacheFile, digestTree, readCache } from '../src/host/index-store.ts'

function tree(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), 'loadout-fetch-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return base
}

const index = (skills: unknown[], rules: unknown[] = []) => JSON.stringify({ format: 1, title: 'Test', skills, rules })
const skillFile = (name: string, extra = '') => `---\nname: ${name}\ndescription: ${name} skill\n${extra}---\n# ${name}\n`

test('refreshes a local source, hashes its entries, and stages a skill', async (t) => {
  const base = tree({
    'source/loadout-index.json': index(
      [{ name: 'tdd', description: 'Test first.', path: 'skills/tdd' }],
      [{ name: 'style', path: 'rules/style.md' }],
    ),
    'source/skills/tdd/SKILL.md': skillFile('tdd'),
    'source/skills/tdd/refs/notes.md': 'Notes',
    'source/rules/style.md': '---\nname: Style\n---\nShort functions.\n',
  })
  t.after(() => rm(base, { recursive: true, force: true }))
  const source = classifySource(join(base, 'source'))
  const cache = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(cache.error, undefined)
  assert.equal(cache.title, 'Test')
  assert.equal(cache.skills.length, 1)
  assert.match(cache.skills[0]?.digest ?? '', /^sha256:/)
  assert.match(cache.rules[0]?.digest ?? '', /^sha256:/)
  const stored = await readCache(cacheFile(join(base, 'home'), source.id))
  assert.equal(stored?.title, 'Test')

  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(base, 'home') }, staging)
  assert.equal(await digestTree(staging), cache.skills[0]?.digest)
  const rule = await ruleContent(cache, cache.rules[0]!, { dshHome: join(base, 'home') })
  assert.equal(Buffer.from(rule).toString('utf8'), '---\nname: Style\n---\nShort functions.\n')

  assert.equal(isStale(cache, 10 * 60 * 1000), false)
  assert.equal(isStale(undefined, 10 * 60 * 1000), true)
  assert.equal(isStale({ ...cache, checkedAt: Date.now() - 11 * 60 * 1000 }, 10 * 60 * 1000), true)
})

test('keeps the previous entries when a source breaks, and reports last-fetch timing', async (t) => {
  const base = tree({ 'source/loadout-index.json': index([{ name: 'tdd', path: 'skills/tdd' }]), 'source/skills/tdd/SKILL.md': skillFile('tdd') })
  t.after(() => rm(base, { recursive: true, force: true }))
  const source = classifySource(join(base, 'source'))
  const first = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(first.error, undefined)
  writeFileSync(join(base, 'source/loadout-index.json'), '{ broken')
  const second = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(second.error ?? '', /not valid JSON/)
  assert.equal(second.skills.length, 1, 'the last good entries stay visible')
  assert.equal(second.fetchedAt, first.fetchedAt)
  assert.ok((second.checkedAt ?? 0) >= (first.checkedAt ?? 0))
})

test('refreshes an HTTP index and fetches a skill by its files list and a rule by its URL', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const served: Record<string, { type: string, body: string }> = {
    '/index.json': {
      type: 'application/json',
      body: index(
        [{ name: 'remote', description: 'From HTTP', version: '1.0.0', path: 'skills/remote', files: ['SKILL.md', 'refs/a.md'] }],
        [{ name: 'http-rule', path: 'rules/http-rule.md' }],
      ),
    },
    '/skills/remote/SKILL.md': { type: 'text/markdown', body: skillFile('remote') },
    '/skills/remote/refs/a.md': { type: 'text/markdown', body: 'A' },
    '/rules/http-rule.md': { type: 'text/markdown', body: 'Rule body.\n' },
  }
  const server = await listen((request, response) => {
    const item = served[request.url ?? '']
    if (item === undefined) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': item.type }).end(item.body)
  })
  t.after(() => close(server))
  const source = classifySource(`${urlOf(server)}/index.json`)
  const cache = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(cache.error, undefined)
  assert.equal(cache.kind, 'http')
  assert.equal(cache.base, `${urlOf(server)}/index.json`)
  assert.deepEqual(cache.skills.map(skill => [skill.name, skill.version]), [['remote', '1.0.0']])

  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(base, 'home') }, staging)
  assert.equal(await readFile(join(staging, 'refs/a.md'), 'utf8'), 'A')
  assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: remote/)
  assert.equal(Buffer.from(await ruleContent(cache, cache.rules[0]!, { dshHome: join(base, 'home') })).toString('utf8'), 'Rule body.\n')

  served['/index.json']!.body = '{"format":9}'
  const failed = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(failed.error ?? '', /unsupported format/)
  assert.equal(failed.skills.length, 1)
})

test('stages a skill from a .tar.gz served by an HTTP index', async (t) => {
  const base = tree({ 'pkg/SKILL.md': skillFile('archived'), 'pkg/refs/notes.md': 'Archived notes' })
  t.after(() => rm(base, { recursive: true, force: true }))
  execFileSync('tar', ['-czf', join(base, 'skill.tgz'), '-C', base, 'pkg'])
  const archive = readFileSync(join(base, 'skill.tgz'))
  const server = await listen((request, response) => {
    if (request.url === '/index.json') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(index([{ name: 'archived', path: 'archives/skill.tgz' }]))
    } else if (request.url === '/archives/skill.tgz') {
      response.writeHead(200, { 'content-type': 'application/gzip' }).end(archive)
    } else {
      response.writeHead(404).end()
    }
  })
  t.after(() => close(server))
  const source = classifySource(`${urlOf(server)}/index.json`)
  const cache = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(cache.error, undefined)
  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(base, 'home') }, staging)
  assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: archived/)
  assert.equal(await readFile(join(staging, 'refs/notes.md'), 'utf8'), 'Archived notes')
})

test('a failed HTTP read reports its status and keeps the source usable', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const server = await listen((_request, response) => { response.writeHead(503).end() })
  t.after(() => close(server))
  const cache = await refreshSource(classifySource(`${urlOf(server)}/index.json`), { dshHome: join(base, 'home') })
  assert.match(cache.error ?? '', /HTTP 503/)
  assert.deepEqual(cache.skills, [])
})

function urlOf(server: Server): string {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no address')
  return `http://127.0.0.1:${String(address.port)}`
}

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
