import { useState } from 'react'
import { getCharacter, safeGooglePhoto } from '../lib/avatars'

export function PlayerAvatar({ identity, name, photoUrl, large = false }: {
  identity: string; name: string; photoUrl?: string | null; large?: boolean
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  const photo = safeGooglePhoto(photoUrl)
  const showPhoto = photo !== null && photo !== failedPhoto
  const character = getCharacter(identity || 'guest')
  return <><span className={`player-avatar${large ? ' player-avatar-large' : ''}`} role="img" title={photo === failedPhoto && photo ? 'Google photo unavailable; showing a character avatar.' : undefined} aria-label={showPhoto ? `${name}'s Google profile photo` : `${character.name} avatar for ${name}`}>
    {showPhoto ? <img src={photo} alt="" width={64} height={64} referrerPolicy="no-referrer" decoding="async" onError={() => setFailedPhoto(photo)} /> : <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="20" fill={character.background} />
      <ellipse cx="32" cy="61" rx="22" ry="12" fill={character.face} />
      {character.kind === 'robot' ? <>
        <path d="M32 23V14" stroke="#34445c" strokeWidth="3" strokeLinecap="round" /><circle cx="32" cy="11" r="4" fill={character.face} stroke="#34445c" strokeWidth="2" />
        <rect x="11" y="32" width="7" height="12" rx="3" fill="#34445c" /><rect x="46" y="32" width="7" height="12" rx="3" fill="#34445c" />
        <rect x="16" y="23" width="32" height="30" rx="10" fill={character.face} stroke="#34445c" strokeWidth="2" />
      </> : <path d={character.kind === 'owl' ? 'M14 30 13 14 26 21Q32 18 38 21L51 14 50 30Q55 54 32 56 9 54 14 30Z' : 'M15 32 16 12 29 23Q32 22 35 23L48 12 49 32Q54 54 32 56 10 54 15 32Z'} fill={character.face} stroke="#34445c" strokeWidth="2" strokeLinejoin="round" />}
      {character.kind === 'cat' && <><path d="m20 20 5 6h-5Zm24 0-5 6h5Z" fill="#f3c0c4" /><path d="m14 41 7 1m-6 6 7-2m28-5-7 1m6 6-7-2" stroke="#34445c" strokeWidth="1.5" strokeLinecap="round" /></>}
      {character.kind === 'fox' && <path d="m17 34 15 11 15-11Q51 53 32 54 13 53 17 34Z" fill="#fff5e8" />}
      {character.kind === 'owl' && <><circle cx="24" cy="36" r="9" fill="#fff9ef" /><circle cx="40" cy="36" r="9" fill="#fff9ef" /></>}
      <circle cx="25" cy="36" r={character.kind === 'owl' ? 3 : 2.5} fill="#25334a" /><circle cx="39" cy="36" r={character.kind === 'owl' ? 3 : 2.5} fill="#25334a" />
      {character.kind === 'owl' ? <path d="m28 44 4 5 4-5Z" fill="#b66c31" /> : <path d="M27 45q5 5 10 0" fill="none" stroke="#25334a" strokeWidth="2" strokeLinecap="round" />}
    </svg>}
  </span>{photo && failedPhoto === photo && <span className="sr-only" role="status">Profile photo unavailable. Showing a character avatar instead.</span>}</>
}
