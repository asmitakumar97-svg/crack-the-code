-- New match rules intentionally restart existing rooms at the wager lobby.
alter table public.rooms
  add column stake text not null default 'low' check (stake in ('low','high')),
  add column wager_version integer not null default 1;
alter table public.players add column wager text not null default '' check (length(wager)<=120);
alter table public.word_bank drop constraint word_bank_word_check;
delete from public.word_bank;
alter table public.word_bank add constraint word_bank_word_check check (word ~ '^[A-Z]{4}$');
insert into public.word_bank(word)
select unnest(string_to_array(
  'ABLE ACHE ACID ACME ACNE ACRE AGED AIDE AIMS AIRY AJAR AKIN ALSO ALTO AMEN AMID ARCH AREA ARID ARMS ARMY ARTS ATOM AUNT AURA AUTO AWAY AXIS BABY BACK BAKE BALD BALL BAND BANG BANK BARE BARK BARN BASE BATH BEAD BEAM BEAN BEAR BEAT BEEF BEEN BEER BEET BELL BELT BEND BENT BEST BETA BIAS BIKE BILL BIND BIRD BITE BLOW BLUE BLUR BOAR BOAT BODY BOLD BOLT BOMB BOND BONE BOOK BOOM BOOT BORE BORN BOTH BOWL BRAG BRED BREW BRIM BROW BUCK BUDS BULB BULK BULL BUMP BUNK BURN BURY BUSH BUSY CAFE CAGE CAKE CALF CALL CALM CAME CAMP CANE CAPE CARD CARE CART CASE CASH CAST CAVE CELL CHAT CHEF CHEW CHIN CHIP CHOP CITE CITY CLAD CLAM CLAP CLAW CLAY CLIP CLOG CLUB CLUE COAL COAT CODE COIL COIN COLD COLT COMB COME CONE COOK COOL COPE COPY CORD CORE CORK CORN COST COSY COZY COUP COVE CRAB CREW CROP CROW CUBE CURE CURL CUTE DAMP DARE DARK DART DASH DATA DATE DAWN DAYS DEAD DEAF DEAL DEAR DEBT DECK DEED DEEM DEEP DEER DENT DENY DESK DIAL DICE DIET DIME DINE DIRT DISC DISH DIVE DOCK DOES DOLL DOME DONE DOOM DOOR DOSE DOVE DOWN DRAG DRAW DREW DRIP DROP DRUM DUAL DUCK DUEL DUET DUKE DULL DUNE DUSK DUST DUTY EACH EARN EARS EASE EAST EASY EATS ECHO EDGE EDIT ELSE EMIT ENVY EPIC EVEN EVER EVIL EXAM EXIT FACE FACT FADE FAIL FAIR FAKE FALL FAME FANG FARE FARM FAST FATE FAWN FEAR FEAT FEED FEEL FEET FELL FELT FERN FIBS FILE FILL FILM FIND FINE FIRE FIRM FISH FIST FIVE FLAG FLAP FLAT FLAW FLEA FLED FLEE FLEW FLEX FLIP FLIT FLOW FOAM FOIL FOLD FOLK FOND FONT FOOD FOOL FOOT FORD FORE FORK FORM FORT FOUR FOWL FREE FRET FROG FROM FUEL FULL FUME FUND FURY FUSE FUSS GAIN GAIT GALE GAME GANG GATE GAVE GAZE GEAR GENE GERM GIFT GILD GILL GIRL GIVE GLAD GLEE GLEN GLOW GLUE GOAL GOAT GOLD GOLF GONE GOOD GOWN GRAB GRAM GRAY GREW GREY GRID GRIM GRIN GRIP GRIT GROW GULF GUST HACK HAIL HAIR HALF HALL HALO HALT HAND HANG HARD HARE HARM HARP HART HATE HAUL HAVE HAWK HAZE HEAD HEAL HEAP HEAR HEAT HEED HEEL HELD HELM HELP HERB HERD HERE HERO HIDE HIGH HIKE HILL HINT HIRE HISS HIVE HOAX HOLD HOLE HOLY HOME HOOD HOOF HOOK HOOP HOPE HORN HOST HOUR HUGE HULL HUMP HUNG HUNT HURT HUSH HYMN ICON IDEA IDLE INCH INTO IRIS IRON ISLE ITEM JACK JADE JAIL JAZZ JEAN JEEP JERK JEST JOBS JOIN JOKE JOLT JUMP JUNE JURY JUST KEEN KEEP KELP KEPT KICK KIDS KIND KING KISS KITE KNEE KNEW KNIT KNOB KNOT KNOW LACE LACK LADY LAID LAKE LAMB LAME LAMP LAND LANE LARK LAST LATE LAWN LAZY LEAD LEAF LEAK LEAN LEAP LEFT LEND LENS LENT LESS LIAR LICE LICK LIED LIFE LIFT LIKE LILY LIME LIMB LIMP LINE LINK LION LIST LIVE LOAD LOAF LOAN LOCK LOFT LOGO LONE LONG LOOK LOOM LOOP LOOT LORD LOSE LOSS LOST LOUD LOVE LUCK LUMP LUNG LURE LURK LUSH LUST LUTE LYNX MAIL MAIN MAKE MALE MALL MALT MANY MARE MARK MARS MASK MASS MAST MATE MATH MAZE MEAD MEAL MEAN MEAT MEEK MEET MELT MEMO MEND MENU MERE MESH MESS MICE MILD MILE MILK MILL MIND MINE MINT MIRE MISS MIST MITE MOAN MOAT MOCK MODE MOLD MOLE MOLT MONK MOOD MOON MOOR MORE MOSS MOST MOTH MOVE MUCH MULE MUSE MUSH MUST MUTE MYTH NAIL NAME NAVY NEAR NEAT NECK NEED NEST NEWS NEWT NEXT NICE NICK NINE NODE NONE NOOK NOON NORM NOSE NOTE NOUN NUDE NUMB OATH OATS OBEY ODDS ODOR OILY OKAY OMEN OMIT ONCE ONLY ONTO ONYX OOZE OPEN ORAL ORCA ORES OVAL OVEN OVER OWLS PACE PACK PACT PAGE PAID PAIL PAIN PAIR PALE PALM PANE PANG PANT PARK PART PASS PAST PATH PAVE PAWN PEAK PEAL PEAR PEAT PECK PEEL PEER PEST PICK PIER PIKE PILE PILL PINE PINK PINT PIPE PLAN PLAY PLEA PLOT PLOW PLUG PLUM PLUS POEM POET POKE POLE POLL POND PONY POOL POOR POPE PORE PORK PORT POSE POST POUR PRAY PREY PROP PULL PULP PUMA PUMP PURE PUSH QUAD QUAY QUID QUIP QUIT QUIZ RACE RACK RAFT RAGE RAID RAIL RAIN RAKE RAMP RANG RANK RANT RARE RASH RASP RATE RAVE RAYS READ REAL REAP REAR REED REEF REEL REIN RELY RENT REST RICE RICH RIDE RIFT RIND RING RIOT RIPE RISE RISK ROAD ROAM ROAR ROBE ROCK RODE ROLE ROLL ROOF ROOK ROOM ROOT ROPE ROSE ROSY ROVE RUBY RUDE RUIN RULE RUNG RUSH RUST SACK SAFE SAGA SAGE SAID SAIL SAKE SALE SALT SAME SAND SANE SANG SANK SAVE SCAM SCAN SCAR SEAL SEAM SEAT SEED SEEK SEEM SEEN SELF SELL SEND SENT SHAM SHED SHIN SHIP SHOE SHOP SHOT SHOW SHUT SICK SIDE SIFT SIGH SIGN SILK SILL SILO SILT SING SINK SITE SIZE SKID SKIM SKIN SKIP SLAB SLAM SLAP SLED SLEW SLID SLIM SLIP SLIT SLOB SLOG SLOT SLOW SLUG SLUM SNAP SNIP SNOB SNOW SOAK SOAP SOAR SOCK SODA SOFA SOFT SOIL SOLD SOLE SOLO SOME SONG SOON SORE SORT SOUL SOUR SOWN SPAN SPAR SPAT SPEC SPED SPIN SPIT SPOT SPUR STAR STAY STEM STEP STEW STIR STOP STOW STUB STUD STUN SUCH SUIT SULK SUMO SUNG SUNK SURE SURF SWAM SWAN SWAP SWAY SWIM TACK TACT TAIL TAKE TALE TALK TALL TAME TANK TAPE TAPS TASK TAXI TEAK TEAM TEAR TEEM TEEN TELL TEND TENT TERM TEST TEXT THAN THAT THEE THEM THEN THEY THIN THIS THUD THUG THUS TICK TIDE TIDY TIED TIER TILE TILL TILT TIME TINY TIRE TOAD TOIL TOLD TOLL TOMB TOME TONE TONG TOOK TOOL TORE TORN TOSS TOUR TOWN TRAM TRAP TRAY TREE TREK TRIM TRIO TRIP TROT TRUE TUBA TUBE TUCK TUFT TUNA TUNE TURF TURN TUSK TWIN TYPE UGLY UNDO UNIT UNTO UPON URGE USED USER VAIN VALE VARY VASE VAST VEAL VEER VEIL VEIN VENT VERB VERY VEST VETO VIAL VIBE VIEW VILE VINE VISA VOID VOTE VOWS WADE WAGE WAIL WAIT WAKE WALK WALL WAND WANE WANT WARD WARM WARN WARP WARY WASH WASP WAVE WAVY WAXY WAYS WEAK WEAN WEAR WEED WEEK WEEP WELL WENT WERE WEST WHAT WHEN WHIM WHIP WHOM WICK WIDE WIFE WILD WILL WILT WILY WIND WINE WING WINK WIPE WIRE WISE WISH WISP WITH WOKE WOLF WOOD WOOL WORD WORE WORK WORM WORN WOVE WRAP WREN YANK YARD YARN YAWN YEAH YEAR YELL YOGA YOKE YOUR ZEAL ZERO ZEST ZINC ZONE ZOOM', ' '));

