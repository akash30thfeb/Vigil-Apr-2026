-- Add full_name to employees extension table
alter table employees add column if not exists full_name text;
