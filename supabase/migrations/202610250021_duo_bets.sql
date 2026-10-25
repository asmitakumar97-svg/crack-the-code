alter table private.duo_choices add column wagers jsonb not null default '{}';
alter table public.bet_history add column game_kind text not null default 'code'
  check(game_kind in ('code','memory','dots','ring','bingo','cheat','hangman'));
alter table public.bet_history alter column mode drop not null;
alter table public.bet_history alter column variant drop not null;
alter table public.bet_history add constraint bet_history_game_settings_check check(
  (game_kind='code' and mode is not null and variant is not null) or
  (game_kind<>'code' and mode is null and variant is null));

create table private.duo_bets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  session_id uuid not null,
  game_kind text not null check(game_kind in ('memory','dots','ring','bingo','cheat','hangman')),
  wagers jsonb not null
);
alter table private.duo_bets enable row level security;
revoke all on private.duo_bets from public,anon,authenticated;

create function private.duo_bet_board(p_room uuid,p_kind text) returns jsonb
language plpgsql set search_path='' as $$
declare board jsonb;
begin
  case p_kind
    when 'memory' then select to_jsonb(m) into strict board from private.memory_games m where room_id=p_room;
    when 'dots' then select to_jsonb(d) into strict board from private.dots_games d where room_id=p_room;
    when 'ring' then select g.board into strict board from private.ring_games g where room_id=p_room;
    when 'bingo','cheat','hangman' then select g.board into strict board from private.party_games g where room_id=p_room;
    else raise exception 'This game does not use shared board bets.';
  end case;
  return board;
end $$;

