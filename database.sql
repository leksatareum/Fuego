-- ═══════════════════════════════════════════════════════════════════
-- COOK'OS — Setup Supabase
-- Colle ce SQL dans Supabase > SQL Editor > New Query > Run
-- ═══════════════════════════════════════════════════════════════════

-- 1. TABLE RESTAURANT (paramètres généraux)
create table if not exists restaurant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  siret text,
  created_at timestamptz default now()
);

-- 2. USERS (équipe)
create table if not exists users (
  id serial primary key,
  name text not null,
  initials text not null,
  role text not null,
  pin text not null,
  is_admin boolean default false,
  color text default '#6B6862',
  created_at timestamptz default now()
);

-- 3. HACCP SETTINGS
create table if not exists haccp_settings (
  id serial primary key,
  cooling_max integer default 120,
  reheat_min integer default 63,
  reheat_max_time integer default 60,
  oil_polar_max integer default 25,
  test_meal_days integer default 3,
  label_dlc_default integer default 3
);

-- 4. FRIDGE TARGETS (enceintes froides)
create table if not exists fridge_targets (
  id serial primary key,
  name text not null,
  icon text,
  target text not null,
  type text default 'positif',
  sort_order integer default 0
);

-- 5. FRIDGE RELEVES (relevés températures)
create table if not exists fridge_releves (
  id bigserial primary key,
  fridge_id integer references fridge_targets(id),
  date text not null,
  period text not null check (period in ('matin','soir')),
  temp integer not null,
  time text not null,
  operator_id integer references users(id),
  created_at timestamptz default now()
);

-- 6. RECEPTION
create table if not exists reception (
  id bigserial primary key,
  date text not null,
  supplier text,
  product text not null,
  qty text,
  temp numeric,
  temp_ok boolean default true,
  dlc text,
  lot text,
  aspect text default 'OK',
  emballage text default 'OK',
  signed text,
  created_at timestamptz default now()
);

-- 7. COOLING (refroidissement)
create table if not exists cooling (
  id bigserial primary key,
  product text not null,
  qty text,
  start_temp numeric,
  end_temp numeric,
  duration integer,
  started_ms bigint,
  operator text,
  status text default 'active',
  date text,
  dlc text,
  created_at timestamptz default now()
);

-- 8. REHEATING (remise en température)
create table if not exists reheating (
  id bigserial primary key,
  product text not null,
  end_temp numeric,
  duration integer,
  operator text,
  status text default 'ok',
  date text,
  created_at timestamptz default now()
);

-- 9. OILS (huiles de friture)
create table if not exists oils (
  id serial primary key,
  name text not null,
  type text,
  date_install text,
  last_test text,
  polaires numeric default 0,
  operator text,
  created_at timestamptz default now()
);

-- 10. CLEANING (nettoyage)
create table if not exists cleaning (
  id serial primary key,
  zone text not null,
  icon text,
  freq text,
  produit text,
  dilution text,
  done boolean default false,
  done_by text,
  done_at timestamptz,
  sort_order integer default 0
);

-- 11. TRACEABILITY
create table if not exists traceability (
  id bigserial primary key,
  product text not null,
  emoji text default '📦',
  supplier text,
  lot text,
  dlc text,
  qty text,
  allergenes jsonb default '[]',
  status text default 'ok',
  created_at timestamptz default now()
);

-- 12. LABELS
create table if not exists labels (
  id bigserial primary key,
  product text not null,
  date_prod text,
  dlc text,
  lot text,
  allergens text,
  operator text,
  qty text,
  created_at timestamptz default now()
);

-- 13. TEST MEALS (plats témoins)
create table if not exists test_meals (
  id bigserial primary key,
  date text,
  service text,
  product text not null,
  qty text,
  destroy_at text,
  operator text,
  created_at timestamptz default now()
);

-- 14. TRAINING (formations)
create table if not exists training (
  id serial primary key,
  name text not null,
  role text,
  haccp_exp text,
  visa_exp text
);

