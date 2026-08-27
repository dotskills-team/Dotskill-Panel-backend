
// import { z } from "zod";
// import { ProjectStatus, ProjectType, PaymentStatus } from "./project.interface";

// const projectTypeValues = Object.values(ProjectType) as [ProjectType, ...ProjectType[]];
// const projectStatusValues = Object.values(ProjectStatus) as [ProjectStatus, ...ProjectStatus[]];
// const paymentStatusValues = Object.values(PaymentStatus) as [PaymentStatus, ...PaymentStatus[]];

// const paymentValidationSchema = z.object({
//   amount: z
//     .number()
//     .min(0, "Payment amount cannot be negative"),

//   date: z
//     .string()
//     .min(1, "Payment date is required"),

//   status: z.enum(paymentStatusValues, {
//     errorMap: () => ({ message: "Invalid payment status" }),
//   }),

//   note: z
//     .string()
//     .trim()
//     .optional(),
// });

// const projectDocumentValidationSchema = z.object({
//   requirement: z
//     .string()
//     .min(1, "Requirement is required")
//     .trim(),

//   link: z
//     .string()
//     .url("Invalid link URL"),
// });

// export const createProjectValidationSchema = z.object({
//     name: z
//       .string()
//       .min(1, "Project name is required")
//       .trim(),

//     description: z
//       .string()
//       .trim()
//       .optional(),

//     type: z.enum(projectTypeValues, {
//       errorMap: () => ({ message: "Invalid project type" }),
//     }   ),

//     client: z
//       .string()
//       .min(1, "Project client is required"),

//     projectManager: z
//       .string()
//       .min(1, "Project manager is required"),

//     developers: z
//       .array(z.string())
//       .optional()
//       .default([]),

//     budget: z
//       .number()
//       .min(0, "Budget cannot be negative")
//       .optional(),

//     startDate: z
//       .string()
//       .min(1, "Start date is required"),

//     endDate: z
//       .string()
//       .optional(),

//     technologies: z
//       .array(z.string())
//       .min(1, "At least one technology is required"),

//     documents: z
//       .array(projectDocumentValidationSchema)
//       .optional()
//       .default([]),

//     status: z
//       .enum(projectStatusValues, {
//         errorMap: () => ({ message: "Invalid project status" }),
//       })
//       .optional()
//       .default(ProjectStatus.PLANNING),

//     paymentStatus: z
//       .enum(paymentStatusValues, {
//         errorMap: () => ({ message: "Invalid payment status" }),
//       })
//       .optional()
//       .default(PaymentStatus.DUE),

//     payments: z
//       .array(paymentValidationSchema)
//       .optional()
//       .default([]),

//     nextPaymentDate: z
//       .string()
//       .optional(),

//     priority: z
//       .number()
//       .int()
//       .min(1, "Priority must be at least 1")
//       .optional(),

//     liveUrl: z
//       .string()
//       .url("Invalid live URL")
//       .optional(),

//     developmentLiveUrl: z
//       .string()
//       .url("Invalid development URL")
//       .optional(),

//     repositoryUrl: z
//       .string()
//       .url("Invalid repository URL")
//       .optional(),
//   });

//   export const updateProjectValidationSchema = createProjectValidationSchema.partial();

import { z } from "zod";
import { ProjectStatus, ProjectType, PaymentStatus } from "./project.interface";

const projectTypeValues = Object.values(ProjectType) as [ProjectType, ...ProjectType[]];
const projectStatusValues = Object.values(ProjectStatus) as [ProjectStatus, ...ProjectStatus[]];
const paymentStatusValues = Object.values(PaymentStatus) as [PaymentStatus, ...PaymentStatus[]];

const paymentValidationSchema = z.object({
  amount: z
    .number()
    .min(0, "Payment amount cannot be negative"),

  date: z
    .string()
    .min(1, "Payment date is required"),

  status: z.enum(paymentStatusValues, {
    errorMap: () => ({ message: "Invalid payment status" }),
  }),

  note: z
    .string()
    .trim()
    .optional(),
});

const projectDocumentValidationSchema = z.object({
  requirement: z
    .string()
    .min(1, "Requirement is required")
    .trim(),

  link: z
    .string()
    .url("Invalid link URL"),
});

const paymentInstallmentValidationSchema = z.object({
  installmentNo: z
    .string()
    .min(1, "Installment name is required")
    .trim(),

  projectionDate: z
    .string()
    .min(1, "Projection date is required"),

  paymentPercentage: z
    .number()
    .min(0, "Payment percentage cannot be negative")
    .max(100, "Payment percentage cannot exceed 100"),

  amount: z
    .number()
    .min(0, "Amount cannot be negative"),

  isCompleted: z
    .boolean()
    .optional()
    .default(false),
});

export const createProjectValidationSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .trim(),

  description: z
    .string()
    .trim()
    .optional(),

  type: z.enum(projectTypeValues, {
    errorMap: () => ({ message: "Invalid project type" }),
  }),

  client: z
    .string()
    .min(1, "Project client is required"),

  projectManager: z
    .string()
    .min(1, "Project manager is required"),

  developers: z
    .array(z.string())
    .optional()
    .default([]),

  budget: z
    .number()
    .min(0, "Budget cannot be negative")
    .optional(),

  startDate: z
    .string()
    .min(1, "Start date is required"),

  endDate: z
    .string()
    .optional(),

  technologies: z
    .array(z.string())
    .min(1, "At least one technology is required"),

  documents: z
    .array(projectDocumentValidationSchema)
    .optional()
    .default([]),

  status: z
    .enum(projectStatusValues, {
      errorMap: () => ({ message: "Invalid project status" }),
    })
    .optional()
    .default(ProjectStatus.PLANNING),

  paymentStatus: z
    .enum(paymentStatusValues, {
      errorMap: () => ({ message: "Invalid payment status" }),
    })
    .optional()
    .default(PaymentStatus.DUE),

  payments: z
    .array(paymentValidationSchema)
    .optional()
    .default([]),

  paymentSchedule: z
    .array(paymentInstallmentValidationSchema)
    .optional()
    .default([]),

  nextPaymentDate: z
    .string()
    .optional(),

  priority: z
    .number()
    .int()
    .min(1, "Priority must be at least 1")
    .optional(),

  liveUrl: z
    .string()
    .url("Invalid live URL")
    .optional(),

  developmentLiveUrl: z
    .string()
    .url("Invalid development URL")
    .optional(),

  repositoryUrl: z
    .string()
    .url("Invalid repository URL")
    .optional(),
});

export const updateProjectValidationSchema = createProjectValidationSchema.partial();

export const sendInvoiceValidationSchema = z.object({
    pdfBase64: z.string().min(1, "PDF data is required"),
});