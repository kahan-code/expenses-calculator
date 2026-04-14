create extension if not exists "pgcrypto";

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  return_amount numeric(12, 2) check (return_amount is null or return_amount >= 0),
  return_person text,
  return_received boolean not null default false,
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_set_updated_at on public.expenses;

create trigger expenses_set_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

create index if not exists expenses_spent_at_idx on public.expenses (spent_at desc);
