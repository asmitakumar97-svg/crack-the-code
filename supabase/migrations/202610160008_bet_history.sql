create table public.bet_history (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  match_number integer not null check (match_number > 0),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null,
  guest_name text not null,
  host_wager text not null,
  guest_wager text not null,
  host_score integer not null check (host_score >= 0),
  guest_score integer not null check (guest_score >= 0),
  winner_id uuid,
  mode text not null check (mode in ('number','word')),
  variant text not null check (variant in ('race','turns')),
  completed_at timestamptz not null default clock_timestamp(),
  unique (room_id,match_number),
  check (host_id <> guest_id),
  check (winner_id is null or winner_id in (host_id,guest_id))
);
alter table public.bet_history enable row level security;
revoke all on public.bet_history from public,anon,authenticated;
grant select on public.bet_history to authenticated;
create policy participants_read_bet_history on public.bet_history for select to authenticated
  using (auth.uid() in (host_id,guest_id));
create index bet_history_host on public.bet_history(host_id,completed_at desc,id desc);
create index bet_history_guest on public.bet_history(guest_id,completed_at desc,id desc);

create function private.archive_match(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bet_history(room_id,match_number,host_id,guest_id,host_name,guest_name,
    host_wager,guest_wager,host_score,guest_score,winner_id,mode,variant,completed_at)
  select r.id,r.match_number,h.user_id,g.user_id,h.name,g.name,h.wager,g.wager,h.score,g.score,
    case when h.score>g.score then h.user_id when g.score>h.score then g.user_id else null end,
    r.mode,r.variant,coalesce(greatest(h.finished_at,g.finished_at),clock_timestamp())
  from public.rooms r
  join public.players h on h.room_id=r.id and h.seat=1
  join public.players g on g.room_id=r.id and g.seat=2
  where r.id=p_room and r.status='match_over'
  on conflict (room_id,match_number) do nothing;
end $$;
revoke all on function private.archive_match(uuid) from public,anon,authenticated;

create function private.archive_completed_match() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.archive_match(new.id);
  return new;
end $$;
revoke all on function private.archive_completed_match() from public,anon,authenticated;
create trigger archive_completed_match after update of status on public.rooms
  for each row when (new.status='match_over' and old.status<>'match_over')
  execute function private.archive_completed_match();

do $$
declare rid uuid;
begin
  for rid in select id from public.rooms where status='match_over' loop
    perform private.archive_match(rid);
  end loop;
end $$;

create function public.get_bet_history(p_before timestamptz default null,p_before_id uuid default null,
  p_search text default '',p_result text default 'won') returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view your bet history.'; end if;
  if p_search is null or length(p_search)>80 then raise exception 'Search must be at most 80 characters.'; end if;
  if p_result is null or p_result not in ('won','lost','all') then raise exception 'Choose won, lost or all bets.'; end if;
  if (p_before is null) <> (p_before_id is null) then raise exception 'The history cursor is incomplete. Refresh the history.'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.completed_at desc,page.id desc),'[]'::jsonb) into result
  from (
    select h.id,h.completed_at,h.mode,h.variant,
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
revoke all on function public.get_bet_history(timestamptz,uuid,text,text) from public,anon;
grant execute on function public.get_bet_history(timestamptz,uuid,text,text) to authenticated;
