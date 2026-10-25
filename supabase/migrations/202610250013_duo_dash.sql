alter table public.rooms add column game_kind text not null default 'code' check(game_kind in ('code','memory'));
alter table public.rooms add column duo_lobby boolean not null default false;

create table private.duo_choices (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  revision integer not null default 1,
  selected text not null default 'code' check(selected in ('code','memory')),
  tiles integer not null default 16 check(tiles in (12,16,24)),
  theme text not null default 'animals' check(theme in ('paintings','florals','animals','patterns')),
  mode text not null default 'number' check(mode in ('number','word')),
  variant text not null default 'turns' check(variant in ('race','turns')),
  ready uuid[] not null default '{}'
);
create table private.memory_games (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  session_id uuid not null default gen_random_uuid(),
  deck integer[] not null,
  matched integer[] not null default '{}',
  flipped integer[] not null default '{}',
  reveal_until timestamptz,
  turn_user uuid not null references auth.users(id),
  turn_number integer not null default 1,
  moves integer not null default 0,
  scores jsonb not null default '{}'::jsonb,
  finished boolean not null default false
);
alter table private.duo_choices enable row level security;
alter table private.memory_games enable row level security;
revoke all on private.duo_choices,private.memory_games from public,anon,authenticated;

create function private.lock_duo_room(p_room uuid) returns public.rooms
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  select * into r from public.rooms where id=p_room for update;
  if not found or not public.is_room_member(p_room) then raise exception 'Room not found or you are not a member.'; end if;
  return r;
end $$;
revoke all on function private.lock_duo_room(uuid) from public,anon,authenticated;

create or replace function private.lock_room(p_room uuid) returns public.rooms
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  r:=private.lock_duo_room(p_room);
  if r.duo_lobby or r.game_kind<>'code' then raise exception 'Crack the Code is not active in this room.'; end if;
  return r;
end $$;

