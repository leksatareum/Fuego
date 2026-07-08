-- Fuego runtime tables migration
-- Apply this after database.sql on existing Supabase projects.
-- It creates the tables that src/App.jsx reads/writes at runtime but that were
-- missing from the initial schema: app_state, products and shifts.

create table if not exists app_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create table if not exists products (
  id serial primary key,
  name text not null,
  price numeric not null default 0 check (price >= 0),
  unit text not null default 'kg',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists shifts (
  id bigserial primary key,
  user_id integer references users(id) on delete set null,
  date text not null,
  start text not null,
  "end" text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_products_name on products (name);
create index if not exists idx_shifts_date on shifts (date);
create index if not exists idx_shifts_user_date on shifts (user_id, date);

alter table app_state enable row level security;
alter table products enable row level security;
alter table shifts enable row level security;

drop policy if exists "allow all" on app_state;
drop policy if exists "allow all" on products;
drop policy if exists "allow all" on shifts;

-- Matches the current anon-key client model used by the app.
-- Tighten these policies when moving to authenticated Supabase users.
create policy "allow all" on app_state for all using (true) with check (true);
create policy "allow all" on products for all using (true) with check (true);
create policy "allow all" on shifts for all using (true) with check (true);

insert into products (name, price, unit) values
  ('Citron vert', 3.20, 'kg'),
  ('Lait de coco', 2.10, 'L'),
  ('Gingembre', 6.00, 'kg'),
  ('Coriandre', 12.00, 'kg')
on conflict do nothing;
