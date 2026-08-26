// e2e.ts — zero-knowledge client-side encryption for Quorly Files.
// PBKDF2-SHA256 (210k iterations) derives an AES-GCM-256 key from the user's vault passphrase.
// The passphrase and the derived key NEVER leave the browser; the server only ever sees ciphertext
// plus a non-secret salt and IV. Losing the passphrase = files are unrecoverable (that's the point).
const enc = new TextEncoder();
const dec = new TextDecoder();
const MARKER = "quorly-e2e-v1";
const ITERATIONS = 210000;

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function rand(n: number): Uint8Array { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
// Return a plain ArrayBuffer (a BufferSource across all TS DOM lib versions) from a Uint8Array.
function buf(u: Uint8Array): ArrayBuffer { return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer; }

export function newSalt(): string { return toB64(rand(16)); }

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", buf(enc.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(fromB64(saltB64)), iterations: ITERATIONS, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

// verifier stored server-side ("iv:cipher" of a known marker) — lets us confirm a passphrase without
// ever storing it. Decrypting it back to MARKER proves the key is correct.
export async function makeCheck(key: CryptoKey): Promise<string> {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(enc.encode(MARKER)));
  return toB64(iv) + ":" + toB64(ct);
}
export async function verifyCheck(key: CryptoKey, check: string): Promise<boolean> {
  try {
    const [ivB, ctB] = check.split(":");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(ivB)) }, key, buf(fromB64(ctB)));
    return dec.decode(pt) === MARKER;
  } catch { return false; }
}

export async function encryptBlob(key: CryptoKey, data: Blob): Promise<{ blob: Blob; iv: string }> {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, await data.arrayBuffer());
  return { blob: new Blob([ct]), iv: toB64(iv) };
}
export async function decryptToBlob(key: CryptoKey, cipher: ArrayBuffer, ivB64: string, mime?: string): Promise<Blob> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(fromB64(ivB64)) }, key, cipher);
  return new Blob([pt], mime ? { type: mime } : undefined);
}
