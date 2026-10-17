import { expect, it } from 'vitest'
import { mkdtemp, mkdir, copyFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createECDH } from 'node:crypto'

const execute = promisify(execFile)
it('generates a matched private VAPID/configuration pair without printing keys or overwriting deployed credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crack-turn-setup-'))
  try {
    await mkdir(join(directory, 'scripts'))
    await mkdir(join(directory, 'supabase'))
    await copyFile(new URL('../scripts/configure-turn-push.mjs', import.meta.url), join(directory, 'scripts/configure-turn-push.mjs'))
    await copyFile(new URL('../supabase/turn-push-schedule.sql', import.meta.url), join(directory, 'supabase/turn-push-schedule.sql'))
    const command = join(directory, 'scripts/configure-turn-push.mjs')
    await expect(execute(process.execPath, [command, 'invalid;project'])).rejects.toThrow(/project reference/)
    const { stdout } = await execute(process.execPath, [command, 'wxmrxcnfivgkmhdhedwf'])
    const env = await readFile(join(directory, '.env.turn-push'), 'utf8')
    const variables = Object.fromEntries(env.trim().split('\n').map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    }))
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(variables.TURN_PUSH_PRIVATE_KEY, 'base64url'))
    expect(ecdh.getPublicKey().toString('base64url')).toBe(variables.TURN_PUSH_PUBLIC_KEY)
    expect(Buffer.from(variables.TURN_PUSH_DISPATCH_TOKEN, 'base64url')).toHaveLength(32)
    const sql = await readFile(join(directory, '.turn-push-setup.sql'), 'utf8')
    expect(sql).toContain(variables.TURN_PUSH_PUBLIC_KEY)
    expect(sql).toContain(variables.TURN_PUSH_DISPATCH_TOKEN)
    expect(sql).not.toContain(variables.TURN_PUSH_PRIVATE_KEY)
    expect(sql).toContain('https://wxmrxcnfivgkmhdhedwf.supabase.co/functions/v1/turn-push')
    expect(stdout).not.toContain(variables.TURN_PUSH_PRIVATE_KEY)
    expect(stdout).not.toContain(variables.TURN_PUSH_DISPATCH_TOKEN)
    expect((await stat(join(directory, '.env.turn-push'))).mode & 0o777).toBe(0o600)
    expect((await stat(join(directory, '.turn-push-setup.sql'))).mode & 0o777).toBe(0o600)
    await expect(execute(process.execPath, [command, 'wxmrxcnfivgkmhdhedwf'])).rejects.toThrow(/Refusing to replace/)
    expect(await readFile(join(directory, '.env.turn-push'), 'utf8')).toBe(env)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
