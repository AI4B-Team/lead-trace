alter table public.marketplace_searches
  add column if not exists alert_threshold integer not null default 1,
  add column if not exists notify_in_app boolean not null default true,
  add column if not exists notify_email boolean not null default false,
  add column if not exists matches_found integer not null default 0,
  add column if not exists attention_note text;