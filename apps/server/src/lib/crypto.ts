import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../env.js";

// Bazada saqlanadigan maxfiy qiymatlar (o'qituvchining Figma tokeni) uchun AES-256-GCM.
// Kalit: DATA_ENCRYPTION_KEY (tavsiya etiladi) yoki u bo'lmasa JWT_SECRET dan hosil qilinadi.
// Format: "v1:<iv base64url>:<tag base64url>:<shifrlangan base64url>".
// Kalitni almashtirish: DEPLOY.md → "Maxfiy kalitlarni almashtirish" (eski tokenlar qayta kiritiladi).

function key(): Buffer {
  const secret = env.DATA_ENCRYPTION_KEY || `${env.JWT_SECRET}:kodim-data`;
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

/** Kalit almashgan yoki qiymat buzilgan bo'lsa `null`. */
export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
