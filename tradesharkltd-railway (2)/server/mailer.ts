import nodemailer from 'nodemailer';
import { config } from './config';
import { db, newId } from './db';
import { getMailSettings, effectiveProvider, MailSettings } from './settings';

export interface MailInput {
  to: string | string[];
  subject: string;
  text: string;          // plain text body (newlines become paragraphs in HTML)
  fromName?: string;     // department display name, e.g. "Compliance Desk"
  replyTo?: string;
  cta?: { label: string; url: string };
  preheader?: string;
}

export type MailResult = { ok: boolean; provider: string; error?: string };

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | null = null;
let smtpKey = '';
const getSmtp = (ms: MailSettings) => {
  const key = [ms.smtpHost, ms.smtpPort, ms.smtpSecure, ms.smtpUser, ms.smtpPass].join('|');
  if (!smtpTransport || key !== smtpKey) {
    smtpKey = key;
    smtpTransport = nodemailer.createTransport({
      host: ms.smtpHost,
      port: ms.smtpPort,
      secure: ms.smtpSecure,
      auth: ms.smtpUser ? { user: ms.smtpUser, pass: ms.smtpPass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
  }
  return smtpTransport;
};

export const mailProvider = (): 'resend' | 'brevo' | 'smtp' | 'log' => effectiveProvider();

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const renderHtml = (m: MailInput) => {
  const b = config.brand;
  const paragraphs = escapeHtml(m.text)
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px;line-height:1.6;color:#d8dbd2;font-size:14px;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const cta = m.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 8px;"><tr><td style="border-radius:999px;background:#6dff8a;">
         <a href="${escapeHtml(m.cta.url)}" style="display:inline-block;padding:12px 26px;font-weight:700;font-size:14px;color:#15170f;text-decoration:none;border-radius:999px;">${escapeHtml(m.cta.label)}</a>
       </td></tr></table>
       <p style="margin:6px 0 0;font-size:11px;color:#868c80;">If the button does not work, copy this link: ${escapeHtml(m.cta.url)}</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(m.subject)}</title></head>
<body style="margin:0;padding:0;background:#0f110a;font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(m.preheader || m.subject)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f110a;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#15170f;border:1px solid #2a2e22;border-radius:18px;overflow:hidden;">
    <tr><td style="padding:22px 28px;border-bottom:1px solid #2a2e22;">
      <a href="${escapeHtml(config.appUrl)}" style="text-decoration:none;font-size:20px;font-weight:800;color:#f4f4f0;">${escapeHtml(b.appName)}<span style="color:#6dff8a;">.</span></a>
    </td></tr>
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 18px;font-size:18px;line-height:1.35;color:#ffffff;">${escapeHtml(m.subject)}</h1>
      ${paragraphs}
      ${cta}
    </td></tr>
    <tr><td style="padding:18px 28px;background:#11130c;border-top:1px solid #2a2e22;font-size:11px;line-height:1.6;color:#868c80;">
      ${escapeHtml(b.legalName)}${b.companyNumber ? ` &middot; Company No. ${escapeHtml(b.companyNumber)}` : ''}<br/>
      ${escapeHtml(b.address)}<br/>
      Questions? <a href="mailto:${escapeHtml(b.supportEmail)}" style="color:#6dff8a;">${escapeHtml(b.supportEmail)}</a>
      &middot; <a href="${escapeHtml(config.appUrl)}" style="color:#6dff8a;">${escapeHtml(config.appUrl.replace(/^https?:\/\//, ''))}</a><br/>
      <span style="color:#5d6258;">Trading involves risk. The value of investments can go down as well as up.</span>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
};

const parseAddress = (v: string) => {
  const m = /^(.*)<([^>]+)>\s*$/.exec(v || '');
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { name: '', email: (v || '').trim() };
};

async function logMail(entry: Record<string, any>) {
  try {
    await db.put('mailLog', { id: newId('ML'), ts: Date.now(), date: new Date().toISOString().replace('T', ' ').slice(0, 19), ...entry });
    const all = db.all<any>('mailLog');
    if (all.length > 1200) {
      const old = all.sort((a, b) => a.ts - b.ts).slice(0, all.length - 1000);
      for (const o of old) await db.remove('mailLog', o.id);
    }
  } catch (e) {
    console.error('[mail] log failed', e);
  }
}

export async function sendMail(m: MailInput): Promise<MailResult> {
  const ms = getMailSettings();
  const provider = effectiveProvider(ms);
  const recipients = (Array.isArray(m.to) ? m.to : [m.to]).map(r => String(r || '').trim()).filter(Boolean);
  if (!recipients.length) return { ok: false, provider, error: 'No recipient' };

  const fromName = m.fromName ? `${ms.fromName} ${m.fromName}` : ms.fromName;
  const fromAddress = ms.fromAddress;
  const from = `${fromName} <${fromAddress}>`;
  const text = m.cta ? `${m.text}\n\n${m.cta.label}: ${m.cta.url}` : m.text;
  const html = renderHtml(m);
  const replyTo = m.replyTo || ms.replyTo || config.brand.supportEmail;

  let result: MailResult;
  try {
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ms.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, subject: m.subject, text, html, reply_to: replyTo }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('[mail] Resend error', res.status, err);
        result = { ok: false, provider, error: `Resend ${res.status}: ${err.slice(0, 300)}` };
      } else {
        result = { ok: true, provider };
      }
    } else if (provider === 'brevo') {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': ms.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: fromName, email: fromAddress },
          to: recipients.map(email => ({ email })),
          replyTo: { email: parseAddress(replyTo).email },
          subject: m.subject,
          htmlContent: html,
          textContent: text,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('[mail] Brevo error', res.status, err);
        result = { ok: false, provider, error: `Brevo ${res.status}: ${err.slice(0, 300)}` };
      } else {
        result = { ok: true, provider };
      }
    } else if (provider === 'smtp') {
      await getSmtp(ms).sendMail({ from, to: recipients.join(', '), subject: m.subject, text, html, replyTo });
      result = { ok: true, provider };
    } else {
      console.log(`[mail:log] To: ${recipients.join(', ')} | Subject: ${m.subject}\n${text}\n---`);
      result = { ok: false, provider, error: 'No email provider configured (Admin > Settings > Email). Email was not sent.' };
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[mail] send failed', msg);
    const hint = provider === 'smtp' && /ETIMEDOUT|ENETUNREACH|ECONNREFUSED|timeout/i.test(msg)
      ? ' (Railway blocks SMTP on Free/Hobby plans - use Resend or Brevo instead)'
      : '';
    result = { ok: false, provider, error: msg + hint };
  }

  await logMail({
    to: recipients.join(', '),
    subject: m.subject,
    provider: result.provider,
    status: result.ok ? 'sent' : provider === 'log' ? 'not-sent' : 'failed',
    error: result.error || '',
    category: m.fromName || 'General',
  });
  return result;
}

/** Fire-and-forget helper so request handlers never block on mail delivery. */
export const queueMail = (m: MailInput) => {
  sendMail(m).catch(err => console.error('[mail] queue error', err));
};

export async function verifyMailer(): Promise<string> {
  const ms = getMailSettings();
  const p = effectiveProvider(ms);
  if (p === 'smtp') {
    try { await getSmtp(ms).verify(); return 'smtp (verified)'; } catch (e: any) { return `smtp (verify failed: ${e?.message})`; }
  }
  return p;
}
