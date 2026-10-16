import { useId, useState } from 'react'
import { ArrowRight, Delete, LockKeyhole, Search, Shuffle } from 'lucide-react'
import { MODES, displayItem, generateSecret, validateEntry, type Mark, type Mode, type Guess } from '../lib/game'
import { Tiles } from './Tiles'

export function CodeEntry({ mode, secret = false, words, busy, onSubmit, guesses = [] }: {
  mode: Mode; secret?: boolean; words: string[]; busy: boolean; onSubmit: (value: string) => Promise<boolean>; guesses?: Guess[]
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [bank, setBank] = useState(false)
  const [search, setSearch] = useState('')
  const id = useId()
  const config = MODES[mode]
  const submit = async () => {
    const validation = validateEntry(mode, value, words)
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
  const keyMarks: Record<string, Mark> = {}
  const priority = { miss: 1, hit: 2 }
  for (const guess of guesses) [...guess.guess].forEach((char, i) => {
    const mark = guess.feedback[i]
    if (!keyMarks[char] || priority[mark] > priority[keyMarks[char]]) keyMarks[char] = mark
  })
  const rows = mode === 'word' ? ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] : ['12345', '67890']

  return <div className="code-entry">
    <div className="entry-label">
      <label htmlFor={id}>{secret ? mode === 'word' ? 'Your secret word' : 'Your secret code' : mode === 'word' ? 'Try their word' : 'Try their code'}</label>
      {secret && <div className="entry-tools">
        <button className="text-button" type="button" disabled={busy} onClick={chooseSecret}><Shuffle size={14} />Choose for me</button>
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
          aria-label={key} onClick={() => add(key)}>{displayItem(mode, key)}</button>)}
      </div>)}
      <div className="keyboard-actions">
        <button className="key backspace" type="button" aria-label="Delete last character" disabled={busy || !value} onClick={() => setValue(old => old.slice(0, -1))}><Delete size={18} /> Delete</button>
        <button className="button primary" type="button" disabled={busy || value.length !== config.length} onClick={() => { void submit() }}>
          {secret ? <LockKeyhole size={16} /> : null}{busy ? 'Sending…' : secret ? 'Lock my secret' : mode === 'word' ? 'Try word' : 'Try code'}{!secret && <ArrowRight size={17} />}
        </button>
      </div>
    </div>
    {mode === 'word' && <div className="word-bank">
      <button className="text-button" onClick={() => setBank(!bank)} aria-expanded={bank}><Search size={14} />{bank ? 'Close word bank' : 'Word bank'}</button>
      {bank && <div className="word-bank-panel">
        <input aria-label="Search word bank" placeholder="Find a four-letter word…" value={search} onChange={e => setSearch(e.target.value.toUpperCase())} />
        <div className="word-list">
          {words.filter(word => word.includes(search)).map(word => <button key={word} disabled={busy} onClick={() => { setValue(word); setBank(false); setError('') }}>{word}</button>)}
          {!words.some(word => word.includes(search)) && <p>No matching words.</p>}
        </div>
      </div>}
    </div>}
  </div>
}
