-- ============================================================
-- Vigil — Demo Seed Data
-- Run AFTER schema.sql + all migrations
-- Replace 'demo' with your actual Clerk org ID before running
-- ============================================================

do $$
declare
  today date := current_date;
  org text := 'demo';

  salesforce_id uuid;
  dell_id uuid;
  figma_id uuid;
  iphone_id uuid;
  james_id uuid;
begin

  -- ============================================================
  -- 1. Salesforce CRM contract — expiring in 7 days
  -- ============================================================
  insert into items (
    id, org_id, name, type, department, status, key_date,
    purchase_price, currency, billing_cycle,
    renewal_date, vendor, confidence, needs_review, raw_log
  ) values (
    uuid_generate_v4(), org,
    'Salesforce CRM', 'contract', 'contracts', 'active',
    today + 7,  -- key_date = renewal_date
    42000, 'GBP', 'annual',
    today + 7, 'Salesforce', 'high', false,
    'Salesforce CRM contract, £42k annual, renews in 7 days'
  ) returning id into salesforce_id;

  insert into reminders (item_id, org_id, type, message, days_before, fire_at, status) values
    (salesforce_id, org, 'renewal_warning',
     'Salesforce CRM renews in 7 days — £42,000. Approve renewal or start vendor review.',
     7, now() + interval '1 day', 'scheduled'),
    (salesforce_id, org, 'renewal_warning',
     'Salesforce CRM renews in 30 days — time to review the contract.',
     30, now() - interval '23 days', 'sent'),
    (salesforce_id, org, 'renewal_warning',
     'Salesforce CRM renews in 60 days — flag for finance sign-off.',
     60, now() - interval '53 days', 'sent');

  insert into contracts (item_id, annual_value, notice_period_days, auto_renews, signatory)
  values (salesforce_id, 42000, 30, true, 'James Okafor');

  -- ============================================================
  -- 2. Dell PowerEdge Server warranty — expiring in 30 days
  -- ============================================================
  insert into items (
    id, org_id, name, type, department, status, key_date,
    purchase_price, currency, billing_cycle,
    purchase_date, expiry_date, vendor, confidence, needs_review, raw_log,
    metadata
  ) values (
    uuid_generate_v4(), org,
    'Dell PowerEdge R750 Server', 'asset', 'it', 'active',
    today + 30,  -- key_date = warranty expiry
    8500, 'GBP', 'one_off',
    today - 1065,
    today + 30,
    'Dell', 'high', false,
    'Dell PowerEdge R750 server, £8,500, 3 year warranty',
    '{"serial_number": "DL-R750-09341", "warranty_months": 36, "condition": "good"}'
  ) returning id into dell_id;

  insert into reminders (item_id, org_id, type, message, days_before, fire_at, status) values
    (dell_id, org, 'expiry_warning',
     'Dell PowerEdge server warranty expires in 30 days. Consider extended warranty or replacement plan.',
     30, now() + interval '1 day', 'scheduled');

  insert into assets (item_id, serial_number, model, manufacturer, condition, warranty_months, warranty_expiry)
  values (dell_id, 'DL-R750-09341', 'PowerEdge R750', 'Dell', 'good', 36, today + 30);

  -- ============================================================
  -- 3. Figma Organisation licence — renews in 180 days
  -- ============================================================
  insert into items (
    id, org_id, name, type, department, status, key_date,
    purchase_price, currency, billing_cycle,
    renewal_date, vendor, confidence, needs_review, raw_log,
    metadata
  ) values (
    uuid_generate_v4(), org,
    'Figma Organisation', 'subscription', 'contracts', 'active',
    today + 180,  -- key_date = renewal_date
    4800, 'GBP', 'annual',
    today + 180,
    'Figma', 'high', false,
    'Figma Organisation licence, £4,800/year',
    '{"seats": 12, "plan_name": "Organisation", "auto_renews": true}'
  ) returning id into figma_id;

  insert into reminders (item_id, org_id, type, message, days_before, fire_at, status) values
    (figma_id, org, 'renewal_warning',
     'Figma Organisation renews in 7 days — £4,800. All good to auto-renew?',
     7, (today + 180 - 7)::timestamptz, 'scheduled'),
    (figma_id, org, 'roi_checkin',
     '3-month check-in: Is the Figma licence being fully used across the team?',
     null, now() + interval '90 days', 'scheduled');

  -- ============================================================
  -- 4. iPhone 14 Pro — Sarah Chen — warranty expired 15 days ago
  -- ============================================================
  insert into items (
    id, org_id, name, type, department, status, key_date,
    purchase_price, currency, billing_cycle,
    purchase_date, expiry_date,
    assigned_to_name, vendor, confidence, needs_review, raw_log,
    metadata
  ) values (
    uuid_generate_v4(), org,
    'iPhone 14 Pro — Sarah Chen', 'asset', 'it', 'active',
    today - 15,  -- key_date = warranty expiry (expired)
    1100, 'GBP', 'one_off',
    today - 380,
    today - 15,
    'Sarah Chen',
    'Apple', 'high', false,
    'iPhone 14 Pro for Sarah Chen, £1,100, 1 year warranty',
    '{"serial_number": "IP14-SC-8821", "warranty_months": 12, "condition": "good"}'
  ) returning id into iphone_id;

  insert into reminders (item_id, org_id, type, message, days_before, fire_at, status) values
    (iphone_id, org, 'expiry_warning',
     'Sarah Chen''s iPhone 14 Pro warranty has expired. Consider AppleCare or replacement.',
     0, now() - interval '15 days', 'sent');

  insert into assets (item_id, serial_number, model, manufacturer, condition, warranty_months, warranty_expiry)
  values (iphone_id, 'IP14-SC-8821', 'iPhone 14 Pro', 'Apple', 'good', 12, today - 15);

  -- ============================================================
  -- 5. James Okafor — Engineer — probation ends in 14 days
  -- ============================================================
  insert into items (
    id, org_id, name, type, department, status, key_date,
    start_date, expiry_date,
    assigned_to_name, confidence, needs_review, raw_log,
    metadata
  ) values (
    uuid_generate_v4(), org,
    'James Okafor — Software Engineer', 'employee', 'hr', 'active',
    today + 14,  -- key_date = probation_end
    today - 76,
    today + 14,
    'James Okafor', 'high', false,
    'James Okafor joined as a software engineer, 3-month probation',
    '{"job_title": "Software Engineer", "employment_type": "full_time", "manager_name": "Sarah Chen"}'
  ) returning id into james_id;

  insert into reminders (item_id, org_id, type, message, days_before, fire_at, status) values
    (james_id, org, 'expiry_warning',
     'James Okafor''s probation ends in 14 days. Schedule a review meeting.',
     14, now() + interval '1 day', 'scheduled'),
    (james_id, org, 'anniversary',
     'James Okafor''s 1-year work anniversary is coming up.',
     null, (today - 76 + 365)::timestamptz, 'scheduled');

  -- Employee domain table (source of truth)
  insert into employees (
    item_id, employee_name, role, joining_date, employment_type,
    department, employment_status, probation_end, manager_name
  ) values (
    james_id, 'James Okafor', 'Software Engineer', today - 76,
    'full_time', 'Engineering', 'active', today + 14, 'Sarah Chen'
  );

end $$;
