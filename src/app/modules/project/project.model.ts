// import { Schema, model } from "mongoose";
// import {
//     IProject,
//     IPayment,
//     IProjectDocument,
//     ProjectStatus,
//     ProjectType,
//     PaymentStatus,
// } from "./project.interface";

// const paymentSchema = new Schema<IPayment>(
//     {
//         amount: {
//             type: Number,
//             required: [true, "Payment amount is required"],
//             min: [0, "Payment amount cannot be negative"],
//         },
//         date: {
//             type: Date,
//             required: [true, "Payment date is required"],
//         },
//         status: {
//             type: String,
//             enum: Object.values(PaymentStatus),
//             required: [true, "Payment status is required"],
//         },
//         note: {
//             type: String,
//             trim: true,
//         },
//     },
//     { _id: true, timestamps: false },
// );

// const projectDocumentSchema = new Schema<IProjectDocument>(
//     {
//         requirement: {
//             type: String,
//             required: [true, "Requirement name is required"],
//             trim: true,
//         },
//         link: {
//             type: String,
//             required: [true, "Link is required"],
//             trim: true,
//         },
//     },
//     { _id: true, timestamps: false },
// );

// const projectSchema = new Schema<IProject>(
//     {
//         name: {
//             type: String,
//             required: [true, "Project name is required"],
//             trim: true,
//         },

//         description: {
//             type: String,
//             trim: true,
//         },

//         type: {
//             type: String,
//             enum: Object.values(ProjectType),
//             required: [true, "Project type is required"],
//         },

//         client: {
//             type: Schema.Types.ObjectId,
//             ref: "Client",
//             required: [true, "Project client is required"],
//         },

//         projectManager: {
//             type: Schema.Types.ObjectId,
//             ref: "User",
//             required: [true, "Project manager is required"],
//         },

//         developers: [
//             {
//                 type: Schema.Types.ObjectId,
//                 ref: "User",
//             },
//         ],

//         budget: {
//             type: Number,
//             min: [0, "Budget cannot be negative"],
//         },

//         startDate: {
//             type: Date,
//             required: [true, "Start date is required"],
//         },

//         endDate: {
//             type: Date,
//         },

//         technologies: {
//             type: [String],
//             required: [true, "Technologies are required"],
//         },

//         documents: {
//             type: [projectDocumentSchema],
//             default: [],
//         },

//         status: {
//             type: String,
//             enum: Object.values(ProjectStatus),
//             default: ProjectStatus.PLANNING,
//         },

//         paymentStatus: {
//             type: String,
//             enum: Object.values(PaymentStatus),
//             default: PaymentStatus.DUE,
//         },

//         payments: {
//             type: [paymentSchema],
//             default: [],
//         },

//         nextPaymentDate: {
//             type: Date,
//         },

//         priority: {
//             type: Number,
//             min: [1, "Priority must be at least 1"],
//             unique: true,
//             sparse: true,
//         },

//         liveUrl: {
//             type: String,
//             trim: true,
//         },

//         developmentLiveUrl: {
//             type: String,
//             trim: true,
//         },

//         repositoryUrl: {
//             type: String,
//             trim: true,
//         },

//         isDeleted: {
//             type: Boolean,
//             default: false,
//         },

//         isActive: {
//             type: Boolean,
//             default: true,
//         },
//         deletedAt: {
//             type: Date,
//             default: null,
//         },

//         deletedBy: {
//             type: Schema.Types.ObjectId,
//             ref: "User",
//             default: null,
//         },
//     },
//     {
//         timestamps: true,
//     }
// );

// export const Project = model<IProject>("Project", projectSchema);

// v3

import { Schema, model } from "mongoose";
import {
    IProject,
    IPayment,
    IProjectDocument,
    IPaymentInstallment,
    ProjectStatus,
    ProjectType,
    PaymentStatus,
} from "./project.interface";

const paymentSchema = new Schema<IPayment>(
    {
        amount: {
            type: Number,
            required: [true, "Payment amount is required"],
            min: [0, "Payment amount cannot be negative"],
        },
        date: {
            type: Date,
            required: [true, "Payment date is required"],
        },
        status: {
            type: String,
            enum: Object.values(PaymentStatus),
            required: [true, "Payment status is required"],
        },
        note: {
            type: String,
            trim: true,
        },
    },
    { _id: true, timestamps: false },
);

const projectDocumentSchema = new Schema<IProjectDocument>(
    {
        requirement: {
            type: String,
            required: [true, "Requirement name is required"],
            trim: true,
        },
        link: {
            type: String,
            required: [true, "Link is required"],
            trim: true,
        },
    },
    { _id: true, timestamps: false },
);

const paymentInstallmentSchema = new Schema<IPaymentInstallment>(
    {
        installmentNo: {
            type: String,
            required: [true, "Installment name is required"],
            trim: true,
        },
        projectionDate: {
            type: Date,
            required: [true, "Projection date is required"],
        },
        paymentPercentage: {
            type: Number,
            required: [true, "Payment percentage is required"],
            min: [0, "Payment percentage cannot be negative"],
            max: [100, "Payment percentage cannot exceed 100"],
        },
        amount: {
            type: Number,
            required: [true, "Amount is required"],
            min: [0, "Amount cannot be negative"],
        },
        isCompleted: {
            type: Boolean,
            default: false,
        },
    },
    { _id: true, timestamps: false },
);

const projectSchema = new Schema<IProject>(
    {
        name: {
            type: String,
            required: [true, "Project name is required"],
            trim: true,
        },

        description: {
            type: String,
            trim: true,
        },

        type: {
            type: String,
            enum: Object.values(ProjectType),
            required: [true, "Project type is required"],
        },

        client: {
            type: Schema.Types.ObjectId,
            ref: "Client",
            required: [true, "Project client is required"],
        },

        projectManager: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Project manager is required"],
        },

        developers: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        budget: {
            type: Number,
            min: [0, "Budget cannot be negative"],
        },

        startDate: {
            type: Date,
            required: [true, "Start date is required"],
        },

        endDate: {
            type: Date,
        },

        technologies: {
            type: [String],
            required: [true, "Technologies are required"],
        },

        documents: {
            type: [projectDocumentSchema],
            default: [],
        },

        status: {
            type: String,
            enum: Object.values(ProjectStatus),
            default: ProjectStatus.PLANNING,
        },

        paymentStatus: {
            type: String,
            enum: Object.values(PaymentStatus),
            default: PaymentStatus.DUE,
        },

        payments: {
            type: [paymentSchema],
            default: [],
        },

        paymentSchedule: {
            type: [paymentInstallmentSchema],
            default: [],
        },

        nextPaymentDate: {
            type: Date,
        },

        priority: {
            type: Number,
            min: [1, "Priority must be at least 1"],
            unique: true,
            sparse: true,
        },

        liveUrl: {
            type: String,
            trim: true,
        },

        developmentLiveUrl: {
            type: String,
            trim: true,
        },

        repositoryUrl: {
            type: String,
            trim: true,
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },

        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export const Project = model<IProject>("Project", projectSchema);