/**
 * dsh-loadout-manager Client half: the Loadout Manager page in the left sidebar panel list.
 * The build wraps this module into `window.__ModuleLoader__.load({ id,
 * factory })`; its exports `inject` and `apply` form the Cordis plugin.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { LoadoutIcon, type T } from './controls.tsx'
import { LoadoutPage } from './LoadoutPage.tsx'
import { en, NS, ru, zh } from './locale.ts'

/** Sidebar entry id and `main` panel key. */
const PANEL_ID = 'loadout'

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  // One registration per language, so each one has its own effect label.
  ctx.effect(() => ctx.locale.register(NS, 'en', en), 'dsh-loadout-manager: locale en')
  ctx.effect(() => ctx.locale.register(NS, 'ru', ru), 'dsh-loadout-manager: locale ru')
  ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'dsh-loadout-manager: locale zh')
  const t = ctx.locale.bind(NS) as T

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, LoadoutPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    // After Plugins (0) and Automation tasks (10).
    order: 20,
    label: () => t('nav'),
    locale: NS,
  }, LoadoutIcon))
}
