-- Run after migration eleven, Edge Function deployment and private.push_settings configuration.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule('crack-the-code-turn-push', '* * * * *', $$
  select private.request_turn_push();
  delete from private.turn_push_events where created_at<now()-interval '7 days';
$$);
