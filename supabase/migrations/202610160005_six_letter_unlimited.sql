lock table public.rooms in exclusive mode;

alter table public.players drop constraint players_attempts_check;
alter table public.players add constraint players_attempts_check check (attempts>=0);
alter table public.guesses drop constraint guesses_attempt_check;
alter table public.guesses add constraint guesses_attempt_check check (attempt>=1);

alter table public.word_bank drop constraint word_bank_word_check;
delete from public.word_bank;
alter table public.word_bank add constraint word_bank_word_check check (word ~ '^[A-Z]{6}$');
insert into public.word_bank(word)
select distinct unnest(string_to_array(
  'ABSENT ABSORB ACCEPT ACCESS ACROSS ACTING ACTION ACTIVE ACTUAL ADJUST ADMIRE ADVICE ADVISE AFFAIR AFFECT AFFORD AFRAID AGENCY AGENDA ALMOST ALWAYS AMOUNT ANCHOR ANIMAL ANNUAL ANSWER ANYONE ANYWAY APPEAL APPEAR AROUND ARRIVE ARTIST ASPECT ASSIST ASSUME ATTACH ATTACK ATTEND AUGUST AUTHOR AUTUMN AVENUE BACKUP BADGER BAKERY BALLET BALLOT BANANA BANNER BARELY BASKET BATTLE BEAUTY BECAME BECOME BEFORE BEHALF BEHAVE BEHIND BELIEF BELONG BESIDE BETTER BEYOND BISHOP BITTER BLANKS BLOCKS BLOUSE BOTTLE BOTTOM BOUNCE BRANCH BREATH BRIDGE BRIGHT BROKEN BRONZE BUBBLE BUCKET BUDGET BUFFER BULLET BUNDLE BURDEN BUREAU BUTTER BUTTON CAMERA CAMPUS CANDLE CANNON CANVAS CARBON CAREER CARPET CARROT CASINO CASTLE CASUAL CATTLE CAUGHT CAUSAL CELLAR CEMENT CENSUS CENTRE CENTER CHANCE CHANGE CHARGE CHERRY CHOICE CHOOSE CHORUS CHOSEN CHROME CHURCH CIRCLE CIRCUS CITIES CLIENT CLINIC CLOSED CLOSER CLOSET CLOUDS CLUMSY COFFEE COLLAR COLOUR COLORS COLUMN COMEDY COMMON COMPLY COPPER CORNER COSTLY COTTON COUNTY COUPLE COUPON COURSE COUSIN COVERS COWARD COYOTE CRADLE CRAFTS CREATE CREDIT CRISIS CUSTOM DAMAGE DANGER DARING DEBATE DECADE DECENT DECIDE DECODE DEFEAT DEFEND DEFINE DEGREE DELAYS DELUXE DEMAND DENIAL DENTAL DEPART DEPEND DEPLOY DEPUTY DESERT DESIGN DESIRE DETAIL DETECT DEVICE DEVOTE DIFFER DIGEST DINNER DIRECT DIVIDE DOCTOR DOMAIN DONATE DONKEY DOUBLE DRAGON DRAWER DRIVEN DRIVER DURING EAGLES EARNED EASIER EASILY EATING EDITOR EFFECT EFFORT EITHER ELEVEN EMERGE EMPIRE EMPLOY ENABLE ENDING ENERGY ENGINE ENOUGH ENSURE ENTIRE EQUITY ESCAPE ESTATE ETHICS EVENLY EVENTS EVOLVE EXCEED EXCEPT EXCESS EXCUSE EXPAND EXPECT EXPERT EXPORT EXTEND EXTENT FABRIC FACING FACTOR FAILED FAIRLY FALLEN FAMILY FAMOUS FATHER FAVOUR FELLOW FEMALE FIGURE FILING FINGER FINISH FISCAL FLIGHT FLOWER FLYING FOLLOW FOREST FORGET FORGOT FORMAT FORMER FOSSIL FOSTER FOUGHT FOURTH FREELY FREEZE FRENCH FRIEND FROZEN FUSION FUTURE GALAXY GARAGE GARDEN GARLIC GATHER GENDER GENTLE GENTLY GIFTED GINGER GLOBAL GOLDEN GOSPEL GOSSIP GOVERN GRAVEL GROUND GROWTH GUILTY GUITAR HAMMER HANDLE HAPPEN HARDLY HATRED HAVING HEALTH HEAVEN HEIGHT HELMET HIDDEN HIGHER HIGHLY HIKING HOCKEY HOLDER HOLLOW HONEST HONOUR HORROR HOTELS HUMBLE HUNGER HUNGRY HUNTER IGNORE IMPACT IMPORT IMPOSE INCOME INDEED INDOOR INFANT INFORM INJURY INLAND INSECT INSIDE INSIST INTACT INTEND INTENT INVENT INVEST INVITE ISLAND ITSELF JACKET JERSEY JIGSAW JOINED JUNGLE JUNIOR KETTLE KIDNEY KITTEN KNIGHT LADDER LANDED LAPTOP LATELY LATTER LAUNCH LAWYER LEADER LEAGUE LEGACY LEGEND LENGTH LESSON LETTER LIGHTS LIKELY LIQUID LISTEN LITTLE LIVING LIZARD LOCATE LOCKED LONELY LONGER LOUDLY LOVELY LUMBER LUXURY MAGNET MAINLY MAKING MANAGE MANNER MANUAL MARBLE MARGIN MARINE MARKED MARKET MASTER MATTER MEADOW MEDIUM MELODY MEMBER MEMORY MENTAL MERELY MERGER METHOD MIDDLE MIGHTY MINUTE MIRROR MOBILE MODEST MODULE MOMENT MONKEY MOTHER MOTION MOVING MUSCLE MUSEUM MUTUAL MYSELF NAPKIN NARROW NATION NATIVE NATURE NEARBY NEARLY NEATLY NEPHEW NESTED NICKEL NOBODY NORMAL NOTICE NOTION NUMBER OBJECT OBTAIN OFFICE OLDEST ONLINE OPENED OPENLY OPTION ORANGE ORIGIN OTHERS OUTFIT OUTPUT OXYGEN PACKET PALACE PARADE PARENT PARTLY PASSED PASTEL PASTRY PATENT PATROL PATRON PEANUT PENCIL PEOPLE PEPPER PERIOD PERMIT PERSON PHRASE PICKED PICNIC PILLOW PIRATE PLACED PLANET PLAYER PLEASE PLENTY POCKET POETRY POINTS POISON POLICE POLICY POLISH POLITE PONDER POPPED PORTAL POSTAL POTATO POTION POWDER PRAISE PRAYER PREFER PREFIX PRETTY PRINCE PRISON PROFIT PROMPT PROPER PROVEN PUBLIC PULLED PUPPET PURPLE PURSUE PUZZLE RABBIT RACIAL RACING RADIUS RAISED RANDOM RANGER RARELY RATHER RATING READER REALLY REASON RECALL RECENT RECIPE RECORD REDUCE REFORM REFUND REFUSE REGARD REGIME REGION REGRET REJECT RELATE RELIEF RELISH REMAIN REMIND REMOTE REMOVE RENDER RENTAL REPAIR REPEAT REPLAY REPORT RESCUE RESIGN RESIST RESORT RESULT RETAIL RETAIN RETURN REVEAL REVIEW REVISE REWARD RHYTHM RIBBON RISING RITUAL ROCKET ROLLED ROTATE RUBBER RULING RUNNER SAFELY SAFETY SALARY SALMON SAMPLE SAVING SAYING SCARCE SCENIC SCHOOL SCREEN SCROLL SEARCH SEASON SECOND SECRET SECURE SEEING SELECT SELLER SENIOR SENSES SERIES SERVER SETTLE SEVERE SHADOW SHARED SHELLS SHIELD SHOULD SIGNAL SILENT SILVER SIMPLE SIMPLY SINGER SINGLE SISTER SKETCH SKILLS SLEEVE SLOWLY SMOOTH SOCCER SOCIAL SOCKET SOFTLY SOLELY SOLVED SOURCE SPEAKS SPEECH SPHERE SPIDER SPIRIT SPLASH SPOKEN SPREAD SPRING SQUARE STABLE STAIRS STANCE STATED STATIC STATUS STEADY STOLEN STORED STRAIN STREAM STREET STRESS STRICT STRIKE STRING STRIPE STRONG STUDIO SUBMIT SUDDEN SUFFER SUMMER SUMMIT SUNDAY SUNSET SUPPLY SURELY SURVEY SWITCH SYMBOL SYSTEM TABLET TACKLE TAKING TALENT TARGET TAUGHT TEMPLE TENANT TENDER TENNIS THANKS THEORY THIRTY THOUGH THREAD THREAT THRIVE THROAT THROWN TICKET TIMBER TIMELY TIMING TISSUE TONGUE TOWARD TRAVEL TREATY TRIBAL TRICKY TRIPLE TROPHY TUNNEL TURKEY TURTLE TWELVE TWENTY UNABLE UNFAIR UNIQUE UNITED UNLESS UNLIKE UNLOCK UNPAID UNUSED UPDATE UPHILL UPHOLD UPLIFT UPLOAD UTMOST VACANT VACUUM VALLEY VALUED VARIED VELVET VENDOR VERBAL VERIFY VERSUS VESSEL VICTIM VIOLET VISION VISUAL VOICES VOLUME VOYAGE WAITER WALKED WALLET WALNUT WANDER WANTED WARMLY WARMTH WEALTH WEAPON WEEKLY WEIGHT WHILST WHOLLY WICKED WIDELY WILLOW WINDOW WINNER WINTER WISDOM WITHIN WONDER WOODEN WORKER WORTHY WRITER YELLOW YOGURT ZIPPER ZOMBIE', ' '));

