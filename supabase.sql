-- Uruchom raz w Supabase: SQL Editor → wklej → Run.
-- Potem: Authentication → URL Configuration → Site URL = adres z Vercela (np. https://ukladacz.vercel.app).
-- Dostęp mają tylko e-maile z tabeli editors — dopisuj je tak:
--   insert into public.editors (email) values ('ktos@example.com');

create table public.dyzury (
  id int primary key default 1 check (id = 1), -- jeden wspólny grafik
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.editors (email text primary key);

alter table public.dyzury enable row level security;
alter table public.editors enable row level security; -- bez polityk: niewidoczna z aplikacji

create function public.is_editor() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.editors where lower(email) = lower(auth.jwt() ->> 'email')) $$;
revoke execute on function public.is_editor() from public, anon;
grant execute on function public.is_editor() to authenticated;

create policy "tylko editors" on public.dyzury for all to authenticated
  using (public.is_editor()) with check (public.is_editor());
