import { ClientStatus, ClientType } from "./client.interface";

export const clientSearchableFields = [
  "clientCode",
  "companyName",
  "industry",
  "phone",
  "firstName",
  "lastName"
];

export const CLIENT_STATUS_OPTIONS = Object.values(ClientStatus);

export const CLIENT_TYPE_OPTIONS = Object.values(ClientType);