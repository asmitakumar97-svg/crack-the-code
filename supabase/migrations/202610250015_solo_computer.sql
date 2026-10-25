create function private.apply_memory_flip(m private.memory_games,p_index integer,p_actor uuid,p_other uuid) returns private.memory_games
language plpgsql set search_path='' as $$
declare first_card integer;
begin
  if m.finished then raise exception 'This Memory Match is complete.'; end if;
  if m.turn_user<>p_actor then raise exception 'It is your friend''s turn.'; end if;
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
      m.scores:=jsonb_set(m.scores,array[p_actor::text],to_jsonb((m.scores->>p_actor::text)::integer+1));
      m.finished:=cardinality(m.matched)=cardinality(m.deck);
    else
      m.reveal_until:=clock_timestamp()+interval '1500 milliseconds';
      m.turn_user:=p_other;
      m.turn_number:=m.turn_number+1;
    end if;
  end if;
  m.moves:=m.moves+1;
  return m;
end $$;

create function private.dots_box_edges(n integer,b integer) returns integer[]
language sql immutable set search_path='' as $$
  select array[(b/(n-1))*(n-1)+b%(n-1),(b/(n-1)+1)*(n-1)+b%(n-1),
    n*(n-1)+(b/(n-1))*n+b%(n-1),n*(n-1)+(b/(n-1))*n+b%(n-1)+1]
$$;
create function private.dots_adjacent_boxes(n integer,e integer) returns integer[]
language plpgsql immutable set search_path='' as $$
declare r integer; c integer; boxes integer[]:='{}';
begin
  if e<n*(n-1) then
    r:=e/(n-1); c:=e%(n-1);
    if r>0 then boxes:=array_append(boxes,(r-1)*(n-1)+c); end if;
    if r<n-1 then boxes:=array_append(boxes,r*(n-1)+c); end if;
  else
    r:=(e-n*(n-1))/n; c:=(e-n*(n-1))%n;
    if c>0 then boxes:=array_append(boxes,r*(n-1)+c-1); end if;
    if c<n-1 then boxes:=array_append(boxes,r*(n-1)+c); end if;
  end if;
  return boxes;
end $$;

create function private.apply_dots_roll(d private.dots_games) returns private.dots_games
language plpgsql set search_path='' as $$
declare available integer;
begin
  if d.finished then raise exception 'This Dots & Boxes game is complete.'; end if;
  if d.remaining>0 then raise exception 'Draw your remaining lines before rolling again.'; end if;
  select count(*) into available from unnest(d.edges) edge where edge is null;
  d.roll:=floor(random()*8)::integer+1;
  d.roll_user:=d.turn_user; d.roll_number:=d.roll_number+1;
  d.roll_until:=clock_timestamp()+interval '2400 milliseconds';
  d.remaining:=least(d.roll,available); d.moves:=d.moves+1;
  return d;
end $$;
create function private.apply_dots_line(d private.dots_games,p_edge integer,p_actor uuid,p_other uuid) returns private.dots_games
language plpgsql set search_path='' as $$
declare b integer; claimed integer:=0;
begin
  if d.finished then raise exception 'This Dots & Boxes game is complete.'; end if;
  if d.turn_user<>p_actor then raise exception 'It is your friend''s turn.'; end if;
  if d.remaining=0 then raise exception 'Roll the eight-sided dice first.'; end if;
  if d.roll_until>clock_timestamp() then raise exception 'Wait for the dice to finish rolling.'; end if;
  if p_edge is null or p_edge<0 or p_edge>=cardinality(d.edges) then raise exception 'Choose a line between neighbouring dots.'; end if;
  if d.edges[p_edge+1] is not null then raise exception 'That line is already drawn.'; end if;
  d.edges[p_edge+1]:=p_actor;
  foreach b in array private.dots_adjacent_boxes(d.dots,p_edge) loop
    if d.boxes[b+1] is null and not exists(
      select 1 from unnest(private.dots_box_edges(d.dots,b)) e where d.edges[e+1] is null
    ) then
      d.boxes[b+1]:=p_actor; claimed:=claimed+1;
    end if;
  end loop;
  d.scores:=jsonb_set(d.scores,array[p_actor::text],to_jsonb((d.scores->>p_actor::text)::integer+claimed));
  d.remaining:=d.remaining-1; d.moves:=d.moves+1;
  d.finished:=not exists(select 1 from unnest(d.edges) edge where edge is null);
  if d.remaining=0 and not d.finished then d.turn_user:=p_other; d.turn_number:=d.turn_number+1; end if;
  return d;
end $$;

