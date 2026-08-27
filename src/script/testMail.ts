import "dotenv/config";
import { sendMail } from "../app/utils/mailer";

(async () => {
    try {
        await sendMail({
            to: "arrafifayezjoy@gmail.com", // apnar nijer email diye test koro
            subject: "Test Email",
            html: "<p>This is a test email.</p>",
        });
        console.log("✅ Test email sent successfully.");
    } catch (err) {
        console.error("❌ Test email failed:", err);
    } finally {
        process.exit(0);
    }
})();