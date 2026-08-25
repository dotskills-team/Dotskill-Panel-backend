import { z } from "zod";
import {
  AttachmentType,
  LeadContactStatus,
  LeadPriority,
  LeadSource,
  LeadStatus,
  PreferredContactMethod,
} from "./lead.interface";
import { objectIdSchema, phoneSchema } from "../user/user.validation";

const statusValues = Object.values(LeadStatus) as [LeadStatus, ...LeadStatus[]];
const priorityValues = Object.values(LeadPriority) as [
  LeadPriority,
  ...LeadPriority[],
];
const sourceValues = Object.values(LeadSource) as [LeadSource, ...LeadSource[]];
const contactMethodValues = Object.values(PreferredContactMethod) as [
  PreferredContactMethod,
  ...PreferredContactMethod[],
];
const attachmentTypeValues = Object.values(AttachmentType) as [
  AttachmentType,
  ...AttachmentType[],
];

const contactStatusValues = Object.values(
  LeadContactStatus,
) as [LeadContactStatus, ...LeadContactStatus[]];

const nameSchema = (fieldName: string) =>
  z
    .string({ invalid_type_error: `${fieldName} must be a string.` })
    .trim()
    .min(2, { message: `${fieldName} must be at least 2 characters long.` })
    .max(50, { message: `${fieldName} cannot exceed 50 characters.` });

export const createLeadValidationSchema = z
  .object({
    firstName: nameSchema("First name"),
    lastName: nameSchema("Last name"),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: "Invalid email address format." })
      .optional(),

    phone: phoneSchema,
    alternatePhone: phoneSchema.optional(),

    company: z.string().trim().max(150).optional(),
    website: z.string().trim().max(200).optional(),
    industry: z.string().trim().max(100).optional(),
    jobTitle: z.string().trim().max(100).optional(),
    employeeSize: z.string().trim().max(50).optional(),

    country: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    zipCode: z.string().trim().max(20).optional(),
    address: z.string().trim().max(200).optional(),
    location: z
      .string()
      .trim()
      .max(150, { message: "Location cannot exceed 150 characters." })
      .optional(),

    source: z.enum(sourceValues, {
      invalid_type_error: `Source must be one of: ${sourceValues.join(", ")}`,
    }),

    priority: z.enum(priorityValues).optional(),

    pipelineStage: z.string().trim().max(100).optional(),

    estimatedValue: z.coerce
      .number({
        invalid_type_error: "Estimated value must be a number.",
      })
      .min(0, {
        message: "Estimated value cannot be negative.",
      })
      .optional(),

    expectedCloseDate: z.coerce.date().optional(),

    assignedTo: objectIdSchema.optional(),

    preferredContactMethod: z.enum(contactMethodValues).optional(),

    tags: z.array(z.string().trim()).optional(),
    labels: z.array(z.string().trim()).optional(),

    requirementTitle: z.string().trim().max(200).optional(),

    requirementDescription: z
      .string()
      .trim()
      .max(2000)
      .optional(),

    budget: z.coerce
      .number({
        invalid_type_error: "Budget must be a number.",
      })
      .min(0, {
        message: "Budget cannot be negative.",
      })
      .optional(),

    timeline: z.string().trim().max(100).optional(),

    technologies: z.array(z.string().trim()).optional(),

    services: z.array(z.string().trim()).optional(),

    customFields: z.record(z.unknown()).optional(),
  })
  .strict();

