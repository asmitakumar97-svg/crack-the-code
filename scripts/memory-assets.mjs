import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const themes = { paintings: 'landscape', florals: 'flowers', animals: 'animals', patterns: 'pattern' }
const catalog = {}
for (const [theme, query] of Object.entries(themes)) {
  const url = new URL('https://openaccess-api.clevelandart.org/api/artworks/')
  url.search = new URLSearchParams({ has_image: '1', cc0: '1', limit: '100', q: query }).toString()
  if (theme === 'paintings') url.searchParams.set('type', 'Painting')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Museum catalog returned ${response.status}`)
  const { data } = await response.json()
  const works = data.filter(work => work.share_license_status === 'CC0' && work.images?.web?.url)
    .filter(work => theme !== 'animals' || ['Painting', 'Print', 'Drawing', 'Photograph'].includes(work.type))
    .filter((work, i, all) => all.findIndex(other => other.title === work.title) === i).slice(0, 12)
  if (works.length !== 12) throw new Error(`Need twelve distinct CC0 images for ${theme}`)
  await mkdir(`public/memory/${theme}`, { recursive: true })
  catalog[theme] = []
  for (const [index, work] of works.entries()) {
    const image = await fetch(work.images.web.url)
    if (!image.ok || !image.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image unavailable: ${work.id}`)
    const path = `memory/${theme}/${index}.jpg`
    await writeFile(`public/${path}`, Buffer.from(await image.arrayBuffer()))
    execFileSync('sips', ['-Z', '360', `public/${path}`], { stdio: 'ignore' })
    catalog[theme].push({ id: work.id, title: work.title, source: work.url, license: 'CC0', path })
  }
  console.log(`Downloaded and resized twelve CC0 ${theme} images.`)
}
await writeFile('src/lib/memory-images.json', JSON.stringify(catalog, null, 2) + '\n')