create function public.set_duo_wager(p_room uuid,p_revision integer,p_wager text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  if not r.duo_lobby then raise exception 'Bets are locked once the game starts.'; end if;
  select * into strict c from private.duo_choices where room_id=p_room;
  if c.selected='code' then raise exception 'Choose your code first, then review bets in Crack the Code.'; end if;
  if p_revision is distinct from c.revision then raise exception 'Settings or bets changed. Review them before saving.'; end if;
  if p_wager is null or length(btrim(p_wager))>120 then raise exception 'Keep your bet to 120 characters or leave it empty.'; end if;
  if coalesce(c.wagers->>auth.uid()::text,'')=btrim(p_wager) then return; end if;
  update private.duo_choices set wagers=jsonb_set(wagers,array[auth.uid()::text],to_jsonb(btrim(p_wager))),
    ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set version=version+1 where id=p_room;
end $$;

alter function public.confirm_duo_game(uuid,integer) rename to confirm_before_duo_bets;
revoke all on function public.confirm_before_duo_bets(uuid,integer) from public,anon,authenticated;
create function public.confirm_duo_game(p_room uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices; board jsonb;
begin
  perform public.confirm_before_duo_bets(p_room,p_revision);
  select * into strict r from public.rooms where id=p_room;
  if not r.duo_lobby and r.game_kind<>'code' then
    select * into strict c from private.duo_choices where room_id=p_room;
    board:=private.duo_bet_board(p_room,r.game_kind);
    insert into private.duo_bets(room_id,session_id,game_kind,wagers)
      values(p_room,(board->>'session_id')::uuid,r.game_kind,c.wagers)
      on conflict(room_id) do update set session_id=excluded.session_id,game_kind=excluded.game_kind,wagers=excluded.wagers;
    update public.rooms set match_number=match_number+1,version=version+1 where id=p_room;
  end if;
end $$;

alter function public.open_duo_lobby(uuid) rename to open_before_duo_bets;
revoke all on function public.open_before_duo_bets(uuid) from public,anon,authenticated;
create function public.open_duo_lobby(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  r:=private.lock_duo_room(p_room);
  perform public.open_before_duo_bets(p_room);
  if not r.duo_lobby then update private.duo_choices set wagers='{}' where room_id=p_room; end if;
end $$;

create function private.archive_duo_bet() returns trigger
language plpgsql security definer set search_path='' as $$
declare bet private.duo_bets; board jsonb; h public.players; g public.players;
  hs integer; gs integer; winner uuid;
begin
  if new.duo_lobby or new.game_kind='code' then return new; end if;
  select * into bet from private.duo_bets where room_id=new.id and game_kind=new.game_kind;
  if not found then return new; end if;
  board:=private.duo_bet_board(new.id,new.game_kind);
  if bet.session_id is distinct from (board->>'session_id')::uuid or not (board->>'finished')::boolean then return new; end if;
  select * into strict h from public.players where room_id=new.id and seat=1;
  select * into strict g from public.players where room_id=new.id and seat=2;
  if new.game_kind in ('memory','dots') then
    hs:=(board->'scores'->>h.user_id::text)::integer;
    gs:=(board->'scores'->>g.user_id::text)::integer;
    winner:=case when hs>gs then h.user_id when gs>hs then g.user_id end;
  else
    winner:=(board->>'winner_id')::uuid;
    if new.game_kind='bingo' then
      hs:=private.bingo_lines(board->'boards'->h.user_id::text,board->'called');
      gs:=private.bingo_lines(board->'boards'->g.user_id::text,board->'called');
    elsif new.game_kind='ring' then
      hs:=private.ring_progress(board->'boards'->h.user_id::text);
      gs:=private.ring_progress(board->'boards'->g.user_id::text);
    else
      hs:=case when winner=h.user_id then 1 else 0 end;
      gs:=case when winner=g.user_id then 1 else 0 end;
    end if;
  end if;
  insert into public.bet_history(room_id,match_number,host_id,guest_id,host_name,guest_name,
    host_wager,guest_wager,host_score,guest_score,winner_id,mode,variant,game_kind,completed_at)
    values(new.id,new.match_number,h.user_id,g.user_id,h.name,g.name,
      coalesce(bet.wagers->>h.user_id::text,''),coalesce(bet.wagers->>g.user_id::text,''),
      hs,gs,winner,null,null,new.game_kind,coalesce((board->>'finished_at')::timestamptz,clock_timestamp()))
    on conflict(room_id,match_number) do nothing;
  return new;
end $$;
create trigger archive_duo_bet after update of version on public.rooms
  for each row execute function private.archive_duo_bet();

alter function public.get_game_state(uuid) rename to get_before_duo_bets;
revoke all on function public.get_before_duo_bets(uuid) from public,anon,authenticated;
create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; bet private.duo_bets; board jsonb;
begin
  state:=public.get_before_duo_bets(p_room);
  if not (state->'room'->>'duo_lobby')::boolean and state->'room'->>'game_kind'<>'code' then
    select * into bet from private.duo_bets where room_id=p_room;
    board:=coalesce(state->'memory',state->'dots',state->'ring',state->'party');
    if found and bet.session_id=(board->>'session_id')::uuid then
      state:=state||jsonb_build_object('duo_bet',jsonb_build_object('session_id',bet.session_id,'wagers',bet.wagers));
    end if;
  end if;
  return state;
end $$;

create or replace function public.get_bet_history(p_before timestamptz default null,p_before_id uuid default null,
  p_search text default '',p_result text default 'won') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view your bet history.'; end if;
  if p_search is null or length(p_search)>80 then raise exception 'Search must be at most 80 characters.'; end if;
  if p_result is null or p_result not in ('won','lost','all') then raise exception 'Choose won, lost or all bets.'; end if;
  if (p_before is null) <> (p_before_id is null) then raise exception 'The history cursor is incomplete. Refresh the history.'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.completed_at desc,page.id desc),'[]') into result
  from (
    select h.id,h.completed_at,h.mode,h.variant,h.game_kind,
      case when h.host_id=auth.uid() then h.guest_id else h.host_id end as opponent_id,
      case when h.host_id=auth.uid() then h.guest_name else h.host_name end as opponent_name,
      coalesce(h.winner_id=auth.uid(),false) as won,h.winner_id is null as draw,
      case when h.winner_id=h.host_id then h.host_wager when h.winner_id=h.guest_id then h.guest_wager else '' end as bet,
      case when h.host_id=auth.uid() then h.host_score else h.guest_score end as your_score,
      case when h.host_id=auth.uid() then h.guest_score else h.host_score end as opponent_score
    from public.bet_history h
    where auth.uid() in (h.host_id,h.guest_id)
      and (p_result='all' or p_result='won' and h.winner_id=auth.uid()
        or p_result='lost' and h.winner_id is not null and h.winner_id<>auth.uid())
      and (case when h.host_id=auth.uid() then h.guest_name else h.host_name end) ilike '%'||p_search||'%'
      and (p_before is null or (h.completed_at,h.id)<(p_before,p_before_id))
    order by h.completed_at desc,h.id desc limit 26
  ) page;
  return result;
end $$;

revoke all on function private.duo_bet_board(uuid,text),private.archive_duo_bet() from public,anon,authenticated;
revoke all on function public.set_duo_wager(uuid,integer,text),public.confirm_duo_game(uuid,integer),
  public.open_duo_lobby(uuid),public.get_game_state(uuid) from public,anon;
grant execute on function public.set_duo_wager(uuid,integer,text),public.confirm_duo_game(uuid,integer),
  public.open_duo_lobby(uuid),public.get_game_state(uuid) to authenticated;
notify pgrst,'reload schema';
