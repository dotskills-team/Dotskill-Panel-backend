import { Role } from "../modules/user/user.interface";

/** The logged-in user, as carried in the access token. */
export interface FinanceActor {
  userId: string;
  role: string;
}

/** Super admins and admins see every account and expense. */
export const isFinanceAdmin = (role: string) =>
  role === Role.SUPER_ADMIN || role === Role.ADMIN;