create or replace function public.flip_memory_card(p_room uuid,p_session uuid,p_move integer,p_index integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; m private.memory_games; other_user uuid;
begin
  r:=private.lock_duo_room(p_room);
  if r.duo_lobby or r.game_kind<>'memory' then raise exception 'Memory Match is not active.'; end if;
  select * into strict m from private.memory_games where room_id=p_room;
  if p_session is distinct from m.session_id or p_move is distinct from m.moves then raise exception 'The board changed. Wait for it to sync before flipping again.'; end if;
  select user_id into strict other_user from public.players where room_id=p_room and user_id<>auth.uid();
  m:=private.apply_memory_flip(m,p_index,auth.uid(),other_user);
  update private.memory_games set flipped=m.flipped,matched=m.matched,reveal_until=m.reveal_until,
    turn_user=m.turn_user,turn_number=m.turn_number,moves=m.moves,scores=m.scores,finished=m.finished where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;
create or replace function public.roll_dots_dice(p_room uuid,p_session uuid,p_move integer) returns void
language plpgsql security definer set search_path='' as $$
declare d private.dots_games;
begin
  d:=private.lock_dots_game(p_room,p_session,p_move);
  d:=private.apply_dots_roll(d);
  update private.dots_games set roll=d.roll,roll_user=d.roll_user,roll_number=d.roll_number,
    roll_until=d.roll_until,remaining=d.remaining,moves=d.moves where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;
create or replace function public.draw_dots_line(p_room uuid,p_session uuid,p_move integer,p_edge integer) returns void
language plpgsql security definer set search_path='' as $$
declare d private.dots_games; other_user uuid;
begin
  d:=private.lock_dots_game(p_room,p_session,p_move);
  select user_id into strict other_user from public.players where room_id=p_room and user_id<>auth.uid();
  d:=private.apply_dots_line(d,p_edge,auth.uid(),other_user);
  update private.dots_games set edges=d.edges,boxes=d.boxes,scores=d.scores,remaining=d.remaining,
    finished=d.finished,turn_user=d.turn_user,turn_number=d.turn_number,moves=d.moves where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

create function private.computer_id() returns uuid language sql immutable set search_path='' as
  $$select '00000000-0000-0000-0000-000000000000'::uuid$$;
create table private.solo_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('memory','dots')),
  difficulty text not null check(difficulty in ('easy','medium','hard')),
  theme text not null check(theme in ('paintings','florals','animals','patterns')),
  status text not null default 'playing' check(status in ('playing','finished','abandoned')),
  board jsonb not null,
  knowledge jsonb not null default '[]'::jsonb,
  next_action_at timestamptz,
  version integer not null default 1,
  started_at timestamptz not null default clock_timestamp()
);
alter table private.solo_boards enable row level security;
revoke all on private.solo_boards from public,anon,authenticated;
create unique index solo_boards_one_active on private.solo_boards(user_id) where status='playing';

create function private.remember_card(g private.solo_boards,p_index integer) returns jsonb
language plpgsql set search_path='' as $$
declare knowledge jsonb; capacity integer; m private.memory_games;
begin
  m:=jsonb_populate_record(null::private.memory_games,g.board);
  capacity:=case g.difficulty when 'easy' then 4 when 'medium' then 8 else 24 end;
  select coalesce(jsonb_agg(item order by position),'[]') into knowledge
    from jsonb_array_elements(g.knowledge) with ordinality t(item,position)
    where (item->>'index')::integer<>p_index and not (item->>'index')::integer=any(m.matched);
  knowledge:=knowledge||jsonb_build_array(jsonb_build_object('index',p_index,'value',m.deck[p_index+1]));
  select coalesce(jsonb_agg(item order by position),'[]') into knowledge
    from jsonb_array_elements(knowledge) with ordinality t(item,position)
    where position>jsonb_array_length(knowledge)-capacity;
  return knowledge;
end $$;
create function private.computer_memory_card(g private.solo_boards) returns integer
language plpgsql set search_path='' as $$
declare m private.memory_games; known jsonb; chosen integer; first_value integer;
begin
  m:=jsonb_populate_record(null::private.memory_games,g.board);
  select coalesce(jsonb_agg(item),'[]') into known from jsonb_array_elements(g.knowledge) item
    where not (item->>'index')::integer=any(m.matched);
  if cardinality(m.flipped)=1 and m.reveal_until is null then
    first_value:=m.deck[m.flipped[1]+1];
    select (item->>'index')::integer into chosen from jsonb_array_elements(known) item
      where (item->>'value')::integer=first_value and (item->>'index')::integer<>m.flipped[1] limit 1;
  else
    select (a->>'index')::integer into chosen from jsonb_array_elements(known) a
      where exists(select 1 from jsonb_array_elements(known) b where a->>'value'=b->>'value' and a->>'index'<>b->>'index')
      order by random() limit 1;
  end if;
  if chosen is null then
    select i into chosen from generate_series(0,cardinality(m.deck)-1) i
      where not i=any(m.matched) and not (m.reveal_until is null and i=any(m.flipped))
      order by exists(select 1 from jsonb_array_elements(known) k where (k->>'index')::integer=i),random() limit 1;
  end if;
  if chosen is null then raise exception 'The computer could not choose an available card.'; end if;
  return chosen;
