import { regionCode } from "./geo";
import { supabase } from "../services/supabase";

export type SizeKey = "envelope" | "small" | "large";
export type DropType = "hub" | "zone" | "door";

// ─────────────────────────────────────────────────────────────────────────
// PRICE IS NEVER COMPUTED IN THE APP. It comes from the database RPC
// `kolis_quote` (→ kolis_estimate_price_cents), the single source of truth
// shared with the business dashboard, so the two can never drift. To change
// prices, edit the DB (see memory: kolis-pricing) — not this file.
// ─────────────────────────────────────────────────────────────────────────

// Express courier (Canada Post / UPS / FedEx) baseline — pricier AND ~2 days
// slower. Used only for the "you save vs. courier" comparison copy.
const COURIER_MULT = 1.4;
const COURIER_DAYS = 2;

// Display-only road distances (km) between region codes — used for the driver
// list's "x km" label. NOT used for pricing (the DB owns distance + price).
const ROUTE_KM: Record<string, number> = {
  "montreal-ottawa": 200, "kingston-ottawa": 195, "ottawa-toronto": 450, "gatineau-ottawa": 20,
  "ottawa-quebec": 480, "ottawa-trois-rivieres": 360, "ottawa-sherbrooke": 380,
  "chicoutimi-ottawa": 660, "moncton-ottawa": 1100,
  "montreal-quebec": 250, "montreal-trois-rivieres": 140, "montreal-toronto": 540,
  "kingston-montreal": 290, "gatineau-montreal": 200, "montreal-sherbrooke": 150,
  "chicoutimi-montreal": 460, "moncton-montreal": 1100,
  "quebec-trois-rivieres": 130, "chicoutimi-quebec": 210, "quebec-sherbrooke": 240,
  "kingston-toronto": 260,
  "ottawa-sudbury": 480, "sudbury-toronto": 390, "montreal-sudbury": 680,
  "kingston-sudbury": 530, "gatineau-sudbury": 470, "quebec-sudbury": 930,
  "sudbury-trois-rivieres": 800, "sherbrooke-sudbury": 830, "chicoutimi-sudbury": 900,
  "moncton-sudbury": 1600,
  "halifax-moncton": 260, "halifax-montreal": 1250, "halifax-ottawa": 1450, "halifax-quebec": 1050,
  "gatineau-halifax": 1450, "halifax-toronto": 1800, "halifax-kingston": 1650, "halifax-sherbrooke": 1050,
  "halifax-trois-rivieres": 1150, "chicoutimi-halifax": 1250, "halifax-sudbury": 1900,
  "arnprior-ottawa": 55, "carleton-ottawa": 50, "ottawa-renfrew": 100, "ottawa-pembroke": 150,
  "deep-ottawa": 200, "bancroft-ottawa": 230, "belleville-ottawa": 270, "north-ottawa": 360,
  "barrie-toronto": 90, "oshawa-toronto": 60, "toronto-whitby": 55, "pickering-toronto": 45,
  "ajax-toronto": 50, "markham-toronto": 35, "toronto-vaughan": 30, "brampton-toronto": 40,
  "mississauga-toronto": 30, "aurora-toronto": 50, "newmarket-toronto": 55, "richmond-toronto": 35,
  "bradford-toronto": 65, "angus-toronto": 110, "orillia-toronto": 135, "bracebridge-toronto": 180,
  "gravenhurst-toronto": 170, "elmvale-toronto": 140, "stouffville-toronto": 55,
  "peterborough-toronto": 130, "quinte-toronto": 185,
  "acton-toronto": 75, "kitchener-toronto": 110, "toronto-waterloo": 115, "cambridge-toronto": 100,
  "guelph-toronto": 100, "brantford-toronto": 110, "burlington-toronto": 60, "toronto-woodstock": 145,
  "london-toronto": 190, "sarnia-toronto": 290, "niagara-toronto": 130,
  "alma-quebec": 210, "baie-comeau-quebec": 420, "baie-saint-paul-quebec": 100, "forestville-quebec": 430,
  "laurier-station-quebec": 50, "quebec-riviere-du-loup": 200, "quebec-tadoussac": 210, "levis-quebec": 10,
  "montreal-saint-constant": 30, "longueuil-montreal": 15, "drummondville-montreal": 100,
};

export function routeKm(from: string, to: string): number {
  const a = regionCode(from), b = regionCode(to);
  if (!a || !b || a === b) return 30;
  return ROUTE_KM[[a, b].sort().join("-")] ?? 250;
}

export type Quote = { price: number; km: number; payout: number };

// Authoritative quote from the DB. price/payout are whole dollars.
export async function fetchQuote(size: SizeKey, drop: DropType, from: string, to: string): Promise<Quote> {
  const { data, error } = await supabase.rpc("kolis_quote", { p_size: size, p_drop: drop, p_from: from, p_to: to });
  if (error || !data) throw error ?? new Error("quote_failed");
  const d = data as { price_cents: number; km: number; payout_cents: number };
  return { price: Math.round(d.price_cents / 100), km: d.km ?? routeKm(from, to), payout: Math.round((d.payout_cents ?? 0) / 100) };
}

export type Comparison = {
  price: number;
  courier: number;
  saved: number;
  courierDays: number;
  hours: number;
  km: number;
  payout: number;
};

export async function compare(size: SizeKey, drop: DropType, from: string, to: string): Promise<Comparison> {
  const q = await fetchQuote(size, drop, from, to);
  const courier = Math.round(q.price * COURIER_MULT);
  return {
    price: q.price,
    courier,
    saved: Math.max(0, courier - q.price),
    courierDays: COURIER_DAYS,
    hours: 4,
    km: q.km,
    payout: q.payout,
  };
}
