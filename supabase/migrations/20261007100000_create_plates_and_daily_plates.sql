create table public.plates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  price_cents integer not null check (price_cents >= 0),
  image_url text check (
    image_url is null or (
      char_length(image_url) <= 2048 and image_url ~ '^https://'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.daily_plates (
  service_date date primary key,
  plate_id uuid not null references public.plates (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index daily_plates_plate_id_idx on public.daily_plates (plate_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plates_set_updated_at
before update on public.plates
for each row
execute function public.set_updated_at();

alter table public.plates enable row level security;
alter table public.daily_plates enable row level security;

revoke all on table public.plates, public.daily_plates from anon, authenticated;
grant select on table public.plates, public.daily_plates to anon;

create policy daily_plates_public_today_read
on public.daily_plates
for select
to anon
using (
  service_date = (now() at time zone 'Africa/Johannesburg')::date
);

create policy plates_public_today_read
on public.plates
for select
to anon
using (
  exists (
    select 1
    from public.daily_plates
    where daily_plates.plate_id = plates.id
      and daily_plates.service_date =
        (now() at time zone 'Africa/Johannesburg')::date
  )
);
