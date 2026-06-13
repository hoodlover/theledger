/**
 * Lightweight auth: HMAC-signed session cookie + bcrypt password hash.
 * No external auth library — keeps middleware edge-safe (Web Crypto)
 * and lets server actions verify passwords in node runtime.
 *
 * Cookie format: `<userId>.<expiresAt>.<base64url HMAC-SHA256>`
 *   userId    — UUID
 *   expiresAt — ISO date (UTC), e.g. 2027-06-13T00:00:00Z
 *   signature — HMAC-SHA256(userId + "." + expiresAt) using SESSION_SECRET
 *
 * One year sessions by default — Lance + Heather, two people, one device
 * each. Re-issue on every authenticated request to extend.
 */

const COOKIE_NAME = "tl_session";
const ENCODER = new TextEncoder();

function getSecretBytes(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET missing or too short — set at least 32 chars in .env.local"
    );
  }
  return ENCODER.encode(s);
}

function base64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmac(payload: string): Promise<string> {
  // Copy to a fresh ArrayBuffer-backed Uint8Array so Web Crypto's BufferSource
  // overload accepts it under strict TS (some Uint8Array variants are typed
  // as ArrayBufferLike which TS narrows away).
  const secret = new Uint8Array(getSecretBytes());
  const payloadBytes = new Uint8Array(ENCODER.encode(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes as BufferSource);
  return base64url(sig);
}

export async function signSessionCookie(
  userId: string,
  ttlSeconds = 60 * 60 * 24 * 365
): Promise<{ value: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const exp = expiresAt.toISOString();
  const payload = `${userId}.${exp}`;
  const sig = await hmac(payload);
  return { value: `${payload}.${sig}`, expiresAt };
}

export async function verifySessionCookie(
  raw: string | undefined | null
): Promise<{ userId: string; expiresAt: Date } | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!userId || !exp || !sig) return null;

  const expected = await hmac(`${userId}.${exp}`);
  if (!timingSafeEqual(sig, expected)) return null;

  const expiresAt = new Date(exp);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) return null;
  return { userId, expiresAt };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE = COOKIE_NAME;
