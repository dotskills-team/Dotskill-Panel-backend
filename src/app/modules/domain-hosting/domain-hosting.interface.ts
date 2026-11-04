import { Types } from "mongoose";
import {
  BillingCycle,
  ContactMethod,
  HostingType,
  PaidBy,
  RenewalAction,
  RenewalStatus,
  TargetType,
} from "./domain-hosting.constant";
import type { IEncryptedSecret } from "../../utils/credentialCrypto";

/* -------------------------------------------------------------------------- */
/* Domain                                                                     */
/* -------------------------------------------------------------------------- */

export interface IDomainCredentials {
  loginUrl?: string;
  username?: string;
  /** AES-256-GCM encrypted password. Null when no password is stored. */
  passwordEncrypted?: IEncryptedSecret | null;
  twoFactorNote?: string;
}

export interface IDomain {
  _id?: Types.ObjectId;

  project: Types.ObjectId;
  client?: Types.ObjectId | null;
  /** Snapshot of the client name, kept even if the client is later renamed or deleted. */
  clientName: string;

  domainName: string;
  registrar?: string;
  registrarUrl?: string;

  purchaseDate?: Date | null;
  expiryDate: Date;

  purchasePrice?: number;
  renewalPrice?: number;
  currency?: string;
  paidBy?: PaidBy;

  autoRenew?: boolean;
  nameservers?: string[];
  dnsNotes?: string;
  whoisPrivacy?: boolean;

  credentials?: IDomainCredentials;

  status: RenewalStatus;
  notes?: string;

  lastRenewedAt?: Date | null;
  lastPaidAmount?: number;

  isDeleted: boolean;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

/* -------------------------------------------------------------------------- */
/* Hosting                                                                    */
/* -------------------------------------------------------------------------- */

export interface IHostingCredential {
  _id?: Types.ObjectId;
  /** e.g. "cPanel", "SSH", "FTP", "DB", "Provider account" */
  label: string;
  loginUrl?: string;
  username?: string;
  passwordEncrypted?: IEncryptedSecret | null;
  port?: number | null;
  note?: string;
}

export interface IHosting {
  _id?: Types.ObjectId;

  project: Types.ObjectId;
  client?: Types.ObjectId | null;
  clientName: string;

  linkedDomains: Types.ObjectId[];

  hostingType: HostingType;
  provider?: string;
  planName?: string;
  serverLocation?: string;
  serverIp?: string;

  controlPanel?: string;
  controlPanelUrl?: string;

  purchaseDate?: Date | null;
  expiryDate: Date;
  billingCycle?: BillingCycle;

  purchasePrice?: number;
  renewalPrice?: number;
  currency?: string;
  paidBy?: PaidBy;

  credentials: IHostingCredential[];

  status: RenewalStatus;
  notes?: string;

  lastRenewedAt?: Date | null;
  lastPaidAmount?: number;

  isDeleted: boolean;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

/* -------------------------------------------------------------------------- */
/* Logs, audit and notifications                                              */
/* -------------------------------------------------------------------------- */

export interface IRenewalLog {
  _id?: Types.ObjectId;
  targetType: TargetType;
  targetId: Types.ObjectId;
  action: RenewalAction;
  contactMethod?: ContactMethod | null;
  oldExpiryDate?: Date | null;
  newExpiryDate?: Date | null;
  amountPaid?: number;
  note?: string;
  createdBy?: Types.ObjectId | null;
  createdAt?: Date;
}

/** Written every time a stored password is decrypted. */
export interface ICredentialAuditLog {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  role: string;
  action: "reveal";
  targetType: TargetType;
  targetId: Types.ObjectId;
  credentialId?: Types.ObjectId | null;
  ipAddress?: string;
  createdAt?: Date;
}

export interface IReminderNotification {
  _id?: Types.ObjectId;
  targetType: TargetType;
  targetId: Types.ObjectId;
  subjectName: string;
  clientName: string;
  expiryDate: Date;
  /** Days left when the reminder was created (0 = expires today). */
  daysBefore: number;
  title: string;
  message: string;
  /** Roles that can see this notification. */
  audience: string[];
  /** Users who marked it as read. */
  readBy: Types.ObjectId[];
  createdAt?: Date;
}
