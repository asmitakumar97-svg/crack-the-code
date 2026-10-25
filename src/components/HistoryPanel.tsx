import { CircleHelp } from 'lucide-react'
import { formatTime, type Guess, type Mode } from '../lib/game'
import { Legend, Tiles } from './Tiles'

export function HistoryPanel({ mode, guesses, timed, onHelp }: { mode: Mode; guesses: Guess[]; timed: boolean; onHelp: () => void }) {
  return <section className="panel history-panel"><div className="history-heading"><h2>Your guesses</h2><button className="icon-button" aria-label="Explain clues" onClick={onHelp}><CircleHelp size={17} /></button></div><Legend /><div className="guess-history" aria-label="Guess history" aria-live="polite">
    {guesses.length === 0 ? <p className="empty-history">Your clues will appear here.</p> : guesses.map(guess => <div className="history-row" key={guess.id}><span>{guess.attempt}</span><Tiles mode={mode} value={guess.guess} marks={guess.feedback} length={guess.guess.length} animated /><small>{timed ? formatTime(guess.elapsed_ms / 1000) : `#${guess.attempt}`}</small></div>)}
  </div></section>
}
