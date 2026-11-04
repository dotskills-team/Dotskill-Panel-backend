import { Schema } from "mongoose";

/**
 * Mongoose sub-schema for an AES-256-GCM encrypted value.
 * Stored as a nested object: { iv, authTag, cipherText } (hex strings).
 * `_id: false` keeps the stored shape small.
 */
export const encryptedSecretSchema = new Schema(
  {
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    cipherText: { type: String, required: true },
  },
  { _id: false },
);
