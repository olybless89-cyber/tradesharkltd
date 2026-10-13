import { useEffect } from 'react';
import { useBrokerage } from '../context/BrokerageContext';

/**
 * Loads the live chat widget chosen in Admin > Settings > Live Chat
 * (Smartsupp, tawk.to or any script URL) and passes the signed-in client's name/email to it.
 */
export const LiveChat = () => {
  const { config, currentUser, ready } = useBrokerage();
  const lc = config.liveChat;

  useEffect(() => {
    if (!ready || !lc || lc.provider === 'none') return;
    if (document.getElementById('site-live-chat')) return;
    const w = window as any;

    if (lc.provider === 'smartsupp' && lc.key) {
      w._smartsupp = w._smartsupp || {};
      w._smartsupp.key = lc.key;
      if (!w.smartsupp) {
        const o: any = (w.smartsupp = function () { o._.push(arguments); });
        o._ = [];
      }
      const s = document.createElement('script');
      s.id = 'site-live-chat';
      s.async = true;
      s.charset = 'utf-8';
      s.src = 'https://www.smartsuppchat.com/loader.js?';
      document.body.appendChild(s);
      return;
    }

    let src = lc.src || '';
    if (lc.provider === 'tawk') {
      // accept the tawk.to "direct chat link" or the embed URL
      src = src.replace(/^https:\/\/tawk\.to\/chat\//, 'https://embed.tawk.to/');
      w.Tawk_API = w.Tawk_API || {};
      w.Tawk_LoadStart = new Date();
    }
    if (!src) return;
    const s = document.createElement('script');
    s.id = 'site-live-chat';
    s.async = true;
    s.src = src;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.body.appendChild(s);
  }, [ready, lc?.provider, lc?.key, lc?.src]);

  // Identify signed-in clients to the chat agent
  useEffect(() => {
    const w = window as any;
    if (!currentUser) return;
    try {
      if (lc?.provider === 'smartsupp' && w.smartsupp) {
        w.smartsupp('name', currentUser.name);
        w.smartsupp('email', currentUser.email);
        w.smartsupp('variables', { clientId: { label: 'Client ID', value: currentUser.id }, tier: { label: 'Tier', value: currentUser.tier } });
      }
      if (lc?.provider === 'tawk' && w.Tawk_API) {
        const setAttrs = () => w.Tawk_API.setAttributes?.({ name: currentUser.name, email: currentUser.email, clientId: currentUser.id }, () => undefined);
        if (w.Tawk_API.setAttributes) setAttrs(); else w.Tawk_API.onLoad = setAttrs;
      }
    } catch { /* widget not ready */ }
  }, [currentUser?.id, lc?.provider]);

  return null;
};

export const liveChatEnabled = (provider?: string) => !!provider && provider !== 'none';
