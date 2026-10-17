import { createECDH, randomBytes } from 'node:crypto'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'

const project = process.argv[2]
if (!project || !/^[a-z0-9]{20}$/.test(project)) throw new Error('Pass your Supabase project reference, for example: node scripts/configure-turn-push.mjs wxmrxcnfivgkmhdhedwf')
const directory = resolve(import.meta.dirname, '..')
const envPath = resolve(directory, '.env.turn-push')
const sqlPath = resolve(directory, '.turn-push-setup.sql')
for (const path of [envPath, sqlPath]) {
  try { await access(path) }
  catch (error) { if (error.code === 'ENOENT') continue; throw error }
  throw new Error(`Refusing to replace existing notification keys: ${path}. Keep existing keys for deployed subscriptions.`)
}
const ecdh = createECDH('prime256v1')
const publicKey = ecdh.generateKeys().toString('base64url')
const privateKey = ecdh.getPrivateKey().toString('base64url')
const token = randomBytes(32).toString('base64url')
const schedule = await readFile(resolve(directory, 'supabase/turn-push-schedule.sql'), 'utf8')
await writeFile(envPath, [
  'TURN_PUSH_SUBJECT=https://asmitakumar97-svg.github.io/crack-the-code/',
  `TURN_PUSH_PUBLIC_KEY=${publicKey}`,
  `TURN_PUSH_PRIVATE_KEY=${privateKey}`,
  `TURN_PUSH_DISPATCH_TOKEN=${token}`,
  '',
].join('\n'), { mode: 0o600, flag: 'wx' })
await writeFile(sqlPath, [
  'begin;',
  "insert into private.push_settings(public_key,dispatch_url,dispatch_token)",
  `values('${publicKey}','https://${project}.supabase.co/functions/v1/turn-push','${token}')`,
  'on conflict(singleton) do update set public_key=excluded.public_key,dispatch_url=excluded.dispatch_url,dispatch_token=excluded.dispatch_token;',
  schedule,
  'commit;',
  "notify pgrst,'reload schema';",
  "select exists(select 1 from private.push_settings) as push_configured,",
  "exists(select 1 from cron.job where jobname='crack-the-code-turn-push' and active) as retry_job_active;",
  '',
].join('\n'), { mode: 0o600, flag: 'wx' })
console.log('Created .env.turn-push and .turn-push-setup.sql with owner-only file permissions.')
console.log('These files contain private notification keys. Keep them out of chat, screenshots and Git.')
console.log('Follow docs/turn-notifications.md to configure Supabase. Do not regenerate keys after enabling subscriptions.')
