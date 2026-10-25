import { ArrowRight, CircleDot, CircleHelp, Clock3, Dices, LockKeyhole, Users } from 'lucide-react'
import { getFeedback, MODES } from '../lib/game'
import { Legend, Tiles } from './Tiles'

export function LandingPage({ onPlay, onRoom, onHelp, busy }: {
  onPlay: (screen: 'friend' | 'solo') => void; onRoom: () => void; onHelp: () => void; busy: boolean
}) {
  return <section className="landing-page duo-landing" aria-labelledby="landing-title">
    <div className="landing-copy">
      <span className="landing-kicker"><Users size={14} aria-hidden="true" />LITTLE GAMES. BIG DUO ENERGY.</span>
      <h1 id="landing-title">Duo <span>Dash<span className="landing-period" aria-hidden="true">.</span></span></h1>
      <p className="landing-description">Your favourite +1. Your next friendly rivalry. One room, more ways to play.</p>
      <button className="button primary full duo-room-cta" disabled={busy} onClick={onRoom}>Create or join a Duo room <ArrowRight size={20} /></button>
      <div className="landing-modes"><span>Crack the Code</span><span>Memory Match</span><span>Dots &amp; Boxes</span><span>Ring Rush</span></div>
      <div className="landing-actions">
        <button className="landing-play landing-friend" aria-label="Play with a friend" aria-describedby="friend-play-detail" disabled={busy} onClick={() => onPlay('friend')}><span className="landing-play-icon"><LockKeyhole size={23} aria-hidden="true" /></span><span><strong>Crack the Code</strong><small id="friend-play-detail">Quick start · private code-breaking room.</small></span><ArrowRight size={20} aria-hidden="true" /></button>
        <button className="landing-play landing-solo" aria-label="Play solo" aria-describedby="solo-play-detail" disabled={busy} onClick={() => onPlay('solo')}><span className="landing-play-icon"><Clock3 size={23} aria-hidden="true" /></span><span><strong>Play solo</strong><small id="solo-play-detail">Every game · puzzles or a computer rival.</small></span><ArrowRight size={20} aria-hidden="true" /></button>
      </div>
      <div className="landing-reassurance"><span>No download. No account needed.</span><button className="text-button" onClick={onHelp}><CircleHelp size={15} aria-hidden="true" />Learn the rules</button></div>
    </div>
    <figure className="landing-visual" aria-label="Number Lock example: use the colours to find the code">
      <div className="landing-orbit" aria-hidden="true" />
      <img className="landing-lock" src={`${import.meta.env.BASE_URL}favicon.svg?v=lock-tiles`} width={86} height={86} alt="" />
      <div className="panel landing-demo">
        <h2>Crack the Code</h2><p>6-digit codes · 6-letter words</p>
        <span className="eyebrow">FROM GUESS TO GOT IT</span>
        <div className="landing-demo-rows">{['123456', '791302', '371902'].map((guess, index) => <div className="landing-code-row" key={guess}><span>0{index + 1}</span><Tiles mode="number" value={guess} marks={getFeedback('371902', guess)} length={MODES.number.length} /></div>)}</div>
        <Legend />
        <p className="landing-caption">Follow the clues. Find your winning moment.</p>
      </div>
      <button className="panel landing-memory-preview" disabled={busy} onClick={onRoom}><span aria-hidden="true">✿</span><div><strong>Memory Match</strong><small>Art, animals, florals & patterns.<br />Pick your tiles. Find your pairs.</small></div><ArrowRight size={20} /></button>
      <button className="panel landing-memory-preview" disabled={busy} onClick={onRoom}><Dices size={36} aria-hidden="true" /><div><strong>Dots &amp; Boxes</strong><small>Roll an eight-sided dice. Connect the dots.<br />Claim your boxes, one line at a time.</small></div><ArrowRight size={20} /></button>
      <button className="panel landing-memory-preview" disabled={busy} onClick={onRoom}><CircleDot size={36} aria-hidden="true" /><div><strong>Ring Rush</strong><small>20 colourful rings. Five rods.<br />Same puzzle. Fastest sorter wins.</small></div><ArrowRight size={20} /></button>
      <span className="landing-sticker" aria-hidden="true">aha!</span>
    </figure>
  </section>
}
