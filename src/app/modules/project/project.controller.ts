import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { ProjectServices } from "./project.service";
import { IProject } from "./project.interface";
import { sendResponse } from "../../utils/sendResponse";
import { catchAsync } from "../../utils/catchAsync";

const createProject = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const result = await ProjectServices.createProject(
            req.body as Partial<IProject>,
        );

        sendResponse(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: "Project created successfully.",
            data: result.data,
        });
    },
);

const getProjects = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const result = await ProjectServices.getProjects(
            req.query as Record<string, string>,
        );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Projects retrieved successfully.",
            data: result.data,
            meta: result.meta,
            stats: result.stats,
        });
    },
);

const getDeletedProjects = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const result =
            await ProjectServices.getDeletedProjects(
                req.query as Record<string, string>,
            );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Deleted projects retrieved successfully.",
            data: result.data,
        });
    },
);

const getProjectById = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const projectId = req.params.id as string;

        const result =
            await ProjectServices.getProjectById(projectId);

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Project retrieved successfully.",
            data: result.data,
        });
    },
);

const updateProject = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const projectId = req.params.id as string;

        const result = await ProjectServices.updateProject(
            projectId,
            req.body as Partial<IProject>,
        );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Project updated successfully.",
            data: result.data,
        });
    },
);

const softDeleteProject = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const projectId = req.params.id as string;

        const result =
            await ProjectServices.softDeleteProject(
                projectId,
                req.user as JwtPayload,
            );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Project moved to trash successfully.",
            data: result.data,
        });
    },
);

const restoreProject = catchAsync(
    async (
        req: Request,
        res: Response,
        _next: NextFunction,
    ) => {
        const projectId = req.params.id as string;

        const result =
            await ProjectServices.restoreProject(
                projectId
            );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Project restored successfully.",
            data: result.data,
        });
    },
);

export const ProjectControllers = {
    createProject,
    getProjects,
    getDeletedProjects,
    getProjectById,
    updateProject,
    softDeleteProject,
    restoreProject,
};