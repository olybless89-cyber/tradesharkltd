import React, { useMemo, useState } from 'react';
import { Search, TrendingUp, TrendingDown, PauseCircle } from 'lucide-react';
import { useBrokerage } from '../../context/BrokerageContext';
import { Instrument } from '../../types';

const CATS: { id: Instrument['category'] | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'etfs', label: 'ETFs' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'indices', label: 'Indices' },
  { id: 'currencies', label: 'Currencies' },
];

interface Props {
  onTrade: (symbol: string) => void;
}

export const UserMarketsTab: React.FC<Props> = ({ onTrade }) => {
  const { instruments, currentUser, tradeAccount, setTradeAccount } = useBrokerage();
  const [cat, setCat] = useState<(typeof CATS)[number]['id']>('stocks');
  const [q, setQ] = useState('');

  const list = useMemo(() => instruments.filter(i =>
    (cat === 'all' || i.category === cat) &&
    (!q.trim() || i.symbol.toLowerCase().includes(q.toLowerCase()) || i.name.toLowerCase().includes(q.toLowerCase()))
  ), [instruments, cat, q]);

  if (!currentUser) return null;
  const balance = tradeAccount === 'real' ? currentUser.realBalance : currentUser.virtualBalance;
  const restricted = tradeAccount === 'real' && (!currentUser.allowTrading || currentUser.status !== 'Active');

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white">Buy Stocks, Crypto &amp; More</h3>
          <p className="text-xs text-[#a3a89e]">Pick an instrument and press Buy. Prices update every 15 seconds.</p>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-[11px] w-full sm:w-auto">
          {(['real', 'virtual'] as const).map(acc => (
            <button
              key={acc}
              onClick={() => setTradeAccount(acc)}
              className={`px-4 py-2 rounded-lg font-bold transition-colors ${tradeAccount === acc ? (acc === 'real' ? 'bg-white text-[#15170f]' : 'bg-sky-400 text-[#0b1a24]') : 'text-white/60 hover:text-white'}`}
            >
              {acc === 'real' ? 'Real' : 'Practice'} · ${(acc === 'real' ? currentUser.realBalance : currentUser.virtualBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </button>
          ))}
        </div>
      </div>

      {restricted && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200">
          Real-money trading is currently restricted on your account. You can still trade with your practice account.
        </div>
      )}
      {!restricted && tradeAccount === 'real' && balance <= 0 && (
        <div className="p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-xs text-yellow-200">
          Your real balance is $0. Make a deposit to start buying, or switch to <button onClick={() => setTradeAccount('virtual')} className="underline font-bold">Practice</button> to try it risk-free.
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {CATS.map(c => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${cat === c.id ? 'bg-[#6dff8a] text-[#15170f] border-[#6dff8a]' : 'border-white/15 text-white/70 hover:text-white'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search e.g. Apple, BTC"
            className="w-full bg-black/40 border border-white/15 rounded-full pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-[#6dff8a]"
          />
        </div>
      </div>

      <div className="border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5 bg-black/20">
        {list.map(i => {
          const up = i.deltaPercent >= 0;
          return (
            <div key={i.symbol} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-white/[0.02]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[11px] text-white shrink-0" style={{ backgroundColor: i.avatarBg }}>
                {i.symbol.slice(0, 4)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  {i.symbol}
                  {i.halted && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 flex items-center gap-1"><PauseCircle className="w-3 h-3" />Paused</span>}
                </div>
                <div className="text-[11px] text-white/50 truncate">{i.name} · <span className="capitalize">{i.category}</span></div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-white text-sm">${i.price.toLocaleString(undefined, { maximumFractionDigits: i.price < 10 ? 4 : 2 })}</div>
                <div className={`text-[11px] font-semibold flex items-center justify-end gap-1 ${up ? 'text-[#6dff8a]' : 'text-[#ff5c5c]'}`}>
                  {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {up ? '+' : ''}{i.deltaPercent.toFixed(2)}%
                </div>
              </div>
              <button
                disabled={!!i.halted || restricted}
                onClick={() => onTrade(i.symbol)}
                className="ml-1 px-4 sm:px-5 py-2 rounded-full bg-[#6dff8a] hover:bg-[#5ce077] text-[#15170f] font-bold text-xs shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy
              </button>
            </div>
          );
        })}
        {!list.length && <div className="p-10 text-center text-white/50 text-sm">No instruments match your search.</div>}
      </div>
      <p className="text-[11px] text-white/40">Your capital is at risk. Practice trades use virtual money and are not real investments.</p>
    </div>
  );
};
