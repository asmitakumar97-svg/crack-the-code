-- All gameplay writes pass through transactional RPCs; no client has table write access.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  host_id uuid not null references auth.users(id),
  mode text not null check (mode in ('number','word','symbol')),
  status text not null default 'lobby' check (status in ('lobby','setting','playing','round_over','match_over')),
  round_number integer not null default 0 check (round_number between 0 and 3),
  match_number integer not null default 1,
  version integer not null default 1,
  started_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 20),
  seat integer not null check (seat in (1,2)),
  score integer not null default 0,
  ready boolean not null default false,
  attempts integer not null default 0 check (attempts between 0 and 8),
  solved boolean not null default false,
  finished_at timestamptz,
  next_ready boolean not null default false,
  last_seen timestamptz not null default now(),
  secret_ready boolean not null default false,
  primary key (room_id,user_id),
  unique(room_id,seat)
);
create index players_user_idx on public.players(user_id);
create index rooms_host_created_idx on public.rooms(host_id,created_at);
create table public.secrets (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  match_number integer not null,
  round_number integer not null,
  code text not null,
  primary key (room_id,user_id,match_number,round_number)
);
create table public.guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  match_number integer not null,
  round_number integer not null,
  attempt integer not null check (attempt between 1 and 8),
  guess text not null,
  feedback text[] not null,
  elapsed_ms bigint not null,
  unique(room_id,user_id,match_number,round_number,attempt)
);
create table public.round_results (
  room_id uuid not null references public.rooms(id) on delete cascade,
  match_number integer not null,
  round_number integer not null,
  winner_id uuid,
  reason text not null,
  reveals jsonb not null,
  stats jsonb not null,
  primary key(room_id,match_number,round_number)
);
create table public.word_bank (
  word text primary key check (word ~ '^[A-Z]{5}$')
);
insert into public.word_bank(word)
select unnest(string_to_array(
  'ABOUT ABOVE ACTOR ACUTE ADMIT ADOPT AFTER AGAIN AGENT AGREE AHEAD ALARM ALBUM ALERT ALIEN ALIVE ALLOW ALONE ALONG ALTER AMBER ANGEL ANGER ANGLE APPLE APPLY ARENA ARGUE ARISE ARMOR AROMA ARRAY ARROW ASIDE ASSET AUDIO AVOID AWAKE AWARD AWARE BADGE BAKER BASIC BEACH BEGAN BEGIN BELOW BENCH BERRY BIRTH BLACK BLADE BLAME BLANK BLAST BLAZE BLEND BLIND BLOCK BLOOM BOARD BOOST BOUND BRAIN BRAVE BREAD BREAK BRICK BRIDE BRIEF BRING BROAD BROKE BROWN BRUSH BUILD BUILT CABLE CANDY CARRY CATCH CAUSE CHAIN CHAIR CHALK CHARM CHART CHASE CHEAP CHECK CHEER CHESS CHEST CHIEF CHILD CHILL CHIME CHORD CLAIM CLASS CLEAN CLEAR CLERK CLICK CLIMB CLOCK CLOSE CLOUD COACH COAST COLOR COMET CORAL COUNT COURT COVER CRANE CRASH CREAM CREEK CRISP CROSS CROWD CROWN CURVE CYCLE DAILY DANCE DEALT DEATH DEBUG DELAY DEPTH DIGIT DIRTY DOUBT DOZEN DRAFT DRAIN DRAMA DRAWN DREAM DRESS DRIFT DRINK DRIVE DROVE EAGER EARLY EARTH EIGHT ELBOW ELDER ELECT ELITE EMPTY ENEMY ENJOY ENTER ENTRY EQUAL ERROR EVENT EVERY EXACT EXIST EXTRA FAINT FAITH FALSE FANCY FAULT FEAST FENCE FERRY FEWER FIELD FIFTH FIFTY FIGHT FINAL FIRST FIXED FLAME FLASH FLEET FLESH FLOAT FLOOR FLOUR FOCUS FORCE FORGE FORTH FORTY FOUND FRAME FRESH FRONT FROST FRUIT FULLY FUNNY GIANT GIVEN GLASS GLEAM GLOBE GLORY GLOVE GOING GRACE GRADE GRAIN GRAND GRANT GRAPE GRAPH GRASP GRASS GREAT GREEN GREET GRIEF GROUP GROVE GROWN GUARD GUESS GUEST GUIDE HABIT HAPPY HASTE HAVEN HEART HEAVY HEDGE HELLO HONEY HORSE HOTEL HOUSE HUMAN HUMOR IDEAL IMAGE INDEX INNER INPUT IRONY ISSUE IVORY JEWEL JOINT JUDGE JUICE KNIFE KNOCK KNOWN LABEL LARGE LASER LATER LAUGH LAYER LEARN LEASE LEAST LEAVE LEGAL LEMON LEVEL LIGHT LIMIT LINEN LINKS LIVER LOCAL LODGE LOGIC LOOSE LOVER LOWER LUCKY LUNAR LUNCH MAGIC MAJOR MAKER MANGO MAPLE MARCH MATCH MAYBE MAYOR MEDAL MEDIA MERCY MERIT METAL MIGHT MINOR MINUS MODEL MONEY MONTH MORAL MOTOR MOUNT MOUSE MOUTH MOVIE MUSIC NERVE NEVER NEWLY NIGHT NINJA NOBLE NOISE NORTH NOTED NOVEL NURSE OCEAN OFFER OFTEN OLIVE ONION OPERA ORBIT ORDER OTHER OUGHT OUTER OWNER OZONE PAINT PANEL PANIC PAPER PARTY PATCH PAUSE PEACE PEACH PEARL PENNY PHASE PHONE PHOTO PIANO PIECE PILOT PITCH PIXEL PLACE PLAIN PLANE PLANT PLATE PLAZA POINT POLAR POUND POWER PRESS PRICE PRIDE PRIME PRINT PRIOR PRIZE PROOF PROUD PROVE PULSE PUPIL QUEEN QUERY QUEST QUICK QUIET QUITE QUOTE RADIO RAISE RALLY RANGE RAPID RATIO REACH READY REALM REBEL REFER RELAX RELAY RENEW REPLY RESET RIDGE RIGHT RIGID RIVER ROBIN ROBOT ROCKY ROUGH ROUND ROUTE ROYAL RUGBY RURAL SADLY SAINT SALAD SALSA SANDY SAUCE SCALE SCARE SCENE SCENT SCORE SCOUT SCREW SENSE SERVE SEVEN SHADE SHAKE SHALL SHAPE SHARE SHARK SHARP SHEEP SHEER SHEET SHELF SHELL SHIFT SHINE SHIRT SHOCK SHORE SHORT SHOUT SHOWN SIGHT SIGMA SILLY SINCE SIXTH SIXTY SKILL SKULL SLATE SLEEP SLICE SLIDE SLOPE SMALL SMART SMELL SMILE SMOKE SNAKE SOLAR SOLID SOLVE SORRY SOUND SOUTH SPACE SPARE SPARK SPEAK SPEED SPELL SPEND SPICE SPINE SPOKE SPORT SPRAY STACK STAFF STAGE STAIR STAKE STALE STAND STARE START STATE STEAM STEEL STEEP STEER STICK STILL STOCK STONE STOOD STORE STORM STORY STRIP STUCK STUDY STYLE SUGAR SUNNY SUPER SURGE SWEET SWIFT SWING SWORD TABLE TAKEN TASTE TEACH TEETH TEMPO THANK THEME THERE THESE THICK THIEF THING THINK THIRD THOSE THREE THROW THUMB TIGER TIGHT TIMER TIRED TITLE TODAY TOKEN TOPIC TOTAL TOUCH TOUGH TOWER TRACE TRACK TRADE TRAIL TRAIN TRAIT TREAT TREND TRIAL TRIBE TRICK TRIED TRULY TRUST TRUTH TULIP TWICE TWIST UNDER UNION UNITY UNTIL UPPER UPSET URBAN USAGE USUAL VALID VALUE VAULT VIDEO VIRAL VISIT VITAL VIVID VOICE VOTER WAGON WASTE WATCH WATER WEAVE WEDGE WEIGH WEIRD WHALE WHEAT WHEEL WHERE WHICH WHILE WHITE WHOLE WHOSE WIDTH WITCH WOMAN WOMEN WORLD WORRY WORSE WORST WORTH WOULD WOUND WRITE WRONG WROTE YACHT YEARN YIELD YOUNG YOUTH ZEBRA', ' '));

