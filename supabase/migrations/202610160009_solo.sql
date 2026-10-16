alter table public.word_bank add column is_answer boolean not null default false;
update public.word_bank set is_answer=true where word=any(string_to_array('ABSENT ABSORB ACCEPT ACCESS ACROSS ACTING ACTION ACTIVE ACTUAL ADJUST ADMIRE ADVICE ADVISE AFFAIR AFFECT AFFORD AFRAID AGENCY AGENDA ALMOST ALWAYS AMOUNT ANCHOR ANIMAL ANNUAL ANSWER ANYONE ANYWAY APPEAL APPEAR AROUND ARRIVE ARTIST ASPECT ASSIST ASSUME ATTACH ATTACK ATTEND AUGUST AUTHOR AUTUMN AVENUE BACKUP BADGER BAKERY BALLET BALLOT BANANA BANNER BARELY BASKET BATTLE BEAUTY BECAME BECOME BEFORE BEHALF BEHAVE BEHIND BELIEF BELONG BESIDE BETTER BEYOND BISHOP BITTER BLANKS BLOCKS BLOUSE BOTTLE BOTTOM BOUNCE BRANCH BREATH BRIDGE BRIGHT BROKEN BRONZE BUBBLE BUCKET BUDGET BUFFER BULLET BUNDLE BURDEN BUREAU BUTTER BUTTON CAMERA CAMPUS CANDLE CANNON CANVAS CARBON CAREER CARPET CARROT CASINO CASTLE CASUAL CATTLE CAUGHT CAUSAL CELLAR CEMENT CENSUS CENTRE CENTER CHANCE CHANGE CHARGE CHERRY CHOICE CHOOSE CHORUS CHOSEN CHROME CHURCH CIRCLE CIRCUS CITIES CLIENT CLINIC CLOSED CLOSER CLOSET CLOUDS CLUMSY COFFEE COLLAR COLOUR COLORS COLUMN COMEDY COMMON COMPLY COPPER CORNER COSTLY COTTON COUNTY COUPLE COUPON COURSE COUSIN COVERS COWARD COYOTE CRADLE CRAFTS CREATE CREDIT CRISIS CUSTOM DAMAGE DANGER DARING DEBATE DECADE DECENT DECIDE DECODE DEFEAT DEFEND DEFINE DEGREE DELAYS DELUXE DEMAND DENIAL DENTAL DEPART DEPEND DEPLOY DEPUTY DESERT DESIGN DESIRE DETAIL DETECT DEVICE DEVOTE DIFFER DIGEST DINNER DIRECT DIVIDE DOCTOR DOMAIN DONATE DONKEY DOUBLE DRAGON DRAWER DRIVEN DRIVER DURING EAGLES EARNED EASIER EASILY EATING EDITOR EFFECT EFFORT EITHER ELEVEN EMERGE EMPIRE EMPLOY ENABLE ENDING ENERGY ENGINE ENOUGH ENSURE ENTIRE EQUITY ESCAPE ESTATE ETHICS EVENLY EVENTS EVOLVE EXCEED EXCEPT EXCESS EXCUSE EXPAND EXPECT EXPERT EXPORT EXTEND EXTENT FABRIC FACING FACTOR FAILED FAIRLY FALLEN FAMILY FAMOUS FATHER FAVOUR FELLOW FEMALE FIGURE FILING FINGER FINISH FISCAL FLIGHT FLOWER FLYING FOLLOW FOREST FORGET FORGOT FORMAT FORMER FOSSIL FOSTER FOUGHT FOURTH FREELY FREEZE FRENCH FRIEND FROZEN FUSION FUTURE GALAXY GARAGE GARDEN GARLIC GATHER GENDER GENTLE GENTLY GIFTED GINGER GLOBAL GOLDEN GOSPEL GOSSIP GOVERN GRAVEL GROUND GROWTH GUILTY GUITAR HAMMER HANDLE HAPPEN HARDLY HATRED HAVING HEALTH HEAVEN HEIGHT HELMET HIDDEN HIGHER HIGHLY HIKING HOCKEY HOLDER HOLLOW HONEST HONOUR HORROR HOTELS HUMBLE HUNGER HUNGRY HUNTER IGNORE IMPACT IMPORT IMPOSE INCOME INDEED INDOOR INFANT INFORM INJURY INLAND INSECT INSIDE INSIST INTACT INTEND INTENT INVENT INVEST INVITE ISLAND ITSELF JACKET JERSEY JIGSAW JOINED JUNGLE JUNIOR KETTLE KIDNEY KITTEN KNIGHT LADDER LANDED LAPTOP LATELY LATTER LAUNCH LAWYER LEADER LEAGUE LEGACY LEGEND LENGTH LESSON LETTER LIGHTS LIKELY LIQUID LISTEN LITTLE LIVING LIZARD LOCATE LOCKED LONELY LONGER LOUDLY LOVELY LUMBER LUXURY MAGNET MAINLY MAKING MANAGE MANNER MANUAL MARBLE MARGIN MARINE MARKED MARKET MASTER MATTER MEADOW MEDIUM MELODY MEMBER MEMORY MENTAL MERELY MERGER METHOD MIDDLE MIGHTY MINUTE MIRROR MOBILE MODEST MODULE MOMENT MONKEY MOTHER MOTION MOVING MUSCLE MUSEUM MUTUAL MYSELF NAPKIN NARROW NATION NATIVE NATURE NEARBY NEARLY NEATLY NEPHEW NESTED NICKEL NOBODY NORMAL NOTICE NOTION NUMBER OBJECT OBTAIN OFFICE OLDEST ONLINE OPENED OPENLY OPTION ORANGE ORIGIN OTHERS OUTFIT OUTPUT OXYGEN PACKET PALACE PARADE PARENT PARTLY PASSED PASTEL PASTRY PATENT PATROL PATRON PEANUT PENCIL PEOPLE PEPPER PERIOD PERMIT PERSON PHRASE PICKED PICNIC PILLOW PIRATE PLACED PLANET PLAYER PLEASE PLENTY POCKET POETRY POINTS POISON POLICE POLICY POLISH POLITE PONDER POPPED PORTAL POSTAL POTATO POTION POWDER PRAISE PRAYER PREFER PREFIX PRETTY PRINCE PRISON PROFIT PROMPT PROPER PROVEN PUBLIC PULLED PUPPET PURPLE PURSUE PUZZLE RABBIT RACIAL RACING RADIUS RAISED RANDOM RANGER RARELY RATHER RATING READER REALLY REASON RECALL RECENT RECIPE RECORD REDUCE REFORM REFUND REFUSE REGARD REGIME REGION REGRET REJECT RELATE RELIEF RELISH REMAIN REMIND REMOTE REMOVE RENDER RENTAL REPAIR REPEAT REPLAY REPORT RESCUE RESIGN RESIST RESORT RESULT RETAIL RETAIN RETURN REVEAL REVIEW REVISE REWARD RHYTHM RIBBON RISING RITUAL ROCKET ROLLED ROTATE RUBBER RULING RUNNER SAFELY SAFETY SALARY SALMON SAMPLE SAVING SAYING SCARCE SCENIC SCHOOL SCREEN SCROLL SEARCH SEASON SECOND SECRET SECURE SEEING SELECT SELLER SENIOR SENSES SERIES SERVER SETTLE SEVERE SHADOW SHARED SHELLS SHIELD SHOULD SIGNAL SILENT SILVER SIMPLE SIMPLY SINGER SINGLE SISTER SKETCH SKILLS SLEEVE SLOWLY SMOOTH SOCCER SOCIAL SOCKET SOFTLY SOLELY SOLVED SOURCE SPEAKS SPEECH SPHERE SPIDER SPIRIT SPLASH SPOKEN SPREAD SPRING SQUARE STABLE STAIRS STANCE STATED STATIC STATUS STEADY STOLEN STORED STRAIN STREAM STREET STRESS STRICT STRIKE STRING STRIPE STRONG STUDIO SUBMIT SUDDEN SUFFER SUMMER SUMMIT SUNDAY SUNSET SUPPLY SURELY SURVEY SWITCH SYMBOL SYSTEM TABLET TACKLE TAKING TALENT TARGET TAUGHT TEMPLE TENANT TENDER TENNIS THANKS THEORY THIRTY THOUGH THREAD THREAT THRIVE THROAT THROWN TICKET TIMBER TIMELY TIMING TISSUE TONGUE TOWARD TRAVEL TREATY TRIBAL TRICKY TRIPLE TROPHY TUNNEL TURKEY TURTLE TWELVE TWENTY UNABLE UNFAIR UNIQUE UNITED UNLESS UNLIKE UNLOCK UNPAID UNUSED UPDATE UPHILL UPHOLD UPLIFT UPLOAD UTMOST VACANT VACUUM VALLEY VALUED VARIED VELVET VENDOR VERBAL VERIFY VERSUS VESSEL VICTIM VIOLET VISION VISUAL VOICES VOLUME VOYAGE WAITER WALKED WALLET WALNUT WANDER WANTED WARMLY WARMTH WEALTH WEAPON WEEKLY WEIGHT WHILST WHOLLY WICKED WIDELY WILLOW WINDOW WINNER WINTER WISDOM WITHIN WONDER WOODEN WORKER WORTHY WRITER YELLOW YOGURT ZIPPER ZOMBIE',' '));

