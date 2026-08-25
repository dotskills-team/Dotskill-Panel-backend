import { Types } from "mongoose";

export enum LeadStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  QUALIFIED = "QUALIFIED",
  PROPOSAL_SENT = "PROPOSAL_SENT",
  CONFIRMED_MEETING = "CONFIRMED_MEETING",
  NEGOTIATION = "NEGOTIATION",
  ON_HOLD = "ON_HOLD",
  WON = "WON",
  LOST = "LOST",
}

export enum LeadContactStatus {
  NO_RESPONSE = "NO_RESPONSE",
  BUSY = "BUSY",
  NEXT_CONTACT = "NEXT_CONTACT",
  PHONE_OFF = "PHONE_OFF",
}

export enum LeadPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum LeadSource {
  WEBSITE = "WEBSITE",
  FACEBOOK = "FACEBOOK",
  GOOGLE = "GOOGLE",
  LINKEDIN = "LINKEDIN",
  WHATSAPP = "WHATSAPP",
  EMAIL = "EMAIL",
  PHONE_CALL = "PHONE_CALL",
  REFERRAL = "REFERRAL",
  MANUAL = "MANUAL",
  OTHER = "OTHER",
}

export enum PreferredContactMethod {
  PHONE = "PHONE",
  EMAIL = "EMAIL",
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
}

export enum AttachmentType {
  IMAGE = "IMAGE",
  DOCUMENT = "DOCUMENT",
  SPREADSHEET = "SPREADSHEET",
  PDF = "PDF",
  OTHER = "OTHER",
}

export interface ILeadAttachment {
  title: string;
  url: string;
  type: AttachmentType;
  uploadedBy?: Types.ObjectId;
  uploadedAt?: Date;
}

export interface IAttachment {
  _id?: Types.ObjectId;
  title: string;
  url: string;
  type: AttachmentType;
  uploadedAt?: Date;
}

export interface INote {
  _id?: Types.ObjectId;
  message: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
}

export interface ILead {
  _id?: Types.ObjectId;
  firstName: string;
  lastName: string;
  fullName?: string;
  email?: string;
  phone: string;
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
  source: LeadSource;
  status: LeadStatus;
    contactStatus?: LeadContactStatus;
  nextContactAt?: Date;
  priority: LeadPriority;
  pipelineStage?: string;
  estimatedValue?: number;
  expectedCloseDate?: Date;
  location?: string;
  assignedTo?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  preferredContactMethod?: PreferredContactMethod;
  tags?: string[];
  labels?: string[];
  requirementTitle?: string;
  requirementDescription?: string;
  budget?: number;
  timeline?: string;
  technologies?: string[];
  services?: string[];
  attachments?: ILeadAttachment[];
  notes?: INote[];

  customFields?: Record<string, unknown>;
  isConverted: boolean;
  convertedAt?: Date;
  convertedBy?: Types.ObjectId;
  clientId?: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}