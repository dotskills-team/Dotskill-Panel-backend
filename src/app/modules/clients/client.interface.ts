import { Types } from "mongoose";

export enum ClientStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
  BLACKLISTED = "BLACKLISTED",
}

export enum ClientType {
  INDIVIDUAL = "INDIVIDUAL",
  BUSINESS = "BUSINESS",
  COMPANY = "COMPANY",
}

export interface IClient {
  _id?: Types.ObjectId;

  leadId: Types.ObjectId;

  clientType: ClientType;
  firstName?: string;
  lastName?: string;
  fullName?: string;

  email?: string;
  phone?: string;
  alternatePhone?: string;
  country?: string;
  state?: string;
  city?: string;
  zipCode?: string;
  address?: string;
  preferredContactMethod?: string;
  estimatedValue?: number;
  budget?: number;
  timeline?: string;
  requirementTitle?: string;
  requirementDescription?: string;
  technologies?: string[];
  services?: string[];

  companyName?: string;

  companyWebsite?: string;

  industry?: string;

  companySize?: string;

  taxId?: string;

  clientCode: string;

  status: ClientStatus;

  joinedAt?: Date;

  totalProjects: number;

  completedProjects: number;

  activeProjects: number;

  totalRevenue: number;

  totalInvoices: number;

  totalPaid: number;

  totalDue: number;

  lastContactAt?: Date;

  nextFollowUp?: Date;

  notes?: Types.ObjectId[];

  documents?: Types.ObjectId[];

  tags?: string[];

  labels?: string[];

  customFields?: Record<string, unknown>;

  isDeleted: boolean;
  deletedAt?: Date;

  accountManager?: Types.ObjectId;
  deletedBy?: Types.ObjectId;

  createdBy?: Types.ObjectId;

  updatedBy?: Types.ObjectId;

  createdAt?: Date;

  updatedAt?: Date;
}
