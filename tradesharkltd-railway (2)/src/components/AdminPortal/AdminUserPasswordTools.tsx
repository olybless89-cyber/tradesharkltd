import React, { useState } from 'react';
import { KeyRound, Link2, Copy, Check } from 'lucide-react';
import { api, errMsg } from '../../lib/api';

/** Admin tools to help a client who cannot log in: email a reset link (and copy it), or set a new password directly. */
export const AdminUserPasswordTools: React.FC<{ userId: string; email: string; onToast: (m: string) => void }> = ({ userId, email, onToast }) => {
  const [busy, setBusy] = useState<'' | 'link' | 'set'>('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState('');

  const sendLink = async () => {
    setBusy('link');
    try {
      const r = await api.post(`/api/admin/users/${userId}/password-reset`);
      setLink(r.resetUrl || '');
      onToast(r.emailProvider === 'log'
        ? 'Reset link created. Email is not set up yet, so copy the link below and send it to the client.'
        : `Password reset link emailed to ${email}.`);
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const setPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { onToast('Password must be at least 8 characters.'); return; }
    setBusy('set');
    try {
      await api.post(`/api/admin/users/${userId}/set-password`, { password: pw, notify: true });
      onToast(`New password set for ${email}. Share it with the client securely.`);
      setPw('');
    } catch (err) {
      onToast(errMsg(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
      <div className="text-xs font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#6dff8a]" />Login help</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={sendLink}
          disabled={!!busy}
          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Link2 className="w-3.5 h-3.5" />{busy === 'link' ? 'Creating…' : 'Email password reset link'}
        </button>
        <form onSubmit={setPassword} className="flex gap-2 flex-1">
          <input
            type="text"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Or type a new password (min 8)"
            className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#6dff8a]"
          />
          <button disabled={!!busy} className="px-3 py-2 rounded-xl bg-[#6dff8a] text-[#15170f] text-xs font-bold disabled:opacity-50">
            {busy === 'set' ? 'Saving…' : 'Set'}
          </button>
        </form>
      </div>
      {link && (
        <div className="flex items-center gap-2">
          <input readOnly value={link} className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white/80 font-mono" />
          <button
            onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white text-[11px] flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-[#6dff8a]" /> : <Copy className="w-3 h-3" />}{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <p className="text-[10px] text-white/40">Reset links expire after 24 hours and can be used once.</p>
    </div>
  );
};
