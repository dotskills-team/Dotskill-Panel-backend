import { model, Schema } from "mongoose";
import {
  Gender,
  IUser,
  PaymentMethod,
  Role,
  UserStatus,
} from "./user.interface";

const userSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: false,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    lastName: {
      type: String,
      required: false,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.STAFF,
      index: true,
    },

    designation: {
      type: String,
      trim: true,
      default: "",
    },
    gender: {
      type: String,
      enum: Object.values(Gender),
      default: null,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    salary: {
      type: Number,
      min: 0,
      default: 0,
    },

    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.CASH,
    },

    paymentAccount: {
      accountHolderName: {
        type: String,
        trim: true,
      },
      accountNumber: {
        type: String,
        trim: true,
      },
    },

    bankAccount: {
      accountHolderName: {
        type: String,
        trim: true,
      },
      accountNumber: {
        type: String,
        trim: true,
      },
      bankName: {
        type: String,
        trim: true,
      },
      branchName: {
        type: String,
        trim: true,
      },
      routingNumber: {
        type: String,
        trim: true,
      },
    },

    department: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    joiningDate: {
      type: Date,
    },

    reportingManager: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    permissions: {
      type: [String],
      default: [],
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
      index: true,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.set("toJSON", {
  virtuals: true,
});

userSchema.set("toObject", {
  virtuals: true,
});

userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1, role: 1 });
userSchema.index({ isDeleted: 1, status: 1 });

export const User = model<IUser>("User", userSchema);
