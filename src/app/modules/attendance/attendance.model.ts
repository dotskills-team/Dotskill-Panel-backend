import { model, Schema } from "mongoose";
import { IAttendance } from "./attendance.interface";

const breakSchema = new Schema(
  {
    start: { type: Date, required: true },
    end: { type: Date, default: null },
  },
  { _id: false },
);

const attendanceSchema = new Schema<IAttendance>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, default: null },
    breaks: { type: [breakSchema], default: [] },
    totalWorkMinutes: { type: Number, default: 0, min: 0 },
    isMissingCheckOut: { type: Boolean, default: false },
    editedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    editReason: { type: String, trim: true, default: null },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// One record per user per day.
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

export const Attendance = model<IAttendance>("Attendance", attendanceSchema);
