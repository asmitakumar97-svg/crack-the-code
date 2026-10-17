create table private.push_settings (
  singleton boolean primary key default true check(singleton),
  public_key text not null,
  dispatch_url text not null check(dispatch_url ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/turn-push$'),
  dispatch_token text not null check(length(dispatch_token)>=32)
);
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  updated_at timestamptz not null default now()
);
create index push_subscriptions_owner on private.push_subscriptions(user_id);
create table private.turn_push_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  action jsonb
);
create table private.turn_push_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null unique,
  kind text not null check(kind in ('guess','clues')),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','processing','retry','sent','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  delivered uuid[] not null default '{}',
  last_error text
);
create index pending_turn_push_events on private.turn_push_events(available_at) where status in ('pending','retry','processing');
alter table private.push_settings enable row level security;
alter table private.push_subscriptions enable row level security;
alter table private.turn_push_state enable row level security;
alter table private.turn_push_events enable row level security;
revoke all on private.push_settings,private.push_subscriptions,private.turn_push_state,private.turn_push_events from public,anon,authenticated;

create function private.valid_push_endpoint(value text) returns boolean
language sql immutable set search_path='' as $$
  select length(value) between 20 and 2048 and value !~ '[[:space:]]' and
    value ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$'
$$;
revoke all on function private.valid_push_endpoint(text) from public,anon,authenticated;

create function public.get_push_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in before enabling notifications.'; end if;
  return (select jsonb_build_object('publicKey',public_key) from private.push_settings where singleton);
end $$;

create function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text) returns void
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Sign in before enabling notifications.'; end if;
  if not exists(select 1 from private.push_settings) then raise exception 'Phone push is not configured on this server yet.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('turn-push.'||auth.uid()::text,0));
  if p_endpoint is null or not private.valid_push_endpoint(p_endpoint)
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}=?$'
    or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' then
    raise exception 'This browser returned an unsupported push subscription.';
  end if;
  if (select count(*) from private.push_subscriptions where user_id=auth.uid() and endpoint<>p_endpoint)>=10 then
    raise exception 'Ten devices already have notifications enabled. Disable one before adding another.';
  end if;
  insert into private.push_subscriptions(user_id,endpoint,p256dh,auth)
    values(auth.uid(),p_endpoint,p_p256dh,p_auth)
  on conflict(endpoint) do update set user_id=excluded.user_id,updated_at=now()
    where private.push_subscriptions.p256dh=excluded.p256dh and private.push_subscriptions.auth=excluded.auth;
  get diagnostics affected=row_count;
  if affected=0 then raise exception 'This device subscription changed. Remove its site notification permission and enable again.'; end if;
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in before changing notifications.'; end if;
  delete from private.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
end $$;

