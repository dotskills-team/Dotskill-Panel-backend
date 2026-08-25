import { Schema, model } from "mongoose";

import {
  ClientDocumentType,
  IClientDocument,
} from "./clientDocument.interface";

const clientDocumentSchema = new Schema<IClientDocument>(
  {

    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    url: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: Object.values(ClientDocumentType),
      default: ClientDocumentType.OTHER,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

export const ClientDocument = model<IClientDocument>(
  "ClientDocument",
  clientDocumentSchema,
);
