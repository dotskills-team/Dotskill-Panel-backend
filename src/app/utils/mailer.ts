// import nodemailer from "nodemailer";

// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: Number(process.env.SMTP_PORT) || 587,
//     secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
//     auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.SMTP_PASS,
//     },
// });

// export interface SendMailAttachment {
//     filename: string;
//     content: Buffer;
//     contentType?: string;
// }

// export interface SendMailOptions {
//     to: string;
//     subject: string;
//     html: string;
//     attachments?: SendMailAttachment[];
// }

// export const sendMail = async ({ to, subject, html, attachments }: SendMailOptions) => {
//     await transporter.sendMail({
//         from: process.env.MAIL_FROM || process.env.SMTP_USER,
//         to,
//         subject,
//         html,
//         attachments,
//     });
// };


// import nodemailer from "nodemailer";

// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: Number(process.env.SMTP_PORT) || 587,
//     secure: process.env.SMTP_SECURE === "true",
//     auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.SMTP_PASS,
//     },
//     connectionTimeout: 20000, // 20s to establish TCP connection
//     greetingTimeout: 20000,   // 20s to receive SMTP greeting
//     socketTimeout: 30000,     // 30s idle socket timeout
// });

// // Optional: verify connection on startup so failures show up immediately in logs
// transporter.verify((err) => {
//     if (err) {
//         console.error("SMTP transporter verify failed:", err);
//     } else {
//         console.log("SMTP transporter ready.");
//     }
// });

// export interface SendMailAttachment {
//     filename: string;
//     content: Buffer;
//     contentType?: string;
// }

// export interface SendMailOptions {
//     to: string;
//     subject: string;
//     html: string;
//     attachments?: SendMailAttachment[];
// }

// export const sendMail = async ({ to, subject, html, attachments }: SendMailOptions) => {
//     await transporter.sendMail({
//         from: process.env.MAIL_FROM || process.env.SMTP_USER,
//         to,
//         subject,
//         html,
//         attachments,
//     });
// };


import dns from "dns";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

// Render (and some cloud hosts) resolve smtp.gmail.com to IPv6 first, but
// often don't have outbound IPv6 routing, causing ENETUNREACH. Force IPv4.
dns.setDefaultResultOrder("ipv4first");

const transportOptions: SMTPTransport.Options & { family?: number } = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    family: 4,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
};

const transporter = nodemailer.createTransport(transportOptions as SMTPTransport.Options);

transporter.verify((err) => {
    if (err) {
        console.error("SMTP transporter verify failed:", err);
    } else {
        console.log("SMTP transporter ready.");
    }
});

export interface SendMailAttachment {
    filename: string;
    content: Buffer;
    contentType?: string;
}

export interface SendMailOptions {
    to: string;
    subject: string;
    html: string;
    attachments?: SendMailAttachment[];
}

export const sendMail = async ({ to, subject, html, attachments }: SendMailOptions) => {
    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        html,
        attachments,
    });
};