alter table private.memory_games add column owners jsonb not null default '{}';

create function private.reset_memory_owners() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.session_id is distinct from old.session_id then new.owners:='{}'; end if;
  return new;
end $$;
create trigger reset_memory_owners before update of session_id on private.memory_games
  for each row execute function private.reset_memory_owners();

alter function private.apply_memory_flip(private.memory_games,integer,uuid,uuid) rename to memory_flip_before_colours;
create function private.apply_memory_flip(m private.memory_games,p_index integer,p_actor uuid,p_other uuid) returns private.memory_games
language plpgsql set search_path='' as $$
begin
  m:=private.memory_flip_before_colours(m,p_index,p_actor,p_other);
  m.owners:=jsonb_set(coalesce(m.owners,'{}'),array[p_index::text],to_jsonb(p_actor::text));
  return m;
end $$;

create function private.visible_memory_owners(m private.memory_games) returns jsonb
language sql set search_path='' as $$
  select coalesce(jsonb_object_agg(i::text,coalesce(m.owners->>i::text,
    case when i=any(m.flipped) then case when m.reveal_until is null then m.turn_user::text
      else (select k from jsonb_object_keys(m.scores) k where k<>m.turn_user::text limit 1) end end))
    filter(where m.owners->>i::text is not null or i=any(m.flipped)),'{}')
  from generate_series(0,cardinality(m.deck)-1) i
  where i=any(m.matched) or (i=any(m.flipped) and (m.reveal_until is null or m.reveal_until>clock_timestamp()))
$$;

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
    turn_user=m.turn_user,turn_number=m.turn_number,moves=m.moves,scores=m.scores,finished=m.finished,owners=m.owners where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

alter function public.get_game_state(uuid) rename to get_before_memory_colours;
revoke all on function public.get_before_memory_colours(uuid) from public,anon,authenticated;
create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; m private.memory_games;
begin
  state:=public.get_before_memory_colours(p_room);
  if state ? 'memory' then
    select * into strict m from private.memory_games where room_id=p_room;
    state:=jsonb_set(state,'{memory,owners}',private.visible_memory_owners(m));
  end if;
  return state;
end $$;

alter function private.solo_board_state(private.solo_boards) rename to solo_state_before_memory_colours;
create function private.solo_board_state(g private.solo_boards) returns jsonb
language plpgsql set search_path='' as $$
declare state jsonb; m private.memory_games;
begin
  state:=private.solo_state_before_memory_colours(g);
  if g.kind='memory' then
    m:=jsonb_populate_record(null::private.memory_games,g.board);
    state:=jsonb_set(state,'{board,owners}',private.visible_memory_owners(m));
  end if;
  return state;
end $$;

revoke all on function private.reset_memory_owners(),private.memory_flip_before_colours(private.memory_games,integer,uuid,uuid),
  private.apply_memory_flip(private.memory_games,integer,uuid,uuid),private.visible_memory_owners(private.memory_games),
  private.solo_state_before_memory_colours(private.solo_boards),private.solo_board_state(private.solo_boards) from public,anon,authenticated;
revoke all on function public.get_game_state(uuid) from public,anon;
grant execute on function public.get_game_state(uuid) to authenticated;
notify pgrst,'reload schema';
