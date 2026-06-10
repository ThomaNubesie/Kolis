// Multi-country tax for Kolis. Canada is taxed by PROVINCE (HST/GST/QST); every
// other country uses a single national VAT/sales-tax rate. Rates are decimals.
export const PROVINCE_TAX: Record<string, number> = {
  ON: 0.13, QC: 0.14975,
  NB: 0.15, NL: 0.15, NS: 0.15, PE: 0.15,
  BC: 0.12, MB: 0.12, SK: 0.11,
  AB: 0.05, NT: 0.05, NU: 0.05, YT: 0.05,
};
export const DEFAULT_PROVINCE = 'ON';

// National VAT / sales tax by country code (Canada handled per-province above).
export const COUNTRY_VAT: Record<string, number> = {
  CA: 0.13,    // fallback if no province
  US: 0,       // state sales tax varies; 0 for now
  FR: 0.20, UK: 0.20, MA: 0.20,
  SN: 0.18, CI: 0.18, RW: 0.18,
  KE: 0.16, GH: 0.15,
  CM: 0.1925,  // Cameroon VAT 19.25%
  NG: 0.075,   // Nigeria VAT 7.5%
};

const POSTAL_PREFIX_PROVINCE: Record<string, string> = {
  A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC',
  K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON',
  R: 'MB', S: 'SK', T: 'AB', V: 'BC', X: 'NT', Y: 'YT',
};

export function provinceFromPostal(postal?: string | null): string | null {
  if (!postal) return null;
  return POSTAL_PREFIX_PROVINCE[postal.trim().charAt(0).toUpperCase()] ?? null;
}

// Tax rate for a country (+ province when Canada).
export function taxRateFor(country?: string | null, province?: string | null): number {
  if (country === 'CA') {
    const p = (province || DEFAULT_PROVINCE).toUpperCase();
    return PROVINCE_TAX[p] ?? PROVINCE_TAX[DEFAULT_PROVINCE];
  }
  return COUNTRY_VAT[String(country || '').toUpperCase()] ?? 0;
}

// Short label for the tax line, e.g. "HST (ON · 13%)" or "VAT (19.25%)".
export function taxLabel(country?: string | null, province?: string | null): string {
  const rate = taxRateFor(country, province);
  const pct = Math.round(rate * 10000) / 100;
  if (country === 'CA') return `Tax (${(province || DEFAULT_PROVINCE).toUpperCase()} · ${pct}%)`;
  return `VAT (${pct}%)`;
}

export function money(n: number): number { return Math.round(n * 100) / 100; }
