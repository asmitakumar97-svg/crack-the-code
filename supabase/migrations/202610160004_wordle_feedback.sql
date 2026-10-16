-- Keep active matches and scores; convert saved clues to positional feedback.
lock table public.rooms in exclusive mode;

create or replace function private.feedback(p_secret text,p_guess text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  marks text[]:=array_fill('miss'::text,array[length(p_guess)]);
  remaining text[]:=string_to_array(p_secret,null);
  i integer;
  idx integer;
begin
  if length(p_secret)<>length(p_guess) then raise exception 'Code lengths must match.'; end if;
  -- Reserve exact matches before assigning remaining copies left to right.
  for i in 1..length(p_guess) loop
    if substr(p_guess,i,1)=substr(p_secret,i,1) then
      marks[i]:='hit';
      remaining[i]:=null;
    end if;
  end loop;
  for i in 1..length(p_guess) loop
    if marks[i]='hit' then continue; end if;
    idx:=array_position(remaining,substr(p_guess,i,1));
    if idx is not null then marks[i]:='present'; remaining[idx]:=null; end if;
  end loop;
  return marks;
end $$;

create or replace function public.submit_hints(p_room uuid,p_guess_id uuid,p_marks text[],p_match integer,p_round integer) returns void
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
    raise exception 'Those hints do not match your secret. Mark correct positions green first, then remaining matching copies yellow from left to right.';
  end if;
  insert into public.guesses(room_id,user_id,match_number,round_number,attempt,guess,feedback,elapsed_ms)
    values(p_room,pending.user_id,r.match_number,r.round_number,pending.attempt,pending.guess,expected,pending.elapsed_ms);
  delete from private.pending_guesses where id=pending.id;
  select user_id into next_player from public.players where room_id=p_room and user_id=auth.uid() and attempts<8;
  if next_player is null then select user_id into next_player from public.players where room_id=p_room and user_id=pending.user_id and attempts<8; end if;
  if next_player is null then perform private.finish_round(p_room,'Both out of guesses');
  else update public.rooms set turn_user_id=next_player,version=version+1 where id=p_room; end if;
end $$;

update public.guesses g set feedback=private.feedback(s.code,g.guess)
from public.secrets s
where s.room_id=g.room_id and s.user_id<>g.user_id
  and s.match_number=g.match_number and s.round_number=g.round_number;

update public.rooms set version=version+1;
