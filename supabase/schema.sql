-- ============================================================
-- Vigil — Supabase Schema
-- Run this in the Supabase SQL editor to initialise the database
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Organizations (one per company, linked to Clerk org ID)
create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  clerk_org_id text unique not null,
  name text not null,
  created_at timestamptz default now()
);

-- Profiles (one per user, linked to Clerk user ID)
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  clerk_user_id text unique not null,
  org_id text not null,            -- Clerk org ID for easy join
  full_name text,
  email text,
  role text default 'member',      -- 'admin' | 'member'
  department text,
  created_at timestamptz default now()
);

-- Items (the main log table — all purchases/contracts/assets land here)
create table if not exists items (
  id uuid primary key default uuid_generate_v4(),
  org_id text not null,            -- Clerk org ID
  created_by text,                 -- Clerk user ID
  name text not null,
  type text not null check (type in ('asset', 'software', 'subscription', 'contract', 'employee', 'milestone')),
  department text not null check (department in ('it', 'contracts', 'hr', 'operations')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled', 'archived')),

  -- Financial
  purchase_price numeric(12, 2),
  currency text default 'GBP',
  billing_cycle text check (billing_cycle in ('one_off', 'monthly', 'annual')),

  -- Dates
  purchase_date date,
  start_date date,
  expiry_date date,
  renewal_date date,

  -- Vendor / assignment
  vendor text,
  assigned_to_name text,
  assigned_to_profile_id uuid references profiles(id) on delete set null,

  -- AI metadata
  metadata jsonb default '{}',
  raw_log text,
  confidence text check (confidence in ('high', 'medium', 'low')),
  needs_review boolean default false,

  -- AI enrichment (Classification Agent — Day 2)
  inferred_warranty_months integer,
  suggested_refresh_cycle integer,
  duplicate_risk boolean default false,
  vendor_category text,
  total_cost_projection numeric(12, 2),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Reminders (one row per scheduled reminder, read by Trigger.dev)
create table if not exists reminders (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  org_id text not null,
  type text not null check (type in ('expiry_warning', 'renewal_warning', 'roi_checkin', 'anniversary', 'custom')),
  message text not null,
  days_before integer,
  fire_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Notifications (audit trail of every notification sent)
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  reminder_id uuid references reminders(id) on delete set null,
  org_id text not null,
  recipient_email text,
  subject text,
  body text,
  sent_at timestamptz default now(),
  resend_message_id text
);

-- ============================================================
-- EXTENSION TABLES
-- ============================================================

-- IT: Assets with serial numbers and warranty
create table if not exists assets (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  serial_number text,
  model text,
  manufacturer text,
  condition text check (condition in ('new', 'good', 'fair', 'poor')),
  warranty_months integer,
  warranty_expiry date
);

-- IT: Asset assignments (who has which device)
create table if not exists asset_assignments (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  assigned_name text,
  assigned_at timestamptz default now(),
  returned_at timestamptz
);

-- Contracts: Extended contract details
create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  annual_value numeric(12, 2),
  notice_period_days integer,
  auto_renews boolean default false,
  signatory text,
  document_url text
);

-- HR: Employee records
create table if not exists employees (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references items(id) on delete cascade,
  job_title text,
  employment_type text check (employment_type in ('full_time', 'part_time', 'contractor', 'intern')),
  probation_end date,
  manager_name text,
  start_date date
);

-- HR: Equipment issued to employees
create table if not exists employee_equipment (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  issued_at timestamptz default now(),
  returned_at timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists items_org_id_idx on items(org_id);
create index if not exists items_department_idx on items(department);
create index if not exists items_type_idx on items(type);
create index if not exists items_status_idx on items(status);
create index if not exists items_expiry_date_idx on items(expiry_date);
create index if not exists items_renewal_date_idx on items(renewal_date);
create index if not exists reminders_org_id_idx on reminders(org_id);
create index if not exists reminders_fire_at_idx on reminders(fire_at);
create index if not exists reminders_status_idx on reminders(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table items enable row level security;
alter table reminders enable row level security;
alter table notifications enable row level security;
alter table assets enable row level security;
alter table asset_assignments enable row level security;
alter table contracts enable row level security;
alter table employees enable row level security;
alter table employee_equipment enable row level security;

-- RLS Policies: users can only see their org's data
-- NOTE: org_id comes from the Clerk JWT. The service role bypasses RLS.

-- Items
create policy "Users see their org items"
  on items for select
  using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));

create policy "Users insert their org items"
  on items for insert
  with check (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));

-- Reminders
create policy "Users see their org reminders"
  on reminders for select
  using (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id'));

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger items_updated_at
  before update on items
  for each row execute function update_updated_at();
