/** Own controls and glyphs (Harness primitives are not importable by plugins). */

import type { ReactNode } from 'react'
import type { SkillState } from '../shared/api.ts'
import type { LoadoutKey } from './locale.ts'
import css from './Loadout.module.css'

export type T = (key: LoadoutKey, params?: Record<string, unknown>) => string

const SKILL_STATES: readonly SkillState[] = ['on', 'manual', 'off']

/** Three-state skill switch, styled as small SegmentedTabs. */
export function SkillStateControl({ t, value, fileManual, disabled, onChange }: {
  t: T
  value: SkillState
  fileManual: boolean
  disabled: boolean
  onChange(state: SkillState): void
}): ReactNode {
  return (
    <div className={css.seg} role="radiogroup" aria-label={t('skills')}>
      {SKILL_STATES.map(state => (
        <button
          key={state}
          type="button"
          role="radio"
          aria-checked={value === state}
          title={state === 'on' && fileManual ? t('fileManual') : t(`stateHint.${state}`)}
          disabled={disabled || (state === 'on' && fileManual)}
          onClick={() => { if (value !== state) onChange(state) }}
        >
          {t(`state.${state}`)}
        </button>
      ))}
    </div>
  )
}

/** Rule switch with the Switch primitive's markup (`role="switch"`, `aria-checked`). */
export function Switch({ t, checked, disabled, onChange }: {
  t: T
  checked: boolean
  disabled: boolean
  onChange(checked: boolean): void
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      className={css.switch}
      aria-checked={checked}
      aria-label={checked ? t('ruleOn') : t('ruleOff')}
      disabled={disabled}
      onClick={() => { onChange(!checked) }}
    />
  )
}

const iconProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export function TrashIcon(): ReactNode {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" {...iconProps}>
      <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6M6.7 7v4.5M9.3 7v4.5" />
    </svg>
  )
}

/** Globe for the global scope, folder for a workspace. */
export function ScopeIcon({ global }: { global: boolean }): ReactNode {
  return global
    ? (
      <svg className={css.lead} width={13} height={13} viewBox="0 0 16 16" {...iconProps}>
        <circle cx={8} cy={8} r={6} />
        <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14M8 2C6.3 3.8 5.5 5.8 5.5 8s.8 4.2 2.5 6" />
      </svg>
    )
    : (
      <svg className={css.lead} width={13} height={13} viewBox="0 0 16 16" {...iconProps}>
        <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
      </svg>
    )
}

export function ChevronIcon(): ReactNode {
  return (
    <svg className={css.chevron} width={12} height={12} viewBox="0 0 12 12" {...iconProps} strokeWidth={1.4}>
      <path d="M3 4.5 6 7.5l3-3" />
    </svg>
  )
}

/** The sidebar entry glyph: a backpack, matching the plugin icon. */
export function LoadoutIcon({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...iconProps}>
      <path d="M6.5 3.5V3a1.5 1.5 0 0 1 3 0v.5" />
      <rect x={3} y={3.5} width={10} height={10.5} rx={3} />
      <path d="M3 7.5c1.5.8 3.2 1.2 5 1.2s3.5-.4 5-1.2" />
      <rect x={5.5} y={10} width={5} height={2.5} rx={0.8} />
    </svg>
  )
}
