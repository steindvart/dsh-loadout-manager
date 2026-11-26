/**
 * Plugin identity shared by the Host and Client halves. The full package name
 * and short slug are injected at build time through the `__PLUGIN_NAME__` and
 * `__PLUGIN_SLUG__` defines (set by `tsdown.config.ts` from the package
 * manifest). Every runtime identifier derives from them, so a renamed build –
 * the `dev/` clone, `dsh-loadout-manager-dev` – registers distinct providers,
 * routes, tools, slots, and locale namespaces instead of colliding with the
 * installed plugin.
 *
 * The `typeof` guard gives the raw `.ts` sources (run by `node:test` without
 * the build step) the original identity: outside the bundle the defines are
 * absent, so each falls back to the shipped name.
 */

declare const __PLUGIN_NAME__: string
declare const __PLUGIN_SLUG__: 'loadout' | 'loadout-dev'

/** Full package name, e.g. `dsh-loadout-manager`. */
export const PLUGIN_NAME: string = typeof __PLUGIN_NAME__ === 'string' ? __PLUGIN_NAME__ : 'dsh-loadout-manager'

/** Short slug, e.g. `loadout`; the dev clone uses `loadout-dev`. */
export const PLUGIN_SLUG: 'loadout' | 'loadout-dev' = typeof __PLUGIN_SLUG__ === 'string' ? __PLUGIN_SLUG__ : 'loadout'

/** Absolute route prefix for the Host Fetch routes. */
export const ROUTE_PREFIX: string = `/api/${PLUGIN_NAME}/`
