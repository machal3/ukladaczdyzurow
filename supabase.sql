-- Uruchom w Supabase: SQL Editor → wklej → Run (można puścić ponownie).
-- Dostęp: PIN wpisywany w aplikacji, sprawdzany tutaj (tabele są niewidoczne z zewnątrz, tylko przez funkcje poniżej).
-- Zmiana PIN-u: update public.access set pin = '0000';

create table if not exists public.dyzury (
  id int primary key default 1 check (id = 1), -- jeden wspólny grafik
  data jsonb not null,
  updated_at timestamptz not null default now()
);
-- sprzątanie po wersji z logowaniem e-mailem (najpierw polityka, bo zależy od funkcji)
drop policy if exists "tylko editors" on public.dyzury;
drop function if exists public.is_editor();
drop table if exists public.editors;

create table if not exists public.access (pin text primary key);
insert into public.access (pin) select '1122' where not exists (select 1 from public.access);

alter table public.dyzury enable row level security; -- bez polityk: bezpośrednio niedostępne
alter table public.access enable row level security;
revoke all on public.dyzury, public.access from anon, authenticated;

-- ponytail: 4 cyfry da się zgadnąć; pg_sleep tylko spowalnia — dłuższy PIN albo limit prób w tabeli, jeśli to za mało
create or replace function public.check_pin(p text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.access where pin = p) then
    perform pg_sleep(2);
    raise exception 'Zły PIN';
  end if;
end $$;

create or replace function public.load_state(p text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_pin(p);
  return (select data from public.dyzury where id = 1);
end $$;

create or replace function public.save_state(p text, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_pin(p);
  insert into public.dyzury (id, data) values (1, d)
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

revoke execute on function public.check_pin(text), public.load_state(text), public.save_state(text, jsonb) from public;
grant execute on function public.load_state(text), public.save_state(text, jsonb) to anon;
