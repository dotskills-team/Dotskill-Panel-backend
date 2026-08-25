import {Model} from "mongoose";
import AppError from "../../errorHelpers/appError";
import httpStatus from "http-status-codes";

interface ITrash {
    isDeleted: boolean;
}

export const CommonTrashService = async <T extends ITrash & Document>(id: string, model: Model<T>) => {
    const doc = await model.findById(id);

    if (!doc) {
        throw new AppError(httpStatus.NOT_FOUND,"Document not found");
    }

    doc.isDeleted = !doc.isDeleted;

    await doc.save();

    return doc;
};