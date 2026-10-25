import { useId, useState } from 'react'
import { ArrowRight, Delete, LockKeyhole, Shuffle } from 'lucide-react'
import { MODES, displayItem, generateSecret, getKeyboardMarks, validateEntry, type Mode, type Guess } from '../lib/game'
import { Tiles } from './Tiles'

export function CodeEntry({ mode, secret = false, words, busy, onSubmit, guesses = [] }: {
  mode: Mode; secret?: boolean; words: string[]; busy: boolean; onSubmit: (value: string) => Promise<boolean>; guesses?: Guess[]
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const id = useId()
  const config = MODES[mode]
  const submit = async () => {
    const validation = validateEntry(mode, value)
    if (validation) { setError(validation); return }
    if (await onSubmit(value)) { setValue(''); setError('') }
  }
  const add = (key: string) => {
    if (busy) return
    setValue(old => old.length < config.length ? old + key : old)
    setError('')
  }
  const chooseSecret = () => {
    try {
      setValue(generateSecret(mode, words))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not choose a secret. Please enter one using the keyboard.')
    }
  }
  const keyMarks = getKeyboardMarks(guesses)
  const keyDescriptions = { miss: 'No match', present: 'Matching copies still need positions', hit: 'All known matching positions found' }
  const rows = mode === 'word' ? ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] : ['12345', '67890']

  return <div className="code-entry">
    <div className="entry-label">
      <label htmlFor={id}>{secret ? mode === 'word' ? 'Your secret word' : 'Your secret code' : mode === 'word' ? 'Try their word' : 'Try their code'}</label>
      {secret && <div className="entry-tools">
        <button className="text-button" type="button" disabled={busy || mode === 'word' && !words.length} aria-description={mode === 'word' && !words.length ? 'Available once the dictionary loads.' : undefined} onClick={chooseSecret}><Shuffle size={14} />Choose for me</button>
      </div>}
    </div>
    <div className="entry-box">
      <Tiles mode={mode} value={value} length={config.length} />
      <input id={id} aria-label={secret ? mode === 'word' ? 'Your secret word' : 'Your secret code' : 'Your guess'} className="tile-input"
        type="text" inputMode="none"
        autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        value={value} maxLength={config.length} disabled={busy}
        onChange={e => {
          setValue([...e.target.value.toUpperCase()].filter(c => config.keys.includes(c)).join('').slice(0, config.length))
          setError('')
        }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }} />
    </div>
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className={`keyboard keyboard-${mode}`} aria-label="Virtual keyboard">
      {rows.map(row => <div className="key-row" key={row}>
        {[...row].map(key => <button key={key} type="button" disabled={busy} className={`key ${!secret ? keyMarks[key] ?? '' : ''}`}
          aria-label={key} aria-description={!secret && keyMarks[key] ? keyDescriptions[keyMarks[key]] : undefined} onClick={() => add(key)}>{displayItem(mode, key)}</button>)}
      </div>)}
      <div className="keyboard-actions">
        <button className="key backspace" type="button" aria-label="Delete last character" disabled={busy || !value} onClick={() => setValue(old => old.slice(0, -1))}><Delete size={18} /> Delete</button>
        <button className="button primary" type="button" disabled={busy || value.length !== config.length} onClick={() => { void submit() }}>
          {secret ? <LockKeyhole size={16} /> : null}{busy ? 'Sending…' : secret ? 'Lock my secret' : mode === 'word' ? 'Try word' : 'Try code'}{!secret && <ArrowRight size={17} />}
        </button>
      </div>
    </div>
    {!secret && <p className="hint-check-note">Keyboard keys stay yellow until every matching copy shown by your clues has a green position. Guess tiles keep their usual colours.</p>}
  </div>
}
