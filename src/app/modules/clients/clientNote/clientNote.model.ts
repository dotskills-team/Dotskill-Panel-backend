import { Schema, model } from "mongoose";

import { IClientNote } from "./clientNote.interface";

const clientNoteSchema = new Schema<IClientNote>(
  {
    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const ClientNote = model<IClientNote>(
  "ClientNote",
  clientNoteSchema,
);