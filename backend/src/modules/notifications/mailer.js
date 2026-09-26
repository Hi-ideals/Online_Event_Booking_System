import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import env from '../../config/env.js';

// backend/storage/emails
export const EMAIL_DIR = fileURLToPath(new URL('../../../storage/emails', import.meta.url));

let transport;

/**
 * SMTP when SMTP_HOST is configured; otherwise each email is saved as an .eml file
 * (open it with any mail app) so development never sends real mail.
 */
function getTransport() {
  if (!transport) {
    transport = env.mail.smtpHost
      ? nodemailer.createTransport({
        host: env.mail.smtpHost,
        port: env.mail.smtpPort,
        secure: env.mail.smtpSecure,
        auth: env.mail.smtpUser ? { user: env.mail.smtpUser, pass: env.mail.smtpPass } : undefined,
      })
      : nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }
  return transport;
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const info = await getTransport().sendMail({ from: env.mail.from, to, subject, html, text, attachments });
  if (!env.mail.smtpHost) {
    await fs.mkdir(EMAIL_DIR, { recursive: true });
    const safeTo = to.replace(/[^a-z0-9@._-]/gi, '_');
    const file = `${EMAIL_DIR}/${Date.now()}-${safeTo}.eml`;
    await fs.writeFile(file, info.message);
    if (!env.isProd) console.log(`[mail] "${subject}" -> ${to} (saved ${file})`);
  }
  return info;
}