create table private.rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);

create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.players where room_id=p_room and user_id=auth.uid());
$$;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.secrets enable row level security;
alter table public.guesses enable row level security;
alter table public.round_results enable row level security;
alter table public.word_bank enable row level security;
create policy members_read_rooms on public.rooms for select to authenticated using (public.is_room_member(id));
create policy members_read_players on public.players for select to authenticated using (public.is_room_member(room_id));
create policy owner_read_secrets on public.secrets for select to authenticated using (user_id=auth.uid() and public.is_room_member(room_id));
create policy owner_read_guesses on public.guesses for select to authenticated using (user_id=auth.uid() and public.is_room_member(room_id));
create policy members_read_results on public.round_results for select to authenticated using (public.is_room_member(room_id));
create policy read_word_bank on public.word_bank for select to authenticated using (true);
revoke all on public.rooms, public.players, public.secrets, public.guesses, public.round_results, public.word_bank from anon, authenticated;
grant select on public.rooms, public.players, public.secrets, public.guesses, public.round_results, public.word_bank to authenticated;

create function private.validate_code(p_mode text, p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_code is null or not (
    (p_mode='number' and p_code ~ '^[0-9]{4}$') or
    (p_mode='symbol' and p_code ~ '^[A-F]{4}$') or
    (p_mode='word' and exists(select 1 from public.word_bank where word=p_code))
  ) then raise exception 'Invalid code. Use four digits, four available symbols, or a five-letter word from the word bank.'; end if;
end $$;

create function private.feedback(p_secret text, p_guess text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  marks text[] := array_fill('absent'::text, array[length(p_secret)]);
  remaining text[] := array[]::text[];
  i integer;
  idx integer;
begin
  if length(p_secret) <> length(p_guess) then raise exception 'Code lengths must match.'; end if;
  for i in 1..length(p_secret) loop
    if substr(p_secret,i,1)=substr(p_guess,i,1) then marks[i]:='exact';
    else remaining:=array_append(remaining,substr(p_secret,i,1)); end if;
  end loop;
  for i in 1..length(p_guess) loop
    if marks[i]='exact' then continue; end if;
    idx:=array_position(remaining,substr(p_guess,i,1));
    if idx is not null then
      marks[i]:='present';
      remaining[idx]:=null;
    end if;
  end loop;
  return marks;
end $$;

create function private.lock_room(p_room uuid) returns public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  select * into r from public.rooms where id=p_room for update;
  if not found or not public.is_room_member(p_room) then raise exception 'Room not found or you are not a member.'; end if;
  return r;
end $$;

create function private.finish_round(p_room uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  winner uuid;
  best integer;
  tied integer;
  reveal_data jsonb;
  stat_data jsonb;
begin
  select * into r from public.rooms where id=p_room;
  if r.status<>'playing' then return; end if;
  select min(attempts) into best from public.players where room_id=p_room and solved;
  select count(*) into tied from public.players where room_id=p_room and solved and attempts=best;
  if tied=1 then select user_id into winner from public.players where room_id=p_room and solved and attempts=best; end if;
  select coalesce(jsonb_object_agg(user_id::text,code),'{}'::jsonb) into reveal_data
    from public.secrets where room_id=p_room and match_number=r.match_number and round_number=r.round_number;
  select jsonb_object_agg(user_id::text,jsonb_build_object('attempts',attempts,'solved',solved,
    'elapsed_ms',case when finished_at is not null and r.started_at is not null then greatest(0, floor(extract(epoch from (finished_at-r.started_at))*1000)) else null end))
    into stat_data from public.players where room_id=p_room;
  insert into public.round_results(room_id,match_number,round_number,winner_id,reason,reveals,stats)
    values(p_room,r.match_number,r.round_number,winner,p_reason,reveal_data,stat_data);
  update public.players set score=score+case when user_id=winner then 1 else 0 end, next_ready=false where room_id=p_room;
  update public.rooms set status=case when round_number=3 then 'match_over' else 'round_over' end,
    version=version+1 where id=p_room;
end $$;

create function public.create_room(p_name text, p_mode text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid; candidate text; retries integer:=0;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 20 then raise exception 'Display name must be 1–20 characters.'; end if;
  if p_mode is null or p_mode not in ('number','word','symbol') then raise exception 'Choose a valid game mode.'; end if;
  -- Serialize room creation by account so the quota cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.rooms where host_id=auth.uid() and created_at > now()-interval '1 hour') >= 10
    then raise exception 'Room creation limit reached. Try again in an hour.'; end if;
  loop
    candidate:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    begin
      insert into public.rooms(code,host_id,mode) values(candidate,auth.uid(),p_mode) returning id into rid;
      exit;
    exception when unique_violation then
      retries:=retries+1;
      if retries>=10 then raise exception 'Could not generate a room code. Try again.'; end if;
    end;
  end loop;
  insert into public.players(room_id,user_id,name,seat) values(rid,auth.uid(),btrim(p_name),1);
  return rid;
end $$;

-- Join failures return an error object rather than raising: the rate-limit write must commit.
create function public.join_room(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; attempts_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  insert into private.rate_limits values(auth.uid(),now(),1)
  on conflict(user_id) do update set
    attempts=case when private.rate_limits.window_start < now()-interval '1 minute' then 1 else private.rate_limits.attempts+1 end,
    window_start=case when private.rate_limits.window_start < now()-interval '1 minute' then now() else private.rate_limits.window_start end
  returning attempts into attempts_count;
  if attempts_count>30 then return jsonb_build_object('error','Too many join attempts. Wait a minute.'); end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 20 then return jsonb_build_object('error','Display name must be 1–20 characters.'); end if;
  select * into r from public.rooms where code=upper(btrim(p_code)) for update;
  if not found then return jsonb_build_object('error','Room not found. Check the six-character code.'); end if;
  if public.is_room_member(r.id) then return jsonb_build_object('room_id',r.id); end if;
  if r.status<>'lobby' or (select count(*) from public.players where room_id=r.id)>=2
    then return jsonb_build_object('error','This room is full or the match has started.'); end if;
  insert into public.players(room_id,user_id,name,seat) values(r.id,auth.uid(),btrim(p_name),2);
  update public.rooms set version=version+1 where id=r.id;
  return jsonb_build_object('room_id',r.id);
end $$;

create function public.set_ready(p_room uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if r.status<>'lobby' then raise exception 'The match has already started.'; end if;
  if p_ready is null then raise exception 'Readiness must be true or false.'; end if;
  update public.players set ready=p_ready,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.players where room_id=p_room and ready)=2 then
    update public.rooms set status='setting',round_number=1,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

create function public.set_secret(p_room uuid, p_code text, p_match integer, p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; normalized text:=upper(btrim(p_code));
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before setting your secret.'; end if;
  if r.status<>'setting' then raise exception 'Secret entry is not open.'; end if;
  perform private.validate_code(r.mode,normalized);
  if exists(select 1 from public.secrets where room_id=p_room and user_id=auth.uid() and match_number=r.match_number and round_number=r.round_number)
    then raise exception 'Your secret is already locked in.'; end if;
  insert into public.secrets values(p_room,auth.uid(),r.match_number,r.round_number,normalized);
  update public.players set secret_ready=true,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.players where room_id=p_room and secret_ready)=2 then
    update public.rooms set status='playing',started_at=now(),version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

create function public.submit_guess(p_room uuid, p_guess text, p_attempt integer, p_match integer, p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; me public.players; secret text; marks text[]; normalized text:=upper(btrim(p_guess)); won boolean;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before guessing again.'; end if;
  if r.status<>'playing' then raise exception 'This round is not accepting guesses.'; end if;
  select * into me from public.players where room_id=p_room and user_id=auth.uid();
  if me.solved or me.attempts>=8 then raise exception 'You have finished this round. Wait for your opponent.'; end if;
  if p_attempt is null or p_attempt<>me.attempts+1 then raise exception 'Attempt out of date. Refresh before guessing again.'; end if;
  perform private.validate_code(r.mode,normalized);
  select code into strict secret from public.secrets where room_id=p_room and user_id<>auth.uid()
    and match_number=r.match_number and round_number=r.round_number;
  marks:=private.feedback(secret,normalized);
  won:=not ('absent'=any(marks) or 'present'=any(marks));
  insert into public.guesses(room_id,user_id,match_number,round_number,attempt,guess,feedback,elapsed_ms)
    values(p_room,auth.uid(),r.match_number,r.round_number,p_attempt,normalized,marks,
      greatest(0,floor(extract(epoch from(now()-r.started_at))*1000)::bigint));
  update public.players set attempts=p_attempt,solved=won,last_seen=now(),
    finished_at=case when won or p_attempt=8 then now() else null end where room_id=p_room and user_id=auth.uid();
  if not exists(select 1 from public.players where room_id=p_room and not solved and attempts<8) then
    perform private.finish_round(p_room,'Both players finished');
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

create function public.advance_round(p_room uuid, p_match integer, p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before continuing.'; end if;
  if r.status not in ('round_over','match_over') then raise exception 'Wait until this round has finished.'; end if;
  update public.players set next_ready=true,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.players where room_id=p_room and next_ready)=2 then
    update public.players set attempts=0,solved=false,finished_at=null,secret_ready=false,next_ready=false,
      score=case when r.status='match_over' then 0 else score end where room_id=p_room;
    update public.rooms set status='setting',round_number=case when r.status='match_over' then 1 else round_number+1 end,
      match_number=match_number+case when r.status='match_over' then 1 else 0 end,
      started_at=null,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

create function public.heartbeat(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_room(p_room);
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
end $$;

create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.rooms; state jsonb;
begin
  if auth.uid() is null or not public.is_room_member(p_room) then raise exception 'Room not found or you are not a member.'; end if;
  select * into r from public.rooms where id=p_room;
  select jsonb_build_object(
    'room',to_jsonb(r),
    'players',(select jsonb_agg(to_jsonb(p)-'room_id' order by seat) from public.players p where room_id=p_room),
    'guesses',coalesce((select jsonb_agg(to_jsonb(g) order by attempt) from public.guesses g where room_id=p_room and user_id=auth.uid()
      and match_number=r.match_number and round_number=r.round_number),'[]'::jsonb),
    'own_secret',(select code from public.secrets where room_id=p_room and user_id=auth.uid() and match_number=r.match_number and round_number=r.round_number),
    'results',coalesce((select jsonb_agg(to_jsonb(rr) order by round_number) from public.round_results rr where room_id=p_room and match_number=r.match_number),'[]'::jsonb),
    'server_now',now()
  ) into state;
  return state;
end $$;

-- Supabase grants EXECUTE to PUBLIC by default; explicitly close every function.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.is_room_member(uuid), public.create_room(text,text), public.join_room(text,text),
  public.set_ready(uuid,boolean), public.set_secret(uuid,text,integer,integer), public.submit_guess(uuid,text,integer,integer,integer),
  public.advance_round(uuid,integer,integer), public.heartbeat(uuid), public.get_game_state(uuid) from public, anon, authenticated;
grant execute on function public.is_room_member(uuid), public.create_room(text,text), public.join_room(text,text),
  public.set_ready(uuid,boolean), public.set_secret(uuid,text,integer,integer), public.submit_guess(uuid,text,integer,integer,integer),
  public.advance_round(uuid,integer,integer), public.heartbeat(uuid), public.get_game_state(uuid) to authenticated;

-- Only the versioned room row is broadcast. Secrets and guesses are never published.
alter publication supabase_realtime add table public.rooms;
