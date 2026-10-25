alter table public.rooms drop constraint rooms_game_kind_check;
alter table public.rooms add constraint rooms_game_kind_check check(game_kind in ('code','memory','dots'));
alter table private.duo_choices drop constraint duo_choices_selected_check;
alter table private.duo_choices add constraint duo_choices_selected_check check(selected in ('code','memory','dots'));
alter table private.duo_choices add column dots integer not null default 10 check(dots in (10,12,15));

create table private.dots_games (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  session_id uuid not null default gen_random_uuid(),
  dots integer not null check(dots in (10,12,15)),
  edges uuid[] not null,
  boxes uuid[] not null,
  scores jsonb not null,
  turn_user uuid not null references auth.users(id),
  turn_number integer not null default 1,
  moves integer not null default 0,
  roll integer,
  roll_user uuid,
  roll_number integer not null default 0,
  roll_until timestamptz,
  remaining integer not null default 0,
  finished boolean not null default false
);
alter table private.dots_games enable row level security;
revoke all on private.dots_games from public,anon,authenticated;

drop function public.choose_duo_game(uuid,integer,text,integer,text,text,text);
create function public.choose_duo_game(p_room uuid,p_revision integer,p_game text,p_tiles integer,p_theme text,p_mode text,p_variant text,p_dots integer default 10) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  if not r.duo_lobby or r.host_id<>auth.uid() then raise exception 'Only the host can change games in the shared lobby.'; end if;
  select * into strict c from private.duo_choices where room_id=p_room;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them again.'; end if;
  if p_game is null or p_game not in ('code','memory','dots') or p_tiles is null or p_tiles not in (12,16,24)
    or p_theme is null or p_theme not in ('paintings','florals','animals','patterns')
    or p_mode is null or p_mode not in ('number','word') or p_variant is null or p_variant not in ('race','turns')
    or p_dots is null or p_dots not in (10,12,15)
    then raise exception 'Choose valid game, tile count and theme settings.'; end if;
  update private.duo_choices set selected=p_game,tiles=p_tiles,theme=p_theme,mode=p_mode,variant=p_variant,dots=p_dots,
    ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set version=version+1 where id=p_room;
end $$;

