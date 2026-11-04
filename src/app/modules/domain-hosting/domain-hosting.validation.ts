import { z } from "zod";
import {
  BillingCycle,
  ContactMethod,
  HostingType,
  PaidBy,
  RenewalStatus,
} from "./domain-hosting.constant";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

/** Dates arrive as ISO strings from the frontend. */
const dateString = z
  .string()
  .min(1, "Date is required")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

const optionalDate = dateString.nullable().optional();

// Domain names: "example.com", "shop.example.co.uk" (letters, digits, hyphens)
const domainNamePattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63}(?<!-))+$/;

const priceField = z.number().min(0, "Price cannot be negative").max(1_000_000_000).optional();

const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Currency code must be 3 letters")
  .max(5)
  .optional();

/* -------------------------------------------------------------------------- */
/* Domain                                                                     */
/* -------------------------------------------------------------------------- */

const domainCredentialsSchema = z
  .object({
    loginUrl: z.string().trim().max(500).optional(),
    username: z.string().trim().max(200).optional(),
    /** Plain text. Encrypted before it is stored. Empty string clears the stored password. */
    password: z.string().max(500).optional(),
    twoFactorNote: z.string().trim().max(500).optional(),
  })
  .optional();

const domainBaseSchema = z.object({
  project: objectId,
  domainName: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Domain name is required")
    .max(253)
    .regex(domainNamePattern, "Enter a valid domain name, e.g. example.com"),
  registrar: z.string().trim().max(150).optional(),
  registrarUrl: z.string().trim().max(500).optional(),
  purchaseDate: optionalDate,
  expiryDate: dateString,
  purchasePrice: priceField,
  renewalPrice: priceField,
  currency: currencyField,
  paidBy: z.nativeEnum(PaidBy).optional(),
  autoRenew: z.boolean().optional(),
  nameservers: z.array(z.string().trim().max(255)).max(10).optional(),
  dnsNotes: z.string().trim().max(2000).optional(),
  whoisPrivacy: z.boolean().optional(),
  credentials: domainCredentialsSchema,
  status: z.nativeEnum(RenewalStatus).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createDomainZodSchema = domainBaseSchema;

export const updateDomainZodSchema = domainBaseSchema.partial();

/* -------------------------------------------------------------------------- */
/* Hosting                                                                    */
/* -------------------------------------------------------------------------- */

const hostingCredentialSchema = z.object({
  /** Present for existing rows so their stored password is kept when not re-typed. */
  _id: objectId.optional(),
  label: z.string().trim().min(1, "Credential label is required").max(100),
  loginUrl: z.string().trim().max(500).optional(),
  username: z.string().trim().max(200).optional(),
  /** Plain text. Encrypted before it is stored. Omit to keep, empty string to clear. */
  password: z.string().max(500).optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

const hostingBaseSchema = z.object({
  project: objectId,
  linkedDomains: z.array(objectId).max(50).optional(),
  hostingType: z.nativeEnum(HostingType).optional(),
  provider: z.string().trim().max(150).optional(),
  planName: z.string().trim().max(150).optional(),
  serverLocation: z.string().trim().max(150).optional(),
  serverIp: z.string().trim().max(100).optional(),
  controlPanel: z.string().trim().max(100).optional(),
  controlPanelUrl: z.string().trim().max(500).optional(),
  purchaseDate: optionalDate,
  expiryDate: dateString,
  billingCycle: z.nativeEnum(BillingCycle).optional(),
  purchasePrice: priceField,
  renewalPrice: priceField,
  currency: currencyField,
  paidBy: z.nativeEnum(PaidBy).optional(),
  credentials: z.array(hostingCredentialSchema).max(20).optional(),
  status: z.nativeEnum(RenewalStatus).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createHostingZodSchema = hostingBaseSchema;

export const updateHostingZodSchema = hostingBaseSchema.partial();

/* -------------------------------------------------------------------------- */
/* Renewal, logs                                                              */
/* -------------------------------------------------------------------------- */

export const renewZodSchema = z.object({
  newExpiryDate: dateString,
  /** Status after renewal. Defaults to "renewed". */
  status: z.enum([RenewalStatus.ACTIVE, RenewalStatus.RENEWED]).optional(),
  amountPaid: z.number().min(0, "Amount cannot be negative").max(1_000_000_000).optional(),
  contactMethod: z.nativeEnum(ContactMethod).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** "renewed" is only created through the renew endpoint, never as a plain log. */
export const addLogZodSchema = z.object({
  action: z.enum(["client_contacted", "reminder_sent", "note"]),
  contactMethod: z.nativeEnum(ContactMethod).optional(),
  note: z.string().trim().max(1000).optional(),
});

export type CreateDomainInput = z.infer<typeof createDomainZodSchema>;
export type UpdateDomainInput = z.infer<typeof updateDomainZodSchema>;
export type CreateHostingInput = z.infer<typeof createHostingZodSchema>;
export type UpdateHostingInput = z.infer<typeof updateHostingZodSchema>;
export type RenewInput = z.infer<typeof renewZodSchema>;
export type AddLogInput = z.infer<typeof addLogZodSchema>;
