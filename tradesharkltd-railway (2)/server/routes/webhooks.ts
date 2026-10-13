import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { getMailSettings } from '../settings';
import { createMessage, findUserByEmail } from '../services';

export const webhookRouter = Router();

/** Verify a Resend (Svix) webhook signature when a signing secret is configured. */
function verifySvix(secret: string, headers: Record<string, any>, raw: Buffer | undefined): boolean {
  if (!secret) return true; // optional - the email is always re-fetched from Resend's API with our key anyway
  try {
    const id = String(headers['svix-id'] || '');
    const ts = String(headers['svix-timestamp'] || '');
    const sigHeader = String(headers['svix-signature'] || '');
    if (!id || !ts || !sigHeader || !raw) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw.toString('utf8')}`).digest('base64');
    return sigHeader.split(' ').some(part => {
      const sig = part.split(',')[1] || '';
      return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
  } catch {
    return false;
  }
}

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const decodeHtml = (html: string) => {
  const m = /^data:[^;,]*(;base64)?,(.*)$/s.exec(html || '');
  if (!m) return html || '';
  return m[1] ? Buffer.from(m[2], 'base64').toString('utf8') : decodeURIComponent(m[2]);
};

const parseAddr = (v: string) => {
  const m = /^(.*)<([^>]+)>\s*$/.exec(v || '');
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim().toLowerCase() } : { name: '', email: String(v || '').trim().toLowerCase() };
};

/**
 * Resend Receiving webhook: emails sent to your domain (e.g. support@yourdomain.com)
 * land in Admin > Emails > Inbound, where you can reply from the admin console.
 */
webhookRouter.post('/resend', async (req: any, res) => {
  const ms = getMailSettings();
  if (!verifySvix(ms.resendWebhookSecret, req.headers, req.rawBody)) return res.status(401).json({ error: 'Invalid signature' });
  const event = req.body || {};
  if (event.type !== 'email.received') return res.json({ ok: true, ignored: event.type || 'unknown' });
  if (!ms.inboundEnabled) return res.json({ ok: true, ignored: 'inbound disabled' });
  const emailId = String(event.data?.email_id || event.data?.id || '');
  if (!emailId || !ms.resendApiKey) return res.status(400).json({ error: 'Missing email id or Resend API key' });
  if (db.find<any>('mailLog', l => l.inboundId === emailId)) return res.json({ ok: true, duplicate: true });

  try {
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${ms.resendApiKey}` },
    });
    if (!r.ok) {
      console.error('[inbound] fetch failed', r.status, await r.text());
      return res.status(502).json({ error: 'Could not fetch email from Resend' });
    }
    const em: any = await r.json();
    const from = parseAddr(em.headers?.from || em.from || '');
    if (from.email && from.email === parseAddr(ms.fromAddress).email) return res.json({ ok: true, ignored: 'own address' });

    let body = em.text ? String(em.text) : stripHtml(decodeHtml(String(em.html || '')));
    // trim quoted history from replies to keep the inbox readable
    body = body.split(/\n(?:On .{5,120} wrote:|-{2,} ?Original Message|From: .+\n(?:Sent|Date): )/)[0].trim() || body.trim();
    const attachments = Array.isArray(em.attachments) && em.attachments.length
      ? `\n\n[${em.attachments.length} attachment(s): ${em.attachments.map((a: any) => a.filename).join(', ')} - open the email in your Resend dashboard to download]`
      : '';
    const user = from.email ? findUserByEmail(from.email) : null;
    const subject = String(em.subject || '(no subject)').slice(0, 200);
    const cat = /kyc|verif|document/i.test(subject) ? 'KYC' : /deposit|withdraw|payment|fund/i.test(subject) ? 'FUNDING' : 'SUPPORT';

    await createMessage({
      userId: user ? user.id : 'GUEST',
      userName: user ? user.name : (from.name || from.email || 'Unknown sender'),
      toEmail: from.email,
      subject,
      body: `${body.slice(0, 8000)}${attachments}\n\n(Received by email at ${(em.to || []).join(', ')})`,
      category: cat as any,
      direction: 'inbound',
    });
    await db.put('mailLog', {
      id: `ML-IN-${emailId}`,
      inboundId: emailId,
      ts: Date.now(),
      date: new Date().toISOString().replace('T', ' ').slice(0, 19),
      to: (em.to || []).join(', '),
      from: from.email,
      subject,
      provider: 'resend (inbound)',
      status: 'received',
      error: '',
      category: 'Inbound',
    });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[inbound] error', e?.message || e);
    res.status(500).json({ error: 'Inbound processing failed' });
  }
});
