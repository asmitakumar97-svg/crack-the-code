create or replace function private.apply_party(board jsonb,p_actor uuid,p_move integer,p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare player text:=p_actor::text; other text; kind text:=board->>'kind'; a text:=board->>'a'; b text:=board->>'b';
  number integer; cards jsonb; kept jsonb; rank integer; truthful boolean; recipient text; previous text; word text; category text; letter text;
  lines_a integer; lines_b integer; guesses jsonb; target text; wrong integer; previous_turn text:=board->>'turn_user';
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
          board:=jsonb_set(board,array['hands',recipient],(board->'hands'->recipient)||(board->'pile'));
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
    if board->>'turn_user' is distinct from previous_turn then
      board:=jsonb_set(board,'{turn_number}',to_jsonb((board->>'turn_number')::integer+1));
    end if;
  end if;
  board:=jsonb_set(board,'{moves}',to_jsonb((board->>'moves')::integer+1));
  if (board->>'finished')::boolean then board:=jsonb_set(board,'{finished_at}',to_jsonb(clock_timestamp())); end if;
  return board;
end $$;

create or replace function private.party_bot(board jsonb,p_difficulty text) returns jsonb
language plpgsql set search_path='' as $$
declare bot text:=private.computer_id()::text; kind text:=board->>'kind'; chosen integer; cards jsonb; rank integer;
  probability double precision; letter text; visible jsonb; pattern text; target_category text; guesses jsonb;
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
  target_category:=visible->'categories'->>case when board->>'a'=bot then board->>'b' else board->>'a' end;
  guesses:=visible->'guesses'->bot;
  select chr(65+n) into strict letter from generate_series(0,25) n where not guesses ? chr(65+n)
    order by case when p_difficulty='easy' then random() when p_difficulty='hard' then
      (select count(*) from private.hangman_words() w where w.category=target_category and length(w.word)=length(pattern)
        and strpos(w.word,chr(65+n))>0 and not exists(select 1 from generate_series(1,length(pattern)) i where
          (substr(pattern,i,1)<>'_' and substr(pattern,i,1)<>substr(w.word,i,1)) or (substr(pattern,i,1)='_' and guesses ? substr(w.word,i,1))))
      else 0 end desc,strpos('ETAOINSHRDLCUMWFGYPBVKJXQZ',chr(65+n)),random() limit 1;
  return jsonb_build_object('action','guess','data',jsonb_build_object('letter',letter));
end $$;

revoke all on function private.apply_party(jsonb,uuid,integer,text,jsonb),private.party_bot(jsonb,text) from public,anon,authenticated;
notify pgrst,'reload schema';
