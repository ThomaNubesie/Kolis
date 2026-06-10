import { supabase } from "./supabase";

export type FeeQuote = {
  already_paid?: boolean;
  founding?: boolean;
  is_founding?: boolean;
  founding_number?: number | null;
  country?: string;
  role?: string;
  verify?: number;      // cents (CAD)
  membership?: number;  // cents (CAD)
  subtotal?: number;    // cents
  tax?: number;         // cents
  total?: number;       // cents
  rate?: number;
};

const call = async (body: any) => {
  const { data, error } = await supabase.functions.invoke("kolis-verification-fee", { body });
  if (error) return { error: error.message };
  return data;
};

export const VerificationAPI = {
  quote: (province?: string) => call({ action: "quote", province }) as Promise<FeeQuote & { error?: string }>,
  activateFree: () => call({ action: "activate_free" }) as Promise<{ ok?: boolean; founding?: boolean; founding_number?: number; error?: string }>,
  createIntent: (province?: string) => call({ action: "create_intent", province }) as Promise<FeeQuote & { client_secret?: string; payment_intent_id?: string; error?: string }>,
  finalize: (payment_intent_id: string) => call({ action: "finalize", payment_intent_id }) as Promise<{ ok?: boolean; error?: string }>,
};

export const ReceiptAPI = {
  async email(receipt: { receiptId: string; lines: { label: string; amount: string }[]; total: string; date: string }) {
    const { data, error } = await supabase.functions.invoke("kolis-email-receipt", { body: receipt });
    if (error) return { error: error.message };
    return data as { ok?: boolean; skipped?: boolean; error?: string };
  },
};
