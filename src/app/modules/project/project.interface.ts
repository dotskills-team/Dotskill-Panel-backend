// import { Types } from "mongoose";

// export enum ProjectStatus {
//     PLANNING = "PLANNING",
//     IN_PROGRESS = "IN_PROGRESS",
//     ON_HOLD = "ON_HOLD",
//     COMPLETED = "COMPLETED",
//     CANCELLED = "CANCELLED",
// }

// export enum ProjectType {
//     WORDPRESS = "WORDPRESS",
//     MERN = "MERN",
//     PERN = "PERN",
//     NEXT_JS = "NEXT_JS",
//     SHOPIFY = "SHOPIFY",
//     LARAVEL = "LARAVEL",
//     PHP = "PHP",
//     MOBILE_APP = "MOBILE_APP",
//     UI_UX = "UI_UX",
//     OTHER = "OTHER",
// }

// export interface IProject {
//     _id?: Types.ObjectId;

//     name: string;
//     description?: string;

//     type: ProjectType;

//     client: Types.ObjectId;
//     projectManager: Types.ObjectId;
//     developers: Types.ObjectId[];

//     budget?: number;

//     startDate: Date;
//     endDate?: Date;

//     technologies: string[];

//     requirements?: string;

//     status: ProjectStatus;

//     liveUrl?: string;
//     developmentLiveUrl?: string;
//     repositoryUrl?: string;

//     isDeleted?: boolean;
//     deletedAt?: Date;
//     deletedBy?: Types.ObjectId;
//     isActive?: boolean;

//     createdAt?: Date;
//     updatedAt?: Date;
// }


// v2
import { Types } from "mongoose";

export enum ProjectStatus {
    PLANNING = "PLANNING",
    IN_PROGRESS = "IN_PROGRESS",
    ON_HOLD = "ON_HOLD",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
}

export enum ProjectType {
    WORDPRESS = "WORDPRESS",
    MERN = "MERN",
    PERN = "PERN",
    NEXT_JS = "NEXT_JS",
    SHOPIFY = "SHOPIFY",
    LARAVEL = "LARAVEL",
    PHP = "PHP",
    MOBILE_APP = "MOBILE_APP",
    UI_UX = "UI_UX",
    OTHER = "OTHER",
}

export enum PaymentStatus {
    DUE = "DUE",
    PARTIAL = "PARTIAL",
    ADVANCED = "ADVANCED",
    COMPLETE = "COMPLETE",
}

export interface IPayment {
    _id?: Types.ObjectId;
    amount: number;
    date: Date;
    status: PaymentStatus;
    note?: string;
}

export interface IProjectDocument {
    _id?: Types.ObjectId;
    requirement: string;
    link: string;
}

export interface IProject {
    _id?: Types.ObjectId;

    name: string;
    description?: string;

    type: ProjectType;

    client: Types.ObjectId;
    projectManager: Types.ObjectId;
    developers: Types.ObjectId[];

    budget?: number;

    startDate: Date;
    endDate?: Date;

    technologies: string[];

    documents?: IProjectDocument[];

    status: ProjectStatus;

    paymentStatus?: PaymentStatus;
    payments?: IPayment[];
    nextPaymentDate?: Date;

    priority?: number;

    liveUrl?: string;
    developmentLiveUrl?: string;
    repositoryUrl?: string;

    isDeleted?: boolean;
    deletedAt?: Date;
    deletedBy?: Types.ObjectId;
    isActive?: boolean;

    createdAt?: Date;
    updatedAt?: Date;
}