import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

export async function openGameDatabase(dataDir?: string) {
  const db = new PGlite(dataDir)
  try {
    const directory = new URL('../supabase/migrations/', import.meta.url)
    const names = (await readdir(directory)).filter(name => /^\d+_[a-z_]+\.sql$/.test(name)).sort()
    const migrations = await Promise.all(names.map(async name => {
      const sql = await readFile(new URL(name, directory), 'utf8')
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    }))
    await db.transaction(async tx => {
      const { rows } = await tx.query<{ exists: boolean }>("select to_regclass('auth.users') is not null as exists")
      if (!rows[0].exists) await tx.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as
          $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated, anon;
        grant execute on function auth.uid() to authenticated, anon;
        create publication supabase_realtime;
      `)
      await tx.exec(`
        alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;
        alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
        alter table auth.users add column if not exists is_anonymous boolean not null default true;
      `)
      await tx.exec(`
        create schema if not exists local_server;
        revoke all on schema local_server from public, anon, authenticated;
        create table if not exists local_server.migrations (
          name text primary key,
          checksum text not null
        );
        create table if not exists local_server.sessions (
          token_hash text primary key,
          user_id uuid not null references auth.users(id),
          expires_at timestamptz not null default (now() + interval '30 days')
        );
      `)
      for (const migration of migrations) {
        const previous = await tx.query<{ checksum: string }>('select checksum from local_server.migrations where name=$1', [migration.name])
        if (previous.rows.length) {
          if (previous.rows[0].checksum !== migration.checksum) throw new Error(`Previously applied migration ${migration.name} changed. Restore it and add a new migration instead.`)
          continue
        }
        await tx.exec(migration.sql)
        await tx.query('insert into local_server.migrations(name,checksum) values($1,$2)', [migration.name, migration.checksum])
      }
    })
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}

export function asPlayer<T>(db: PGlite, id: string, sql: string, args: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
    return tx.query<T>(sql, args)
  })
}
