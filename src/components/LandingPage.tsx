import { ArrowRight, CircleHelp, Clock3, LockKeyhole, Users } from 'lucide-react'
import { getFeedback } from '../lib/game'
import { Legend, Tiles } from './Tiles'

export function LandingPage({ onPlay, onHelp, busy }: {
  onPlay: (screen: 'friend' | 'solo') => void; onHelp: () => void; busy: boolean
}) {
  return <section className="landing-page" aria-labelledby="landing-title">
    <div className="landing-copy">
      <span className="landing-kicker"><LockKeyhole size={14} aria-hidden="true" />THE CODE-BREAKING GAME</span>
      <h1 id="landing-title">Crack the <span>Code<span className="landing-period" aria-hidden="true">.</span></span></h1>
      <p className="landing-description">A little logic. A little rivalry. A lot of &quot;one more round&quot;.</p>
      <div className="landing-modes"><span>4-digit codes</span><span>6-letter words</span><span>Your next aha moment</span></div>
      <div className="landing-actions">
        <button className="landing-play landing-friend" aria-label="Play with a friend" aria-describedby="friend-play-detail" disabled={busy} onClick={() => onPlay('friend')}><span className="landing-play-icon"><Users size={23} aria-hidden="true" /></span><span><strong>Play with a friend</strong><small id="friend-play-detail">Private rooms. Friendly rivalries.</small></span><ArrowRight size={20} aria-hidden="true" /></button>
        <button className="landing-play landing-solo" aria-label="Play solo" aria-describedby="solo-play-detail" disabled={busy} onClick={() => onPlay('solo')}><span className="landing-play-icon"><Clock3 size={23} aria-hidden="true" /></span><span><strong>Play solo</strong><small id="solo-play-detail">6 guesses or a 3-minute challenge.</small></span><ArrowRight size={20} aria-hidden="true" /></button>
      </div>
      <div className="landing-reassurance"><span>No download. No account needed.</span><button className="text-button" onClick={onHelp}><CircleHelp size={15} aria-hidden="true" />Learn the rules</button></div>
    </div>
    <figure className="landing-visual" aria-label="Number Lock example: use the colours to find the code">
      <div className="landing-orbit" aria-hidden="true" />
      <img className="landing-lock" src={`${import.meta.env.BASE_URL}favicon.svg?v=lock-tiles`} width={86} height={86} alt="" />
      <div className="panel landing-demo">
        <span className="eyebrow">FROM GUESS TO GOT IT</span>
        <div className="landing-demo-rows">{['1234', '7913', '3719'].map((guess, index) => <div className="landing-code-row" key={guess}><span>0{index + 1}</span><Tiles mode="number" value={guess} marks={getFeedback('3719', guess)} length={4} /></div>)}</div>
        <Legend />
        <p className="landing-caption">Follow the clues. Find your winning moment.</p>
      </div>
      <span className="landing-sticker" aria-hidden="true">aha!</span>
    </figure>
  </section>
}
