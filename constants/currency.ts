// Multi-country currency for Kolis (mirrors ConcordXpress). Fees are stored in
// CAD and DISPLAYED in local currency via rateFromCAD; the actual charge is in
// CAD (Stripe card) or local (Flutterwave Mobile Money).
export type CountryCode = 'CA' | 'US' | 'FR' | 'UK' | 'SN' | 'CI' | 'GH' | 'NG' | 'CM' | 'KE' | 'RW' | 'MA';
export type CurrencyCode = 'CAD' | 'USD' | 'EUR' | 'GBP' | 'XOF' | 'GHS' | 'NGN' | 'XAF' | 'KES' | 'RWF' | 'MAD';

export interface Currency {
  code: CurrencyCode; symbol: string; name: string;
  position: 'before' | 'after'; decimals: number; rateFromCAD: number;
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  CAD: { code:'CAD', symbol:'C$', name:'Canadian Dollar',     position:'before', decimals:2, rateFromCAD:1     },
  USD: { code:'USD', symbol:'$',  name:'US Dollar',           position:'before', decimals:2, rateFromCAD:0.74  },
  EUR: { code:'EUR', symbol:'€',  name:'Euro',                position:'before', decimals:2, rateFromCAD:0.68  },
  GBP: { code:'GBP', symbol:'£',  name:'British Pound',       position:'before', decimals:2, rateFromCAD:0.58  },
  XOF: { code:'XOF', symbol:'CFA', name:'West African CFA',    position:'after',  decimals:0, rateFromCAD:447   },
  GHS: { code:'GHS', symbol:'₵',   name:'Ghanaian Cedi',       position:'before', decimals:2, rateFromCAD:11.2  },
  NGN: { code:'NGN', symbol:'₦',   name:'Nigerian Naira',      position:'before', decimals:0, rateFromCAD:1148  },
  XAF: { code:'XAF', symbol:'CFA', name:'Central African CFA', position:'after',  decimals:0, rateFromCAD:447   },
  KES: { code:'KES', symbol:'KSh', name:'Kenyan Shilling',     position:'before', decimals:0, rateFromCAD:97    },
  RWF: { code:'RWF', symbol:'RF',  name:'Rwandan Franc',       position:'before', decimals:0, rateFromCAD:1040  },
  MAD: { code:'MAD', symbol:'DH',  name:'Moroccan Dirham',     position:'after',  decimals:2, rateFromCAD:7.4   },
};

export function formatCurrency(amountCAD: number, currency: CurrencyCode): string {
  const cur = CURRENCIES[currency];
  const converted = amountCAD * cur.rateFromCAD;
  const rounded = cur.decimals === 0 ? Math.round(converted) : Math.round(converted * 100) / 100;
  const formatted = cur.decimals === 0 ? rounded.toLocaleString() : rounded.toFixed(cur.decimals);
  if (cur.position === 'before') return `${cur.symbol}${formatted}`;
  if (cur.symbol) return `${formatted} ${cur.symbol}`;
  return `${formatted} ${cur.code}`;
}

export const COUNTRY_CURRENCY: Record<CountryCode, CurrencyCode> = {
  CA: 'CAD', US: 'USD', FR: 'EUR', UK: 'GBP',
  SN: 'XOF', CI: 'XOF', GH: 'GHS', NG: 'NGN',
  CM: 'XAF', KE: 'KES', RW: 'RWF', MA: 'MAD',
};

// Kolis onboarding fees in CAD: one-time identity verification + annual membership.
export const KOLIS_FEES_CAD = {
  verifyFee:     3.99,
  membershipFee: 10.00,
};