create or replace function public.heartbeat(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_duo_room(p_room);
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
end $$;

create function public.create_duo_room(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  rid:=public.create_room(p_name,'number','low','','turns');
  insert into private.duo_choices(room_id) values(rid);
  update public.rooms set duo_lobby=true,version=version+1 where id=rid;
  return rid;
end $$;

create function public.open_duo_lobby(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; m private.memory_games;
begin
  r:=private.lock_duo_room(p_room);
  if r.host_id<>auth.uid() then raise exception 'Only the host can choose the next game.'; end if;
  if r.duo_lobby then return; end if;
  if r.game_kind='memory' then
    select * into m from private.memory_games where room_id=p_room;
    if not found or not m.finished then raise exception 'Finish Memory Match before switching games.'; end if;
  elsif r.status<>'match_over' and not (r.status='lobby' and not exists(
    select 1 from public.players where room_id=p_room and secret_ready
  )) then raise exception 'Finish the current match before switching games.'; end if;
  insert into private.duo_choices(room_id,mode,variant) values(p_room,r.mode,r.variant)
    on conflict(room_id) do update set ready='{}',revision=private.duo_choices.revision+1;
  update public.rooms set duo_lobby=true,version=version+1 where id=p_room;
end $$;

create function public.choose_duo_game(p_room uuid,p_revision integer,p_game text,p_tiles integer,p_theme text,p_mode text,p_variant text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  if not r.duo_lobby or r.host_id<>auth.uid() then raise exception 'Only the host can change games in the shared lobby.'; end if;
  select * into strict c from private.duo_choices where room_id=p_room;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them again.'; end if;
  if p_game is null or p_game not in ('code','memory') or p_tiles is null or p_tiles not in (12,16,24)
    or p_theme is null or p_theme not in ('paintings','florals','animals','patterns')
    or p_mode is null or p_mode not in ('number','word') or p_variant is null or p_variant not in ('race','turns')
    then raise exception 'Choose valid game, tile count and theme settings.'; end if;
  update private.duo_choices set selected=p_game,tiles=p_tiles,theme=p_theme,mode=p_mode,variant=p_variant,
    ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set version=version+1 where id=p_room;
end $$;

create function public.confirm_duo_game(p_room uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  if not r.duo_lobby then raise exception 'This game has already started.'; end if;
  select * into strict c from private.duo_choices where room_id=p_room;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them before confirming.'; end if;
  if (select count(*) from public.players where room_id=p_room)<>2 then raise exception 'Wait for your friend to join.'; end if;
  if not auth.uid()=any(c.ready) then
    update private.duo_choices set ready=array_append(ready,auth.uid()) where room_id=p_room returning * into c;
  end if;
  if cardinality(c.ready)=2 then
    if c.selected='memory' then
      insert into private.memory_games(room_id,deck,turn_user,scores)
        select p_room,array(select n from generate_series(0,c.tiles/2-1) n cross join generate_series(1,2) copies order by random()),
          r.host_id,(select jsonb_object_agg(user_id::text,0) from public.players where room_id=p_room)
        on conflict(room_id) do update set session_id=gen_random_uuid(),deck=excluded.deck,turn_user=excluded.turn_user,
          scores=excluded.scores,matched='{}',flipped='{}',reveal_until=null,turn_number=1,moves=0,finished=false;
      update public.rooms set game_kind='memory',duo_lobby=false,version=version+1 where id=p_room;
    else
      delete from private.pending_guesses where room_id=p_room;
      update public.players set score=0,ready=false,attempts=0,solved=false,finished_at=null,next_ready=false,
        secret_ready=false,wager='' where room_id=p_room;
      update public.rooms set game_kind='code',duo_lobby=false,mode=c.mode,variant=c.variant,status='lobby',
        match_number=match_number+1,round_number=1,started_at=null,turn_user_id=null,wager_version=wager_version+1,
        version=version+1 where id=p_room;
    end if;
  else
    update public.rooms set version=version+1 where id=p_room;
  end if;
end $$;

create function public.flip_memory_card(p_room uuid,p_session uuid,p_move integer,p_index integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; m private.memory_games; first_card integer; next_user uuid;
begin
  r:=private.lock_duo_room(p_room);
  if r.duo_lobby or r.game_kind<>'memory' then raise exception 'Memory Match is not active.'; end if;
  select * into strict m from private.memory_games where room_id=p_room;
  if p_session is distinct from m.session_id or p_move is distinct from m.moves then raise exception 'The board changed. Wait for it to sync before flipping again.'; end if;
  if m.finished then raise exception 'This Memory Match is complete.'; end if;
  if m.turn_user<>auth.uid() then raise exception 'It is your friend''s turn.'; end if;
  if m.reveal_until>clock_timestamp() then raise exception 'Wait for the revealed cards to turn back over.'; end if;
  if p_index is null or p_index<0 or p_index>=cardinality(m.deck) then raise exception 'Choose a card on the board.'; end if;
  if p_index=any(m.matched) then raise exception 'That pair has already been found.'; end if;
  if m.reveal_until is not null then m.flipped:='{}'; m.reveal_until:=null; end if;
  if p_index=any(m.flipped) then raise exception 'Choose a different card.'; end if;
  if cardinality(m.flipped)=0 then
    m.flipped:=array[p_index];
  else
    first_card:=m.flipped[1];
    m.flipped:=array_append(m.flipped,p_index);
    if m.deck[first_card+1]=m.deck[p_index+1] then
      m.matched:=m.matched||m.flipped;
      m.flipped:='{}';
      m.scores:=jsonb_set(m.scores,array[auth.uid()::text],to_jsonb((m.scores->>auth.uid()::text)::integer+1));
      m.finished:=cardinality(m.matched)=cardinality(m.deck);
    else
      m.reveal_until:=clock_timestamp()+interval '1500 milliseconds';
      select user_id into strict next_user from public.players where room_id=p_room and user_id<>auth.uid();
      m.turn_user:=next_user;
      m.turn_number:=m.turn_number+1;
    end if;
  end if;
  update private.memory_games set flipped=m.flipped,matched=m.matched,reveal_until=m.reveal_until,
    turn_user=m.turn_user,turn_number=m.turn_number,moves=m.moves+1,scores=m.scores,finished=m.finished where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

alter function public.get_game_state(uuid) rename to get_code_game_state;
revoke all on function public.get_code_game_state(uuid) from public,anon,authenticated;
create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; r public.rooms; c private.duo_choices; m private.memory_games;
begin
  state:=public.get_code_game_state(p_room);
  select * into r from public.rooms where id=p_room;
  select * into c from private.duo_choices where room_id=p_room;
  if found then
    state:=state||jsonb_build_object('hub',to_jsonb(c)-'room_id');
  end if;
  if r.game_kind='memory' and not r.duo_lobby then
    select * into strict m from private.memory_games where room_id=p_room;
    state:=state||jsonb_build_object('memory',jsonb_build_object(
      'session_id',m.session_id,'moves',m.moves,'turn_number',m.turn_number,'turn_user',m.turn_user,'scores',m.scores,'finished',m.finished,
      'reveal_until',m.reveal_until,'theme',c.theme,
      'cards',(select jsonb_agg(case when m.finished or i=any(m.matched) or
        (i=any(m.flipped) and (m.reveal_until is null or m.reveal_until>clock_timestamp())) then m.deck[i+1] else null end order by i)
        from generate_series(0,cardinality(m.deck)-1) i),
      'matched',m.matched
    ));
    state:=state||jsonb_build_object('own_secret',null,'guesses','[]'::jsonb,'pending_guess',null,'results','[]'::jsonb);
  end if;
  return state||jsonb_build_object('server_now',clock_timestamp());
end $$;

alter function private.current_turn_action(uuid) rename to code_turn_action;
create function private.current_turn_action(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.rooms; m private.memory_games;
begin
  select * into r from public.rooms where id=p_room;
  if not found or r.duo_lobby then return null; end if;
  if r.game_kind='code' then return private.code_turn_action(p_room); end if;
  select * into m from private.memory_games where room_id=p_room;
  if not found or m.finished then return null; end if;
  return jsonb_build_object('user',m.turn_user,'kind','guess','roomCode',r.code,
    'key',r.id::text||'.memory.'||m.session_id::text||'.'||m.turn_number);
end $$;
revoke all on function private.current_turn_action(uuid),private.code_turn_action(uuid) from public,anon,authenticated;
revoke all on function public.create_duo_room(text),public.open_duo_lobby(uuid),
  public.choose_duo_game(uuid,integer,text,integer,text,text,text),public.confirm_duo_game(uuid,integer),
  public.flip_memory_card(uuid,uuid,integer,integer),public.get_game_state(uuid) from public,anon;
grant execute on function public.create_duo_room(text),public.open_duo_lobby(uuid),
  public.choose_duo_game(uuid,integer,text,integer,text,text,text),public.confirm_duo_game(uuid,integer),
  public.flip_memory_card(uuid,uuid,integer,integer),public.get_game_state(uuid) to authenticated;
notify pgrst,'reload schema';
