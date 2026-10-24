import "server-only";
import nodemailer from "nodemailer";

export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.MAIL_FROM);

export async function sendMail(opts: { to: string; subject: string; text: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType: string }[] }) {
  if (!mailConfigured()) throw new Error("Email is not set up. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM to the environment.");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.MAIL_FROM, ...opts });
}
