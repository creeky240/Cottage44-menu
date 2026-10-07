grant select, insert, update, delete
on public.plates, public.daily_plates
to authenticated;

create policy plates_owner_read
on public.plates
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy plates_owner_insert
on public.plates
for insert
to authenticated
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy plates_owner_update
on public.plates
for update
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy plates_owner_delete
on public.plates
for delete
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy daily_plates_owner_read
on public.daily_plates
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com');

create policy daily_plates_owner_insert
on public.daily_plates
for insert
to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date = (now() at time zone 'Africa/Johannesburg')::date
);

create policy daily_plates_owner_update
on public.daily_plates
for update
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date = (now() at time zone 'Africa/Johannesburg')::date
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
  and service_date = (now() at time zone 'Africa/Johannesburg')::date
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'cottage44-plates',
  'cottage44-plates',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy cottage44_plate_images_public_read
on storage.objects
for select
to public
using (bucket_id = 'cottage44-plates');

create policy cottage44_plate_images_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cottage44-plates'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
);

create policy cottage44_plate_images_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'cottage44-plates'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
)
with check (
  bucket_id = 'cottage44-plates'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
);

create policy cottage44_plate_images_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'cottage44-plates'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'corne.dawson@gmail.com'
);
