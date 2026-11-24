/**
 * Build for dsh-loadout, modelled on dsh-better-sidebar's tsdown config:
 *
 * - `lib/index.js` – the Host half (ESM, Node). Everything except Node
 *   builtins is inlined: the bundle is installed as a linked directory, so a
 *   bare import would resolve against this repository, not the DSH profile.
 * - `lib/client.js` – the browser half. It registers itself through
 *   `window.__ModuleLoader__.load({ id, factory })` as a CJS closure; React
 *   comes from the shell's module table (`require('react')`), everything
 *   else is inlined. CSS Modules compile to hashed class maps and inject one
 *   `<style data-plugin>` tag per file, which the loader removes on unload.
 *
 * Types are checked by `tsc --noEmit` (npm run typecheck), not by tsdown.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { builtinModules } from 'node:module'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import packageJson from './package.json' with { type: 'json' }

/** The module loader id must equal the package name. */
const PLUGIN_ID = packageJson.name

/** Node builtins never belong in the browser factory. */
const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map(id => `node:${id}`)])

/** Modules the Web shell shares through the frozen module table (PLATFORM_MODULES). */
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

type BuildPlugin = NonNullable<UserConfig['plugins']>

/** Client code may import Harness packages only as types; values come through Cordis services. */
function clientPurityGate(): BuildPlugin {
  return {
    name: 'dsh-loadout-client-purity',
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(`client bundle purity: Node builtin "${source}" cannot run in the browser`)
      }
      if (source.startsWith('@deepseek-ai/')) {
        throw new Error(`client bundle purity: value import of "${source}"; use a Cordis service and import types with "import type"`)
      }
      return null
    },
  }
}

/** The Host bundle keeps only `node:` imports external; it must not depend on packages next to the checkout. */
function hostSelfContained(): BuildPlugin {
  return {
    name: 'dsh-loadout-host-self-contained',
    resolveId(source: string) {
      if (source.startsWith('@deepseek-ai/')) {
        throw new Error(`host bundle: value import of "${source}"; DSH services come from ctx, import their types with "import type"`)
      }
      return null
    },
  }
}

const CSS_VIRTUAL_PREFIX = '\0dsh-loadout-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** `*.module.css` → hashed class map plus a style tag injected once per file. */
function cssModules(): BuildPlugin {
  return {
    name: 'dsh-loadout-css-modules',
    async resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (resolved === null) return null
      return CSS_VIRTUAL_PREFIX + resolved.id + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: await readFile(fileId),
        cssModules: { pattern: 'dshlo_[local]_[hash]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, entry] of Object.entries(cssExports ?? {})) {
        classMap[local] = [entry.name, ...entry.composes.map(item => item.name)].join(' ')
      }
      const tagId = `${PLUGIN_ID}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + ${JSON.stringify(JSON.stringify(tagId))} + ']') === null) {`,
        `  const tag = document.createElement('style');`,
        `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
        `  tag.dataset.pluginCss = ${JSON.stringify(tagId)};`,
        `  tag.textContent = css;`,
        `  document.head.appendChild(tag);`,
        `}`,
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

const production = JSON.stringify(process.env.NODE_ENV ?? 'production')

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'node24',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: false,
    plugins: [hostSelfContained()],
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2023',
    dts: false,
    clean: false,
    sourcemap: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: { 'process.env.NODE_ENV': production },
    plugins: [clientPurityGate(), cssModules()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
      codeSplitting: false,
    },
  },
] satisfies UserConfig[]
