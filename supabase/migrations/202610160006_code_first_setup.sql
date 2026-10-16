create or replace function public.create_room(p_name text,p_mode text,p_stake text,p_wager text,p_variant text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid; candidate text; retries integer:=0;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 20 then raise exception 'Display name must be 1–20 characters.'; end if;
  if p_mode is null or p_mode not in ('number','word') then raise exception 'Choose Number Lock or Word Lock.'; end if;
  if p_stake is null or p_stake not in ('low','high') then raise exception 'Choose low or high stakes.'; end if;
  if p_variant is null or p_variant not in ('race','turns') then raise exception 'Choose a race or turn-by-turn game.'; end if;
  if p_wager is null or length(btrim(p_wager))>120 then raise exception 'A bet must be at most 120 characters.'; end if;
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
    then raise exception 'Lock your secret before agreeing to the bets.'; end if;
  update public.players set ready=p_ready,last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;
