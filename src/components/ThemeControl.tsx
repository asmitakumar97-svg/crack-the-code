import { useLayoutEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'pastel' | 'dark'
const key = 'crack-the-code.theme'

function savedPreference(): { theme: Theme; error: string } {
  try { return { theme: localStorage.getItem(key) === 'dark' ? 'dark' : 'pastel', error: '' } }
  catch { return { theme: 'pastel', error: 'This browser could not read your saved theme.' } }
}

export function ThemeControl() {
  const [preference, setPreference] = useState(savedPreference)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preference.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preference.theme === 'pastel' ? '#f7f3fc' : '#080f1e')
  }, [preference.theme])
  const choose = (theme: Theme) => {
    try { localStorage.setItem(key, theme); setPreference({ theme, error: '' }) }
    catch { setPreference({ theme, error: 'Your theme changed, but this browser could not save the preference.' }) }
  }
  return <div className="theme-control">
    <div className="theme-choices" role="group" aria-label="Colour theme">
      <button type="button" aria-label="Use pastel theme" aria-pressed={preference.theme === 'pastel'} onClick={() => choose('pastel')}><Sun size={15} /><span>Pastel</span></button>
      <button type="button" aria-label="Use dark theme" aria-pressed={preference.theme === 'dark'} onClick={() => choose('dark')}><Moon size={15} /><span>Dark</span></button>
    </div>
    {preference.error && <p role="alert" className="field-error">{preference.error}</p>}
  </div>
}
