import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Server-only AES-256-GCM helper for mailbox (IMAP/SMTP) password storage —
 * see supabase/migrations/0022_email_accounts.sql. The key lives only in
 * EMAIL_CREDENTIALS_KEY (32 raw bytes, base64-encoded), never in the
 * database, so a leaked service-role key or DB dump alone can't recover a
 * plaintext password. Throws a clear error rather than silently storing
 * plaintext if the key hasn't been configured, same pattern as
 * lib/supabase/admin.ts / lib/stripe.ts.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.EMAIL_CREDENTIALS_KEY;
  if (!raw) {
    throw new Error("EMAIL_CREDENTIALS_KEY is not configured — mailbox credentials cannot be stored.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("EMAIL_CREDENTIALS_KEY must decode to exactly 32 bytes (base64-encoded).");
  }
  return key;
}

/** Returns `${iv}:${authTag}:${ciphertext}`, each base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
