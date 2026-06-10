-- Sender shipping form (security + insurance). recipient_name/recipient_phone/
-- dropoff_addr already exist; add the rest.
alter table public.kolis_parcels
  add column if not exists recipient_email      text,
  add column if not exists contents_description text,
  add column if not exists declared_value_cents integer,
  add column if not exists insured              boolean not null default false,
  add column if not exists terms_accepted_at    timestamptz;
