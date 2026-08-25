/* eslint-disable no-console */
import crypto from "crypto";

function generateSecret(bytes = 64): string {
  return crypto.randomBytes(bytes).toString("hex");
}

console.log("JWT_ACCESS_SECRET =", generateSecret(64));
console.log("JWT_REFRESH_SECRET =", generateSecret(128));
console.log("JWT_RESET_PASSWORD_SECRET =", generateSecret(64));