export const updateLeadValidationSchema = z
  .object({
    firstName: nameSchema("First name").optional(),
    lastName: nameSchema("Last name").optional(),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: "Invalid email address format." })
      .optional(),

    phone: phoneSchema.optional(),
    alternatePhone: phoneSchema.optional(),

    company: z.string().trim().max(150).optional(),
    website: z.string().trim().max(200).optional(),
    industry: z.string().trim().max(100).optional(),
    jobTitle: z.string().trim().max(100).optional(),
    employeeSize: z.string().trim().max(50).optional(),

    country: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    zipCode: z.string().trim().max(20).optional(),
    address: z.string().trim().max(200).optional(),

    location: z
      .string()
      .trim()
      .max(150, {
        message: "Location cannot exceed 150 characters.",
      })
      .optional(),

    source: z.enum(sourceValues).optional(),

    priority: z.enum(priorityValues).optional(),

    pipelineStage: z.string().trim().max(100).optional(),

    estimatedValue: z.coerce
      .number()
      .min(0, {
        message: "Estimated value cannot be negative.",
      })
      .optional(),

    expectedCloseDate: z.coerce.date().optional(),

    assignedTo: objectIdSchema.optional(),

    preferredContactMethod: z
      .enum(contactMethodValues)
      .optional(),

    tags: z.array(z.string().trim()).optional(),
    labels: z.array(z.string().trim()).optional(),

    requirementTitle: z
      .string()
      .trim()
      .max(200)
      .optional(),

    requirementDescription: z
      .string()
      .trim()
      .max(2000)
      .optional(),

    budget: z.coerce
      .number()
      .min(0)
      .optional(),

    timeline: z.string().trim().max(100).optional(),

    technologies: z.array(z.string().trim()).optional(),

    services: z.array(z.string().trim()).optional(),

    customFields: z.record(z.unknown()).optional(),
  })
  .strict();

export const updateLeadStatusValidationSchema = z
  .object({
    status: z.enum(statusValues, {
      required_error: "Status is required.",
      invalid_type_error: `Status must be one of: ${statusValues.join(", ")}`,
    }),
  })
  .strict();

  export const updateLeadContactStatusValidationSchema = z
  .object({
    contactStatus: z.enum(contactStatusValues, {
      required_error: "Contact status is required.",
      invalid_type_error: `Contact status must be one of: ${contactStatusValues.join(", ")}`,
    }),

    nextContactAt: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.contactStatus === LeadContactStatus.NEXT_CONTACT &&
      !data.nextContactAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextContactAt"],
        message:
          "Next contact date and time are required when contact status is NEXT_CONTACT.",
      });
    }

    if (
      data.contactStatus !== LeadContactStatus.NEXT_CONTACT &&
      data.nextContactAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextContactAt"],
        message:
          "Next contact date and time can only be provided when contact status is NEXT_CONTACT.",
      });
    }

    if (
      data.nextContactAt &&
      data.nextContactAt.getTime() <= Date.now()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextContactAt"],
        message: "Next contact time must be in the future.",
      });
    }
  });

export const assignLeadValidationSchema = z
  .object({
    assignedTo: objectIdSchema,
  })
  .strict();

export const convertLeadValidationSchema = z
  .object({
    clientId: objectIdSchema.optional(),
  })
  .strict();

export const addNoteValidationSchema = z
  .object({
    message: z
      .string({ invalid_type_error: "Message must be a string." })
      .trim()
      .min(1, { message: "Message cannot be empty." })
      .max(2000, { message: "Message cannot exceed 2000 characters." }),
  })
  .strict();

  

export const addAttachmentValidationSchema = z
  .object({
    title: z
      .string({ invalid_type_error: "Title must be a string." })
      .trim()
      .min(1, { message: "Title is required." })
      .max(150, { message: "Title cannot exceed 150 characters." }),
    url: z
      .string({ invalid_type_error: "URL must be a string." })
      .trim()
      .url({ message: "Invalid attachment URL." }),
    type: z.enum(attachmentTypeValues).optional(),
  })
  .strict();

export type CreateLeadInput = z.infer<typeof createLeadValidationSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadValidationSchema>;
export type UpdateLeadStatusInput = z.infer<
  typeof updateLeadStatusValidationSchema
>;
export type UpdateLeadContactStatusInput = z.infer<
  typeof updateLeadContactStatusValidationSchema
>;
export type AssignLeadInput = z.infer<typeof assignLeadValidationSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadValidationSchema>;
export type AddNoteInput = z.infer<typeof addNoteValidationSchema>;
export type AddAttachmentInput = z.infer<typeof addAttachmentValidationSchema>;
