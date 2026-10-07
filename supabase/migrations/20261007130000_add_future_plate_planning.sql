drop policy if exists daily_plates_public_today_read on public.daily_plates;
create policy daily_plates_public_today_and_tomorrow_read
on public.daily_plates
for select
to anon
using (
  service_date between (now() at time zone 'Africa/Johannesburg')::date
    and ((now() at time zone 'Africa/Johannesburg')::date + 1)
);

drop policy if exists plates_public_today_read on public.plates;
create policy plates_public_today_and_tomorrow_read
on public.plates
for select
to anon
using (
  exists (
    select 1
    from public.daily_plates
    where daily_plates.plate_id = plates.id
      and daily_plates.service_date between
        (now() at time zone 'Africa/Johannesburg')::date
        and ((now() at time zone 'Africa/Johannesburg')::date + 1)
  )
);

drop policy if exists daily_plates_owner_insert on public.daily_plates;
create policy daily_plates_owner_insert
on public.daily_plates
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date between (now() at time zone 'Africa/Johannesburg')::date
    and ((now() at time zone 'Africa/Johannesburg')::date + 365)
);

drop policy if exists daily_plates_owner_update on public.daily_plates;
create policy daily_plates_owner_update
on public.daily_plates
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date between (now() at time zone 'Africa/Johannesburg')::date
    and ((now() at time zone 'Africa/Johannesburg')::date + 365)
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date between (now() at time zone 'Africa/Johannesburg')::date
    and ((now() at time zone 'Africa/Johannesburg')::date + 365)
);
