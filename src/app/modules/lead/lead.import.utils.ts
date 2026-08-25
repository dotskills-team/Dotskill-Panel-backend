import * as XLSX from "xlsx";

import {
  ILead,
  LeadPriority,
  LeadSource,
  LeadStatus,
} from "./lead.interface";

export interface IImportedLeadRow {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  company?: string;
  website?: string;
  industry?: string;
  jobTitle?: string;
  employeeSize?: string;
  country?: string;
  state?: string;
  city?: string;
  zipCode?: string;
  address?: string;
  source?: string;
  status?: string;
  priority?: string;
  pipelineStage?: string;
  estimatedValue?: string | number;
  preferredContactMethod?: string;
  tags?: string;
  labels?: string;
  requirementTitle?: string;
  requirementDescription?: string;
  budget?: string | number;
  timeline?: string;
  technologies?: string;
  services?: string;
  notes?: string;
  [key: string]: unknown;
}

const COLUMN_MAPPING: Record<string, keyof IImportedLeadRow> = {
  firstname: "firstName",
  first_name: "firstName",
  "first name": "firstName",

  lastname: "lastName",
  last_name: "lastName",
  "last name": "lastName",

  fullname: "fullName",
  full_name: "fullName",
  name: "fullName",

  email: "email",
  emailaddress: "email",
  "email address": "email",

  phone: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  phone_number: "phone",

  alternatephone: "alternatePhone",

  company: "company",
  companyname: "company",

  website: "website",

  industry: "industry",

  jobtitle: "jobTitle",
  designation: "jobTitle",

  employeesize: "employeeSize",

  country: "country",
  state: "state",
  city: "city",
  zipcode: "zipCode",
  postcode: "zipCode",

  address: "address",

  source: "source",

  status: "status",

  priority: "priority",

  pipelinestage: "pipelineStage",

  estimatedvalue: "estimatedValue",

  tags: "tags",

  labels: "labels",

  requirementtitle: "requirementTitle",

  requirementdescription: "requirementDescription",

  budget: "budget",

  timeline: "timeline",

  technologies: "technologies",

  services: "services",

  note: "notes",
  notes: "notes",
};

const normalizeKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, "")
    .replace(/\s+/g, "");

export const readImportFile = (
  buffer: Buffer,
): Record<string, unknown>[] => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("No worksheet found.");
  }

  const worksheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  });
};

export const mapLeadRow = (
  row: Record<string, unknown>,
): Partial<IImportedLeadRow> => {
  const mapped: Partial<IImportedLeadRow> = {};

  Object.entries(row).forEach(([key, value]) => {
    const target = COLUMN_MAPPING[normalizeKey(key)];

    if (!target) return;

    mapped[target] =
      typeof value === "string" ? value.trim() : value;
  });

  return mapped;
};

export const normalizePhone = (phone?: string) => {
  if (!phone) return undefined;

  return phone
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");
};

export const normalizeEmail = (email?: string) => {
  if (!email) return undefined;

  return email.trim().toLowerCase();
};

const splitName = (row: Partial<IImportedLeadRow>) => {
  if (row.firstName && row.lastName) {
    return {
      firstName: row.firstName,
      lastName: row.lastName,
    };
  }

  if (row.fullName) {
    const parts = row.fullName.trim().split(/\s+/);

    return {
      firstName: parts.shift() || "Unknown",
      lastName: parts.join(" ") || "-",
    };
  }

  return {
    firstName: row.firstName || "Unknown",
    lastName: row.lastName || "-",
  };
};

const normalizeSource = (value?: string): LeadSource => {
  if (!value) return LeadSource.MANUAL;

  const source = value.trim().toUpperCase();

  return (
    Object.values(LeadSource).find((item) => item === source) ??
    LeadSource.MANUAL
  );
};

const normalizeStatus = (value?: string): LeadStatus => {
  if (!value) return LeadStatus.NEW;

  const status = value.trim().toUpperCase();

  return (
    Object.values(LeadStatus).find((item) => item === status) ??
    LeadStatus.NEW
  );
};

const normalizePriority = (value?: string): LeadPriority => {
  if (!value) return LeadPriority.MEDIUM;

  const priority = value.trim().toUpperCase();

  return (
    Object.values(LeadPriority).find((item) => item === priority) ??
    LeadPriority.MEDIUM
  );
};

export const prepareLead = (
  row: Partial<IImportedLeadRow>,
): Partial<ILead> => {
  const { firstName, lastName } = splitName(row);

  return {
    firstName,
    lastName,
    email: normalizeEmail(row.email),
    phone: normalizePhone(row.phone) || "",
    alternatePhone: normalizePhone(row.alternatePhone),
    company: row.company,
    website: row.website,
    industry: row.industry,
    jobTitle: row.jobTitle,
    employeeSize: row.employeeSize,
    country: row.country,
    state: row.state,
    city: row.city,
    zipCode: row.zipCode,
    address: row.address,
    source: normalizeSource(row.source),
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    pipelineStage: row.pipelineStage,
    estimatedValue: Number(row.estimatedValue) || 0,
    requirementTitle: row.requirementTitle,
    requirementDescription: row.requirementDescription,
    budget: Number(row.budget) || 0,
    timeline: row.timeline,
    tags: row.tags
      ? row.tags.split(",").map((item) => item.trim())
      : [],
    labels: row.labels
      ? row.labels.split(",").map((item) => item.trim())
      : [],
    technologies: row.technologies
      ? row.technologies.split(",").map((item) => item.trim())
      : [],
    services: row.services
      ? row.services.split(",").map((item) => item.trim())
      : [],
  };
};

export const validateImportedLead = (
  lead: Partial<ILead>,
): string[] => {
  const errors: string[] = [];

  if (!lead.phone) {
    errors.push("Phone is required.");
  }

  if (!lead.firstName) {
    errors.push("First name is required.");
  }

  if (!lead.lastName) {
    errors.push("Last name is required.");
  }

  return errors;
};

export const parseImportFile = (buffer: Buffer) => {
  const rows = readImportFile(buffer);

  return rows.map((row) => prepareLead(mapLeadRow(row)));
};