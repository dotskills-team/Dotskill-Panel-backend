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


import dns from "dns/promises";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SMTP_HOSTNAME = process.env.SMTP_HOST || "smtp.gmail.com";

let transporterPromise: Promise<nodemailer.Transporter<SMTPTransport.SentMessageInfo>> | null = null;

const buildTransporter = async () => {
    // Render's containers often lack outbound IPv6 routing, but DNS still
    // returns the IPv6 (AAAA) record first for smtp.gmail.com, causing
    // ENETUNREACH. Resolve an explicit IPv4 address and connect to that,
    // while keeping the original hostname for TLS certificate validation
    // (Gmail's cert is issued for smtp.gmail.com, not the raw IP).
    let resolvedHost = SMTP_HOSTNAME;
    try {
        const { address } = await dns.lookup(SMTP_HOSTNAME, { family: 4 });
        resolvedHost = address;
    } catch (err) {
        console.error("IPv4 DNS lookup failed, falling back to hostname:", err);
    }

    const transportOptions: SMTPTransport.Options = {
        host: resolvedHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            servername: SMTP_HOSTNAME,
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 30000,
    };

    const transporter = nodemailer.createTransport(transportOptions);

    transporter.verify((err) => {
        if (err) {
            console.error("SMTP transporter verify failed:", err);
        } else {
            console.log("SMTP transporter ready.");
        }
    });

    return transporter;
};

const getTransporter = () => {
    if (!transporterPromise) {
        transporterPromise = buildTransporter();
    }
    return transporterPromise;
};

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
    const transporter = await getTransporter();
    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        html,
        attachments,
    });
};