import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock3, Flame, Leaf, LockKeyhole, Repeat2, Users } from 'lucide-react'
import type { useGame } from '../hooks/useGame'
import { MODES, type Mark, type Mode, type Stake, type Variant } from '../lib/game'
import { configured } from '../lib/supabase'
import { Legend, Tiles } from './Tiles'

type Controller = ReturnType<typeof useGame>

export function ScreenSteps({ current }: { current: number }) {
  return <nav className="screen-steps" aria-label="Game setup progress">
    {['Name', 'How to play', 'Room & secret', 'Play'].map((label, i) => <span key={label} aria-current={current === i + 1 ? 'step' : undefined} className={current === i + 1 ? 'active' : current > i + 1 ? 'complete' : ''}><i>{current > i + 1 ? <Check size={11} /> : i + 1}</i>{label}</span>)}
  </nav>
}

export function SetupFlow({ controller, mode, setMode, variant, setVariant }: { controller: Controller; mode: Mode; setMode: (mode: Mode) => void; variant: Variant; setVariant: (variant: Variant) => void }) {
  const invite = new URLSearchParams(location.search).get('room') ?? ''
  const [step, setStep] = useState(1)
  const [name, setName] = useState(() => localStorage.getItem('crack-the-code.name') ?? '')
  const [tab, setTab] = useState<'create' | 'join'>(invite ? 'join' : 'create')
  const [code, setCode] = useState(invite.toUpperCase().slice(0, 6))
  const [stake, setStake] = useState<Stake>('low')
  const [error, setError] = useState('')
  useEffect(() => { window.scrollTo(0, 0) }, [step])
  const next = (value: number) => { setError(''); setStep(value) }
  const enter = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!configured) { setError('Connect Supabase first. See the project setup guide.'); return }
    if (tab === 'create') {
      await controller.createRoom(name.trim(), mode, stake, variant)
    } else {
      if (!/^[A-F0-9]{6}$/.test(code)) { setError('Enter a six-character room code.'); return }
      await controller.joinRoom(name.trim(), code)
    }
  }
  return <div className="setup-flow"><ScreenSteps current={step} />
    {step === 1 ? <section className="panel wizard-panel welcome-screen">
      <span className="eyebrow">JUST YOU. A FRIEND. A SECRET.</span><h1>What’s your name?</h1><p>Let the mind games begin.</p>
      {!configured && <p className="setup-note" role="status">Online play needs a Supabase connection. To play locally without an account, start this project with npm run dev:local.</p>}
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) { localStorage.setItem('crack-the-code.name', name.trim()); next(2) } }}>
        <label htmlFor="display-name">Your name</label><input id="display-name" value={name} onChange={e => setName(e.target.value)} placeholder="Display name" maxLength={20} autoComplete="nickname" required autoFocus />
        <button type="submit" className="button primary full" disabled={!name.trim()}>Next <ArrowRight size={18} /></button>
      </form>
    </section> : step === 2 ? <section className="panel wizard-panel instructions-screen">
      <button className="text-button back-link" onClick={() => next(1)}><ArrowLeft size={15} />Back</button>
      <h1>Choose your challenge.</h1>
      <div className="mode-picker" aria-label="Game mode">{(Object.keys(MODES) as Mode[]).map(key => <button key={key} className={mode === key ? 'active' : ''} aria-pressed={mode === key} onClick={() => setMode(key)}>{MODES[key].name}</button>)}</div>
      <Illustration key={mode} mode={mode} />
      <div className="variant-picker" aria-label="Play style">
        <button className={variant === 'race' ? 'selected' : ''} aria-pressed={variant === 'race'} onClick={() => setVariant('race')}><Clock3 size={17} /><strong>Live race</strong><small>Guess together · live timer</small></button>
        <button className={variant === 'turns' ? 'selected' : ''} aria-pressed={variant === 'turns'} onClick={() => setVariant('turns')}><Repeat2 size={17} /><strong>Take turns</strong><small>One guess each · keep alternating</small></button>
      </div>
      <ol className="how-to-play" aria-label={`${MODES[mode].name} instructions`}>
        <li><span>1</span><p>{mode === 'word' ? 'Pick a secret six-letter word.' : 'Pick a secret four-digit code.'}<small>Then write your bets, agree and start.</small></p></li>
        <li><span>2</span><p>{variant === 'turns' ? 'Take one guess each. Help mark your friend’s clues.' : 'Guess together and follow the colours.'}<small>Green: right place. Yellow: wrong place. Grey: no match.</small></p></li>
        <li><span>3</span><p>First to crack the code wins.<small>Unlimited guesses. Best of three rounds.</small></p></li>
      </ol>
      <button className="button primary full" onClick={() => next(3)}>Next · your room <ArrowRight size={18} /></button>
    </section> : <section className="panel wizard-panel room-setup">
      <button className="text-button back-link" onClick={() => next(2)}><ArrowLeft size={15} />Back</button>
      <h1>Bring your rival.</h1>
      <div className="tabs" role="tablist" aria-label="Room action"><button role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'active' : ''} onClick={() => { setTab('create'); setError('') }}>Create room</button><button role="tab" aria-selected={tab === 'join'} className={tab === 'join' ? 'active' : ''} onClick={() => { setTab('join'); setError('') }}>Join room</button></div>
      <form onSubmit={e => { void enter(e) }}>
        {tab === 'create' ? <>
          <div className="stake-picker" aria-label="Stakes"><button type="button" aria-pressed={stake === 'low'} className={stake === 'low' ? 'selected' : ''} onClick={() => setStake('low')}><Leaf size={20} /><strong>Low stakes</strong></button><button type="button" aria-pressed={stake === 'high'} className={stake === 'high' ? 'selected' : ''} onClick={() => setStake('high')}><Flame size={20} /><strong>High stakes</strong></button></div>
          <div className="chosen-mode"><span>{MODES[mode].name}</span><span>{variant === 'race' ? 'Live race' : 'Take turns'}</span></div>
        </> : <><label htmlFor="join-code">Room code</label><input id="join-code" className="room-code-input" placeholder="A1B2C3" value={code} maxLength={6} autoComplete="off" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6))} required /><p className="join-description">You’ll get your host’s game and stakes.</p></>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={controller.busy} type="submit"><Users size={18} />{tab === 'create' ? 'Create private room' : 'Join private room'}<ArrowRight size={18} /></button>
        <p className="secret-step-note">Next: enter your private {mode === 'word' ? 'word' : 'code'}, or tap Choose for me.</p>
      </form>
    </section>}
  </div>
}

export function Illustration({ mode }: { mode: Mode }) {
  const guess = mode === 'word' ? 'LETTER' : '2917'
  const marks: Mark[] = mode === 'word' ? ['miss', 'hit', 'present', 'miss', 'hit', 'present'] : ['miss', 'present', 'hit', 'present']
  return <div className={`illustration illustration-${mode}`} aria-label={`${MODES[mode].name} example`}><div className="example-secret"><LockKeyhole size={13} /><span>{mode === 'word' ? 'SECRET WORD' : 'SECRET CODE'}</span></div><Tiles mode={mode} value={MODES[mode].sample.join('')} length={MODES[mode].length} /><span className="example-arrow">↓</span><Tiles mode={mode} value={guess} marks={marks} length={MODES[mode].length} animated /><Legend /></div>
}
