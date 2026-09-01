import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Download } from 'lucide-react';
import { toast } from 'sonner';
import { DeedLogRow, DeedCategory, TeamItem, adminGetDeedLog, adminExportDeedLogCsv } from '@/lib/game-utils';

const DEED_LOG_PAGE_SIZE = 50;

// Monday-based UTC week start, matching getWeekStart/getCurrentWeekYear on
// the backend (game/index.ts) — used to default the Deed Log's date range.
const currentWeekStartDateStr = (): string => {
  const now = new Date();
  const day = now.getUTCDay() || 7; // Mon=1..Sun=7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)));
  return monday.toISOString().slice(0, 10);
};
const todayDateStr = (): string => new Date().toISOString().slice(0, 10);

interface DeedLogSectionProps {
  deedCategories: DeedCategory[];
  teams: TeamItem[];
}

const DeedLogSection: React.FC<DeedLogSectionProps> = ({ deedCategories, teams }) => {
  const [deedLogRows, setDeedLogRows] = useState<DeedLogRow[]>([]);
  const [deedLogTotal, setDeedLogTotal] = useState(0);
  const [deedLogPage, setDeedLogPage] = useState(0);
  const [deedLogLoading, setDeedLogLoading] = useState(false);
  const [deedLogExporting, setDeedLogExporting] = useState(false);
  const [deedLogStart, setDeedLogStart] = useState(currentWeekStartDateStr());
  const [deedLogEnd, setDeedLogEnd] = useState(todayDateStr());
  const [deedLogPlayer, setDeedLogPlayer] = useState('');
  const [deedLogCategory, setDeedLogCategory] = useState('');
  const [deedLogTeamId, setDeedLogTeamId] = useState('');

  const loadDeedLog = async (page = 0) => {
    setDeedLogLoading(true);
    try {
      const res = await adminGetDeedLog(
        {
          start: deedLogStart || undefined,
          end: deedLogEnd || undefined,
          player: deedLogPlayer.trim() || undefined,
          category: deedLogCategory || undefined,
          teamId: deedLogTeamId ? Number(deedLogTeamId) : undefined,
        },
        page,
      );
      setDeedLogRows(res.rows);
      setDeedLogTotal(res.total);
      setDeedLogPage(res.page);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load deed log');
    } finally {
      setDeedLogLoading(false);
    }
  };

  useEffect(() => {
    loadDeedLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExportDeedLog = async () => {
    setDeedLogExporting(true);
    try {
      const csv = await adminExportDeedLogCsv({
        start: deedLogStart || undefined,
        end: deedLogEnd || undefined,
        player: deedLogPlayer.trim() || undefined,
        category: deedLogCategory || undefined,
        teamId: deedLogTeamId ? Number(deedLogTeamId) : undefined,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deed-log-${deedLogStart}-to-${deedLogEnd}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export deed log');
    } finally {
      setDeedLogExporting(false);
    }
  };

  return (
    <section id="section-deed-log">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-500" />
            Deed Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50/60 border border-slate-200 rounded-lg">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">From</label>
              <Input
                type="date"
                value={deedLogStart}
                onChange={(e) => setDeedLogStart(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">To</label>
              <Input
                type="date"
                value={deedLogEnd}
                onChange={(e) => setDeedLogEnd(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Player</label>
              <Input
                placeholder="Name…"
                value={deedLogPlayer}
                onChange={(e) => setDeedLogPlayer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadDeedLog(0)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Category</label>
              <select
                value={deedLogCategory}
                onChange={(e) => setDeedLogCategory(e.target.value)}
                className="h-9 border border-input rounded-md bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {deedCategories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Team</label>
              <select
                value={deedLogTeamId}
                onChange={(e) => setDeedLogTeamId(e.target.value)}
                className="h-9 border border-input rounded-md bg-background px-2 text-sm"
              >
                <option value="">All</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.team_name}</option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={() => loadDeedLog(0)} disabled={deedLogLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {deedLogLoading ? 'Loading…' : 'Apply Filters'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportDeedLog}
              disabled={deedLogExporting}
              className="ml-auto"
            >
              <Download className="w-4 h-4 mr-1" />
              {deedLogExporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Deed</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Completed</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Square Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deedLogRows.map((row) => (
                    <tr key={row.id} className={row.reversed ? 'opacity-50 bg-rose-50/40' : ''}>
                      <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{row.player_name}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={row.deed_text}>
                        {row.deed_text}
                        {row.reversed && <span className="ml-2 text-[10px] font-semibold text-rose-600 uppercase">Reversed</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.category ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(row.completed_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.team_name ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          row.square_type === 'Quick Tap' ? 'bg-sky-50 text-sky-700'
                          : row.square_type === 'Blackout' ? 'bg-slate-800 text-white'
                          : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {row.square_type}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {deedLogRows.length === 0 && !deedLogLoading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                        No deeds match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>
              {deedLogTotal === 0 ? '0 results' : `${deedLogPage * DEED_LOG_PAGE_SIZE + 1}–${Math.min(deedLogTotal, (deedLogPage + 1) * DEED_LOG_PAGE_SIZE)} of ${deedLogTotal}`}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={deedLogLoading || deedLogPage === 0}
                onClick={() => loadDeedLog(deedLogPage - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={deedLogLoading || (deedLogPage + 1) * DEED_LOG_PAGE_SIZE >= deedLogTotal}
                onClick={() => loadDeedLog(deedLogPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default DeedLogSection;
