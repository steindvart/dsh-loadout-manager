/**
 * Publish the npm packages of the Catalog fixture (`test/fixtures/index/packages/`)
 * to a registry, so `test/fixtures/index` can be added as a source in a running
 * DSH. A version the registry already has is skipped. The registry and an
 * account that may publish to it come from the environment:
 *
 *   NPM_REGISTRY=http://127.0.0.1:8081/repository/npm-hosted/ NEXUS_LOGIN=… NEXUS_PASSWORD=… node scripts/publish-fixture.mjs
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packages = resolve(dirname(fileURLToPath(import.meta.url)), '../test/fixtures/index/packages')
const { NPM_REGISTRY: registryText, NEXUS_LOGIN: login, NEXUS_PASSWORD: password } = process.env
if (registryText === undefined || login === undefined || password === undefined) {
  console.error('Set NPM_REGISTRY, NEXUS_LOGIN, and NEXUS_PASSWORD.')
  process.exit(2)
}
const registry = registryText.endsWith('/') ? registryText : `${registryText}/`

// A throwaway npmrc keeps the credentials out of the user's own config.
const config = mkdtempSync(join(tmpdir(), 'loadout-fixture-npmrc-'))
const npmrc = join(config, 'npmrc')
const auth = Buffer.from(`${login}:${password}`).toString('base64')
writeFileSync(npmrc, `registry=${registry}\n${registry.replace(/^https?:/, '')}:_auth=${auth}\n`, { mode: 0o600 })

let failed = 0
try {
  for (const name of readdirSync(packages).sort()) {
    const dir = join(packages, name)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const spec = `${manifest.name}@${manifest.version}`
    if (await published(manifest.name, manifest.version)) {
      console.log(`${spec}: already published`)
      continue
    }
    const run = spawnSync('npm', ['publish', dir, '--registry', registry, '--userconfig', npmrc, '--ignore-scripts'], { encoding: 'utf8' })
    if (run.status === 0) {
      console.log(`${spec}: published`)
    } else {
      failed += 1
      console.error(`${spec}: npm publish failed\n${run.stderr.trim()}`)
    }
  }
} finally {
  rmSync(config, { recursive: true, force: true })
}
process.exitCode = failed === 0 ? 0 : 1

async function published(name, version) {
  const response = await fetch(`${registry}${name.replace('/', '%2f')}`, { headers: { authorization: `Basic ${auth}` } })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`${name}: the registry answered ${String(response.status)}`)
  const packument = await response.json()
  return packument.versions?.[version] !== undefined
}
