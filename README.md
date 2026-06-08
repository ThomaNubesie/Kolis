# Kolis

Intercity **package delivery** app. Parcels ride with a driver already heading to
your city — on the **LoadQ** driver network. Part of the Concord Express network
(ConcordXpress · Kolis · LoadQ). Site: [kolis.ca](https://kolis.ca).

Expo + expo-router + Supabase (mirrors the LoadQ app). Light theme, magenta brand.

## How it works
- **Door-to-door** → sender is *matched* with a driver (door pickup + delivery).
- **LoadQ zone** → sender drops at a loading zone; the platform *delegates* a queued driver (cheapest).
- **Sender masked from drivers** (anti-disintermediation): a driver never sees the
  sender's name/number. Enforced at the data layer via `parcels_for_drivers`
  (PII-free view) + RLS, not just the UI. Delivery handoff uses a 4-digit code.

## Structure
```
app/
  _layout.tsx            root (lang init + stack)
  index.tsx              session gate → app or auth
  (auth)/                language · sign-in (phone) · otp
  (app)/                 tabs: send · shipments · profile
services/                supabase · auth
constants/               colors · i18n (EN/FR) · pricing
hooks/                   useStrings
supabase/migrations/     parcels schema (+ PII-free driver view)
```

## Run
1. `npm install`
2. Copy `.env.example` → `.env` and set your Supabase URL + anon key
   (a dedicated Kolis Supabase project, or the shared LoadQ project).
3. Apply `supabase/migrations/*` to that project.
4. `npm start` (Expo). Builds via EAS (`eas build`).

## Status
Milestone 1 — boots through language → sign-in → OTP into the tabbed app with a
working **Send a parcel** screen. Next: pickup-zone picker, confirm/pay (escrow),
shipments list, live tracking, and the LoadQ driver side (accept/carry/deliver).

Branded `assets/` (icon, splash, adaptive-icon) still to be added.
