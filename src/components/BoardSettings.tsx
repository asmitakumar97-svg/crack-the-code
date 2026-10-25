import type { BoardOptions } from '../lib/game'
import images from '../lib/memory-images.json'

export function BoardSettings({ kind, options, disabled, onChange }: {
  kind: 'memory' | 'dots'; options: BoardOptions; disabled: boolean; onChange: (patch: Partial<BoardOptions>) => void
}) {
  return kind === 'dots' ? <>
    <fieldset disabled={disabled}><legend>Dots per side</legend><div className="duo-options">{([10, 12, 15] as const).map(dots => <button key={dots} aria-label={`${dots} by ${dots} dots`} aria-pressed={options.dots === dots} onClick={() => onChange({ dots })}>{dots} × {dots}<small>{(dots - 1) ** 2} boxes</small></button>)}</div></fieldset>
    <p>Roll the eight-sided dice once, then draw that many lines between neighbouring dots. Close a box to claim it in your colour. No bonus rolls: use your lines, then pass. Most boxes wins. If fewer edges remain than your roll, fill the remaining edges to finish.</p>
  </> : <>
    <fieldset disabled={disabled}><legend>How many tiles?</legend><div className="duo-options">{([12, 16, 24] as const).map(tiles => <button key={tiles} aria-label={`${tiles} tiles`} aria-pressed={options.tiles === tiles} onClick={() => onChange({ tiles })}>{tiles} tiles<small>{tiles / 2} pairs</small></button>)}</div></fieldset>
    <fieldset disabled={disabled}><legend>Picture theme</legend><div className="memory-themes">{(['paintings', 'florals', 'animals', 'patterns'] as const).map(theme => <button key={theme} className={options.theme === theme ? 'selected' : ''} aria-pressed={options.theme === theme} onClick={() => onChange({ theme })}><img src={`${import.meta.env.BASE_URL}${images[theme][0].path}`} alt="" /><span>{theme}</span></button>)}</div></fieldset>
    <p>Take turns flipping two cards. Find a pair to score and play again. Miss a pair and the other player goes next. Most pairs wins; equal scores are a draw.</p>
  </>
}
