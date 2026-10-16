create function private.google_avatar(p_user uuid) returns text
language sql stable set search_path = '' as $$
  select case when u.is_anonymous is not true and
    (u.raw_app_meta_data->>'provider'='google' or (jsonb_typeof(u.raw_app_meta_data->'providers')='array' and u.raw_app_meta_data->'providers' ? 'google'))
    then coalesce(
      case when u.raw_user_meta_data->>'avatar_url' ~ '^https://([a-zA-Z0-9-]+\.)*googleusercontent\.com/[^[:space:]]+$' then u.raw_user_meta_data->>'avatar_url' end,
      case when u.raw_user_meta_data->>'picture' ~ '^https://([a-zA-Z0-9-]+\.)*googleusercontent\.com/[^[:space:]]+$' then u.raw_user_meta_data->>'picture' end)
    else null end
  from auth.users u where u.id=p_user
$$;
revoke all on function private.google_avatar(uuid) from public,anon,authenticated;

create or replace function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null or not public.is_room_member(p_room) then raise exception 'Room not found or you are not a member.'; end if;
  select * into r from public.rooms where id=p_room;
  return jsonb_build_object(
    'room',to_jsonb(r),
    'players',(select jsonb_agg((to_jsonb(p)-'room_id')||jsonb_build_object('avatar_url',private.google_avatar(p.user_id)) order by seat) from public.players p where room_id=p_room),
    'guesses',coalesce((select jsonb_agg(to_jsonb(g) order by attempt) from public.guesses g where room_id=p_room and user_id=auth.uid()
      and match_number=r.match_number and round_number=r.round_number),'[]'::jsonb),
    'pending_guess',(select jsonb_build_object('id',id,'user_id',user_id,'guess',guess,'attempt',attempt)
      from private.pending_guesses where room_id=p_room and match_number=r.match_number and round_number=r.round_number),
    'own_secret',(select code from public.secrets where room_id=p_room and user_id=auth.uid() and match_number=r.match_number and round_number=r.round_number),
    'results',coalesce((select jsonb_agg(to_jsonb(rr) order by round_number) from public.round_results rr where room_id=p_room and match_number=r.match_number),'[]'::jsonb),
    'server_now',now()
  );
end $$;
revoke all on function public.get_game_state(uuid) from public,anon;
grant execute on function public.get_game_state(uuid) to authenticated;
