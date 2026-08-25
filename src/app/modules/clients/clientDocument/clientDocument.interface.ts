import { Types } from "mongoose";

export enum ClientDocumentType {
  IMAGE = "IMAGE",
  PDF = "PDF",
  DOCUMENT = "DOCUMENT",
  SPREADSHEET = "SPREADSHEET",
  OTHER = "OTHER",
}

export interface IClientDocument {
  _id?: Types.ObjectId;

  client: Types.ObjectId;

  title: string;

  url: string;

  type: ClientDocumentType;

  uploadedBy: Types.ObjectId;

  uploadedAt?: Date;

  createdAt?: Date;

  updatedAt?: Date;
}