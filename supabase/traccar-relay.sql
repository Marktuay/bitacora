create table public.km_traccar_relay_jobs (
 id text primary key check (length(id)=64),
 operation text not null check (operation in ('position','device','route','summary')),
 payload jsonb not null,
 status text not null default 'queued' check (status in ('queued','processing','done')),
 response jsonb,
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 lease_until timestamptz,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index km_traccar_relay_pending on public.km_traccar_relay_jobs (available_at,created_at) where status <> 'done';
create index km_traccar_relay_expiry on public.km_traccar_relay_jobs (expires_at);
alter table public.km_traccar_relay_jobs enable row level security;
revoke all on public.km_traccar_relay_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.km_traccar_relay_jobs to service_role;

create table public.km_traccar_relay_status (
 id text primary key check (id='pilot'),
 last_seen timestamptz not null,
 traccar_online boolean not null,
 version text not null
);
alter table public.km_traccar_relay_status enable row level security;
revoke all on public.km_traccar_relay_status from public,anon,authenticated;
grant select,insert,update on public.km_traccar_relay_status to service_role;

create function public.km_claim_traccar_relay_jobs(p_limit integer default 30)
returns setof public.km_traccar_relay_jobs
language sql security invoker set search_path = '' as $$
 update public.km_traccar_relay_jobs j
 set status='processing', lease_until=now()+interval '45 seconds', attempts=j.attempts+1
 where j.id in (
  select q.id from public.km_traccar_relay_jobs q
  where q.expires_at>now() and q.available_at<=now()
    and (q.status='queued' or q.status='processing' and q.lease_until<now())
  order by q.available_at,q.created_at
  for update skip locked limit greatest(1,least(p_limit,100))
 ) returning j.*
$$;
revoke all on function public.km_claim_traccar_relay_jobs(integer) from public,anon,authenticated;
grant execute on function public.km_claim_traccar_relay_jobs(integer) to service_role;
