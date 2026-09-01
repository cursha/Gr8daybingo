import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftRight, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { AdminTradeRow, adminGetTrades, adminVoidTrade } from '@/lib/game-utils';

const SquareTradesSection: React.FC = () => {
  const [tradeRows, setTradeRows] = useState<AdminTradeRow[]>([]);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeStatusFilter, setTradeStatusFilter] = useState('');
  const [voidingTradeId, setVoidingTradeId] = useState<number | null>(null);
  const [voidReasonDraft, setVoidReasonDraft] = useState('');

  const loadTrades = async () => {
    setTradeLoading(true);
    try {
      const rows = await adminGetTrades({ status: tradeStatusFilter || undefined, limit: 100 });
      setTradeRows(rows);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load trades');
    } finally {
      setTradeLoading(false);
    }
  };

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVoidTrade = async (tradeId: number) => {
    try {
      await adminVoidTrade(tradeId, voidReasonDraft.trim());
      toast.success('Trade voided');
      setVoidingTradeId(null);
      setVoidReasonDraft('');
      await loadTrades();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to void trade');
    }
  };

  return (
    <section id="section-trades">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            Square Trades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50/60 border border-slate-200 rounded-lg">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select
                value={tradeStatusFilter}
                onChange={(e) => setTradeStatusFilter(e.target.value)}
                className="h-9 border border-input rounded-md bg-background px-2 text-sm"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
                <option value="voided">Voided</option>
              </select>
            </div>
            <Button size="sm" onClick={loadTrades} disabled={tradeLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {tradeLoading ? 'Loading…' : 'Apply Filter'}
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="px-3 py-2">Week</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2">To</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tradeRows.map((t) => {
                    const fromName = [t.from_user?.first_name, t.from_user?.last_name].filter(Boolean).join(' ')
                      || (t.from_user?.player_number ? `GR8-${t.from_user.player_number}` : t.from_user_id);
                    const toName = [t.to_user?.first_name, t.to_user?.last_name].filter(Boolean).join(' ')
                      || (t.to_user?.player_number ? `GR8-${t.to_user.player_number}` : t.to_user_id);
                    const voidedByName = t.voided_by_user
                      ? [t.voided_by_user.first_name, t.voided_by_user.last_name].filter(Boolean).join(' ') || 'admin'
                      : null;
                    const voidable = t.status === 'pending' || t.status === 'accepted';
                    return (
                      <tr key={t.id} className={t.status === 'voided' ? 'opacity-50 bg-rose-50/40' : ''}>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{t.week_year}</td>
                        <td className="px-3 py-2 text-slate-700 max-w-xs">
                          <div className="font-medium text-slate-800">{fromName}</div>
                          <div className="text-xs text-slate-500 truncate" title={t.from_deed_text}>{t.from_deed_text}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700 max-w-xs">
                          <div className="font-medium text-slate-800">{toName}</div>
                          <div className="text-xs text-slate-500 truncate" title={t.to_deed_text}>{t.to_deed_text}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            t.status === 'accepted' ? 'bg-emerald-50 text-emerald-700'
                            : t.status === 'pending' ? 'bg-amber-50 text-amber-700'
                            : t.status === 'voided' ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                            {t.status}
                          </span>
                          {t.status === 'voided' && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              by {voidedByName ?? 'admin'}{t.void_reason ? `: ${t.void_reason}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {voidable && voidingTradeId !== t.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setVoidingTradeId(t.id); setVoidReasonDraft(''); }}
                              className="border-rose-200 text-rose-600 hover:bg-rose-50"
                            >
                              <Ban className="w-3.5 h-3.5 mr-1" />
                              Void
                            </Button>
                          )}
                          {voidable && voidingTradeId === t.id && (
                            <div className="flex flex-col gap-1.5 min-w-[220px]">
                              <Input
                                placeholder="Reason (required)"
                                value={voidReasonDraft}
                                onChange={(e) => setVoidReasonDraft(e.target.value)}
                                className="h-8 text-xs"
                              />
                              <div className="flex gap-1.5">
                                <Button
                                  size="sm"
                                  disabled={!voidReasonDraft.trim()}
                                  onClick={() => handleVoidTrade(t.id)}
                                  className="bg-rose-600 hover:bg-rose-700 text-white h-7 text-xs flex-1"
                                >
                                  Confirm Void
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setVoidingTradeId(null)}
                                  className="h-7 text-xs"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tradeRows.length === 0 && !tradeLoading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                        No trades match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default SquareTradesSection;
