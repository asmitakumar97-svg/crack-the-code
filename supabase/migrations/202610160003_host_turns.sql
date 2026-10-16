-- Restart active matches to adopt host-started rounds and protected manual hints.
alter table public.rooms add column variant text not null default 'race' check (variant in ('race','turns'));
alter table public.rooms add column turn_user_id uuid references auth.users(id);
update public.players set score=0,ready=false,attempts=0,solved=false,finished_at=null,next_ready=false,secret_ready=false;
update public.rooms set mode=case when mode='symbol' then 'number' else mode end,
  status='lobby',round_number=1,match_number=match_number+1,started_at=null,version=version+1;
alter table public.rooms drop constraint rooms_mode_check;
alter table public.rooms add constraint rooms_mode_check check (mode in ('number','word'));

create table private.pending_guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  match_number integer not null,
  round_number integer not null,
  attempt integer not null,
  guess text not null,
  elapsed_ms bigint not null
);
revoke all on private.pending_guesses from public,anon,authenticated;

create or replace function private.validate_code(p_mode text,p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_code is null or not (
    (p_mode='number' and p_code ~ '^[0-9]{4}$') or
    (p_mode='word' and exists(select 1 from public.word_bank where word=p_code))
  ) then raise exception 'Enter four digits or a real four-letter word from the word bank.'; end if;
end $$;

drop function public.create_room(text,text,text);
create function public.create_room(p_name text,p_mode text,p_stake text,p_wager text,p_variant text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid; candidate text; retries integer:=0;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 20 then raise exception 'Display name must be 1–20 characters.'; end if;
  if p_mode is null or p_mode not in ('number','word') then raise exception 'Choose Number Lock or Word Lock.'; end if;
  if p_stake is null or p_stake not in ('low','high') then raise exception 'Choose low or high stakes.'; end if;
  if p_variant is null or p_variant not in ('race','turns') then raise exception 'Choose a race or turn-by-turn game.'; end if;
  if p_wager is null or length(btrim(p_wager)) not between 1 and 120 then raise exception 'Write a bet with 1–120 characters.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.rooms where host_id=auth.uid() and created_at>now()-interval '1 hour')>=10
    then raise exception 'Room creation limit reached. Try again in an hour.'; end if;
  loop
    candidate:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    begin
      insert into public.rooms(code,host_id,mode,stake,variant,round_number)
        values(candidate,auth.uid(),p_mode,p_stake,p_variant,1) returning id into rid;
      exit;
    exception when unique_violation then
      retries:=retries+1;
      if retries>=10 then raise exception 'Could not generate a room code. Try again.'; end if;
    end;
  end loop;
  insert into public.players(room_id,user_id,name,seat,wager) values(rid,auth.uid(),btrim(p_name),1,btrim(p_wager));
  return rid;
end $$;

create or replace function public.set_ready(p_room uuid,p_ready boolean,p_wager_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if r.status not in ('lobby','setting') then raise exception 'The round has already started.'; end if;
  if p_ready is null then raise exception 'Readiness must be true or false.'; end if;
  if p_ready and p_wager_version is distinct from r.wager_version then raise exception 'The bets changed. Read them again before agreeing.'; end if;
  if p_ready and (select count(*) from public.players where room_id=p_room and length(wager)>0)<>2 then raise exception 'Both players must write a bet first.'; end if;
  if p_ready and not exists(select 1 from public.players where room_id=p_room and user_id=auth.uid() and secret_ready)
    then raise exception 'Lock your secret before getting ready.'; end if;
  update public.players set ready=p_ready,last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

create or replace function public.set_secret(p_room uuid,p_code text,p_match integer,p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; normalized text:=upper(btrim(p_code));
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before setting your secret.'; end if;
  if r.status not in ('lobby','setting') then raise exception 'Secret entry is not open.'; end if;
  perform private.validate_code(r.mode,normalized);
  if exists(select 1 from public.secrets where room_id=p_room and user_id=auth.uid() and match_number=r.match_number and round_number=r.round_number)
    then raise exception 'Your secret is already locked in.'; end if;
  insert into public.secrets values(p_room,auth.uid(),r.match_number,r.round_number,normalized);
  update public.players set secret_ready=true,last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

create function public.start_round(p_room uuid,p_match integer,p_round integer,p_wager_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; first_player uuid;
begin
  r:=private.lock_room(p_room);
  if r.host_id<>auth.uid() then raise exception 'Only the room creator can start the round.'; end if;
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before starting.'; end if;
  if r.status not in ('lobby','setting') then raise exception 'The round has already started.'; end if;
  if p_wager_version is distinct from r.wager_version then raise exception 'The bets changed. Read them again before starting.'; end if;
  if (select count(*) from public.players where room_id=p_room and secret_ready and length(wager)>0)<>2
    then raise exception 'Both players must save a bet and lock a secret.'; end if;
  if not exists(select 1 from public.players where room_id=p_room and user_id<>auth.uid() and ready)
    then raise exception 'Your opponent must agree and get ready first.'; end if;
  select user_id into first_player from public.players where room_id=p_room and seat=case when r.round_number%2=1 then 1 else 2 end;
  update public.players set ready=true where room_id=p_room and user_id=auth.uid();
  update public.rooms set status='playing',started_at=clock_timestamp()+interval '6 seconds',
    turn_user_id=case when variant='turns' then first_player else null end,version=version+1 where id=p_room;
end $$;

create or replace function public.submit_guess(p_room uuid,p_guess text,p_attempt integer,p_match integer,p_round integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; me public.players; secret text; marks text[]; normalized text:=upper(btrim(p_guess)); won boolean; elapsed bigint;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before guessing again.'; end if;
  if r.status in ('round_over','match_over') then return jsonb_build_object('accepted',false,'reason','round_finished'); end if;
  if r.status<>'playing' then raise exception 'This round is not accepting guesses.'; end if;
  if clock_timestamp()<r.started_at then raise exception 'The game starts in a moment.'; end if;
  if r.variant='turns' then
    if r.turn_user_id<>auth.uid() then raise exception 'It is your opponent''s turn.'; end if;
    if exists(select 1 from private.pending_guesses where room_id=p_room) then raise exception 'Wait for your opponent to send the checked hints.'; end if;
  end if;
  select * into me from public.players where room_id=p_room and user_id=auth.uid();
  if me.attempts>=8 then raise exception 'All eight guesses are used. Wait for your opponent.'; end if;
  if p_attempt is null or p_attempt<>me.attempts+1 then raise exception 'Attempt out of date. Refresh before guessing again.'; end if;
  perform private.validate_code(r.mode,normalized);
  select code into strict secret from public.secrets where room_id=p_room and user_id<>auth.uid()
    and match_number=r.match_number and round_number=r.round_number;
  won:=secret=normalized;
  elapsed:=greatest(0,floor(extract(epoch from(clock_timestamp()-r.started_at))*1000)::bigint);
  update public.players set attempts=p_attempt,solved=won,last_seen=now(),
    finished_at=case when won or p_attempt=8 then clock_timestamp() else null end where room_id=p_room and user_id=auth.uid();
  if r.variant='turns' and not won then
    insert into private.pending_guesses(room_id,user_id,match_number,round_number,attempt,guess,elapsed_ms)
      values(p_room,auth.uid(),r.match_number,r.round_number,p_attempt,normalized,elapsed);
    update public.rooms set version=version+1 where id=p_room;
    return jsonb_build_object('accepted',true,'awaiting_hints',true);
  end if;
  marks:=private.feedback(secret,normalized);
  insert into public.guesses(room_id,user_id,match_number,round_number,attempt,guess,feedback,elapsed_ms)
    values(p_room,auth.uid(),r.match_number,r.round_number,p_attempt,normalized,marks,elapsed);
  if won then perform private.finish_round(p_room,'First code cracked');
  elsif not exists(select 1 from public.players where room_id=p_room and attempts<8) then
    perform private.finish_round(p_room,'Both out of guesses');
  else update public.rooms set version=version+1 where id=p_room; end if;
  return jsonb_build_object('accepted',true);
end $$;

create function public.submit_hints(p_room uuid,p_guess_id uuid,p_marks text[],p_match integer,p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; pending private.pending_guesses; secret text; expected text[]; next_player uuid;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before sending hints.'; end if;
  if r.variant<>'turns' or r.status<>'playing' then raise exception 'This round is not accepting manual hints.'; end if;
  select * into pending from private.pending_guesses where room_id=p_room and id=p_guess_id;
  if not found then raise exception 'This guess has already been checked or is out of date.'; end if;
  if pending.user_id=auth.uid() then raise exception 'Only the secret owner can give hints.'; end if;
  select code into strict secret from public.secrets where room_id=p_room and user_id=auth.uid()
    and match_number=r.match_number and round_number=r.round_number;
  expected:=private.feedback(secret,pending.guess);
  if p_marks is null or p_marks is distinct from expected then
    raise exception 'Those hints do not match your secret. Mark matching copies from left to right.';
  end if;
  insert into public.guesses(room_id,user_id,match_number,round_number,attempt,guess,feedback,elapsed_ms)
    values(p_room,pending.user_id,r.match_number,r.round_number,pending.attempt,pending.guess,expected,pending.elapsed_ms);
  delete from private.pending_guesses where id=pending.id;
  select user_id into next_player from public.players where room_id=p_room and user_id=auth.uid() and attempts<8;
  if next_player is null then select user_id into next_player from public.players where room_id=p_room and user_id=pending.user_id and attempts<8; end if;
  if next_player is null then perform private.finish_round(p_room,'Both out of guesses');
  else update public.rooms set turn_user_id=next_player,version=version+1 where id=p_room; end if;
end $$;

create or replace function public.advance_round(p_room uuid,p_match integer,p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before continuing.'; end if;
  if r.status not in ('round_over','match_over') then raise exception 'Wait until this round has finished.'; end if;
  update public.players set next_ready=true,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.players where room_id=p_room and next_ready)=2 then
    update public.players set attempts=0,solved=false,finished_at=null,secret_ready=false,next_ready=false,ready=false,
      wager=case when r.status='match_over' then '' else wager end,
      score=case when r.status='match_over' then 0 else score end where room_id=p_room;
    update public.rooms set status=case when r.status='match_over' then 'lobby' else 'setting' end,
      round_number=case when r.status='match_over' then 1 else round_number+1 end,
      match_number=match_number+case when r.status='match_over' then 1 else 0 end,
      wager_version=wager_version+case when r.status='match_over' then 1 else 0 end,
      started_at=null,turn_user_id=null,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

create or replace function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null or not public.is_room_member(p_room) then raise exception 'Room not found or you are not a member.'; end if;
  select * into r from public.rooms where id=p_room;
  return jsonb_build_object(
    'room',to_jsonb(r),
    'players',(select jsonb_agg(to_jsonb(p)-'room_id' order by seat) from public.players p where room_id=p_room),
    'guesses',coalesce((select jsonb_agg(to_jsonb(g) order by attempt) from public.guesses g where room_id=p_room and user_id=auth.uid()
      and match_number=r.match_number and round_number=r.round_number),'[]'::jsonb),
    'pending_guess',(select jsonb_build_object('id',id,'user_id',user_id,'guess',guess,'attempt',attempt)
      from private.pending_guesses where room_id=p_room and match_number=r.match_number and round_number=r.round_number),
    'own_secret',(select code from public.secrets where room_id=p_room and user_id=auth.uid() and match_number=r.match_number and round_number=r.round_number),
    'results',coalesce((select jsonb_agg(to_jsonb(rr) order by round_number) from public.round_results rr where room_id=p_room and match_number=r.match_number),'[]'::jsonb),
    'server_now',now()
  );
end $$;

revoke all on function public.create_room(text,text,text,text,text),public.start_round(uuid,integer,integer,integer),
  public.submit_hints(uuid,uuid,text[],integer,integer) from public,anon,authenticated;
grant execute on function public.create_room(text,text,text,text,text),public.start_round(uuid,integer,integer,integer),
  public.submit_hints(uuid,uuid,text[],integer,integer) to authenticated;
