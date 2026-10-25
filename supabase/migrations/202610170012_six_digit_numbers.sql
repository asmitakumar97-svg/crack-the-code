lock table public.rooms in exclusive mode;
lock table private.solo_games in exclusive mode;

create or replace function private.validate_code(p_mode text,p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_code is null or not (
    (p_mode='number' and p_code ~ '^[0-9]{6}$') or
    (p_mode='word' and exists(select 1 from public.word_bank where word=p_code))
  ) then raise exception 'Enter six digits or a real six-letter word.'; end if;
end $$;

-- Restart only unfinished number rounds; completed results, scores and bets stay intact.
delete from private.pending_guesses g using public.rooms r
where r.id=g.room_id and r.mode='number' and r.status in ('lobby','setting','playing');
delete from public.guesses g using public.rooms r
where r.id=g.room_id and r.mode='number' and r.status in ('lobby','setting','playing')
  and g.match_number=r.match_number and g.round_number=r.round_number;
delete from public.secrets s using public.rooms r
where r.id=s.room_id and r.mode='number' and r.status in ('lobby','setting','playing')
  and s.match_number=r.match_number and s.round_number=r.round_number;
update public.players p set attempts=0,solved=false,finished_at=null,next_ready=false,secret_ready=false
from public.rooms r where r.id=p.room_id and r.mode='number' and r.status in ('lobby','setting','playing');
update public.rooms set status=case when status='lobby' then 'lobby' else 'setting' end,
  started_at=null,turn_user_id=null,version=version+1
where mode='number' and status in ('lobby','setting','playing');

alter table private.solo_games drop constraint solo_games_check1;
update private.solo_games set answer=lpad(floor(random()*1000000)::integer::text,6,'0'),
  guesses='[]'::jsonb,started_at=statement_timestamp(),
  deadline=case when challenge='timed' then statement_timestamp()+interval '3 minutes' else null end,
  version=version+1
where mode='number' and status='playing';
alter table private.solo_games add constraint solo_games_check1 check (
  (mode='number' and (answer ~ '^[0-9]{6}$' or status<>'playing' and answer ~ '^[0-9]{4}$'))
  or (mode='word' and answer ~ '^[A-Z]{6}$')
);

create or replace function public.create_solo_game(p_mode text,p_challenge text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g private.solo_games; secret text; started timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  if p_mode is null or p_mode not in ('number','word') then raise exception 'Choose Number Lock or Word Lock.'; end if;
  if p_challenge is null or p_challenge not in ('attempts','timed') then raise exception 'Choose six guesses or the three-minute timer.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':solo',0));
  if p_mode='number' then
    secret:=lpad(floor(random()*1000000)::integer::text,6,'0');
  else
    select word into secret from public.word_bank where is_answer order by random() limit 1;
    if secret is null then raise exception 'The word puzzles are not ready. Please try again later.'; end if;
  end if;
  update private.solo_games set status='abandoned',finished_at=clock_timestamp(),version=version+1
    where user_id=auth.uid() and status='playing';
  started:=clock_timestamp();
  insert into private.solo_games(user_id,mode,challenge,answer,started_at,deadline)
    values(auth.uid(),p_mode,p_challenge,secret,started,
      case when p_challenge='timed' then started+interval '3 minutes' else null end) returning * into g;
  return private.solo_state(g);
end $$;