end $$;
create function private.computer_dots_edge(d private.dots_games,p_difficulty text) returns integer
language plpgsql set search_path='' as $$
declare e integer; b integer; sides integer; points integer; risk integer; rank integer; best integer:=-100000; candidates integer[]:='{}';
begin
  for e in 0..cardinality(d.edges)-1 loop
    if d.edges[e+1] is not null then continue; end if;
    points:=0; risk:=0;
    foreach b in array private.dots_adjacent_boxes(d.dots,e) loop
      select count(*) into sides from unnest(private.dots_box_edges(d.dots,b)) edge where d.edges[edge+1] is not null;
      if sides=3 then points:=points+1; elsif sides=2 then risk:=risk+1; end if;
    end loop;
    rank:=case p_difficulty when 'easy' then 0 when 'medium' then points else points*100-risk*10 end;
    if rank>best then best:=rank; candidates:=array[e];
    elsif rank=best then candidates:=array_append(candidates,e); end if;
  end loop;
  if cardinality(candidates)=0 then raise exception 'The computer could not choose an available line.'; end if;
  return candidates[floor(random()*cardinality(candidates))::integer+1];
end $$;

create function private.solo_board_state(g private.solo_boards) returns jsonb
language plpgsql set search_path='' as $$
declare projection jsonb; m private.memory_games;
begin
  if g.kind='memory' then
    m:=jsonb_populate_record(null::private.memory_games,g.board);
    projection:=(to_jsonb(m)-'room_id'-'deck'-'flipped')||jsonb_build_object('theme',g.theme,
      'cards',(select jsonb_agg(case when m.finished or i=any(m.matched) or
        (i=any(m.flipped) and (m.reveal_until is null or m.reveal_until>clock_timestamp())) then m.deck[i+1] else null end order by i)
        from generate_series(0,cardinality(m.deck)-1) i));
  else projection:=g.board-'room_id';
  end if;
  return jsonb_build_object('id',g.id,'kind',g.kind,'difficulty',g.difficulty,'status',g.status,'version',g.version,
    'board',projection,'next_action_at',g.next_action_at,'server_now',clock_timestamp(),'computer_id',private.computer_id());
end $$;
create function private.save_solo_board(g private.solo_boards) returns private.solo_boards
language plpgsql set search_path='' as $$
declare next_time timestamptz;
begin
  if (g.board->>'finished')::boolean then g.status:='finished'; end if;
  if g.status='playing' and (g.board->>'turn_user')::uuid=private.computer_id() then
    next_time:=clock_timestamp()+interval '700 milliseconds';
    if g.kind='memory' and g.board->>'reveal_until' is not null then
      next_time:=greatest(next_time,(g.board->>'reveal_until')::timestamptz);
    elsif g.kind='dots' and g.board->>'roll_until' is not null then
      next_time:=greatest(next_time,(g.board->>'roll_until')::timestamptz);
    end if;
  end if;
  update private.solo_boards set board=g.board,knowledge=g.knowledge,status=g.status,next_action_at=next_time,
    version=version+1 where id=g.id returning * into g;
  return g;
end $$;