-- Four-letter matches cannot continue with six-letter guesses. Keep their history.
delete from private.pending_guesses where room_id in (select id from public.rooms where mode='word');
update public.players p set score=0,ready=false,attempts=0,solved=false,finished_at=null,next_ready=false,secret_ready=false
from public.rooms r where r.id=p.room_id and r.mode='word';
update public.players set finished_at=null where not solved;
update public.rooms set
  status=case when mode='word' then 'lobby' else status end,
  round_number=case when mode='word' then 1 else round_number end,
  match_number=match_number+case when mode='word' then 1 else 0 end,
  started_at=case when mode='word' then null else started_at end,
  turn_user_id=case when mode='word' then null else turn_user_id end,
  version=version+1;

create or replace function private.validate_code(p_mode text,p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_code is null or not (
    (p_mode='number' and p_code ~ '^[0-9]{4}$') or
    (p_mode='word' and exists(select 1 from public.word_bank where word=p_code))
  ) then raise exception 'Enter four digits or a real six-letter word.'; end if;
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
  update public.players set ready=p_ready,last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;

create or replace function public.start_round(p_room uuid,p_match integer,p_round integer,p_wager_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; first_player uuid;
begin
  r:=private.lock_room(p_room);
  if r.host_id<>auth.uid() then raise exception 'Only the room creator can start the round.'; end if;
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before starting.'; end if;
  if r.status not in ('lobby','setting') then raise exception 'The round has already started.'; end if;
  if p_wager_version is distinct from r.wager_version then raise exception 'The bets changed. Read them again before starting.'; end if;
  if (select count(*) from public.players where room_id=p_room and ready and length(wager)>0)<>2
    then raise exception 'Both players must agree to the bets first.'; end if;
  if (select count(*) from public.players where room_id=p_room and secret_ready)<>2
    then raise exception 'Both players must lock a secret first.'; end if;
  select user_id into first_player from public.players where room_id=p_room and seat=case when r.round_number%2=1 then 1 else 2 end;
  update public.rooms set status='playing',started_at=clock_timestamp()+interval '6 seconds',
    turn_user_id=case when variant='turns' then first_player else null end,version=version+1 where id=p_room;
end $$;

create or replace function public.submit_guess(p_room uuid,p_guess text,p_attempt integer,p_match integer,p_round integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; me public.players; secret text; marks text[]; normalized text:=upper(btrim(p_guess)); won boolean; elapsed bigint;
begin
  r:=private.lock_room(p_room);
  if p_match is distinct from r.match_number or p_round is distinct from r.round_number then raise exception 'Round out of date. Refresh before guessing again.'; end if;
  if r.status in ('round_over','match_over') then return jsonb_build_object('accepted',false,'reason','round_finished'); end if;
  if r.status<>'playing' then raise exception 'This round is not accepting guesses.'; end if;
  if clock_timestamp()<r.started_at then raise exception 'The game starts in a moment.'; end if;
  if r.variant='turns' then
    if r.turn_user_id<>auth.uid() then raise exception 'It is your opponent''s turn.'; end if;
    if exists(select 1 from private.pending_guesses where room_id=p_room) then raise exception 'Wait for your opponent to send the checked hints.'; end if;
  end if;
  select * into me from public.players where room_id=p_room and user_id=auth.uid();
  if p_attempt is null or p_attempt<>me.attempts+1 then raise exception 'Attempt out of date. Refresh before guessing again.'; end if;
  perform private.validate_code(r.mode,normalized);
  select code into strict secret from public.secrets where room_id=p_room and user_id<>auth.uid()
    and match_number=r.match_number and round_number=r.round_number;
  won:=secret=normalized;
  elapsed:=greatest(0,floor(extract(epoch from(clock_timestamp()-r.started_at))*1000)::bigint);
  update public.players set attempts=p_attempt,solved=won,last_seen=now(),
    finished_at=case when won then clock_timestamp() else null end where room_id=p_room and user_id=auth.uid();
  if r.variant='turns' and not won then
    insert into private.pending_guesses(room_id,user_id,match_number,round_number,attempt,guess,elapsed_ms)
      values(p_room,auth.uid(),r.match_number,r.round_number,p_attempt,normalized,elapsed);
    update public.rooms set version=version+1 where id=p_room;
    return jsonb_build_object('accepted',true,'awaiting_hints',true);
  end if;
  marks:=private.feedback(secret,normalized);
  insert into public.guesses(room_id,user_id,match_number,round_number,attempt,guess,feedback,elapsed_ms)
    values(p_room,auth.uid(),r.match_number,r.round_number,p_attempt,normalized,marks,elapsed);
  if won then perform private.finish_round(p_room,'First code cracked');
  else update public.rooms set version=version+1 where id=p_room; end if;
  return jsonb_build_object('accepted',true);
end $$;

create or replace function public.submit_hints(p_room uuid,p_guess_id uuid,p_marks text[],p_match integer,p_round integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rooms; pending private.pending_guesses; secret text; expected text[];
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
  update public.rooms set turn_user_id=auth.uid(),version=version+1 where id=p_room;
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
      ready=case when r.status='match_over' then false else ready end,
      wager=case when r.status='match_over' then '' else wager end,
      score=case when r.status='match_over' then 0 else score end where room_id=p_room;
    update public.rooms set status=case when r.status='match_over' then 'lobby' else 'setting' end,
      round_number=case when r.status='match_over' then 1 else round_number+1 end,
      match_number=match_number+case when r.status='match_over' then 1 else 0 end,
      wager_version=wager_version+case when r.status='match_over' then 1 else 0 end,
      started_at=null,turn_user_id=null,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;
