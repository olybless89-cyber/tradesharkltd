import React, { useEffect, useState } from 'react';
import {
  Mail, MessageCircle, Wallet, CheckCircle2, AlertTriangle, Send, RefreshCw, Copy, Check, Inbox, Search,
} from 'lucide-react';
import { api, errMsg } from '../../lib/api';

type Sub = 'email' | 'chat' | 'payments';

interface Props {
  isSuperAdmin: boolean;
  onToast: (m: string) => void;
  paymentsPanel: React.ReactNode;
}

export const AdminSettingsTab: React.FC<Props> = ({ isSuperAdmin, onToast, paymentsPanel }) => {
  const [sub, setSub] = useState<Sub>('email');
  const tabs: { id: Sub; label: string; icon: React.ReactNode }[] = [
    { id: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
    { id: 'chat', label: 'Live Chat', icon: <MessageCircle className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <Wallet className="w-4 h-4" /> },
  ];
  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-3 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${sub === t.id ? 'bg-[#6dff8a] text-[#15170f]' : 'bg-white/5 text-white/70 hover:text-white'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      {!isSuperAdmin && sub !== 'payments' && (
        <div className="p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-xs text-yellow-200">
          Only the Super-Admin account can change these settings. You can view them.
        </div>
      )}
      {sub === 'email' && <EmailSettings onToast={onToast} />}
      {sub === 'chat' && <LiveChatSettings onToast={onToast} />}
      {sub === 'payments' && paymentsPanel}
    </div>
  );
};

// ------------------------------------------------------------------
// Shared bits
// ------------------------------------------------------------------
const input = 'w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#6dff8a]';
const Card: React.FC<{ title: string; desc?: React.ReactNode; children: React.ReactNode }> = ({ title, desc, children }) => (
  <section className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
    <div>
      <h4 className="text-sm font-bold text-white">{title}</h4>
      {desc && <p className="text-[11px] text-white/50 mt-1 leading-relaxed">{desc}</p>}
    </div>
    {children}
  </section>
);
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; wide?: boolean }> = ({ label, hint, children, wide }) => (
  <label className={`space-y-1 block ${wide ? 'sm:col-span-2' : ''}`}>
    <span className="text-[11px] text-white/60">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-white/40">{hint}</span>}
  </label>
);
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-3 p-3 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#6dff8a]" />
    <span>
      <span className="text-xs font-semibold text-white block">{label}</span>
      {hint && <span className="text-[10px] text-white/45">{hint}</span>}
    </span>
  </label>
);
const CopyField: React.FC<{ value: string }> = ({ value }) => {
  const [c, setC] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className={`${input} font-mono text-[11px]`} />
      <button type="button" onClick={() => { navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1500); }} className="px-3 rounded-lg bg-white/10 text-white text-[11px] flex items-center gap-1 shrink-0">
        {c ? <Check className="w-3 h-3 text-[#6dff8a]" /> : <Copy className="w-3 h-3" />}{c ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

// ------------------------------------------------------------------
// Email
// ------------------------------------------------------------------
const PROVIDERS: { id: string; name: string; tag: string; desc: string }[] = [
  { id: 'resend', name: 'Resend', tag: 'Recommended', desc: 'Free: 3,000 emails/month (100/day). Sends AND receives (support@ inbox in this admin). Works on Railway.' },
  { id: 'brevo', name: 'Brevo', tag: 'Free 300/day', desc: 'Free: 300 emails/day. Sending only. Works on Railway.' },
  { id: 'smtp', name: 'SMTP', tag: 'Railway Pro only', desc: 'Gmail, Zoho, cPanel mail etc. Railway blocks SMTP on Free/Hobby plans.' },
  { id: 'log', name: 'Off', tag: '', desc: 'Do not send emails (messages still appear in client inboxes on the site).' },
];

const EmailSettings: React.FC<{ onToast: (m: string) => void }> = ({ onToast }) => {
  const [s, setS] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState<{ rows: any[]; stats: any } | null>(null);
  const [q, setQ] = useState('');

  const load = async () => {
    try {
      const r = await api.get('/api/admin/settings/mail');
      setS(r);
      setForm({ ...r, resendApiKey: '', brevoApiKey: '', smtpPass: '', resendWebhookSecret: '', provider: r.provider === 'auto' ? (r.effectiveProvider || 'log') : r.provider });
      setTestTo(t => t || r.adminNotifyEmail || '');
    } catch (e) { onToast(errMsg(e)); }
  };
  const loadLog = async (query = q) => {
    try { setLog(await api.get(`/api/admin/mail-log${query ? `?q=${encodeURIComponent(query)}` : ''}`)); } catch { /* ignore */ }
  };
  useEffect(() => { load(); loadLog(''); }, []);

  if (!s) return <div className="text-xs text-white/50">Loading email settings…</div>;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/api/admin/settings/mail', form);
      setS(r);
      setForm((f: any) => ({ ...f, resendApiKey: '', brevoApiKey: '', smtpPass: '', resendWebhookSecret: '' }));
      onToast(`Email settings saved. Active: ${r.effectiveProvider === 'log' ? 'not sending' : r.effectiveProvider}.`);
    } catch (err) { onToast(errMsg(err)); } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post('/api/admin/settings/mail/test', { to: testTo });
      onToast(`Test email sent to ${testTo} via ${r.provider}. Check the inbox (and spam folder).`);
    } catch (err) { onToast(errMsg(err)); } finally { setTesting(false); loadLog(); }
  };

  const active = s.effectiveProvider as string;
  const p = form.provider;
  const st = log?.stats || {};
  const domain = String(form.fromAddress || '').split('@')[1] || 'yourdomain.com';

  return (
    <form onSubmit={save} className="space-y-5 max-w-4xl">
      {/* Status */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${active === 'log' ? 'bg-red-500/10 border-red-500/30' : 'bg-[#6dff8a]/10 border-[#6dff8a]/30'}`}>
        <div className="flex items-start gap-3">
          {active === 'log' ? <AlertTriangle className="w-5 h-5 text-red-300 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-[#6dff8a] shrink-0" />}
          <div>
            <div className="text-sm font-bold text-white">{active === 'log' ? 'Emails are NOT being sent' : `Emails are being sent with ${active.toUpperCase()}`}</div>
            <div className="text-[11px] text-white/60">
              {active === 'log'
                ? 'Registration emails, password resets and notifications will not reach anyone until you add a provider below.'
                : `From ${s.fromName} <${s.fromAddress}> · alerts to ${s.adminNotifyEmail || '—'}`}
            </div>
          </div>
        </div>
        <div className="flex gap-3 text-[11px] text-white/70 shrink-0">
          <span><b className="text-[#6dff8a]">{st.sent24h ?? 0}</b> sent</span>
          <span><b className="text-red-300">{(st.failed24h ?? 0) + (st.notSent24h ?? 0)}</b> not delivered</span>
          <span><b className="text-sky-300">{st.received24h ?? 0}</b> received</span>
          <span className="text-white/40">24h</span>
        </div>
      </div>

      {/* Provider */}
      <Card title="1. Email provider" desc="Choose the service that delivers your emails. Railway blocks normal SMTP on Free/Hobby plans, so Resend or Brevo are the reliable free choices.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDERS.map(pr => (
            <button
              type="button"
              key={pr.id}
              onClick={() => set('provider', pr.id)}
              className={`text-left p-3 rounded-xl border transition-colors ${p === pr.id ? 'border-[#6dff8a] bg-[#6dff8a]/10' : 'border-white/10 bg-black/30 hover:border-white/25'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{pr.name}</span>
                {pr.tag && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pr.id === 'resend' ? 'bg-[#6dff8a] text-[#15170f]' : 'bg-white/10 text-white/70'}`}>{pr.tag}</span>}
              </div>
              <p className="text-[10px] text-white/50 mt-1">{pr.desc}</p>
            </button>
          ))}
        </div>

        {p === 'resend' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Resend API key" hint={s.resendApiKeySet ? `Saved (${s.resendApiKey}). Leave blank to keep it.` : 'resend.com → API Keys → Create API key (Full access, so receiving works).'} wide>
              <input type="password" autoComplete="off" value={form.resendApiKey} onChange={e => set('resendApiKey', e.target.value)} placeholder={s.resendApiKeySet ? s.resendApiKey : 're_...'} className={input} />
            </Field>
            <div className="sm:col-span-2 text-[11px] text-white/50 leading-relaxed p-3 rounded-xl bg-black/30 border border-white/10">
              <b className="text-white">Setup:</b> in Resend go to <b>Domains → Add domain</b>, enter <b>{domain}</b>, and copy the DNS records it shows into the place you bought the domain. Wait until it says <b>Verified</b>. The "From address" below must use that domain.
            </div>
          </div>
        )}
        {p === 'brevo' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Brevo API key" hint={s.brevoApiKeySet ? `Saved (${s.brevoApiKey}). Leave blank to keep it.` : 'brevo.com → SMTP & API → API Keys → Generate (starts with xkeysib-).'} wide>
              <input type="password" autoComplete="off" value={form.brevoApiKey} onChange={e => set('brevoApiKey', e.target.value)} placeholder={s.brevoApiKeySet ? s.brevoApiKey : 'xkeysib-...'} className={input} />
            </Field>
            <div className="sm:col-span-2 text-[11px] text-white/50 p-3 rounded-xl bg-black/30 border border-white/10">
              In Brevo, authenticate your domain (<b>Senders, Domains & IPs → Domains</b>) or verify the exact sender email you use as the From address.
            </div>
          </div>
        )}
        {p === 'smtp' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-[11px] text-yellow-200">
              Railway blocks SMTP ports on the Free and Hobby plans. This option only works on Railway Pro. Use the "Send test" button to check.
            </div>
            <Field label="SMTP host"><input value={form.smtpHost || ''} onChange={e => set('smtpHost', e.target.value)} placeholder="smtp.zoho.com" className={input} /></Field>
            <Field label="Port"><input value={form.smtpPort || ''} onChange={e => set('smtpPort', e.target.value)} placeholder="587" className={input} /></Field>
            <Field label="Username"><input value={form.smtpUser || ''} onChange={e => set('smtpUser', e.target.value)} className={input} /></Field>
            <Field label="Password" hint={s.smtpPassSet ? 'Saved. Leave blank to keep it.' : undefined}>
              <input type="password" autoComplete="off" value={form.smtpPass} onChange={e => set('smtpPass', e.target.value)} placeholder={s.smtpPassSet ? s.smtpPass : ''} className={input} />
            </Field>
            <Toggle checked={!!form.smtpSecure} onChange={v => set('smtpSecure', v)} label="Use SSL (port 465)" />
          </div>
        )}
      </Card>

      {/* Sender */}
      <Card title="2. Sender & addresses" desc="How your emails appear to clients, and where replies and admin alerts go.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="From name"><input value={form.fromName || ''} onChange={e => set('fromName', e.target.value)} placeholder="TradeShark" className={input} /></Field>
          <Field label="From address" hint="Must be on your verified domain, e.g. noreply@yourdomain.com"><input value={form.fromAddress || ''} onChange={e => set('fromAddress', e.target.value)} placeholder="noreply@yourdomain.com" className={input} /></Field>
          <Field label="Reply-to / support address" hint="Where clients' replies go, e.g. support@yourdomain.com"><input value={form.replyTo || ''} onChange={e => set('replyTo', e.target.value)} placeholder="support@yourdomain.com" className={input} /></Field>
          <Field label="Admin alert email" hint="Receives new-registration, deposit, withdrawal, KYC and message alerts"><input value={form.adminNotifyEmail || ''} onChange={e => set('adminNotifyEmail', e.target.value)} placeholder="you@gmail.com" className={input} /></Field>
        </div>
      </Card>

      {/* Notifications */}
      <Card title="3. Notifications" desc="Choose which emails are sent automatically.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle checked={!!form.welcomeEmail} onChange={v => set('welcomeEmail', v)} label="Welcome email to new clients" hint="Email verification and password reset emails are always sent." />
          <Toggle checked={!!form.tradeConfirmations} onChange={v => set('tradeConfirmations', v)} label="Trade confirmations to clients" />
          <Toggle checked={!!form.loginAlerts} onChange={v => set('loginAlerts', v)} label="New sign-in alerts to clients" />
          <Toggle checked={!!form.notifyRegistration} onChange={v => set('notifyRegistration', v)} label="Admin: new registration" />
          <Toggle checked={!!form.notifyDeposits} onChange={v => set('notifyDeposits', v)} label="Admin: new deposit request" />
          <Toggle checked={!!form.notifyWithdrawals} onChange={v => set('notifyWithdrawals', v)} label="Admin: new withdrawal request" />
          <Toggle checked={!!form.notifyKyc} onChange={v => set('notifyKyc', v)} label="Admin: KYC submitted" />
          <Toggle checked={!!form.notifyMessages} onChange={v => set('notifyMessages', v)} label="Admin: new client / website message" />
        </div>
      </Card>

      {/* Receiving */}
      <Card
        title="4. Receive emails in this admin (optional, Resend only)"
        desc="Emails people send to your domain (e.g. support@) appear under Emails → Inbound, and you can reply from here."
      >
        <Toggle checked={!!form.inboundEnabled} onChange={v => set('inboundEnabled', v)} label="Accept incoming emails" />
        <ol className="text-[11px] text-white/60 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>In Resend open your domain and turn on <b>Receiving</b>. Add the <b>MX</b> record it shows at your domain registrar. (Do not also use another mailbox provider's MX on the same domain.)</li>
          <li>In Resend go to <b>Webhooks → Add endpoint</b>, paste the URL below and tick the event <b>email.received</b>.</li>
          <li>Copy the webhook <b>Signing secret</b> (starts with whsec_) and paste it below, then Save.</li>
        </ol>
        <Field label="Webhook URL (paste into Resend)"><CopyField value={s.inboundWebhookUrl} /></Field>
        <Field label="Webhook signing secret" hint={s.resendWebhookSecretSet ? 'Saved. Leave blank to keep it.' : 'Optional but recommended.'}>
          <input type="password" autoComplete="off" value={form.resendWebhookSecret} onChange={e => set('resendWebhookSecret', e.target.value)} placeholder={s.resendWebhookSecretSet ? s.resendWebhookSecret : 'whsec_...'} className={input} />
        </Field>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end sticky bottom-0 bg-[#10120a]/95 py-3 border-t border-white/10">
        <button disabled={saving} className="px-6 py-2.5 rounded-xl bg-[#6dff8a] text-[#15170f] font-bold text-xs disabled:opacity-60">
          {saving ? 'Saving…' : 'Save email settings'}
        </button>
        <div className="flex gap-2 flex-1">
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Send a test email to…" className={input} />
          <button type="button" onClick={test} disabled={testing || !testTo} className="px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50">
            <Send className="w-3.5 h-3.5" />{testing ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-white/40 -mt-3">Save first, then send a test.</p>

      {/* Delivery log */}
      <Card title="Email delivery log" desc="Every email the site sent or received, newest first. Failed rows show the reason.">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); loadLog(); } }} placeholder="Search email or subject" className={`${input} pl-8`} />
          </div>
          <button type="button" onClick={() => loadLog()} className="px-3 rounded-lg bg-white/10 text-white text-xs flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
        </div>
        <div className="border border-white/10 rounded-xl overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-[11px] min-w-[620px]">
            <thead className="bg-white/5 text-white/50 uppercase text-[9px] sticky top-0">
              <tr><th className="p-2.5">Time (UTC)</th><th className="p-2.5">To / From</th><th className="p-2.5">Subject</th><th className="p-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(log?.rows || []).map(r => (
                <tr key={r.id} className="align-top">
                  <td className="p-2.5 font-mono text-white/50 whitespace-nowrap">{r.date}</td>
                  <td className="p-2.5 text-white/80 break-all">{r.status === 'received' ? <span className="flex items-center gap-1"><Inbox className="w-3 h-3 text-sky-300" />{r.from}</span> : r.to}</td>
                  <td className="p-2.5 text-white">{r.subject}</td>
                  <td className="p-2.5">
                    <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase ${r.status === 'sent' ? 'bg-[#6dff8a]/20 text-[#6dff8a]' : r.status === 'received' ? 'bg-sky-400/20 text-sky-300' : 'bg-red-500/20 text-red-300'}`}>{r.status}</span>
                    {r.error && <div className="text-[10px] text-red-300/80 mt-1 max-w-[260px]">{r.error}</div>}
                  </td>
                </tr>
              ))}
              {!(log?.rows || []).length && <tr><td colSpan={4} className="p-6 text-center text-white/40">No emails yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </form>
  );
};

