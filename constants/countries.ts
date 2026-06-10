// Concord network countries + phone rules (shared shape with ConcordXpress).
import { CountryCode, CurrencyCode } from "./currency";

export type Country = { code: CountryCode; name: string; flag: string; currency: CurrencyCode; dial: string };

export const COUNTRIES: Country[] = [
  { code: 'CA', name: 'Canada',          flag: '🇨🇦', currency: 'CAD', dial: '+1'   },
  { code: 'US', name: 'USA',             flag: '🇺🇸', currency: 'USD', dial: '+1'   },
  { code: 'FR', name: 'France',          flag: '🇫🇷', currency: 'EUR', dial: '+33'  },
  { code: 'UK', name: 'United Kingdom',  flag: '🇬🇧', currency: 'GBP', dial: '+44'  },
  { code: 'SN', name: 'Sénégal',         flag: '🇸🇳', currency: 'XOF', dial: '+221' },
  { code: 'CI', name: "Côte d'Ivoire",   flag: '🇨🇮', currency: 'XOF', dial: '+225' },
  { code: 'GH', name: 'Ghana',           flag: '🇬🇭', currency: 'GHS', dial: '+233' },
  { code: 'NG', name: 'Nigeria',         flag: '🇳🇬', currency: 'NGN', dial: '+234' },
  { code: 'CM', name: 'Cameroun',        flag: '🇨🇲', currency: 'XAF', dial: '+237' },
  { code: 'KE', name: 'Kenya',           flag: '🇰🇪', currency: 'KES', dial: '+254' },
  { code: 'RW', name: 'Rwanda',          flag: '🇷🇼', currency: 'RWF', dial: '+250' },
  { code: 'MA', name: 'Maroc',           flag: '🇲🇦', currency: 'MAD', dial: '+212' },
];

export const PHONE_RULES: Record<string, { digits: number; placeholder: string; regex: RegExp }> = {
  CA: { digits:10, placeholder:'(613) 555-0192', regex:/^[2-9]\d{9}$/ },
  US: { digits:10, placeholder:'(555) 555-0192', regex:/^[2-9]\d{9}$/ },
  FR: { digits:9,  placeholder:'6 12 34 56 78',  regex:/^\d{9}$/ },
  UK: { digits:10, placeholder:'7400 123456',    regex:/^\d{10}$/ },
  SN: { digits:9,  placeholder:'77 123 45 67',   regex:/^\d{9}$/ },
  CI: { digits:10, placeholder:'07 12 34 56 78', regex:/^\d{8,10}$/ },
  GH: { digits:9,  placeholder:'24 123 4567',    regex:/^\d{9}$/ },
  NG: { digits:10, placeholder:'801 234 5678',   regex:/^\d{10}$/ },
  CM: { digits:9,  placeholder:'6 71 23 45 67',  regex:/^\d{9}$/ },
  KE: { digits:9,  placeholder:'712 345678',     regex:/^\d{9}$/ },
  RW: { digits:9,  placeholder:'72 123 4567',    regex:/^\d{9}$/ },
  MA: { digits:9,  placeholder:'6 12 34 56 78',  regex:/^\d{9}$/ },
};

export function countryByCode(code?: string | null): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}
