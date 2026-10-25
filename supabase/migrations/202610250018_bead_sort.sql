create or replace function private.shift_ring(rods jsonb,p_from integer,p_to integer,p_reverse boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare source jsonb; target jsonb; colour jsonb; height integer; capacity integer;
begin
  select greatest(5,sum(jsonb_array_length(rod))::integer/4) into capacity from jsonb_array_elements(rods) rod;
  if p_from is null or p_to is null or p_from not between 0 and 4 or p_to not between 0 and 4 or p_from=p_to then
    raise exception 'Choose two different rods on the board.';
  end if;
  source:=rods->p_from; target:=rods->p_to; height:=jsonb_array_length(source);
  if height=0 then raise exception 'That rod has no beads to move.'; end if;
  if jsonb_array_length(target)>=capacity then raise exception 'That rod is full. Each rod holds % beads.',capacity; end if;
  colour:=source->(height-1);
  if p_reverse then
    if height>1 and source->(height-2)<>colour then raise exception 'The reverse puzzle move cannot be undone legally.'; end if;
  elsif jsonb_array_length(target)>0 and target->(jsonb_array_length(target)-1)<>colour then
    raise exception 'Move onto an empty rod or a bead of the same colour.';
  end if;
  rods:=jsonb_set(rods,array[p_from::text],source-(height-1));
  return jsonb_set(rods,array[p_to::text],target||jsonb_build_array(colour));
end $$;
create or replace function private.ring_progress(rods jsonb) returns integer
language sql immutable set search_path='' as $$
  select count(*)::integer from jsonb_array_elements(rods) rod where
    jsonb_array_length(rod)=greatest(5,(select sum(jsonb_array_length(r))::integer/4 from jsonb_array_elements(rods) r)) and
    not exists(select 1 from jsonb_array_elements(rod) bead where bead<>rod->0)
$$;
create or replace function private.new_ring_puzzle() returns jsonb
language plpgsql set search_path='' as $$
declare colours integer[]; positions integer[]; rods jsonb:='[[],[],[],[],[]]'; plan jsonb:='[]';
  pairs integer[][]:=array[[1,2],[3,4],[1,3],[2,4],[1,2],[3,4]];
  phase integer; count_to_move integer; leg integer; i integer; a integer; b integer; source integer; target integer;
begin
  select array_agg(n order by random()) into colours from generate_series(0,3) n;
  select array_agg(n order by random()) into positions from generate_series(0,4) n;
  for i in 1..4 loop
    rods:=jsonb_set(rods,array[positions[i]::text],to_jsonb(array_fill(colours[i],array[10])));
  end loop;
  for phase in 1..6 loop
    a:=positions[pairs[phase][1]]; b:=positions[pairs[phase][2]];
    count_to_move:=case when phase<=2 then 7+floor(random()*2)::integer when phase<=4 then 4 else 1 end;
    for leg in 1..3 loop
      source:=case leg when 1 then a when 2 then b else positions[5] end;
      target:=case leg when 1 then positions[5] when 2 then a else b end;
      for i in 1..count_to_move loop
        rods:=private.shift_ring(rods,source,target,true);
        plan:=jsonb_build_array(target*5+source)||plan;
      end loop;
    end loop;
  end loop;
  if private.ring_progress(rods)=4 then raise exception 'The bead puzzle did not shuffle.'; end if;
  return jsonb_build_object('initial',rods,'solution',plan);
end $$;
revoke all on function private.shift_ring(jsonb,integer,integer,boolean),private.ring_progress(jsonb),private.new_ring_puzzle() from public,anon,authenticated;