create table private.solo_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('number','word')),
  challenge text not null check (challenge in ('attempts','timed')),
  status text not null default 'playing' check (status in ('playing','won','lost','abandoned')),
  answer text not null,
  guesses jsonb not null default '[]'::jsonb check (jsonb_typeof(guesses)='array'),
  started_at timestamptz not null default clock_timestamp(),
  deadline timestamptz,
  finished_at timestamptz,
  version integer not null default 1,
  check ((challenge='timed')=(deadline is not null)),
  check ((mode='number' and answer ~ '^[0-9]{4}$') or (mode='word' and answer ~ '^[A-Z]{6}$'))
);
alter table private.solo_games enable row level security;
revoke all on private.solo_games from public,anon,authenticated;
create unique index solo_one_active_game on private.solo_games(user_id) where status='playing';

create function private.solo_state(g private.solo_games) returns jsonb
language sql volatile set search_path = '' as $$
  select jsonb_build_object('id',g.id,'mode',g.mode,'challenge',g.challenge,'status',g.status,
    'guesses',g.guesses,'started_at',g.started_at,'deadline',g.deadline,'finished_at',g.finished_at,
    'max_guesses',case when g.challenge='attempts' then 6 else null end,'version',g.version,
    'secret',case when g.status='playing' then null else g.answer end,'server_now',clock_timestamp())
