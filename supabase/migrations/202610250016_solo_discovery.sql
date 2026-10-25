create or replace function public.get_solo_board(p_game uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g private.solo_boards; m private.memory_games; d private.dots_games; chosen integer;
begin
  if auth.uid() is null then raise exception 'Sign in to play solo.'; end if;
  select * into g from private.solo_boards where user_id=auth.uid() and (id=p_game or p_game is null and status='playing')
    order by started_at desc limit 1 for update;
  if not found then
    if p_game is null then return null; end if;
    raise exception 'No solo board was found for your player. Start a new game.';
  end if;
  if p_game is not null and g.status='playing' and g.next_action_at<=clock_timestamp() then
    if g.kind='memory' then
      chosen:=private.computer_memory_card(g);
      m:=jsonb_populate_record(null::private.memory_games,g.board);
      m:=private.apply_memory_flip(m,chosen,private.computer_id(),g.user_id);
      g.board:=to_jsonb(m); g.knowledge:=private.remember_card(g,chosen);
    else
      d:=jsonb_populate_record(null::private.dots_games,g.board);
      if d.remaining=0 then d:=private.apply_dots_roll(d);
      else d:=private.apply_dots_line(d,private.computer_dots_edge(d,g.difficulty),private.computer_id(),g.user_id); end if;
      g.board:=to_jsonb(d);
    end if;
    g:=private.save_solo_board(g);
  end if;
  return private.solo_board_state(g);
end $$;
notify pgrst,'reload schema';
