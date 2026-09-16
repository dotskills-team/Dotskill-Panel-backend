

import { Types } from "mongoose";

export enum ProjectStatus {
    PLANNING = "PLANNING",
    IN_PROGRESS = "IN_PROGRESS",
    ON_HOLD = "ON_HOLD",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    DONE_DUE = "DONE_DUE",
    DELIVERED = "DELIVERED",
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

export interface IPaymentInstallment {
    _id?: Types.ObjectId;
    installmentNo: string;
    projectionDate: Date;
    paymentPercentage: number;
    amount: number;
    isCompleted: boolean;
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
    paymentSchedule?: IPaymentInstallment[];
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

export interface ISendInvoicePayload {
    pdfBase64: string;
}