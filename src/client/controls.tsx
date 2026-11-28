/** Own controls and glyphs (Harness primitives are not importable by plugins). */

import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
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

/** Switch with the Switch primitive's markup (`role="switch"`, `aria-checked`); `label` names it, the rule wording by default. */
export function Switch({ t, checked, disabled, label, onChange }: {
  t: T
  checked: boolean
  disabled: boolean
  label?: string
  onChange(checked: boolean): void
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      className={css.switch}
      aria-checked={checked}
      aria-label={label ?? (checked ? t('ruleOn') : t('ruleOff'))}
      title={label}
      disabled={disabled}
      onClick={() => { onChange(!checked) }}
    />
  )
}

/**
 * A confirmation under a row, announced as an alert dialog named by its
 * question. Opening it from its row moves focus to Cancel; Escape cancels.
 * While `busy` both buttons stay focusable but ignore presses, and Escape
 * does nothing. When it closes with focus inside, focus returns to the
 * control that opened it or, when that control is gone, to the row, its
 * neighbours, or what holds them.
 */
export function Confirm({ t, message, action, busy, onCancel, onConfirm }: {
  t: T
  message: string
  /** The confirm button's label. */
  action: string
  busy: boolean
  onCancel(): void
  onConfirm(): void
}): ReactNode {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  // A layout effect: its cleanup runs before React detaches the box, so it can still see focus and the row.
  useLayoutEffect(() => {
    const opener = document.activeElement
    const node = box.current
    // Shown again without a press in its row, as when a search filter brings the row back, it leaves focus where it is.
    const row = node?.closest(`.${css.row}`) ?? node?.parentElement
    if (opener === null || opener === document.body || row?.contains(opener) === true) cancel.current?.focus()
    return () => {
      if (node === null || !node.contains(document.activeElement)) return
      const places = placesAround(node)
      // After the commit, when the opener or the whole row may be gone.
      queueMicrotask(() => { returnFocus(opener, places) })
    }
  }, [])
  return (
    <div
      ref={box}
      className={css.confirm}
      role="alertdialog"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        if (!busy) onCancel()
      }}
    >
      <span id={id}>{message}</span>
      <button ref={cancel} type="button" className={css.btn} data-tone="outline" aria-disabled={busy} onClick={() => { if (!busy) onCancel() }}>{t('cancel')}</button>
      <button type="button" className={css.btn} data-tone="dangerText" aria-disabled={busy} onClick={() => { if (!busy) onConfirm() }}>{action}</button>
    </div>
  )
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** The row holding `box`, then at each level up its next and previous sibling and its parent, nearest first. */
function placesAround(box: Element): Element[] {
  const places: Element[] = []
  for (let at = box.closest(`.${css.row}`) ?? box.parentElement; at !== null && at !== document.body; at = at.parentElement) {
    places.push(at)
    if (at.nextElementSibling !== null) places.push(at.nextElementSibling)
    if (at.previousElementSibling !== null) places.push(at.previousElementSibling)
  }
  return places
}

/** Focus `opener` if it can still take focus, else the first focusable control in the first place still on the page. */
function returnFocus(opener: Element | null, places: readonly Element[]): void {
  const active = document.activeElement
  if (active !== null && active !== document.body) return
  if (opener?.isConnected === true && opener.matches(FOCUSABLE)) {
    (opener as HTMLElement).focus()
    return
  }
  for (const place of places) {
    if (!place.isConnected) continue
    const target = place.matches(FOCUSABLE) ? place : place.querySelector(FOCUSABLE)
    if (target !== null) {
      (target as HTMLElement).focus()
      return
    }
  }
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

/** The sidebar entry glyph: three sliders set to on, manual, and off, matching the plugin icon. */
export function LoadoutIcon({ size = 16 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...iconProps}>
      <path d="M2.5 4h6.3M12.2 4h1.3M2.5 8h3.3M9.2 8h4.3M6.2 12h7.3" />
      <circle cx={10.5} cy={4} r={1.7} />
      <circle cx={7.5} cy={8} r={1.7} />
      <circle cx={4.5} cy={12} r={1.7} />
    </svg>
  )
}
