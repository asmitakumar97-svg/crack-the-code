alter table public.rooms drop constraint rooms_game_kind_check;
alter table public.rooms add constraint rooms_game_kind_check check(game_kind in ('code','memory','dots','ring','bingo','cheat','hangman'));
alter table private.duo_choices drop constraint duo_choices_selected_check;
alter table private.duo_choices add constraint duo_choices_selected_check check(selected in ('code','memory','dots','ring','bingo','cheat','hangman'));
alter table private.solo_boards drop constraint solo_boards_kind_check;
alter table private.solo_boards add constraint solo_boards_kind_check check(kind in ('memory','dots','ring','bingo','cheat','hangman'));

create table private.party_games (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  board jsonb not null
);
alter table private.party_games enable row level security;
revoke all on private.party_games from public,anon,authenticated;

create function private.bingo_groups(numbers jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare groups jsonb:='[]'; cells jsonb; line integer; cell integer; idx integer;
begin
  for line in 0..11 loop
    cells:='[]';
    for cell in 0..4 loop
      idx:=case when line<5 then line*5+cell when line<10 then cell*5+line-5 when line=10 then cell*6 else 4+cell*4 end;
      cells:=cells||jsonb_build_array(numbers->idx);
    end loop;
    groups:=groups||jsonb_build_array(cells);
  end loop;
  return groups;
end $$;
create function private.bingo_lines(numbers jsonb,called jsonb) returns integer
language sql immutable set search_path='' as $$
  select count(*)::integer from jsonb_array_elements(private.bingo_groups(numbers)) cells where called @> cells
$$;
create function private.hangman_words() returns table(category text,word text)
language sql immutable set search_path='' as $$
  select 'animals',unnest(array['CAT','DOG','TIGER','HORSE','PANDA','RABBIT','DOLPHIN','ELEPHANT','BUTTERFLY','CROCODILE'])
  union all select 'food',unnest(array['PIE','EGG','APPLE','BREAD','PIZZA','BANANA','POPCORN','PINEAPPLE','CHOCOLATE','STRAWBERRY'])
  union all select 'places',unnest(array['BAY','ZOO','PARK','BEACH','SCHOOL','ISLAND','LIBRARY','MOUNTAIN','HOSPITAL','UNIVERSITY'])
  union all select 'nature',unnest(array['SUN','SKY','RAIN','RIVER','FLOWER','FOREST','RAINBOW','SUNSHINE','WATERFALL','SNOWFLAKE'])
$$;
create function private.hangman_word(p_category text,p_difficulty text default 'medium') returns text
language plpgsql volatile set search_path='' as $$
declare selected text;
begin
  if p_category is null or p_category not in ('animals','food','places','nature') then raise exception 'Choose an available word category.'; end if;
  select word into strict selected from private.hangman_words() where category=p_category
    and case p_difficulty when 'easy' then length(word)<=5 when 'hard' then length(word)>=8 else length(word) between 5 and 8 end
    order by random() limit 1;
  return selected;
end $$;
create function private.hangman_pattern(word text,guesses jsonb) returns text
language sql immutable set search_path='' as $$
  select coalesce(string_agg(case when guesses ? letter then letter else '_' end,'' order by position),'')
    from regexp_split_to_table(word,'') with ordinality t(letter,position)
$$;
create function private.new_party_board(p_kind text,a uuid,b uuid) returns jsonb
language plpgsql set search_path='' as $$
declare board jsonb; first_board jsonb; second_board jsonb; deck integer[];
begin
  board:=jsonb_build_object('kind',p_kind,'session_id',gen_random_uuid(),'a',a,'b',b,'moves',0,'turn_number',1,
    'turn_user',a,'finished',false,'winner_id',null,'finished_at',null);
  if p_kind='bingo' then
    select jsonb_agg(n order by random()) into first_board from generate_series(1,25) n;
    select jsonb_agg(n order by random()) into second_board from generate_series(1,25) n;
    return board||jsonb_build_object('boards',jsonb_build_object(a::text,first_board,b::text,second_board),'called','[]'::jsonb);
  elsif p_kind='cheat' then
    select array_agg(n order by random()) into deck from generate_series(0,51) n;
    return board||jsonb_build_object('hands',jsonb_build_object(a::text,to_jsonb(deck[1:26]),b::text,to_jsonb(deck[27:52])),
      'pile','[]'::jsonb,'pending','[]'::jsonb,'last_play',null,'reveal',null,'rank',1,'phase','play');
  elsif p_kind='hangman' then
    return board||jsonb_build_object('secrets','{}'::jsonb,'categories','{}'::jsonb,
      'guesses',jsonb_build_object(a::text,'[]'::jsonb,b::text,'[]'::jsonb),'ready','[]'::jsonb,'phase','setting','turn_user',null,'turn_number',0);
  end if;
  raise exception 'Choose Bingo, Cheat or Hangman.';
end $$;
create function private.party_state(board jsonb,p_viewer uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare state jsonb; a text:=board->>'a'; b text:=board->>'b'; player text:=p_viewer::text; other text;
  patterns jsonb:='{}'; misses jsonb:='{}'; target text; letters jsonb; who text; category text;
begin
  if player not in (a,b) or player is null then raise exception 'You are not a player in this game.'; end if;
  other:=case when player=a then b else a end;
  if board->>'kind'='bingo' then
    return (board-'boards')||jsonb_build_object('numbers',board->'boards'->player,'lines',jsonb_build_object(
      a,private.bingo_lines(board->'boards'->a,board->'called'),b,private.bingo_lines(board->'boards'->b,board->'called')));
  elsif board->>'kind'='cheat' then
    return (board-'hands'-'pile'-'pending')||jsonb_build_object('cards',board->'hands'->player,
      'hand_counts',jsonb_build_object(a,jsonb_array_length(board->'hands'->a),b,jsonb_array_length(board->'hands'->b)),
      'pile_count',jsonb_array_length(board->'pile'));
  end if;
  foreach who in array array[a,b] loop
    target:=board->'secrets'->>case when who=a then b else a end;
    letters:=board->'guesses'->who;
    patterns:=jsonb_set(patterns,array[who],to_jsonb(private.hangman_pattern(target,letters)),true);
    misses:=jsonb_set(misses,array[who],to_jsonb((select count(*)::integer from jsonb_array_elements_text(letters) letter where strpos(coalesce(target,''),letter)=0)),true);
  end loop;
  state:=(board-'secrets')||jsonb_build_object('patterns',patterns,'misses',misses,'own_word',board->'secrets'->player);
  if (board->>'finished')::boolean then state:=state||jsonb_build_object('reveals',board->'secrets'); end if;
  return state;
end $$;
create function private.apply_party(board jsonb,p_actor uuid,p_move integer,p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare player text:=p_actor::text; other text; kind text:=board->>'kind'; a text:=board->>'a'; b text:=board->>'b';
  number integer; cards jsonb; kept jsonb; rank integer; truthful boolean; recipient text; previous text; word text; category text; letter text;
  lines_a integer; lines_b integer; guesses jsonb; target text; wrong integer;
begin
  if player is null or player not in (a,b) then raise exception 'You are not a player in this game.'; end if;
  if (board->>'finished')::boolean then raise exception 'This game is complete.'; end if;
  if p_action is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Choose a valid game action.'; end if;
  other:=case when player=a then b else a end;
  if kind='hangman' and p_action='secret' then
    if board->'ready' ? player then raise exception 'Your word is already locked.'; end if;
    category:=p_data->>'category';
    if category is null or category not in ('animals','food','places','nature') then raise exception 'Choose an available word category.'; end if;
    word:=upper(trim(p_data->>'word'));
    if word is null or word='' then word:=private.hangman_word(category); end if;
    if word !~ '^[A-Z]{3,12}$' then raise exception 'Choose a word of 3–12 letters, without spaces or punctuation.'; end if;
    board:=jsonb_set(board,array['secrets',player],to_jsonb(word));
    board:=jsonb_set(board,array['categories',player],to_jsonb(category));
    board:=jsonb_set(board,'{ready}',board->'ready'||jsonb_build_array(player));
    if jsonb_array_length(board->'ready')=2 then board:=board||jsonb_build_object('phase','guessing','turn_user',a,'turn_number',1); end if;
  else
    if p_move is distinct from (board->>'moves')::integer then raise exception 'The board changed. Wait for it to sync and try again.'; end if;
    if board->>'turn_user' is distinct from player then raise exception 'It is your opponent''s turn.'; end if;
    if kind='bingo' and p_action='call' then
      if coalesce(p_data->>'number','') !~ '^(?:[1-9]|1[0-9]|2[0-5])$' then raise exception 'Choose an uncalled number from 1 to 25.'; end if;
      number:=(p_data->>'number')::integer;
      if board->'called' @> jsonb_build_array(number) then raise exception 'That number was already called.'; end if;
      board:=jsonb_set(board,'{called}',board->'called'||jsonb_build_array(number));
      lines_a:=private.bingo_lines(board->'boards'->a,board->'called');
      lines_b:=private.bingo_lines(board->'boards'->b,board->'called');
      if greatest(lines_a,lines_b)>=5 then
        board:=board||jsonb_build_object('finished',true,'winner_id',case when lines_a>=5 and lines_b>=5 then null when lines_a>=5 then a else b end);
      end if;
      board:=jsonb_set(board,'{turn_user}',to_jsonb(other));
    elsif kind='cheat' then
      if board->>'phase'='play' and p_action='play' then
        cards:=p_data->'cards';
        if jsonb_typeof(cards) is distinct from 'array' then raise exception 'Select one to four cards from your hand.'; end if;
        if jsonb_array_length(cards) not between 1 and 4 or exists(select 1 from jsonb_array_elements_text(cards) card where card !~ '^(?:[0-9]|[1-4][0-9]|5[01])$')
          or (select count(distinct card) from jsonb_array_elements(cards) card)<>jsonb_array_length(cards)
          or not (board->'hands'->player @> cards) then raise exception 'Select one to four different cards from your hand.'; end if;
        select coalesce(jsonb_agg(card),'[]') into kept from jsonb_array_elements(board->'hands'->player) card where not cards @> jsonb_build_array(card);
        board:=jsonb_set(board,array['hands',player],kept);
        board:=jsonb_set(board,'{pile}',board->'pile'||cards);
        board:=board||jsonb_build_object('pending',cards,'last_play',jsonb_build_object('player',player,'count',jsonb_array_length(cards),'rank',board->'rank'),
          'phase','challenge','turn_user',other,'reveal',null);
      elsif board->>'phase'='challenge' and p_action in ('accept','challenge') then
        previous:=board->'last_play'->>'player'; rank:=(board->>'rank')::integer;
        if p_action='challenge' then
          truthful:=not exists(select 1 from jsonb_array_elements_text(board->'pending') card where card::integer%13+1<>rank);
          recipient:=case when truthful then player else previous end;
          board:=jsonb_set(board,array['hands',recipient],board->'hands'->recipient||board->'pile');
          board:=board||jsonb_build_object('reveal',jsonb_build_object('cards',board->'pending','truthful',truthful,'recipient',recipient),'pile','[]'::jsonb);
        end if;
        if jsonb_array_length(board->'hands'->previous)=0 then board:=board||jsonb_build_object('finished',true,'winner_id',previous); end if;
        board:=board||jsonb_build_object('pending','[]'::jsonb,'phase','play','turn_user',player,'rank',rank%13+1);
      else raise exception 'Play cards on your turn, then let the opponent accept or call the bluff.';
      end if;
    elsif kind='hangman' and p_action='guess' and board->>'phase'='guessing' then
      letter:=upper(p_data->>'letter');
      if letter is null or letter !~ '^[A-Z]$' then raise exception 'Choose one letter from A to Z.'; end if;
      guesses:=board->'guesses'->player;
      if guesses ? letter then raise exception 'You already guessed that letter.'; end if;
      guesses:=guesses||jsonb_build_array(letter); target:=board->'secrets'->>other;
      board:=jsonb_set(board,array['guesses',player],guesses);
      select count(*) into wrong from jsonb_array_elements_text(guesses) guess where strpos(target,guess)=0;
      if private.hangman_pattern(target,guesses)=target then board:=board||jsonb_build_object('finished',true,'winner_id',player);
      elsif wrong>=6 then board:=board||jsonb_build_object('finished',true,'winner_id',other); end if;
      board:=jsonb_set(board,'{turn_user}',to_jsonb(other));
    else raise exception 'That action is not available in this game.';
    end if;
    board:=jsonb_set(board,'{turn_number}',to_jsonb((board->>'turn_number')::integer+1));
  end if;
  board:=jsonb_set(board,'{moves}',to_jsonb((board->>'moves')::integer+1));
  if (board->>'finished')::boolean then board:=jsonb_set(board,'{finished_at}',to_jsonb(clock_timestamp())); end if;
  return board;
end $$;
create function private.party_bot(board jsonb,p_difficulty text) returns jsonb
language plpgsql set search_path='' as $$
declare bot text:=private.computer_id()::text; kind text:=board->>'kind'; chosen integer; cards jsonb; rank integer;
  probability double precision; letter text; visible jsonb; pattern text; category text; guesses jsonb;
begin
  if board->>'turn_user' is distinct from bot or (board->>'finished')::boolean then raise exception 'The computer has no action to take.'; end if;
  if kind='bingo' then
    select n into strict chosen from generate_series(1,25) n where not board->'called' @> jsonb_build_array(n)
      order by case when p_difficulty='easy' then random() else
        (select coalesce(sum(power((select count(*) from jsonb_array_elements(cells) cell where
          (board->'called'||jsonb_build_array(n)) @> jsonb_build_array(cell)),case when p_difficulty='hard' then 3 else 2 end)),0)
          from jsonb_array_elements(private.bingo_groups(board->'boards'->bot)) cells) end desc,random() limit 1;
    return jsonb_build_object('action','call','data',jsonb_build_object('number',chosen));
  elsif kind='cheat' then
    rank:=(board->>'rank')::integer;
    if board->>'phase'='challenge' then
      probability:=case p_difficulty when 'easy' then 0.2 when 'medium' then 0.4 else 0.6 end;
      if (board->'last_play'->>'count')::integer > 4-(select count(*) from jsonb_array_elements_text(board->'hands'->bot) card where card::integer%13+1=rank)
        or random()<probability then return jsonb_build_object('action','challenge','data','{}'::jsonb); end if;
      return jsonb_build_object('action','accept','data','{}'::jsonb);
    end if;
    select coalesce(jsonb_agg(card),'[]') into cards from (select card from jsonb_array_elements(board->'hands'->bot) card where (card::text)::integer%13+1=rank limit 4) matching;
    if jsonb_array_length(cards)=0 then
      select jsonb_build_array(card) into strict cards from jsonb_array_elements(board->'hands'->bot) card order by random() limit 1;
    end if;
    return jsonb_build_object('action','play','data',jsonb_build_object('cards',cards));
  end if;
  visible:=private.party_state(board,private.computer_id());
  pattern:=visible->'patterns'->>bot;
  category:=visible->'categories'->>case when board->>'a'=bot then board->>'b' else board->>'a' end;
  guesses:=visible->'guesses'->bot;
  select chr(65+n) into strict letter from generate_series(0,25) n where not guesses ? chr(65+n)
    order by case when p_difficulty='easy' then random() when p_difficulty='hard' then
      (select count(*) from private.hangman_words() w where w.category=category and length(w.word)=length(pattern)
        and strpos(w.word,chr(65+n))>0 and not exists(select 1 from generate_series(1,length(pattern)) i where
          (substr(pattern,i,1)<>'_' and substr(pattern,i,1)<>substr(w.word,i,1)) or (substr(pattern,i,1)='_' and guesses ? substr(w.word,i,1))))
      else 0 end desc,strpos('ETAOINSHRDLCUMWFGYPBVKJXQZ',chr(65+n)),random() limit 1;
  return jsonb_build_object('action','guess','data',jsonb_build_object('letter',letter));
end $$;

create or replace function public.choose_duo_game(p_room uuid,p_revision integer,p_game text,p_tiles integer,p_theme text,p_mode text,p_variant text,p_dots integer default 10) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices;
begin
  r:=private.lock_duo_room(p_room);
  if not r.duo_lobby or r.host_id<>auth.uid() then raise exception 'Only the host can change games in the shared lobby.'; end if;
  select * into strict c from private.duo_choices where room_id=p_room;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them again.'; end if;
  if p_game is null or p_game not in ('code','memory','dots','ring','bingo','cheat','hangman') or p_tiles is null or p_tiles not in (12,16,24)
    or p_theme is null or p_theme not in ('paintings','florals','animals','patterns')
    or p_mode is null or p_mode not in ('number','word') or p_variant is null or p_variant not in ('race','turns')
    or p_dots is null or p_dots not in (10,12,15) then raise exception 'Choose valid game settings.'; end if;
  update private.duo_choices set selected=p_game,tiles=p_tiles,theme=p_theme,mode=p_mode,variant=p_variant,dots=p_dots,
    ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set version=version+1 where id=p_room;
end $$;
alter function public.confirm_duo_game(uuid,integer) rename to confirm_before_party;
revoke all on function public.confirm_before_party(uuid,integer) from public,anon,authenticated;
create function public.confirm_duo_game(p_room uuid,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c private.duo_choices; other uuid;
begin
  r:=private.lock_duo_room(p_room);
  select * into strict c from private.duo_choices where room_id=p_room;
  if c.selected not in ('bingo','cheat','hangman') then perform public.confirm_before_party(p_room,p_revision); return; end if;
  if not r.duo_lobby then raise exception 'This game has already started.'; end if;
  if p_revision is distinct from c.revision then raise exception 'Game settings changed. Review them before confirming.'; end if;
  select user_id into other from public.players where room_id=p_room and user_id<>r.host_id;
  if other is null then raise exception 'Wait for your friend to join.'; end if;
  if not auth.uid()=any(c.ready) then
    update private.duo_choices set ready=array_append(ready,auth.uid()) where room_id=p_room returning * into c;
  end if;
  if cardinality(c.ready)=2 then
    insert into private.party_games(room_id,board) values(p_room,private.new_party_board(c.selected,r.host_id,other))
      on conflict(room_id) do update set board=excluded.board;
    update public.rooms set game_kind=c.selected,duo_lobby=false,version=version+1 where id=p_room;
  else update public.rooms set version=version+1 where id=p_room; end if;
end $$;
create function public.play_party(p_room uuid,p_session uuid,p_move integer,p_action text,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; next_board jsonb;
begin
  r:=private.lock_duo_room(p_room);
  if r.duo_lobby or r.game_kind not in ('bingo','cheat','hangman') then raise exception 'This game is not active.'; end if;
  select board into strict next_board from private.party_games where room_id=p_room;
  if p_session is distinct from (next_board->>'session_id')::uuid then raise exception 'This is a different game. Reload to reconnect.'; end if;
  next_board:=private.apply_party(next_board,auth.uid(),p_move,p_action,p_data);
  update private.party_games set board=next_board where room_id=p_room;
  update public.players set last_seen=now() where room_id=p_room and user_id=auth.uid();
  update public.rooms set version=version+1 where id=p_room;
end $$;
alter function public.open_duo_lobby(uuid) rename to open_before_party;
revoke all on function public.open_before_party(uuid) from public,anon,authenticated;
create function public.open_duo_lobby(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
  r:=private.lock_duo_room(p_room);
  if r.game_kind not in ('bingo','cheat','hangman') or r.duo_lobby then perform public.open_before_party(p_room); return; end if;
  if r.host_id<>auth.uid() then raise exception 'Only the host can choose the next game.'; end if;
  if not exists(select 1 from private.party_games where room_id=p_room and (board->>'finished')::boolean) then raise exception 'Finish this game before switching games.'; end if;
  update private.duo_choices set ready='{}',revision=revision+1 where room_id=p_room;
  update public.rooms set duo_lobby=true,version=version+1 where id=p_room;
end $$;
alter function public.get_game_state(uuid) rename to get_before_party;
revoke all on function public.get_before_party(uuid) from public,anon,authenticated;
create function public.get_game_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare state jsonb; board jsonb;
begin
  state:=public.get_before_party(p_room);
  if state->'room'->>'game_kind' in ('bingo','cheat','hangman') and not (state->'room'->>'duo_lobby')::boolean then
    select g.board into strict board from private.party_games g where room_id=p_room;
    state:=state||jsonb_build_object('party',private.party_state(board,auth.uid()),
      'own_secret',null,'guesses','[]'::jsonb,'pending_guess',null,'results','[]'::jsonb);
  end if;
  return state;
end $$;
alter function private.current_turn_action(uuid) rename to turn_action_before_party;
revoke all on function private.turn_action_before_party(uuid) from public,anon,authenticated;
create function private.current_turn_action(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.rooms; board jsonb;
begin
  select * into r from public.rooms where id=p_room;
  if not found or r.duo_lobby then return null; end if;
  if r.game_kind not in ('bingo','cheat','hangman') then return private.turn_action_before_party(p_room); end if;
  select g.board into board from private.party_games g where room_id=p_room;
  if (board->>'finished')::boolean or board->>'turn_user' is null then return null; end if;
  return jsonb_build_object('user',board->>'turn_user','kind','guess','roomCode',r.code,
    'key',r.id::text||'.'||r.game_kind||'.'||(board->>'session_id')||'.'||(board->>'turn_number'));
end $$;

alter function private.solo_board_state(private.solo_boards) rename to solo_state_before_party;
revoke all on function private.solo_state_before_party(private.solo_boards) from public,anon,authenticated;
create function private.solo_board_state(g private.solo_boards) returns jsonb
language plpgsql set search_path='' as $$
begin
  if g.kind not in ('bingo','cheat','hangman') then return private.solo_state_before_party(g); end if;
  return jsonb_build_object('id',g.id,'kind',g.kind,'difficulty',g.difficulty,'status',g.status,'version',g.version,
    'board',private.party_state(g.board,g.user_id),'next_action_at',g.next_action_at,'server_now',clock_timestamp(),'computer_id',private.computer_id());
end $$;
create function private.schedule_party(g private.solo_boards) returns private.solo_boards
language plpgsql set search_path='' as $$
begin
  update private.solo_boards set status=case when (g.board->>'finished')::boolean then 'finished' else 'playing' end,
    board=g.board,version=version+1,
    next_action_at=case when not (g.board->>'finished')::boolean and g.board->>'turn_user'=private.computer_id()::text
      then clock_timestamp()+case g.difficulty when 'easy' then interval '1600 milliseconds' when 'medium' then interval '1200 milliseconds' else interval '800 milliseconds' end else null end
    where id=g.id returning * into g;
  return g;
end $$;
alter function public.create_solo_board(text,text,integer,text,integer) rename to create_solo_before_party;
revoke all on function public.create_solo_before_party(text,text,integer,text,integer) from public,anon,authenticated;
create function public.create_solo_board(p_kind text,p_difficulty text,p_tiles integer,p_theme text,p_dots integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; next_board jsonb; category text;
begin
  if p_kind is null or p_kind not in ('bingo','cheat','hangman') then return public.create_solo_before_party(p_kind,p_difficulty,p_tiles,p_theme,p_dots); end if;
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  if p_difficulty is null or p_difficulty not in ('easy','medium','hard') or p_tiles is null or p_tiles not in (12,16,24)
    or p_theme is null or p_theme not in ('paintings','florals','animals','patterns') or p_dots is null or p_dots not in (10,12,15) then raise exception 'Choose valid solo game settings.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':solo-board',0));
  update private.solo_boards set status='abandoned',next_action_at=null,version=version+1 where user_id=auth.uid() and status='playing';
  next_board:=private.new_party_board(p_kind,auth.uid(),private.computer_id());
  if p_kind='hangman' then
    select c into strict category from unnest(array['animals','food','places','nature']) c order by random() limit 1;
    next_board:=private.apply_party(next_board,private.computer_id(),0,'secret',jsonb_build_object('category',category,'word',private.hangman_word(category,p_difficulty)));
  end if;
  insert into private.solo_boards(user_id,kind,difficulty,theme,board) values(auth.uid(),p_kind,p_difficulty,p_theme,next_board) returning * into g;
  return private.solo_board_state(g);
end $$;
alter function public.get_solo_board(uuid) rename to get_solo_before_party;
revoke all on function public.get_solo_before_party(uuid) from public,anon,authenticated;
create function public.get_solo_board(p_game uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; action jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_boards where user_id=auth.uid() and (id=p_game or p_game is null and status='playing') order by started_at desc limit 1 for update;
  if not found then
    if p_game is null then return null; end if;
    raise exception 'No solo board was found for your player. Start a new game.';
  end if;
  if g.kind not in ('bingo','cheat','hangman') then return public.get_solo_before_party(p_game); end if;
  if p_game is not null and g.status='playing' and g.next_action_at<=clock_timestamp() then
    action:=private.party_bot(g.board,g.difficulty);
    g.board:=private.apply_party(g.board,private.computer_id(),(g.board->>'moves')::integer,action->>'action',action->'data');
    g:=private.schedule_party(g);
  end if;
  return private.solo_board_state(g);
end $$;
create function public.play_solo_party(p_game uuid,p_move integer,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards;
begin
  select * into g from private.solo_boards where id=p_game and user_id=auth.uid() and kind in ('bingo','cheat','hangman') for update;
  if not found then raise exception 'No game was found for your player.'; end if;
  if g.status<>'playing' then raise exception 'This game is complete or was replaced. Start a new game.'; end if;
  g.board:=private.apply_party(g.board,auth.uid(),p_move,p_action,p_data);
  g:=private.schedule_party(g);
  return private.solo_board_state(g);
end $$;
revoke all on function private.bingo_groups(jsonb),private.bingo_lines(jsonb,jsonb),private.hangman_words(),private.hangman_word(text,text),
  private.hangman_pattern(text,jsonb),private.new_party_board(text,uuid,uuid),private.party_state(jsonb,uuid),
  private.apply_party(jsonb,uuid,integer,text,jsonb),private.party_bot(jsonb,text),private.current_turn_action(uuid),
  private.solo_board_state(private.solo_boards),private.schedule_party(private.solo_boards) from public,anon,authenticated;
revoke all on function public.play_party(uuid,uuid,integer,text,jsonb),public.play_solo_party(uuid,integer,text,jsonb),
  public.confirm_duo_game(uuid,integer),public.open_duo_lobby(uuid),public.get_game_state(uuid),
  public.create_solo_board(text,text,integer,text,integer),public.get_solo_board(uuid) from public,anon;
grant execute on function public.play_party(uuid,uuid,integer,text,jsonb),public.play_solo_party(uuid,integer,text,jsonb),
  public.confirm_duo_game(uuid,integer),public.open_duo_lobby(uuid),public.get_game_state(uuid),
  public.create_solo_board(text,text,integer,text,integer),public.get_solo_board(uuid) to authenticated;
notify pgrst,'reload schema';
