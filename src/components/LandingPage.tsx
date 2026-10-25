import { ArrowRight, CircleDot, CircleHelp, Clock3, Dices, Grid2X2, Grid3X3, Layers3, LockKeyhole, SpellCheck, Users } from 'lucide-react'
import { getFeedback, MODES } from '../lib/game'
import { Tiles } from './Tiles'

export function LandingPage({ onPlay, onRoom, onHelp, busy }: {
  onPlay: (screen: 'friend' | 'solo') => void; onRoom: () => void; onHelp: () => void; busy: boolean
}) {
  const games = [
    {
      name: 'Crack the Code', detail: '6-digit codes · 6-letter words', caption: 'Follow the clues. Find the code.', Icon: LockKeyhole,
      preview: <div className="landing-demo"><div className="landing-demo-rows">{['123456', '791302', '371902'].map((guess, index) => <div className="landing-code-row" key={guess}><span>0{index + 1}</span><Tiles mode="number" value={guess} marks={getFeedback('371902', guess)} length={MODES.number.length} /></div>)}</div></div>,
    },
    {
      name: 'Memory Match', detail: 'Art, animals, florals & patterns', caption: 'Flip your tiles. Find your pairs.', Icon: Grid2X2,
      preview: <div className="landing-memory-grid">{[0, 1, 2, 0, 3, 2, 1, 3].map((picture, index) => <span key={index}><img src={`${import.meta.env.BASE_URL}memory/florals/${picture}.jpg`} alt="" loading="lazy" /></span>)}</div>,
    },
    {
      name: 'Dots & Boxes', detail: 'Eight-sided dice · shared board', caption: 'Connect the dots. Claim your boxes.', Icon: Dices,
      preview: <svg className="landing-dots-preview" viewBox="0 0 160 120">
        <rect x="20" y="20" width="40" height="26" className="landing-dots-mint" />
        <rect x="60" y="46" width="40" height="26" className="landing-dots-amber" />
        <path d="M20 20H100 M20 46H140 M20 72H100 M60 98H140 M20 20V72 M60 20V98 M100 20V72 M140 46V98" />
        {Array.from({ length: 16 }, (_, index) => <circle key={index} cx={20 + index % 4 * 40} cy={20 + Math.floor(index / 4) * 26} r="3" />)}
      </svg>,
    },
    {
      name: 'Ring Rush', detail: '40 colourful beads · ten per rod', caption: 'Same puzzle. Fastest sorter wins.', Icon: CircleDot,
      preview: <div className="landing-ring-preview">{Array.from({ length: 5 }, (_, rod) => rod === 2 ? [] : Array.from({ length: 10 }, (_, level) => ((rod > 2 ? rod - 1 : rod) + level) % 4)).map((rod, index) => <span className="landing-mini-rod" key={index}><span className="landing-mini-stack">{rod.map((colour, level) => <i className={`landing-mini-ring ring-colour-${colour}`} key={level} />)}</span></span>)}</div>,
    },
    {
      name: 'Bingo', detail: '25 numbers · five lines to win', caption: 'Call a number. Chase five lines.', Icon: Grid3X3,
      preview: <div className="landing-bingo-preview">{Array.from({ length: 25 }, (_, index) => <span className={index < 5 || index % 5 === 2 ? 'marked' : ''} key={index}>{index + 1}</span>)}</div>,
    },
    {
      name: 'Cheat', detail: 'Hidden cards · call the bluff', caption: 'Play face down. Call the bluff.', Icon: Layers3,
      preview: <div className="landing-cheat-preview"><span>A ♠</span><span>K ♥</span><span>dd</span></div>,
    },
    {
      name: 'Hangman', detail: 'Secret words · alternating guesses', caption: 'Pick a word. Guess a letter.', Icon: SpellCheck,
      preview: <div className="landing-hangman-preview">{['', 'A', '', '', 'O', 'O', 'N'].map((letter, index) => <span key={index}>{letter}</span>)}</div>,
    },
  ]
  return <section className="landing-page duo-landing" aria-labelledby="landing-title">
    <div className="landing-copy">
      <span className="landing-kicker"><Users size={14} aria-hidden="true" />LITTLE GAMES. BIG DUO ENERGY.</span>
      <h1 id="landing-title">Duo <span>Dash<span className="landing-period" aria-hidden="true">.</span></span></h1>
      <p className="landing-description">Your favourite +1. Your next friendly rivalry. One room, more ways to play.</p>
      <button className="button primary full duo-room-cta" disabled={busy} onClick={onRoom}>Create or join a Duo room <ArrowRight size={20} /></button>
      <div className="landing-modes">{games.map(game => <span key={game.name}>{game.name}</span>)}</div>
      <div className="landing-actions">
        <button className="landing-play landing-friend" aria-label="Play with a friend" aria-describedby="friend-play-detail" disabled={busy} onClick={() => onPlay('friend')}><span className="landing-play-icon"><LockKeyhole size={23} aria-hidden="true" /></span><span><strong>Crack the Code</strong><small id="friend-play-detail">Quick start · private code-breaking room.</small></span><ArrowRight size={20} aria-hidden="true" /></button>
        <button className="landing-play landing-solo" aria-label="Play solo" aria-describedby="solo-play-detail" disabled={busy} onClick={() => onPlay('solo')}><span className="landing-play-icon"><Clock3 size={23} aria-hidden="true" /></span><span><strong>Play solo</strong><small id="solo-play-detail">Every game · puzzles or a computer rival.</small></span><ArrowRight size={20} aria-hidden="true" /></button>
      </div>
      <div className="landing-reassurance"><span>No download. No account needed.</span><button className="text-button" onClick={onHelp}><CircleHelp size={15} aria-hidden="true" />Learn the rules</button></div>
    </div>
    <div className="landing-visual" role="group" aria-label="Explore the games">
      <div className="landing-orbit" aria-hidden="true" />
      <div className="landing-game-grid">{games.map(({ name, detail, caption, Icon, preview }) => <button key={name} className="panel landing-game-card" aria-label={`Explore ${name}`} disabled={busy} onClick={onRoom}>
        <div className="landing-card-heading"><span className="landing-card-icon"><Icon size={22} aria-hidden="true" /></span><h2>{name}</h2></div>
        <p className="landing-card-detail">{detail}</p>
        <div className="landing-game-preview" aria-hidden="true">{preview}</div>
        <span className="landing-caption">{caption}<ArrowRight size={16} aria-hidden="true" /></span>
      </button>)}</div>
    </div>
  </section>
}
