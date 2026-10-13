import { db } from './db';
import { config } from './config';

/**
 * Settings that the admin can change from the back office (Admin -> Settings).
 * Values saved in the database override the Railway environment variables,
 * so the site works out of the box from env and can be re-configured without a redeploy.
 */

export type MailProviderName = 'auto' | 'resend' | 'brevo' | 'smtp' | 'log';

export interface MailSettings {
  provider: MailProviderName;
  resendApiKey: string;
  brevoApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  fromName: string;
  replyTo: string;
  adminNotifyEmail: string;
  // inbound (receive emails into the admin inbox via Resend Receiving)
  inboundEnabled: boolean;
  resendWebhookSecret: string;
  // notification switches
  notifyRegistration: boolean;
  notifyDeposits: boolean;
  notifyWithdrawals: boolean;
  notifyKyc: boolean;
  notifyMessages: boolean;
  welcomeEmail: boolean;
  tradeConfirmations: boolean;
  loginAlerts: boolean;
}

export const SECRET_MAIL_FIELDS: (keyof MailSettings)[] = ['resendApiKey', 'brevoApiKey', 'smtpPass', 'resendWebhookSecret'];

const envMail = (): MailSettings => ({
  provider: 'auto',
  resendApiKey: config.mail.resendApiKey,
  brevoApiKey: process.env.BREVO_API_KEY || '',
  smtpHost: config.mail.smtpHost,
  smtpPort: config.mail.smtpPort,
  smtpSecure: config.mail.smtpSecure,
  smtpUser: config.mail.smtpUser,
  smtpPass: config.mail.smtpPass,
  fromAddress: config.mail.fromAddress,
  fromName: config.mail.fromName,
  replyTo: config.mail.replyTo,
  adminNotifyEmail: config.admin.notifyEmail,
  inboundEnabled: true,
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
  notifyRegistration: true,
  notifyDeposits: true,
  notifyWithdrawals: true,
  notifyKyc: true,
  notifyMessages: true,
  welcomeEmail: true,
  tradeConfirmations: config.mail.tradeConfirmations,
  loginAlerts: config.mail.loginAlerts,
});

export function getMailSettings(): MailSettings {
  const saved = db.get<any>('settings', 'mail') || {};
  const base = envMail();
  const out: any = { ...base };
  for (const k of Object.keys(base) as (keyof MailSettings)[]) {
    const v = saved[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '' && typeof base[k] === 'string') continue; // empty saved string -> keep env value
    out[k] = v;
  }
  return out as MailSettings;
}

/** Which provider will actually be used right now. */
export function effectiveProvider(s = getMailSettings()): 'resend' | 'brevo' | 'smtp' | 'log' {
  if (s.provider === 'resend') return s.resendApiKey ? 'resend' : 'log';
  if (s.provider === 'brevo') return s.brevoApiKey ? 'brevo' : 'log';
  if (s.provider === 'smtp') return s.smtpHost ? 'smtp' : 'log';
  if (s.provider === 'log') return 'log';
  if (s.resendApiKey) return 'resend';
  if (s.brevoApiKey) return 'brevo';
  if (s.smtpHost) return 'smtp';
  return 'log';
}

const mask = (v: string) => (v ? `••••••${v.slice(-4)}` : '');

/** Settings safe to show in the admin UI (secrets masked). */
export function publicMailSettings() {
  const s = getMailSettings();
  const out: any = { ...s };
  for (const k of SECRET_MAIL_FIELDS) {
    out[k] = mask(String(s[k] || ''));
    out[`${k}Set`] = !!s[k];
  }
  out.effectiveProvider = effectiveProvider(s);
  out.inboundWebhookUrl = `${config.appUrl}/api/webhooks/resend`;
  return out;
}

export async function saveMailSettings(patch: Record<string, any>) {
  const current = db.get<any>('settings', 'mail') || { id: 'mail' };
  const base = envMail();
  const next: any = { ...current, id: 'mail' };
  for (const k of Object.keys(base) as (keyof MailSettings)[]) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (SECRET_MAIL_FIELDS.includes(k)) {
      // blank or masked value = keep the existing secret; "__clear__" removes it
      if (v === '__clear__') { next[k] = ''; continue; }
      if (typeof v !== 'string' || !v.trim() || v.startsWith('••')) continue;
      next[k] = v.trim();
      continue;
    }
    if (typeof base[k] === 'boolean') v = v === true || v === 'true';
    else if (typeof base[k] === 'number') v = Number(v) || base[k];
    else v = String(v ?? '').trim();
    next[k] = v;
  }
  if (next.provider && !['auto', 'resend', 'brevo', 'smtp', 'log'].includes(next.provider)) next.provider = 'auto';
  await db.put('settings', next);
  return publicMailSettings();
}

// ------------------------------------------------------------------
// Live chat (Smartsupp, tawk.to or any script)
// ------------------------------------------------------------------
export interface LiveChatSettings {
  provider: 'none' | 'smartsupp' | 'tawk' | 'script';
  smartsuppKey: string;
  tawkUrl: string;
  scriptUrl: string;
}

export function getLiveChatSettings(): LiveChatSettings {
  const saved = db.get<any>('settings', 'livechat') || {};
  const envScript = config.brand.liveChatScript;
  const def: LiveChatSettings = {
    provider: envScript ? 'script' : 'none',
    smartsuppKey: process.env.SMARTSUPP_KEY || '',
    tawkUrl: '',
    scriptUrl: envScript,
  };
  if (!saved.provider && def.smartsuppKey) def.provider = 'smartsupp';
  return { ...def, ...Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'id')) } as LiveChatSettings;
}

export async function saveLiveChatSettings(patch: Partial<LiveChatSettings>) {
  const cur = getLiveChatSettings();
  const clean = (u: any) => String(u ?? '').trim();
  const next: LiveChatSettings = {
    provider: (['none', 'smartsupp', 'tawk', 'script'] as const).includes(patch.provider as any) ? (patch.provider as any) : cur.provider,
    smartsuppKey: 'smartsuppKey' in patch ? clean(patch.smartsuppKey).replace(/[^a-zA-Z0-9]/g, '') : cur.smartsuppKey,
    tawkUrl: 'tawkUrl' in patch ? clean(patch.tawkUrl) : cur.tawkUrl,
    scriptUrl: 'scriptUrl' in patch ? clean(patch.scriptUrl) : cur.scriptUrl,
  };
  for (const k of ['tawkUrl', 'scriptUrl'] as const) {
    if (next[k] && !/^https:\/\/[^\s"'<>]+$/.test(next[k])) throw new Error(`${k === 'tawkUrl' ? 'tawk.to link' : 'Script URL'} must start with https://`);
  }
  await db.put('settings', { id: 'livechat', ...next });
  return next;
}

/** What the browser needs to load the widget. */
export function publicLiveChat() {
  const s = getLiveChatSettings();
  if (s.provider === 'smartsupp' && s.smartsuppKey) return { provider: 'smartsupp' as const, key: s.smartsuppKey };
  if (s.provider === 'tawk' && s.tawkUrl) return { provider: 'tawk' as const, src: s.tawkUrl };
  if (s.provider === 'script' && s.scriptUrl) return { provider: 'script' as const, src: s.scriptUrl };
  return { provider: 'none' as const };
}
