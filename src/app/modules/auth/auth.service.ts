import httpStatus from "http-status-codes";
import { IUser, UserStatus } from "../user/user.interface";
import { User } from "../user/user.model";
import AppError from "../../errorHelpers/appError";
import bcryptjs from "bcryptjs";
import {
  createNewAccessTokenWithRefreshToken,
  createUserTokens,
} from "../../utils/userTokens";
import { JwtPayload } from "jsonwebtoken";
import { envVars } from "../../config/env";
import { generateToken, verifyToken } from "../../utils/jwt";
import { sendEmail } from "../../utils/sendEmail";

const credentialsLogin = async (payload: Partial<IUser>) => {
  const { email, password } = payload;

  const isUserExist = await User.findOne({ email }).select("+password");

  if (!isUserExist) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "User does not exist! Please register.",
    );
  }

  if (isUserExist.isDeleted) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account has been deleted. Please contact the administrator.",
    );
  }

  if (isUserExist.status === UserStatus.INACTIVE) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account is inactive. Please contact the administrator.",
    );
  }

  if (isUserExist.status === UserStatus.SUSPENDED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account has been suspended. Please contact the administrator.",
    );
  }

  if (!isUserExist.password) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  }

  const isPasswordMatched = await bcryptjs.compare(
    password as string,
    isUserExist.password as string,
  );

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Incorrect password!");
  }

  const userTokens = createUserTokens(isUserExist);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: pass, ...rest } = isUserExist.toObject();

  return {
    email: isUserExist.email,
    accessToken: userTokens.accessToken,
    refreshToken: userTokens.refreshToken,
    user: rest,
  };
};

const forgotPassword = async (email: string) => {
  const user = await User.findOne({
    email,
    isDeleted: false,
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  const token = generateToken(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
    },
    envVars.JWT_RESET_PASSWORD_SECRET,
    envVars.JWT_RESET_PASSWORD_EXPIRES,
  );

  const resetLink = `${envVars.FRONTEND_URL}/reset-password?token=${token}`;

  await sendEmail(
    user.email,
    "Reset Your Password",
    `
      <div style="font-family:Arial,sans-serif">
        <h2>Reset Password</h2>

        <p>Hello ${user.fullName},</p>

        <p>Click the button below to reset your password.</p>

        <a
          href="${resetLink}"
          style="
            display:inline-block;
            padding:12px 22px;
            background:#4f46e5;
            color:white;
            text-decoration:none;
            border-radius:6px;
          "
        >
          Reset Password
        </a>

        <p>This link expires in 15 minutes.</p>

        <p>If you didn't request this, ignore this email.</p>
      </div>
    `,
  );

  return null;
};

const resetPassword = async (token: string, newPassword: string) => {
  const decoded = verifyToken(
    token,
    envVars.JWT_RESET_PASSWORD_SECRET,
  ) as JwtPayload;

  const user = await User.findById(decoded.userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  user.password = await bcryptjs.hash(
    newPassword,
    Number(envVars.BCRYPT_SALT_ROUND),
  );

  await user.save();

  return null;
};

const adminChangePassword = async (userId: string, newPassword: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(404, "User not found");
  }

  user.password = await bcryptjs.hash(
    newPassword,
    Number(envVars.BCRYPT_SALT_ROUND),
  );

  await user.save();

  return null;
};

const getNewAccessToken = async (refreshToken: string) => {
  const newAccessToken =
    await createNewAccessTokenWithRefreshToken(refreshToken);
  return {
    accessToken: newAccessToken,
  };
};

const changePassword = async (
  oldPassword: string,
  newPassword: string,
  decodedToken: JwtPayload,
) => {
  const user = await User.findById(decodedToken.userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const isOldPasswordMatch = await bcryptjs.compare(
    oldPassword,
    user.password as string,
  );
  if (!isOldPasswordMatch) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Old Password does not match");
  }

  user.password = await bcryptjs.hash(
    newPassword,
    Number(envVars.BCRYPT_SALT_ROUND),
  );

  user.save();
};

export const AuthServices = {
  credentialsLogin,
  getNewAccessToken,
  forgotPassword,
  resetPassword,
  changePassword,
  adminChangePassword,
};
