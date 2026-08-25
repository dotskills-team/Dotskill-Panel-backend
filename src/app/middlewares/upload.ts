import multer from "multer";
import AppError from "../errorHelpers/appError";
import httpStatus from "http-status-codes";

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_, file, cb) => {
  const allowedMimeTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new AppError(
        httpStatus.BAD_REQUEST,
        "Only CSV, XLS and XLSX files are allowed.",
      ),
    );
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});