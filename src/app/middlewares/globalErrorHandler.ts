/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from "express";
import { envVars } from "../config/env";
import AppError from "../errorHelpers/appError";
import { TErrorSources } from "../interfaces/error.types";
import { handleDuplicateError } from "../errorHelpers/handleDuplicateError";
import { handleCastError } from "../errorHelpers/handleCastError";
import { handleValidationError } from "../errorHelpers/handleValidationError";
import { handleZodError } from "../errorHelpers/handleZodError";


// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const globalErrorHandler = async(err: any, req: Request, res: Response, next: NextFunction) => {

    if(envVars.NODE_ENV === "development"){
        console.log(err);
    }

    // if(req.file){
    //     await deleteImageFromCloudinary(req.file.path)
    // }

    // if(req.files && Array.isArray(req.files) && req.files.length > 0){
    //     const imageUrls = (req.files as Express.Multer.File[]).map(file => file.path)
    //     await Promise.all(imageUrls.map(url => deleteImageFromCloudinary(url)))
    // }

    let errorSources: TErrorSources[] = [];
    let statusCode = 500;
    let message = "Something went wrong!!!"

    // Duplicate error 
    if (err.code === 11000) {
        const simplifiedError = handleDuplicateError(err)
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message
    }
    // Cast Error / Object ID error 
    else if (err.name === "CastError") {
        const simplifiedError = handleCastError(err)
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message;
    }
    // Mongoose validation error 
    else if (err.name === "ValidationError") {
        const simplifiedError = handleValidationError(err)
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message;
        errorSources = simplifiedError.errorSources as TErrorSources[];
    }
    // Zod error 
    else if (err.name === "ZodError") {
        const simplifiedError = handleZodError(err)
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message;
        errorSources = simplifiedError.errorSources as TErrorSources[];
    }
    else if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
    } else if (err instanceof Error) {
        statusCode = 500;
        message = err.message
    }

    res.status(statusCode).json({
        success: false,
        message: message,
        errorSources,
        err: envVars.NODE_ENV === "development" ? err : null,
        stack: envVars.NODE_ENV === "development" ? err.stack : null
    })
}