// ------------------------------------------------------------------
// Live chat
// ------------------------------------------------------------------
const LiveChatSettings: React.FC<{ onToast: (m: string) => void }> = ({ onToast }) => {
  const [f, setF] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/api/admin/settings/livechat').then(setF).catch(e => onToast(errMsg(e))); }, []);
  if (!f) return <div className="text-xs text-white/50">Loading…</div>;
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  // allow pasting the whole Smartsupp code snippet: pull the key out of it
  const onSmartsupp = (v: string) => {
    const m = /_smartsupp\.key\s*=\s*['"]([a-zA-Z0-9]+)['"]/.exec(v);
    set('smartsuppKey', m ? m[1] : v.trim());
  };
  const onTawk = (v: string) => {
    const m = /(https:\/\/(?:embed\.)?tawk\.to\/[^\s'"<>]+)/.exec(v);
    set('tawkUrl', m ? m[1] : v.trim());
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/api/admin/settings/livechat', f);
      setF(r);
      onToast(r.provider === 'none' ? 'Live chat turned off.' : 'Live chat saved. Reload the website to see the chat bubble.');
    } catch (err) { onToast(errMsg(err)); } finally { setSaving(false); }
  };

  const opts = [
    { id: 'none', name: 'Off' },
    { id: 'smartsupp', name: 'Smartsupp' },
    { id: 'tawk', name: 'tawk.to (free)' },
    { id: 'script', name: 'Other (script URL)' },
  ];

  return (
    <form onSubmit={save} className="space-y-5 max-w-3xl">
      <Card title="Live chat widget" desc="Shows a chat bubble on every page so visitors and clients can message your support team in real time. Signed-in clients are identified to your agents automatically (name, email, client ID).">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {opts.map(o => (
            <button type="button" key={o.id} onClick={() => set('provider', o.id)} className={`p-3 rounded-xl border text-xs font-bold ${f.provider === o.id ? 'border-[#6dff8a] bg-[#6dff8a]/10 text-white' : 'border-white/10 bg-black/30 text-white/70'}`}>{o.name}</button>
          ))}
        </div>

        {f.provider === 'smartsupp' && (
          <div className="space-y-2">
            <Field label="Smartsupp key (or paste the whole chat code)" hint="Smartsupp dashboard → Settings → Chat box → Chat code. Paste it here; the key is picked out automatically.">
              <textarea rows={3} value={f.smartsuppKey} onChange={e => onSmartsupp(e.target.value)} placeholder="e.g. 3f2a1b... or the full <script> code" className={`${input} font-mono`} />
            </Field>
            {f.smartsuppKey && <div className="text-[11px] text-[#6dff8a]">Key detected: <span className="font-mono">{f.smartsuppKey}</span></div>}
          </div>
        )}
        {f.provider === 'tawk' && (
          <Field label="tawk.to link (or paste the whole widget code)" hint="tawk.to → Administration → Chat Widget → copy the Direct Chat Link or widget code.">
            <textarea rows={3} value={f.tawkUrl} onChange={e => onTawk(e.target.value)} placeholder="https://tawk.to/chat/xxxx/yyyy" className={`${input} font-mono`} />
          </Field>
        )}
        {f.provider === 'script' && (
          <Field label="Script URL" hint="Any chat widget that loads from a single https:// script link.">
            <input value={f.scriptUrl} onChange={e => set('scriptUrl', e.target.value)} placeholder="https://..." className={`${input} font-mono`} />
          </Field>
        )}
      </Card>
      <button disabled={saving} className="px-6 py-2.5 rounded-xl bg-[#6dff8a] text-[#15170f] font-bold text-xs disabled:opacity-60">{saving ? 'Saving…' : 'Save live chat'}</button>
    </form>
  );
};
