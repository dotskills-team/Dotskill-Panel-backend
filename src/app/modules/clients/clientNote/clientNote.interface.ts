import { Types } from "mongoose";

export interface IClientNote {
  _id?: Types.ObjectId;

  client: Types.ObjectId;

  message: string;

  createdBy: Types.ObjectId;

  createdAt?: Date;

  updatedAt?: Date;
}