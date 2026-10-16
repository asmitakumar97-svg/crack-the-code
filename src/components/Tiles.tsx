import type { CSSProperties } from 'react'
import { displayItem, type Mark, type Mode } from '../lib/game'

export function Tiles({ mode, value, marks, length, concealed = false, animated = false }: {
  mode: Mode; value: string; marks?: Mark[]; length: number; concealed?: boolean; animated?: boolean
}) {
  return <div className={`tiles tiles-${length} ${animated ? 'tiles-animate' : ''}`} role="group" aria-label={concealed ? 'Secret code hidden' : 'Code tiles'}>
    {Array.from({ length }, (_, i) => {
      const item = value[i] ?? ''
      return <span key={i} className={`tile ${marks?.[i] ?? ''} ${item ? 'filled' : ''}`}
        style={{ '--i': i } as CSSProperties}
        aria-label={item ? `${concealed ? 'hidden' : item}${marks ? `, ${marks[i] === 'hit' ? 'in the code' : 'not in the code'}` : ''}` : 'Empty position'}>
        {item ? concealed ? '•' : displayItem(mode, item) : '' }
        {marks && <small aria-hidden="true">{marks[i] === 'hit' ? '✓' : '−'}</small>}
      </span>
    })}
  </div>
}

export function Legend() {
  return <div className="legend">
    <span><i className="hit">✓</i> In the code</span>
    <span><i className="miss">−</i> Not in the code</span>
  </div>
}
