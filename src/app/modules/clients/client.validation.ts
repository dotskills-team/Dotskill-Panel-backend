import { z } from "zod";

import { ClientStatus, ClientType } from "./client.interface";
import { ClientDocumentType } from "./clientDocument/clientDocument.interface";

const objectId = z
  .string({
    required_error: "ObjectId is required.",
  })
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId.");

const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+880|880|0)?1[3-9]\d{8}$/, "Invalid phone number.")
  .optional()
  .or(z.literal(""));

const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address.")
  .optional()
  .or(z.literal(""));

const clientBaseSchema = {
  leadId: objectId.optional(),

  accountManager: objectId.optional(),

  clientType: z.nativeEnum(ClientType).optional(),

  firstName: z.string().trim().max(100).optional(),

  lastName: z.string().trim().max(100).optional(),

  fullName: z.string().trim().max(200).optional(),

  email: emailSchema,

  phone: phoneSchema,

  alternatePhone: phoneSchema,

  companyName: z.string().trim().max(200).optional(),

  companyWebsite: z
    .string()
    .trim()
    .url("Please provide a valid website URL.")
    .optional()
    .or(z.literal("")),

  industry: z.string().trim().max(100).optional(),

  companySize: z.string().trim().max(100).optional(),

  taxId: z.string().trim().max(100).optional(),

  clientCode: z.string().trim().min(1).optional(),

  status: z.nativeEnum(ClientStatus).optional(),

  country: z.string().trim().max(100).optional(),

  state: z.string().trim().max(100).optional(),

  city: z.string().trim().max(100).optional(),

  zipCode: z.string().trim().max(30).optional(),

  address: z.string().trim().max(500).optional(),

  preferredContactMethod: z.string().trim().max(100).optional(),

  estimatedValue: z.coerce.number().min(0).optional(),

  budget: z.coerce.number().min(0).optional(),

  timeline: z.string().trim().max(200).optional(),

  requirementTitle: z.string().trim().max(200).optional(),

  requirementDescription: z.string().trim().max(5000).optional(),

  technologies: z.array(z.string()).optional(),

  services: z.array(z.string()).optional(),

  joinedAt: z.string().datetime().optional(),

  lastContactAt: z.string().datetime().optional(),

  nextFollowUp: z.string().datetime().optional(),

  tags: z.array(z.string()).optional(),

  labels: z.array(z.string()).optional(),

  customFields: z.record(z.any()).optional(),
};

export const createClientValidationSchema = z.object(clientBaseSchema);

export const updateClientValidationSchema = z.object(clientBaseSchema);

export const addClientNoteValidationSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Note message is required.")
    .max(5000, "Note cannot exceed 5000 characters."),
});

export const addClientDocumentValidationSchema = z.object({
  title: z.string().trim().min(1, "Document title is required."),

  url: z.string().trim().url("Please provide a valid document URL."),

  type: z.nativeEnum(ClientDocumentType).optional(),
});

export const assignClientManagerValidationSchema = z.object({
  accountManager: objectId,
});

export const updateClientStatusValidationSchema = z.object({
  status: z.nativeEnum(ClientStatus),
});
