import { Types } from "mongoose";
import { AttendanceState } from "./attendance.constant";

export interface IAttendanceBreak {
  start: Date;
  end: Date | null;
}

export interface IAttendance {
  _id?: Types.ObjectId;
  user: Types.ObjectId;
  /** Calendar day in Asia/Dhaka, "YYYY-MM-DD". */
  date: string;
  checkIn: Date;
  checkOut: Date | null;
  breaks: IAttendanceBreak[];
  /** Stored when the day is closed. For an open day it is computed live in the response. */
  totalWorkMinutes: number;
  isMissingCheckOut: boolean;
  editedBy: Types.ObjectId | null;
  editReason: string | null;
  editedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AttendanceActor {
  userId: string;
  role: string;
}

/** Shape returned to the client: the stored record plus values computed at request time. */
export interface IAttendanceView {
  _id: string;
  user: unknown;
  date: string;
  checkIn: Date;
  checkOut: Date | null;
  breaks: IAttendanceBreak[];
  totalWorkMinutes: number;
  breakMinutes: number;
  isMissingCheckOut: boolean;
  isEdited: boolean;
  state: AttendanceState;
  editedBy: unknown;
  editReason: string | null;
  editedAt: Date | null;
}

export interface ManualBreakInput {
  start: Date;
  end?: Date | null;
}
