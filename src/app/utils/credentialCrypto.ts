import crypto from "crypto";
import { envVars } from "../config/env";

/**
 * AES-256-GCM helpers for stored credentials (domain / hosting passwords).
 *
 * Each encrypted value is stored as three hex strings:
 *  - iv         : random 96-bit nonce (a new one for every encryption)
 *  - authTag    : GCM authentication tag, verified on decrypt
 *  - cipherText : the encrypted password
 *
 * The 256-bit key comes from the CREDENTIAL_ENCRYPTION_KEY environment variable.
 * Losing or changing that key makes every stored password unrecoverable.
 */

const ALGORITHM = "aes-256-gcm";

// 96-bit IV is the size recommended for GCM
const IV_LENGTH = 12;

/** Value returned in list/detail APIs in place of a real password. */
export const MASKED_PASSWORD = "••••••••";

export interface IEncryptedSecret {
  iv: string;
  authTag: string;
  cipherText: string;
}

const getKey = (): Buffer => Buffer.from(envVars.CREDENTIAL_ENCRYPTION_KEY, "hex");

/** Encrypts a plain-text secret. Returns iv, authTag and cipherText as hex strings. */
export const encryptSecret = (plainText: string): IEncryptedSecret => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);

  return {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    cipherText: encrypted.toString("hex"),
  };
};

/** Decrypts a stored secret. Throws if the data was tampered with or the key is wrong. */
export const decryptSecret = (secret: IEncryptedSecret): string => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(secret.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(secret.cipherText, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
