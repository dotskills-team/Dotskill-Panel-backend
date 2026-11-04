import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  PORT: string;
  DB_URL: string;
  NODE_ENV: "production" | "development";
  BCRYPT_SALT_ROUND: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES: string;
  JWT_RESET_PASSWORD_EXPIRES: string;
  JWT_RESET_PASSWORD_SECRET: string;
  CLOUDINARY: {
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
  };
  EMAIL_SENDER: {
    SMTP_USER: string;
    SMTP_PASS: string;
    SMTP_PORT: string;
    SMTP_HOST: string;
    SMTP_FROM: string;
  };
  COMPANY_EMAIL: string;
  FRONTEND_URL: string;
  /** Optional. Only set when frontend and backend share a parent domain (e.g. ".dotskills.com"). */
  COOKIE_DOMAIN?: string;
  /** 64 hex characters (32 bytes) used as the AES-256-GCM key for stored credentials. */
  CREDENTIAL_ENCRYPTION_KEY: string;
  /** Optional. Comma-separated days-before-expiry that create reminders, e.g. "30,15,7,3,1,0". */
  DOMAIN_REMINDER_DAYS?: string;
  /** Optional. node-cron expression for the daily renewal job. Default: "0 9 * * *". */
  DOMAIN_CRON_SCHEDULE?: string;
  /** Optional. IANA timezone for the daily renewal job. Default: "Asia/Dhaka". */
  DOMAIN_CRON_TIMEZONE?: string;
}

const loadEnvVariables = (): EnvConfig => {
  const requiredEnvVariables: string[] = [
    "PORT",
    "DB_URL",
    "NODE_ENV",
    "BCRYPT_SALT_ROUND",
    "JWT_ACCESS_SECRET",
    "JWT_ACCESS_EXPIRES",
    "JWT_REFRESH_SECRET",
    "JWT_RESET_PASSWORD_SECRET",
    "JWT_RESET_PASSWORD_EXPIRES",
    "JWT_REFRESH_EXPIRES",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "COMPANY_EMAIL",
    "FRONTEND_URL",
    "CREDENTIAL_ENCRYPTION_KEY",
  ];

  requiredEnvVariables.forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`Missing require environment variable ${key}`);
    }
  });

  // The key must be exactly 32 bytes (64 hex characters) for AES-256.
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.CREDENTIAL_ENCRYPTION_KEY as string)) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }

  return {
    PORT: process.env.PORT as string,
    DB_URL: process.env.DB_URL as string,
    NODE_ENV: process.env.NODE_ENV as "development" | "production",
    BCRYPT_SALT_ROUND: process.env.BCRYPT_SALT_ROUND as string,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
    JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES as string,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET as string,
    JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES as string,
    JWT_RESET_PASSWORD_SECRET: process.env.JWT_RESET_PASSWORD_SECRET as string,
    JWT_RESET_PASSWORD_EXPIRES: process.env
      .JWT_RESET_PASSWORD_EXPIRES as string,
    CLOUDINARY: {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,
    },
    EMAIL_SENDER: {
      SMTP_USER: process.env.SMTP_USER as string,
      SMTP_PASS: process.env.SMTP_PASS as string,
      SMTP_PORT: process.env.SMTP_PORT as string,
      SMTP_HOST: process.env.SMTP_HOST as string,
      SMTP_FROM: process.env.SMTP_FROM as string,
    },
    COMPANY_EMAIL: process.env.COMPANY_EMAIL as string,
    FRONTEND_URL: process.env.FRONTEND_URL as string,
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
    CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY as string,
    DOMAIN_REMINDER_DAYS: process.env.DOMAIN_REMINDER_DAYS || undefined,
    DOMAIN_CRON_SCHEDULE: process.env.DOMAIN_CRON_SCHEDULE || undefined,
    DOMAIN_CRON_TIMEZONE: process.env.DOMAIN_CRON_TIMEZONE || undefined,
  };
};

export const envVars = loadEnvVariables();