$$;
revoke all on function private.solo_state(private.solo_games) from public,anon,authenticated;

create function public.get_solo_game(p_game uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g private.solo_games;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_games
    where user_id=auth.uid() and (id=p_game or p_game is null and status='playing')
    order by started_at desc limit 1 for update;
  if not found then
    if p_game is null then return null; end if;
    raise exception 'No solo puzzle was found for your player. Start a new puzzle.';
  end if;
  if g.status='playing' and g.deadline is not null and clock_timestamp()>=g.deadline then
    update private.solo_games set status='lost',finished_at=deadline,version=version+1
      where id=g.id returning * into g;
  end if;
  return private.solo_state(g);
end $$;

create function public.create_solo_game(p_mode text,p_challenge text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g private.solo_games; secret text; started timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  if p_mode is null or p_mode not in ('number','word') then raise exception 'Choose Number Lock or Word Lock.'; end if;
  if p_challenge is null or p_challenge not in ('attempts','timed') then raise exception 'Choose six guesses or the three-minute timer.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':solo',0));
  if p_mode='number' then
    secret:=lpad(floor(random()*10000)::integer::text,4,'0');
  else
    select word into secret from public.word_bank where is_answer order by random() limit 1;
    if secret is null then raise exception 'The word puzzles are not ready. Please try again later.'; end if;
  end if;
  update private.solo_games set status='abandoned',finished_at=clock_timestamp(),version=version+1
    where user_id=auth.uid() and status='playing';
  started:=clock_timestamp();
  insert into private.solo_games(user_id,mode,challenge,answer,started_at,deadline)
    values(auth.uid(),p_mode,p_challenge,secret,started,
      case when p_challenge='timed' then started+interval '3 minutes' else null end) returning * into g;
  return private.solo_state(g);
end $$;

create function public.submit_solo_guess(p_game uuid,p_guess text,p_attempt integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g private.solo_games; normalized text:=upper(btrim(p_guess)); next_attempt integer; won boolean; submitted timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_games where id=p_game and user_id=auth.uid() for update;
  if not found then raise exception 'No solo puzzle was found for your player. Start a new puzzle.'; end if;
  if g.status<>'playing' then
    return jsonb_build_object('accepted',false,'reason','puzzle_finished','game',private.solo_state(g));
  end if;
  submitted:=clock_timestamp();
  if g.deadline is not null and submitted>=g.deadline then
    update private.solo_games set status='lost',finished_at=deadline,version=version+1 where id=g.id returning * into g;
    return jsonb_build_object('accepted',false,'reason','time_expired','game',private.solo_state(g));
  end if;
  next_attempt:=jsonb_array_length(g.guesses)+1;
  if p_attempt is distinct from next_attempt then raise exception 'Your guesses changed. Refresh the puzzle before trying again.'; end if;
  perform private.validate_code(g.mode,normalized);
  won:=normalized=g.answer;
  update private.solo_games set guesses=guesses||jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'guess',normalized,'feedback',private.feedback(g.answer,normalized),
      'attempt',next_attempt,'elapsed_ms',greatest(0,floor(extract(epoch from(submitted-g.started_at))*1000)))),
    status=case when won then 'won' when g.challenge='attempts' and next_attempt>=6 then 'lost' else 'playing' end,
    finished_at=case when won or g.challenge='attempts' and next_attempt>=6 then submitted else null end,
    version=version+1 where id=g.id returning * into g;
  return jsonb_build_object('accepted',true,'game',private.solo_state(g));
end $$;

revoke all on function public.get_solo_game(uuid),public.create_solo_game(text,text),public.submit_solo_guess(uuid,text,integer) from public,anon;
grant execute on function public.get_solo_game(uuid),public.create_solo_game(text,text),public.submit_solo_guess(uuid,text,integer) to authenticated;