update public.players set wager='',score=0,ready=false,attempts=0,solved=false,finished_at=null,next_ready=false,secret_ready=false;
update public.rooms set status='lobby',round_number=0,match_number=match_number+1,started_at=null,version=version+1;

create or replace function private.validate_code(p_mode text, p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_code is null or not (
    (p_mode='number' and p_code ~ '^[0-9]{4}$') or
    (p_mode='symbol' and p_code ~ '^[A-F]{4}$') or
    (p_mode='word' and exists(select 1 from public.word_bank where word=p_code))
  ) then raise exception 'Enter four digits, four symbols, or a real four-letter word from the word bank.'; end if;
end $$;

create or replace function private.feedback(p_secret text, p_guess text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  marks text[]:=array_fill('miss'::text,array[length(p_guess)]);
  remaining text[]:=string_to_array(p_secret,null);
  i integer;
  idx integer;
begin
  if length(p_secret)<>length(p_guess) then raise exception 'Code lengths must match.'; end if;
  -- Consume copies left to right, without inspecting or exposing their positions.
  for i in 1..length(p_guess) loop
    idx:=array_position(remaining,substr(p_guess,i,1));
    if idx is not null then marks[i]:='hit'; remaining[idx]:=null; end if;
  end loop;
  return marks;
end $$;

create or replace function private.finish_round(p_room uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; winner uuid; reveal_data jsonb; stat_data jsonb;
begin
  select * into r from public.rooms where id=p_room;
  if r.status<>'playing' then return; end if;
  select user_id into winner from public.players where room_id=p_room and solved;
  select jsonb_object_agg(user_id::text,code) into reveal_data from public.secrets
    where room_id=p_room and match_number=r.match_number and round_number=r.round_number;
  select jsonb_object_agg(user_id::text,jsonb_build_object('attempts',attempts,'solved',solved,
    'elapsed_ms',case when finished_at is not null then greatest(0,floor(extract(epoch from(finished_at-r.started_at))*1000)) else null end))
    into stat_data from public.players where room_id=p_room;
  insert into public.round_results values(p_room,r.match_number,r.round_number,winner,p_reason,reveal_data,stat_data);
  update public.players set score=score+case when user_id=winner then 1 else 0 end,next_ready=false where room_id=p_room;
  update public.rooms set status=case when round_number=3 or exists(
      select 1 from public.players where room_id=p_room and score>=2
    ) then 'match_over' else 'round_over' end,version=version+1 where id=p_room;
end $$;

drop function public.create_room(text,text);
create function public.create_room(p_name text,p_mode text,p_stake text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid; candidate text; retries integer:=0;
begin
  if auth.uid() is null then raise exception 'Sign in to play.'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 20 then raise exception 'Display name must be 1–20 characters.'; end if;
  if p_mode is null or p_mode not in ('number','word','symbol') then raise exception 'Choose a valid game mode.'; end if;
  if p_stake is null or p_stake not in ('low','high') then raise exception 'Choose low or high stakes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.rooms where host_id=auth.uid() and created_at>now()-interval '1 hour')>=10
    then raise exception 'Room creation limit reached. Try again in an hour.'; end if;
  loop
    candidate:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    begin
      insert into public.rooms(code,host_id,mode,stake) values(candidate,auth.uid(),p_mode,p_stake) returning id into rid;
      exit;
    exception when unique_violation then
      retries:=retries+1;
      if retries>=10 then raise exception 'Could not generate a room code. Try again.'; end if;
    end;
  end loop;
  insert into public.players(room_id,user_id,name,seat) values(rid,auth.uid(),btrim(p_name),1);
  return rid;
end $$;

create function public.set_wager(p_room uuid,p_wager text,p_match integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number then raise exception 'Match out of date. Refresh before editing your bet.'; end if;
  if r.status<>'lobby' then raise exception 'Bets are locked for this match.'; end if;
  if p_wager is null or length(btrim(p_wager)) not between 1 and 120 then raise exception 'Write a bet with 1–120 characters.'; end if;
  update public.players set wager=btrim(p_wager),last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.players set ready=false where room_id=p_room;
  update public.rooms set wager_version=wager_version+1,version=version+1 where id=p_room;
end $$;

drop function public.set_ready(uuid,boolean);
create function public.set_ready(p_room uuid,p_ready boolean,p_wager_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if r.status<>'lobby' then raise exception 'The match has already started.'; end if;
  if p_ready is null then raise exception 'Readiness must be true or false.'; end if;
  if p_ready and p_wager_version is distinct from r.wager_version then raise exception 'The bets changed. Read them again before agreeing.'; end if;
  if p_ready and (select count(*) from public.players where room_id=p_room and length(wager)>0)<>2 then raise exception 'Both players must write a bet first.'; end if;
  update public.players set ready=p_ready,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.players where room_id=p_room and ready)=2 then
    update public.rooms set status='setting',round_number=1,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

create or replace function public.set_secret(p_room uuid,p_code text,p_match integer,p_round integer) returns void
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
    update public.rooms set status='playing',started_at=clock_timestamp()+interval '6 seconds',version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

drop function public.submit_guess(uuid,text,integer,integer,integer);
create function public.submit_guess(p_room uuid,p_guess text,p_attempt integer,p_match integer,p_round integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; me public.players; secret text; marks text[]; normalized text:=upper(btrim(p_guess)); won boolean;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before guessing again.'; end if;
  if r.status in ('round_over','match_over') then
    return jsonb_build_object('accepted',false,'reason','round_finished');
  end if;
  if r.status<>'playing' then raise exception 'This round is not accepting guesses.'; end if;
  if clock_timestamp()<r.started_at then raise exception 'The race starts in a moment.'; end if;
  select * into me from public.players where room_id=p_room and user_id=auth.uid();
  if me.attempts>=8 then raise exception 'All eight guesses are used. Wait for your opponent.'; end if;
  if p_attempt is null or p_attempt<>me.attempts+1 then raise exception 'Attempt out of date. Refresh before guessing again.'; end if;
  perform private.validate_code(r.mode,normalized);
  select code into strict secret from public.secrets where room_id=p_room and user_id<>auth.uid()
    and match_number=r.match_number and round_number=r.round_number;
  marks:=private.feedback(secret,normalized);
  won:=secret=normalized;
  insert into public.guesses(room_id,user_id,match_number,round_number,attempt,guess,feedback,elapsed_ms)
    values(p_room,auth.uid(),r.match_number,r.round_number,p_attempt,normalized,marks,
      greatest(0,floor(extract(epoch from(clock_timestamp()-r.started_at))*1000)::bigint));
  update public.players set attempts=p_attempt,solved=won,last_seen=now(),
    finished_at=case when won or p_attempt=8 then clock_timestamp() else null end where room_id=p_room and user_id=auth.uid();
  if won then perform private.finish_round(p_room,'First code cracked');
  elsif not exists(select 1 from public.players where room_id=p_room and attempts<8) then
    perform private.finish_round(p_room,'Both out of guesses');
  else update public.rooms set version=version+1 where id=p_room; end if;
  return jsonb_build_object('accepted',true);
end $$;

create or replace function public.advance_round(p_room uuid,p_match integer,p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before continuing.'; end if;
  if r.status not in ('round_over','match_over') then raise exception 'Wait until this round has finished.'; end if;
  update public.players set next_ready=true,last_seen=now() where room_id=p_room and user_id=auth.uid();
  if (select count(*) from public.players where room_id=p_room and next_ready)=2 then
    update public.players set attempts=0,solved=false,finished_at=null,secret_ready=false,next_ready=false,
      ready=false,wager=case when r.status='match_over' then '' else wager end,
      score=case when r.status='match_over' then 0 else score end where room_id=p_room;
    update public.rooms set status=case when r.status='match_over' then 'lobby' else 'setting' end,
      round_number=case when r.status='match_over' then 0 else round_number+1 end,
      match_number=match_number+case when r.status='match_over' then 1 else 0 end,
      wager_version=wager_version+case when r.status='match_over' then 1 else 0 end,
      started_at=null,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;

revoke all on function public.create_room(text,text,text),public.set_wager(uuid,text,integer),public.set_ready(uuid,boolean,integer),
  public.submit_guess(uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.create_room(text,text,text),public.set_wager(uuid,text,integer),public.set_ready(uuid,boolean,integer),
  public.submit_guess(uuid,text,integer,integer,integer) to authenticated;