-- 15. PESTS (nuisibles)
create table if not exists pests (
  id bigserial primary key,
  date text,
  type text,
  company text,
  result text default 'RAS',
  next_visit text,
  created_at timestamptz default now()
);

-- 16. RECIPES
create table if not exists recipes (
  id serial primary key,
  name text not null,
  emoji text default '🍽️',
  type text default 'plat',
  category text,
  price numeric,
  portions integer default 1,
  yield_qty numeric,
  yield_unit text,
  components jsonb default '[]',
  steps jsonb default '[]',
  allergens jsonb default '[]',
  created_at timestamptz default now()
);

-- 17. TASK CATEGORIES
create table if not exists task_categories (
  id serial primary key,
  name text not null,
  icon text default '📋',
  color text default '#5A8FB5',
  sort_order integer default 0
);

-- 18. TASKS
create table if not exists tasks (
  id bigserial primary key,
  category_id integer references task_categories(id),
  task text not null,
  resp text,
  qty text,
  done boolean default false,
  prio text default 'med',
  date text,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════
-- DONNÉES INITIALES (à adapter avec tes vraies infos)
-- ═══════════════════════════════════════════════════════════════════

insert into restaurant (name, address, phone, siret) values
('Ô Grain de Sable', '123 Boulevard de la Mer, 34000 Montpellier', '04 67 00 00 00', '123 456 789 00012');

insert into users (name, initials, role, pin, is_admin, color) values
('Lucas Martin', 'LM', 'Chef de cuisine', '1234', true,  '#B8503F'),
('Marie Dubois',  'MD', 'Chef de partie',  '5678', true,  '#A05030'),
('Théo Blanc',    'TB', 'Commis',          '9999', false, '#6B6862'),
('Sarah Petit',   'SP', 'Plonge',          '1111', false, '#6B6862'),
('Alex Torres',   'AT', 'Service',         '2222', false, '#6B6862');

insert into haccp_settings (cooling_max, reheat_min, reheat_max_time, oil_polar_max, test_meal_days, label_dlc_default)
values (120, 63, 60, 25, 3, 3);

insert into fridge_targets (name, icon, target, type, sort_order) values
('Frigo Entrées',    '🥗', '0–4', 'positif', 1),
('Frigo Viandes',    '🥩', '0–4', 'positif', 2),
('Frigo Poissons',   '🐟', '0–2', 'positif', 3),
('Congélateur',      '❄️', '-18', 'negatif', 4),
('Vitrine Desserts', '🍰', '0–4', 'positif', 5);

insert into oils (name, type, date_install, last_test, polaires) values
('Friteuse 1 — Frites',  'Tournesol', '05/05', '10/05', 18),
('Friteuse 2 — Poisson', 'Arachide',  '03/05', '10/05', 23);

insert into cleaning (zone, icon, freq, produit, dilution, done, sort_order) values
('Cuisine chaude',        '🔥', 'Quotidien',    'Dégraissant Pro',      '1:10',  false, 1),
('Plan de travail froid', '❄️', 'Quotidien',    'Désinfectant alim.',   '1:50',  false, 2),
('Sol cuisine',           '🧹', 'Quotidien',    'Détergent sol',        '1:20',  false, 3),
('Chambre froide',        '🥶', 'Hebdomadaire', 'Désinfectant Pro',     '1:30',  false, 4),
('Hotte et Filtres',      '💨', 'Mensuel',      'Dégraissant puissant', 'Pur',   false, 5),
('Salle et Tables',       '🪑', 'Quotidien',    'Désinfectant surface', '1:100', false, 6),
('Trancheuse',            '🔪', 'Après usage',  'Désinfectant alim.',   '1:50',  false, 7),
('Friteuse',              '🍟', 'Hebdomadaire', 'Dégraissant friteuse', 'Pur',   false, 8);

insert into training (name, role, haccp_exp, visa_exp) values
('Lucas Martin', 'Chef de cuisine', '15/03/2027', '02/01/2027'),
('Marie Dubois',  'Chef de partie',  '20/01/2027', '05/02/2027'),
('Théo Blanc',    'Commis',          '10/04/2026', '15/04/2026');

insert into task_categories (name, icon, color, sort_order) values
('Mise en place froid', '❄️', '#5A8FB5', 1),
('Mise en place chaud', '🔥', '#D49340', 2),
('Pâtisserie',          '🍰', '#C97FA8', 3),
('Boulangerie',         '🥖', '#C9A862', 4);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (désactivé pour le test, à activer en prod)
-- ═══════════════════════════════════════════════════════════════════
-- Pour l'instant toutes les tables sont accessibles sans auth.
-- Quand tu passes en production multi-user, activer RLS ici.

alter table fridge_releves enable row level security;
create policy "allow all" on fridge_releves for all using (true);

alter table reception enable row level security;
create policy "allow all" on reception for all using (true);

alter table cooling enable row level security;
create policy "allow all" on cooling for all using (true);

alter table reheating enable row level security;
create policy "allow all" on reheating for all using (true);

alter table cleaning enable row level security;
create policy "allow all" on cleaning for all using (true);

alter table traceability enable row level security;
create policy "allow all" on traceability for all using (true);

alter table labels enable row level security;
create policy "allow all" on labels for all using (true);

alter table test_meals enable row level security;
create policy "allow all" on test_meals for all using (true);

alter table pests enable row level security;
create policy "allow all" on pests for all using (true);

alter table tasks enable row level security;
create policy "allow all" on tasks for all using (true);

alter table oils enable row level security;
create policy "allow all" on oils for all using (true);

alter table recipes enable row level security;
create policy "allow all" on recipes for all using (true);

-- ═══════════════════════════════════════════════════════════════════
-- COOK'OS CAISSE — Tables supplémentaires
-- Ajouter à la suite du SQL existant
-- ═══════════════════════════════════════════════════════════════════

-- Tables du restaurant
create table if not exists restaurant_tables (
  id serial primary key,
  number integer not null unique,
  label text,           -- ex: "Terrasse 1" optionnel
  capacity integer default 4,
  status text default 'free', -- free | occupied | bill_requested
  current_order_id bigint,
  updated_at timestamptz default now()
);

-- Commandes (une par table par service)
create table if not exists orders (
  id bigserial primary key,
  table_id integer references restaurant_tables(id),
  table_number integer,
  covers integer default 1,
  status text default 'open', -- open | sent | paid
  payment_method text,        -- cb | cash | ticket_resto | cheque
  total numeric default 0,
  note text,
  opened_by text,
  opened_at timestamptz default now(),
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- Lignes de commande
create table if not exists order_items (
  id bigserial primary key,
  order_id bigint references orders(id) on delete cascade,
  recipe_id integer,
  name text not null,
  price numeric not null,
  qty integer default 1,
  course text default 'plat', -- entree | plat | dessert | boisson
  status text default 'pending', -- pending | sent | done
  note text,
  created_at timestamptz default now()
);

-- Tickets imprimés (log)
create table if not exists print_jobs (
  id bigserial primary key,
  order_id bigint references orders(id),
  type text default 'kitchen', -- kitchen | bill
  content text,
  printed_at timestamptz default now()
);

-- RLS
alter table restaurant_tables enable row level security;
create policy "allow all" on restaurant_tables for all using (true);
alter table orders enable row level security;
create policy "allow all" on orders for all using (true);
alter table order_items enable row level security;
create policy "allow all" on order_items for all using (true);
alter table print_jobs enable row level security;
create policy "allow all" on print_jobs for all using (true);

-- Tables de démonstration (à adapter)
insert into restaurant_tables (number, capacity) values
(1,2),(2,2),(3,4),(4,4),(5,4),(6,6),(7,6),(8,8),(9,2),(10,4),
(11,4),(12,6),(13,2),(14,4),(15,4)
on conflict (number) do nothing;