alter function public.confirm_duo_game(uuid,integer) rename to confirm_code_or_memory;
revoke all on function public.confirm_code_or_memory(uuid,integer) from public,anon,authenticated;
create function public.confirm_duo_game(p_room uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  select * into strict c from private.duo_choices where room_id=p_room;
  if c.selected<>'dots' then perform public.confirm_code_or_memory(p_room,p_revision); return; end if;
  if not r.duo_lobby then raise exception 'This game has already started.'; end if;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them before confirming.'; end if;
  if (select count(*) from public.players where room_id=p_room)<>2 then raise exception 'Wait for your friend to join.'; end if;
  if not auth.uid()=any(c.ready) then
    update private.duo_choices set ready=array_append(ready,auth.uid()) where room_id=p_room returning * into c;
  end if;
  if cardinality(c.ready)=2 then
    insert into private.dots_games(room_id,dots,edges,boxes,scores,turn_user)
      select p_room,c.dots,array_fill(null::uuid,array[2*c.dots*(c.dots-1)]),
        array_fill(null::uuid,array[(c.dots-1)*(c.dots-1)]),
        (select jsonb_object_agg(user_id::text,0) from public.players where room_id=p_room),r.host_id
      on conflict(room_id) do update set session_id=gen_random_uuid(),dots=excluded.dots,edges=excluded.edges,
        boxes=excluded.boxes,scores=excluded.scores,turn_user=excluded.turn_user,turn_number=1,moves=0,
        roll=null,roll_user=null,roll_number=0,roll_until=null,remaining=0,finished=false;
    update public.rooms set game_kind='dots',duo_lobby=false,version=version+1 where id=p_room;
  else
    update public.rooms set version=version+1 where id=p_room;
  end if;
end $$;

alter function public.open_duo_lobby(uuid) rename to open_code_or_memory_lobby;
revoke all on function public.open_code_or_memory_lobby(uuid) from public,anon,authenticated;
create function public.open_duo_lobby(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  r:=private.lock_duo_room(p_room);
  if r.game_kind<>'dots' or r.duo_lobby then perform public.open_code_or_memory_lobby(p_room); return; end if;
  if r.host_id<>auth.uid() then raise exception 'Only the host can choose the next game.'; end if;
  if not exists(select 1 from private.dots_games where room_id=p_room and finished) then
    raise exception 'Finish Dots & Boxes before switching games.';
  end if;
  update private.duo_choices set ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set duo_lobby=true,version=version+1 where id=p_room;
end $$;

create function private.lock_dots_game(p_room uuid,p_session uuid,p_move integer) returns private.dots_games
language plpgsql security definer set search_path='' as $$
declare r public.rooms; d private.dots_games;
begin
  r:=private.lock_duo_room(p_room);
  if r.duo_lobby or r.game_kind<>'dots' then raise exception 'Dots & Boxes is not active.'; end if;
  select * into strict d from private.dots_games where room_id=p_room;
  if p_session is distinct from d.session_id or p_move is distinct from d.moves then raise exception 'The board changed. Wait for it to sync and try again.'; end if;
  if d.finished then raise exception 'This Dots & Boxes game is complete.'; end if;
  if d.turn_user<>auth.uid() then raise exception 'It is your friend''s turn.'; end if;
  return d;
end $$;
revoke all on function private.lock_dots_game(uuid,uuid,integer) from public,anon,authenticated;

create function public.roll_dots_dice(p_room uuid,p_session uuid,p_move integer) returns void
language plpgsql security definer set search_path='' as $$
declare d private.dots_games; rolled integer; available integer;
begin
  d:=private.lock_dots_game(p_room,p_session,p_move);
  if d.remaining>0 then raise exception 'Draw your remaining lines before rolling again.'; end if;
  rolled:=floor(random()*8)::integer+1;
  select count(*) into available from unnest(d.edges) edge where edge is null;
  update private.dots_games set roll=rolled,roll_user=auth.uid(),roll_number=roll_number+1,
    roll_until=clock_timestamp()+interval '2400 milliseconds',remaining=least(rolled,available),moves=moves+1 where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

create function public.draw_dots_line(p_room uuid,p_session uuid,p_move integer,p_edge integer) returns void
language plpgsql security definer set search_path='' as $$
declare d private.dots_games; i integer; row_no integer; col_no integer; top_edge integer; left_edge integer; claimed integer:=0;
begin
  d:=private.lock_dots_game(p_room,p_session,p_move);
  if d.remaining=0 then raise exception 'Roll the eight-sided dice first.'; end if;
  if d.roll_until>clock_timestamp() then raise exception 'Wait for the dice to finish rolling.'; end if;
  if p_edge is null or p_edge<0 or p_edge>=cardinality(d.edges) then raise exception 'Choose a line between neighbouring dots.'; end if;
  if d.edges[p_edge+1] is not null then raise exception 'That line is already drawn.'; end if;
  d.edges[p_edge+1]:=auth.uid();
  for i in 0..cardinality(d.boxes)-1 loop
    if d.boxes[i+1] is not null then continue; end if;
    row_no:=i/(d.dots-1); col_no:=i%(d.dots-1);
    top_edge:=row_no*(d.dots-1)+col_no+1;
    left_edge:=d.dots*(d.dots-1)+row_no*d.dots+col_no+1;
    if d.edges[top_edge] is not null and d.edges[top_edge+d.dots-1] is not null
      and d.edges[left_edge] is not null and d.edges[left_edge+1] is not null then
      d.boxes[i+1]:=auth.uid(); claimed:=claimed+1;
    end if;
  end loop;
  d.scores:=jsonb_set(d.scores,array[auth.uid()::text],to_jsonb((d.scores->>auth.uid()::text)::integer+claimed));
  d.remaining:=d.remaining-1;
  d.finished:=not exists(select 1 from unnest(d.edges) edge where edge is null);
  if d.remaining=0 and not d.finished then
    select user_id into strict d.turn_user from public.players where room_id=p_room and user_id<>auth.uid();
    d.turn_number:=d.turn_number+1;
  end if;
  update private.dots_games set edges=d.edges,boxes=d.boxes,scores=d.scores,remaining=d.remaining,
    finished=d.finished,turn_user=d.turn_user,turn_number=d.turn_number,moves=moves+1 where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

alter function public.get_game_state(uuid) rename to get_code_or_memory_state;
revoke all on function public.get_code_or_memory_state(uuid) from public,anon,authenticated;
create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; d private.dots_games;
begin
  state:=public.get_code_or_memory_state(p_room);
  if state->'room'->>'game_kind'='dots' and not (state->'room'->>'duo_lobby')::boolean then
    select * into strict d from private.dots_games where room_id=p_room;
    state:=state||jsonb_build_object('dots',to_jsonb(d)-'room_id',
      'own_secret',null,'guesses','[]'::jsonb,'pending_guess',null,'results','[]'::jsonb);
  end if;
  return state;
end $$;

alter function private.current_turn_action(uuid) rename to code_or_memory_turn_action;
revoke all on function private.code_or_memory_turn_action(uuid) from public,anon,authenticated;
create function private.current_turn_action(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.rooms; d private.dots_games;
begin
  select * into r from public.rooms where id=p_room;
  if not found or r.duo_lobby then return null; end if;
  if r.game_kind<>'dots' then return private.code_or_memory_turn_action(p_room); end if;
  select * into d from private.dots_games where room_id=p_room;
  if not found or d.finished then return null; end if;
  return jsonb_build_object('user',d.turn_user,'kind','guess','roomCode',r.code,
    'key',r.id::text||'.dots.'||d.session_id::text||'.'||d.turn_number);
end $$;
revoke all on function private.current_turn_action(uuid) from public,anon,authenticated;
revoke all on function public.choose_duo_game(uuid,integer,text,integer,text,text,text,integer),
  public.confirm_duo_game(uuid,integer),public.open_duo_lobby(uuid),public.get_game_state(uuid),
  public.roll_dots_dice(uuid,uuid,integer),public.draw_dots_line(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.choose_duo_game(uuid,integer,text,integer,text,text,text,integer),
  public.confirm_duo_game(uuid,integer),public.open_duo_lobby(uuid),public.get_game_state(uuid),
  public.roll_dots_dice(uuid,uuid,integer),public.draw_dots_line(uuid,uuid,integer,integer) to authenticated;
notify pgrst,'reload schema';
