alter table public.rooms drop constraint rooms_game_kind_check;
alter table public.rooms add constraint rooms_game_kind_check check(game_kind in ('code','memory','dots','ring'));
alter table private.duo_choices drop constraint duo_choices_selected_check;
alter table private.duo_choices add constraint duo_choices_selected_check check(selected in ('code','memory','dots','ring'));
alter table private.solo_boards drop constraint solo_boards_kind_check;
alter table private.solo_boards add constraint solo_boards_kind_check check(kind in ('memory','dots','ring'));

create function private.shift_ring(rods jsonb,p_from integer,p_to integer,p_reverse boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare source jsonb; target jsonb; colour jsonb; height integer;
begin
  if p_from is null or p_to is null or p_from not between 0 and 4 or p_to not between 0 and 4 or p_from=p_to then
    raise exception 'Choose two different rods on the board.';
  end if;
  source:=rods->p_from; target:=rods->p_to; height:=jsonb_array_length(source);
  if height=0 then raise exception 'That rod has no rings to move.'; end if;
  if jsonb_array_length(target)>=5 then raise exception 'That rod is full. Each rod holds five rings.'; end if;
  colour:=source->(height-1);
  if p_reverse then
    if height>1 and source->(height-2)<>colour then raise exception 'The reverse puzzle move cannot be undone legally.'; end if;
  elsif jsonb_array_length(target)>0 and target->(jsonb_array_length(target)-1)<>colour then
    raise exception 'Move onto an empty rod or a ring of the same colour.';
  end if;
  rods:=jsonb_set(rods,array[p_from::text],source-(height-1));
  return jsonb_set(rods,array[p_to::text],target||jsonb_build_array(colour));
end $$;
create function private.ring_progress(rods jsonb) returns integer
language sql immutable set search_path='' as $$
  select count(*)::integer from jsonb_array_elements(rods) rod where jsonb_array_length(rod)=5 and
    not exists(select 1 from jsonb_array_elements(rod) ring where ring<>rod->0)
$$;
create function private.new_ring_puzzle() returns jsonb
language plpgsql set search_path='' as $$
declare colours integer[]; positions integer[]; rods jsonb:='[[],[],[],[],[]]'; plan jsonb:='[]';
  pairs integer[][]:=array[[1,2],[3,4],[1,3],[2,4],[1,2],[3,4]];
  phase integer; count_to_move integer; leg integer; i integer; a integer; b integer; source integer; target integer;
begin
  select array_agg(n order by random()) into colours from generate_series(0,3) n;
  select array_agg(n order by random()) into positions from generate_series(0,4) n;
  for i in 1..4 loop
    rods:=jsonb_set(rods,array[positions[i]::text],to_jsonb(array_fill(colours[i],array[5])));
  end loop;
  for phase in 1..6 loop
    a:=positions[pairs[phase][1]]; b:=positions[pairs[phase][2]];
    count_to_move:=case when phase<=2 then 3+floor(random()*2)::integer when phase<=4 then 2 else 1 end;
    for leg in 1..3 loop
      source:=case leg when 1 then a when 2 then b else positions[5] end;
      target:=case leg when 1 then positions[5] when 2 then a else b end;
      for i in 1..count_to_move loop
        rods:=private.shift_ring(rods,source,target,true);
        plan:=jsonb_build_array(target*5+source)||plan;
      end loop;
    end loop;
  end loop;
  if private.ring_progress(rods)=4 then raise exception 'The ring puzzle did not shuffle.'; end if;
  return jsonb_build_object('initial',rods,'solution',plan);
end $$;
create function private.ring_state(board jsonb) returns jsonb
language sql set search_path='' as $$
  select (board-'solution'-'bot_step'-'initial')||jsonb_build_object('progress',
    (select jsonb_object_agg(player,private.ring_progress(rods)) from jsonb_each(board->'boards') t(player,rods)))
$$;
create table private.ring_games (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  board jsonb not null
);
alter table private.ring_games enable row level security;
revoke all on private.ring_games from public,anon,authenticated;

create or replace function public.choose_duo_game(p_room uuid,p_revision integer,p_game text,p_tiles integer,p_theme text,p_mode text,p_variant text,p_dots integer default 10) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  if not r.duo_lobby or r.host_id<>auth.uid() then raise exception 'Only the host can change games in the shared lobby.'; end if;
  select * into strict c from private.duo_choices where room_id=p_room;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them again.'; end if;
  if p_game is null or p_game not in ('code','memory','dots','ring') or p_tiles is null or p_tiles not in (12,16,24)
    or p_theme is null or p_theme not in ('paintings','florals','animals','patterns')
    or p_mode is null or p_mode not in ('number','word') or p_variant is null or p_variant not in ('race','turns')
    or p_dots is null or p_dots not in (10,12,15) then raise exception 'Choose valid game, tile count and theme settings.'; end if;
  update private.duo_choices set selected=p_game,tiles=p_tiles,theme=p_theme,mode=p_mode,variant=p_variant,dots=p_dots,
    ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set version=version+1 where id=p_room;
end $$;
alter function public.confirm_duo_game(uuid,integer) rename to confirm_before_rings;
revoke all on function public.confirm_before_rings(uuid,integer) from public,anon,authenticated;
create function public.confirm_duo_game(p_room uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices; puzzle jsonb; board jsonb;
begin
  r:=private.lock_duo_room(p_room);
  select * into strict c from private.duo_choices where room_id=p_room;
  if c.selected<>'ring' then perform public.confirm_before_rings(p_room,p_revision); return; end if;
  if not r.duo_lobby then raise exception 'This game has already started.'; end if;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them before confirming.'; end if;
  if (select count(*) from public.players where room_id=p_room)<>2 then raise exception 'Wait for your friend to join.'; end if;
  if not auth.uid()=any(c.ready) then
    update private.duo_choices set ready=array_append(ready,auth.uid()) where room_id=p_room returning * into c;
  end if;
  if cardinality(c.ready)=2 then
    puzzle:=private.new_ring_puzzle();
    board:=jsonb_build_object('session_id',gen_random_uuid(),'initial',puzzle->'initial','boards',
      (select jsonb_object_agg(user_id::text,puzzle->'initial') from public.players where room_id=p_room),
      'moves',(select jsonb_object_agg(user_id::text,0) from public.players where room_id=p_room),
      'resets',(select jsonb_object_agg(user_id::text,0) from public.players where room_id=p_room),
      'started_at',clock_timestamp()+interval '3 seconds','finished',false,'winner_id',null,'finished_at',null,'solution',puzzle->'solution');
    insert into private.ring_games(room_id,board) values(p_room,board)
      on conflict(room_id) do update set board=excluded.board;
    update public.rooms set game_kind='ring',duo_lobby=false,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room;
  end if;
end $$;
create function private.apply_ring_move(board jsonb,p_player uuid,p_move integer,p_from integer,p_to integer) returns jsonb
language plpgsql set search_path='' as $$
declare rods jsonb; player text:=p_player::text;
begin
  if (board->>'finished')::boolean then raise exception 'This Ring Rush race is complete.'; end if;
  if clock_timestamp()<(board->>'started_at')::timestamptz then raise exception 'Wait for the shared countdown to finish.'; end if;
  if not (board->'boards') ? player then raise exception 'You are not a player in this ring race.'; end if;
  if p_move is distinct from (board->'moves'->>player)::integer then raise exception 'Your rings changed. Wait for them to sync and try again.'; end if;
  rods:=private.shift_ring(board->'boards'->player,p_from,p_to);
  board:=jsonb_set(board,array['boards',player],rods);
  board:=jsonb_set(board,array['moves',player],to_jsonb(p_move+1));
  if private.ring_progress(rods)=4 then
    board:=board||jsonb_build_object('finished',true,'winner_id',p_player,'finished_at',clock_timestamp());
  end if;
  return board;
end $$;
create function private.reset_rings(board jsonb,p_player uuid,p_move integer) returns jsonb
language plpgsql set search_path='' as $$
declare player text:=p_player::text;
begin
  if (board->>'finished')::boolean then raise exception 'This Ring Rush race is complete.'; end if;
  if clock_timestamp()<(board->>'started_at')::timestamptz then raise exception 'Wait for the shared countdown to finish.'; end if;
  if not ((board->'boards') ? player) then raise exception 'You are not a player in this ring race.'; end if;
  if p_move is distinct from (board->'moves'->>player)::integer then raise exception 'Your rings changed. Wait for them to sync and try again.'; end if;
  board:=jsonb_set(board,array['boards',player],board->'initial');
  board:=jsonb_set(board,array['moves',player],to_jsonb(p_move+1));
  return jsonb_set(board,array['resets',player],to_jsonb((board->'resets'->>player)::integer+1));
end $$;
create function public.move_ring(p_room uuid,p_session uuid,p_move integer,p_from integer,p_to integer,p_reset boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; next_board jsonb;
begin
  r:=private.lock_duo_room(p_room);
  if r.duo_lobby or r.game_kind<>'ring' then raise exception 'Ring Rush is not active.'; end if;
  select g.board into strict next_board from private.ring_games g where room_id=p_room;
  if p_session is distinct from (next_board->>'session_id')::uuid then raise exception 'This is a different ring race. Reload to reconnect.'; end if;
  if p_reset then next_board:=private.reset_rings(next_board,auth.uid(),p_move);
  else next_board:=private.apply_ring_move(next_board,auth.uid(),p_move,p_from,p_to); end if;
  update private.ring_games set board=next_board where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;
alter function public.open_duo_lobby(uuid) rename to open_before_rings;
revoke all on function public.open_before_rings(uuid) from public,anon,authenticated;
create function public.open_duo_lobby(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  r:=private.lock_duo_room(p_room);
  if r.game_kind<>'ring' or r.duo_lobby then perform public.open_before_rings(p_room); return; end if;
  if r.host_id<>auth.uid() then raise exception 'Only the host can choose the next game.'; end if;
  if not exists(select 1 from private.ring_games where room_id=p_room and (board->>'finished')::boolean) then
    raise exception 'Finish Ring Rush before switching games.';
  end if;
  update private.duo_choices set ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set duo_lobby=true,version=version+1 where id=p_room;
end $$;
alter function public.get_game_state(uuid) rename to get_before_rings;
revoke all on function public.get_before_rings(uuid) from public,anon,authenticated;
create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; board jsonb;
begin
  state:=public.get_before_rings(p_room);
  if state->'room'->>'game_kind'='ring' and not (state->'room'->>'duo_lobby')::boolean then
    select g.board into strict board from private.ring_games g where room_id=p_room;
    state:=state||jsonb_build_object('ring',private.ring_state(board),
      'own_secret',null,'guesses','[]'::jsonb,'pending_guess',null,'results','[]'::jsonb);
  end if;
  return state;
end $$;
alter function private.current_turn_action(uuid) rename to turn_action_before_rings;
revoke all on function private.turn_action_before_rings(uuid) from public,anon,authenticated;
create function private.current_turn_action(p_room uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when game_kind='ring' then null else private.turn_action_before_rings(p_room) end
    from public.rooms where id=p_room
$$;
revoke all on function private.current_turn_action(uuid) from public,anon,authenticated;

alter function private.solo_board_state(private.solo_boards) rename to solo_state_before_rings;
revoke all on function private.solo_state_before_rings(private.solo_boards) from public,anon,authenticated;
create function private.solo_board_state(g private.solo_boards) returns jsonb
language plpgsql set search_path='' as $$
begin
  if g.kind<>'ring' then return private.solo_state_before_rings(g); end if;
  return jsonb_build_object('id',g.id,'kind',g.kind,'difficulty',g.difficulty,'status',g.status,'version',g.version,
    'board',private.ring_state(g.board),'next_action_at',g.next_action_at,'server_now',clock_timestamp(),'computer_id',private.computer_id());
end $$;
create function private.ring_pace(difficulty text) returns interval language sql immutable set search_path='' as $$
  select case difficulty when 'easy' then interval '2400 milliseconds' when 'medium' then interval '1500 milliseconds' else interval '900 milliseconds' end
$$;
create function private.advance_ring_computer(g private.solo_boards) returns private.solo_boards
language plpgsql set search_path='' as $$
declare step integer:=(g.board->>'bot_step')::integer; code integer; due timestamptz; bot uuid:=private.computer_id(); next_board jsonb:=g.board;
begin
  if g.status<>'playing' then return g; end if;
  due:=(next_board->>'started_at')::timestamptz+(step+1)*private.ring_pace(g.difficulty);
  while due<=clock_timestamp() and not (next_board->>'finished')::boolean loop
    if step>=jsonb_array_length(next_board->'solution') then raise exception 'The computer ring solution ended before the puzzle was sorted.'; end if;
    code:=(next_board->'solution'->>step)::integer;
    next_board:=private.apply_ring_move(next_board,bot,step,code/5,code%5);
    step:=step+1;
    if (next_board->>'finished')::boolean then next_board:=jsonb_set(next_board,'{finished_at}',to_jsonb(due)); end if;
    due:=(next_board->>'started_at')::timestamptz+(step+1)*private.ring_pace(g.difficulty);
  end loop;
  if step<>(g.board->>'bot_step')::integer then
    next_board:=jsonb_set(next_board,'{bot_step}',to_jsonb(step));
    update private.solo_boards set board=next_board,version=version+1,
      status=case when (next_board->>'finished')::boolean then 'finished' else 'playing' end,
      next_action_at=case when (next_board->>'finished')::boolean then null else due end where id=g.id returning * into g;
  end if;
  return g;
end $$;
alter function public.create_solo_board(text,text,integer,text,integer) rename to create_solo_before_rings;
revoke all on function public.create_solo_before_rings(text,text,integer,text,integer) from public,anon,authenticated;
create function public.create_solo_board(p_kind text,p_difficulty text,p_tiles integer,p_theme text,p_dots integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; puzzle jsonb; sid uuid:=gen_random_uuid(); started timestamptz:=clock_timestamp()+interval '3 seconds'; board jsonb;
begin
  if p_kind is distinct from 'ring' then return public.create_solo_before_rings(p_kind,p_difficulty,p_tiles,p_theme,p_dots); end if;
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  if p_difficulty is null or p_difficulty not in ('easy','medium','hard')
    or p_tiles is null or p_tiles not in (12,16,24) or p_theme is null or p_theme not in ('paintings','florals','animals','patterns')
    or p_dots is null or p_dots not in (10,12,15) then raise exception 'Choose valid solo game and difficulty settings.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':solo-board',0));
  update private.solo_boards set status='abandoned',next_action_at=null,version=version+1 where user_id=auth.uid() and status='playing';
  puzzle:=private.new_ring_puzzle();
  board:=jsonb_build_object('session_id',sid,'initial',puzzle->'initial','boards',jsonb_build_object(auth.uid()::text,puzzle->'initial',private.computer_id()::text,puzzle->'initial'),
    'moves',jsonb_build_object(auth.uid()::text,0,private.computer_id()::text,0),'started_at',started,
    'resets',jsonb_build_object(auth.uid()::text,0,private.computer_id()::text,0),
    'finished',false,'winner_id',null,'finished_at',null,'solution',puzzle->'solution','bot_step',0);
  insert into private.solo_boards(id,user_id,kind,difficulty,theme,board,next_action_at)
    values(sid,auth.uid(),'ring',p_difficulty,p_theme,board,started+private.ring_pace(p_difficulty)) returning * into g;
  return private.solo_board_state(g);
end $$;
alter function public.get_solo_board(uuid) rename to get_solo_before_rings;
revoke all on function public.get_solo_before_rings(uuid) from public,anon,authenticated;
create function public.get_solo_board(p_game uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_boards where user_id=auth.uid() and (id=p_game or p_game is null and status='playing')
    order by started_at desc limit 1 for update;
  if not found or g.kind<>'ring' then return public.get_solo_before_rings(p_game); end if;
  if p_game is not null then g:=private.advance_ring_computer(g); end if;
  return private.solo_board_state(g);
end $$;
create function public.move_solo_ring(p_game uuid,p_move integer,p_from integer,p_to integer,p_reset boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; next_board jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_boards where id=p_game and user_id=auth.uid() for update;
  if not found or g.kind<>'ring' then raise exception 'No Ring Rush game was found for your player.'; end if;
  if g.status<>'playing' then raise exception 'This solo race is complete or was replaced. Start a new game.'; end if;
  if p_move is distinct from (g.board->'moves'->>auth.uid()::text)::integer then raise exception 'Your rings changed. Wait for them to sync and try again.'; end if;
  g:=private.advance_ring_computer(g);
  if g.status='finished' then return private.solo_board_state(g)||jsonb_build_object('move_accepted',false); end if;
  if p_reset then next_board:=private.reset_rings(g.board,auth.uid(),p_move);
  else next_board:=private.apply_ring_move(g.board,auth.uid(),p_move,p_from,p_to); end if;
  update private.solo_boards set board=next_board,version=version+1,
    status=case when (next_board->>'finished')::boolean then 'finished' else 'playing' end,
    next_action_at=case when (next_board->>'finished')::boolean then null else next_action_at end where id=g.id returning * into g;
  return private.solo_board_state(g)||jsonb_build_object('move_accepted',true);
end $$;

revoke all on function private.shift_ring(jsonb,integer,integer,boolean),private.ring_progress(jsonb),
  private.new_ring_puzzle(),private.ring_state(jsonb),private.solo_board_state(private.solo_boards),
  private.ring_pace(text),private.advance_ring_computer(private.solo_boards),private.reset_rings(jsonb,uuid,integer) from public,anon,authenticated;
revoke all on function public.confirm_duo_game(uuid,integer),public.open_duo_lobby(uuid),public.get_game_state(uuid),
  public.create_solo_board(text,text,integer,text,integer),public.get_solo_board(uuid),
  public.move_ring(uuid,uuid,integer,integer,integer,boolean),public.move_solo_ring(uuid,integer,integer,integer,boolean) from public,anon;
grant execute on function public.confirm_duo_game(uuid,integer),public.open_duo_lobby(uuid),public.get_game_state(uuid),
  public.create_solo_board(text,text,integer,text,integer),public.get_solo_board(uuid),
  public.move_ring(uuid,uuid,integer,integer,integer,boolean),public.move_solo_ring(uuid,integer,integer,integer,boolean) to authenticated;
notify pgrst,'reload schema';