create function public.get_push_subscription_status(p_endpoint text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in before checking notifications.'; end if;
  return jsonb_build_object('enabled',exists(select 1 from private.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid()),
    'lastError',(select case when status='failed' then last_error else null end from private.turn_push_events where user_id=auth.uid() order by created_at desc limit 1));
end $$;

create function private.current_turn_action(p_room uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare r public.rooms; p private.pending_guesses; recipient uuid; kind text; key text;
begin
  select * into r from public.rooms where id=p_room;
  if not found or r.variant<>'turns' or r.status<>'playing' then return null; end if;
  select * into p from private.pending_guesses where room_id=p_room and match_number=r.match_number and round_number=r.round_number;
  if found then
    select user_id into recipient from public.players where room_id=p_room and user_id<>p.user_id;
    kind:='clues'; key:=p.id::text;
  else
    recipient:=r.turn_user_id; kind:='guess';
    select string_agg(user_id::text||':'||attempts::text,',' order by user_id) into key from public.players where room_id=p_room;
  end if;
  if recipient is null then return null; end if;
  return jsonb_build_object('user',recipient,'kind',kind,'key',r.id::text||'.'||r.match_number||'.'||r.round_number||'.'||kind||'.'||key,'roomCode',r.code);
end $$;
revoke all on function private.current_turn_action(uuid) from public,anon,authenticated;

create function private.request_turn_push(p_event uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare settings private.push_settings;
begin
  select * into settings from private.push_settings where singleton;
  if not found then return; end if;
  begin
    execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
      using settings.dispatch_url,jsonb_build_object('Content-Type','application/json','x-turn-push-token',settings.dispatch_token),jsonb_build_object('eventId',p_event);
  exception when undefined_function or invalid_schema_name then
    raise warning 'Turn push dispatch unavailable: configure pg_net. Queued event %',p_event;
  end;
end $$;
revoke all on function private.request_turn_push(uuid) from public,anon,authenticated;

create function private.queue_turn_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_action jsonb; previous_action jsonb; event_id uuid;
begin
  current_action:=private.current_turn_action(new.id);
  select action into previous_action from private.turn_push_state where room_id=new.id;
  if current_action is not distinct from previous_action then return new; end if;
  insert into private.turn_push_state(room_id,action) values(new.id,current_action)
    on conflict(room_id) do update set action=excluded.action;
  if current_action is null
    or (previous_action->>'kind'='clues' and current_action->>'kind'='guess' and previous_action->>'user'=current_action->>'user')
    or not exists(select 1 from private.push_subscriptions where user_id=(current_action->>'user')::uuid) then return new; end if;
  insert into private.turn_push_events(room_id,user_id,action_key,kind)
    values(new.id,(current_action->>'user')::uuid,current_action->>'key',current_action->>'kind')
    on conflict(action_key) do nothing returning id into event_id;
  if event_id is not null then perform private.request_turn_push(event_id); end if;
  return new;
end $$;
revoke all on function private.queue_turn_push() from public,anon,authenticated;
create trigger queue_turn_push after update on public.rooms for each row execute function private.queue_turn_push();

create function public.claim_turn_push(p_event uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.turn_push_events; action jsonb; subscriptions jsonb;
begin
  select * into e from private.turn_push_events where (p_event is null or id=p_event)
    and status in ('pending','retry','processing') and available_at<=clock_timestamp()
    order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  action:=private.current_turn_action(e.room_id);
  if e.created_at<clock_timestamp()-interval '5 minutes' or action->>'key' is distinct from e.action_key then
    update private.turn_push_events set status='skipped' where id=e.id;
    return jsonb_build_object('skipped',true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]'::jsonb)
    into subscriptions from private.push_subscriptions s where user_id=e.user_id and not(s.id=any(e.delivered));
  if jsonb_array_length(subscriptions)=0 then
    update private.turn_push_events set status='sent' where id=e.id;
    return jsonb_build_object('skipped',true);
  end if;
  if e.attempts>=3 then
    update private.turn_push_events set status='failed',last_error='Notification delivery did not finish after three attempts.' where id=e.id;
    return jsonb_build_object('skipped',true);
  end if;
  update private.turn_push_events set status='processing',attempts=attempts+1,available_at=clock_timestamp()+interval '60 seconds' where id=e.id;
  return jsonb_build_object('eventId',e.id,'roomId',e.room_id,'roomCode',action->>'roomCode','kind',e.kind,'subscriptions',subscriptions);
end $$;

create function public.finish_turn_push(p_event uuid,p_results jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare e private.turn_push_events; item jsonb; failed boolean:=false; status_code integer; subscription_id uuid;
begin
  select * into e from private.turn_push_events where id=p_event for update;
  if not found or e.status<>'processing' then raise exception 'Notification job is no longer claimed.'; end if;
  if jsonb_typeof(p_results)<>'array' then raise exception 'Notification results must be an array.'; end if;
  for item in select value from jsonb_array_elements(p_results) loop
    subscription_id:=(item->>'id')::uuid; status_code:=(item->>'status')::integer;
    if status_code in (404,410) then
      delete from private.push_subscriptions where id=subscription_id and user_id=e.user_id;
    elsif status_code between 200 and 299 then
      update private.turn_push_events set delivered=array_append(delivered,subscription_id) where id=e.id and not(subscription_id=any(delivered));
    else failed:=true;
    end if;
  end loop;
  update private.turn_push_events set status=case when failed and attempts<3 then 'retry' when failed then 'failed' else 'sent' end,
    available_at=clock_timestamp()+interval '30 seconds',
    last_error=case when failed then 'The push service could not deliver a turn notification. Check device permissions or try enabling again.' else null end where id=e.id;
end $$;

revoke all on function public.get_push_settings(),public.save_push_subscription(text,text,text),public.remove_push_subscription(text),public.get_push_subscription_status(text),
  public.claim_turn_push(uuid),public.finish_turn_push(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.get_push_settings(),public.save_push_subscription(text,text,text),public.remove_push_subscription(text),public.get_push_subscription_status(text) to authenticated;
grant execute on function public.claim_turn_push(uuid),public.finish_turn_push(uuid,jsonb) to service_role;