create function public.create_solo_board(p_kind text,p_difficulty text,p_tiles integer,p_theme text,p_dots integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; m private.memory_games; d private.dots_games; sid uuid:=gen_random_uuid(); scores jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  if p_kind is null or p_kind not in ('memory','dots') or p_difficulty is null or p_difficulty not in ('easy','medium','hard')
    or p_tiles is null or p_tiles not in (12,16,24) or p_theme is null or p_theme not in ('paintings','florals','animals','patterns')
    or p_dots is null or p_dots not in (10,12,15) then raise exception 'Choose valid solo game and difficulty settings.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':solo-board',0));
  update private.solo_boards set status='abandoned',next_action_at=null,version=version+1 where user_id=auth.uid() and status='playing';
  scores:=jsonb_build_object(auth.uid()::text,0,private.computer_id()::text,0);
  if p_kind='memory' then
    m.session_id:=sid; m.deck:=array(select n from generate_series(0,p_tiles/2-1) n cross join generate_series(1,2) copies order by random());
    m.matched:='{}'; m.flipped:='{}'; m.turn_user:=auth.uid(); m.turn_number:=1; m.moves:=0; m.scores:=scores; m.finished:=false;
    g.board:=to_jsonb(m);
  else
    d.session_id:=sid; d.dots:=p_dots; d.edges:=array_fill(null::uuid,array[2*p_dots*(p_dots-1)]);
    d.boxes:=array_fill(null::uuid,array[(p_dots-1)*(p_dots-1)]); d.scores:=scores; d.turn_user:=auth.uid();
    d.turn_number:=1; d.moves:=0; d.roll_number:=0; d.remaining:=0; d.finished:=false;
    g.board:=to_jsonb(d);
  end if;
  insert into private.solo_boards(id,user_id,kind,difficulty,theme,board)
    values(sid,auth.uid(),p_kind,p_difficulty,p_theme,g.board) returning * into g;
  return private.solo_board_state(g);
end $$;

create function public.get_solo_board(p_game uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; m private.memory_games; d private.dots_games; chosen integer;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_boards where user_id=auth.uid() and (id=p_game or p_game is null and status='playing')
    order by started_at desc limit 1 for update;
  if not found then
    if p_game is null then return null; end if;
    raise exception 'No solo board was found for your player. Start a new game.';
  end if;
  if g.status='playing' and g.next_action_at<=clock_timestamp() then
    if g.kind='memory' then
      chosen:=private.computer_memory_card(g);
      m:=jsonb_populate_record(null::private.memory_games,g.board);
      m:=private.apply_memory_flip(m,chosen,private.computer_id(),g.user_id);
      g.board:=to_jsonb(m); g.knowledge:=private.remember_card(g,chosen);
    else
      d:=jsonb_populate_record(null::private.dots_games,g.board);
      if d.remaining=0 then d:=private.apply_dots_roll(d);
      else d:=private.apply_dots_line(d,private.computer_dots_edge(d,g.difficulty),private.computer_id(),g.user_id); end if;
      g.board:=to_jsonb(d);
    end if;
    g:=private.save_solo_board(g);
  end if;
  return private.solo_board_state(g);
end $$;
create function public.play_solo_board(p_game uuid,p_version integer,p_action text,p_index integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; m private.memory_games; d private.dots_games;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_boards where id=p_game and user_id=auth.uid() for update;
  if not found then raise exception 'No solo board was found for your player. Start a new game.'; end if;
  if p_version is distinct from g.version then raise exception 'The board changed. Wait for it to sync and try again.'; end if;
  if g.status<>'playing' then raise exception 'This solo game is complete or was replaced. Start a new game.'; end if;
  if (g.board->>'turn_user')::uuid<>auth.uid() then raise exception 'It is the computer''s turn.'; end if;
  if g.kind='memory' and p_action='flip' then
    m:=jsonb_populate_record(null::private.memory_games,g.board);
    m:=private.apply_memory_flip(m,p_index,auth.uid(),private.computer_id());
    g.board:=to_jsonb(m); g.knowledge:=private.remember_card(g,p_index);
  elsif g.kind='dots' and p_action in ('roll','line') then
    d:=jsonb_populate_record(null::private.dots_games,g.board);
    if p_action='roll' then d:=private.apply_dots_roll(d);
    else d:=private.apply_dots_line(d,p_index,auth.uid(),private.computer_id()); end if;
    g.board:=to_jsonb(d);
  else raise exception 'Choose a valid action for this solo game.';
  end if;
  g:=private.save_solo_board(g);
  return private.solo_board_state(g);
end $$;

revoke all on function private.apply_memory_flip(private.memory_games,integer,uuid,uuid),
  private.dots_box_edges(integer,integer),private.dots_adjacent_boxes(integer,integer),
  private.apply_dots_roll(private.dots_games),private.apply_dots_line(private.dots_games,integer,uuid,uuid),
  private.computer_id(),private.remember_card(private.solo_boards,integer),private.computer_memory_card(private.solo_boards),
  private.computer_dots_edge(private.dots_games,text),private.solo_board_state(private.solo_boards),
  private.save_solo_board(private.solo_boards) from public,anon,authenticated;
revoke all on function public.create_solo_board(text,text,integer,text,integer),public.get_solo_board(uuid),
  public.play_solo_board(uuid,integer,text,integer) from public,anon;
grant execute on function public.create_solo_board(text,text,integer,text,integer),public.get_solo_board(uuid),
  public.play_solo_board(uuid,integer,text,integer) to authenticated;
notify pgrst,'reload schema';
