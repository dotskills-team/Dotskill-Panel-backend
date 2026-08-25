import bcrypt from "bcryptjs";
import { User } from "../modules/user/user.model";
import { Role } from "../modules/user/user.interface";

export const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: Role.SUPER_ADMIN });

    if (adminExists) {
      console.log("✅ Super Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash("Superadmin1@123", 10);
    const superAdmin = await User.create({
      fullName: "Super Admin",
      email: "superadmin1@dotskills.com",
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      phone: "01700000000",
      address: "System Generated",
      isVerified: true,
    });

    console.log("🔥 Default super admin created:", superAdmin.email);
  } catch (error) {
    console.error("❌ Failed to seed super admin:", error);
  }
};