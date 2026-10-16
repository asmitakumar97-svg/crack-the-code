import type { CSSProperties } from 'react'
import { displayItem, type Mark, type Mode } from '../lib/game'

export const CLUES = {
  hit: { label: 'Correct position', symbol: '✓' },
  present: { label: 'Wrong position', symbol: '↔' },
  miss: { label: 'No match', symbol: '−' },
} satisfies Record<Mark, { label: string; symbol: string }>

export function Tiles({ mode, value, marks, length, concealed = false, animated = false }: {
  mode: Mode; value: string; marks?: Mark[]; length: number; concealed?: boolean; animated?: boolean
}) {
  return <div className={`tiles tiles-${length} ${animated ? 'tiles-animate' : ''}`} role="group" aria-label={concealed ? 'Secret code hidden' : 'Code tiles'}>
    {Array.from({ length }, (_, i) => {
      const item = value[i] ?? ''
      return <span key={i} className={`tile ${marks?.[i] ?? ''} ${item ? 'filled' : ''}`}
        style={{ '--i': i } as CSSProperties}
        aria-label={item ? `${concealed ? 'hidden' : item}${marks ? `, ${CLUES[marks[i]].label.toLowerCase()}` : ''}` : 'Empty position'}>
        {item ? concealed ? '•' : displayItem(mode, item) : '' }
        {marks && <small aria-hidden="true">{CLUES[marks[i]].symbol}</small>}
      </span>
    })}
  </div>
}

export function Legend() {
  return <div className="legend">
    {(['hit', 'present', 'miss'] as const).map(mark => <span key={mark}><i className={mark} aria-hidden="true">{CLUES[mark].symbol}</i> {CLUES[mark].label}</span>)}
  </div>
}
