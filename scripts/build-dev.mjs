/**
 * Build the dev clone into `dev/`: the same source compiled under the
 * `dsh-loadout-manager-dev` identity, so it can be installed next to the
 * shipped plugin without colliding on providers, routes, tools, slots, or
 * locale namespaces. Run through `npm run build:dev`.
 */

import { rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

rmSync(resolve(root, 'dev/lib'), { recursive: true, force: true })

const env = {
  ...process.env,
  DSH_PLUGIN_NAME: 'dsh-loadout-manager-dev',
  DSH_PLUGIN_SLUG: 'loadout-dev',
  DSH_PLUGIN_OUT_DIR: 'dev/lib',
}

const child = spawn('npx', ['tsdown'], { cwd: root, env, stdio: 'inherit' })
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
