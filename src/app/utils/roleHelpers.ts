import { Role } from "../modules/user/user.interface";

/** True only for the Marketing & Sales Lead role. */
export const isMarketingSalesLead = (role?: string | null): boolean =>
  role === Role.MARKETING_SALES_LEAD;

/** True for the whole marketing/sales team: regular members and the lead. */
export const isMarketingSalesTeam = (role?: string | null): boolean =>
  role === Role.SALES_MARKETING || role === Role.MARKETING_SALES_LEAD;

/** Admin-level access to the KPI module: super admin, admin and manager. */
export const isKpiAdmin = (role?: string | null): boolean =>
  role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGER;
