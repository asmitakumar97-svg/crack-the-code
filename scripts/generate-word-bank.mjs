import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const archive = process.argv[2]
if (!archive) throw new Error('Usage: node scripts/generate-word-bank.mjs /path/to/scowl-2020.12.07.tar.gz')
const checksum = createHash('sha256').update(await readFile(archive)).digest('hex')
if (checksum !== '5587667caa20c4891390c2d42dbb4d5c4c3f41bee77af1457ece3ba23fb859cc') {
  throw new Error('The archive does not match the pinned SCOWL 2020.12.07 release.')
}
const extract = name => execFileSync('tar', ['-xOf', archive, name], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n').filter(name => {
  const match = /^scowl-2020\.12\.07\/final\/(?:english|american|british|british_z|canadian|australian|variant_1|british_variant_1|canadian_variant_1|australian_variant_1)-words\.(\d+)$/.exec(name)
  return match && Number(match[1]) <= 70
})
if (!files.length) throw new Error('The archive contains no supported dictionary files.')
const words = new Set()
for (const file of files) {
  for (const word of extract(file).split(/\r?\n/)) {
    if (/^[a-z]{6}$/.test(word)) words.add(word.toUpperCase())
  }
}
for (const word of ['NORMAL', 'APPLES', 'FRUITS', 'BOILED', 'UNSEEN', 'ZIGZAG', 'COLOUR', 'COLORS']) {
  if (!words.has(word)) throw new Error(`Required regression word missing: ${word}`)
}
const sorted = [...words].sort()
const sql = `-- Generated from SCOWL 2020.12.07, levels through 70, ASCII six-letter words.
-- Source, checksum and regeneration instructions: README.md, "English dictionary".
-- License: third-party/SCOWL-Copyright.txt. Existing words and matches are preserved.
insert into public.word_bank(word)
select unnest(string_to_array('${sorted.join('\n')}', E'\\n'))
on conflict (word) do nothing;
`
await mkdir(new URL('../third-party/', import.meta.url), { recursive: true })
await writeFile(new URL('../third-party/SCOWL-Copyright.txt', import.meta.url), extract('scowl-2020.12.07/Copyright'))
await writeFile(new URL('../supabase/migrations/202610160007_expanded_dictionary.sql', import.meta.url), sql)
console.log(`Generated ${sorted.length} six-letter words from ${files.length} pinned SCOWL lists.`)
