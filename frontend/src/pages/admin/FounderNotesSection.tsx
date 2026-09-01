import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PenLine, Save } from 'lucide-react';
import { toast } from 'sonner';
import { FounderNoteRow, adminGetFounderNotes } from '@/lib/game-utils';

const FOUNDER_NOTES_PAGE_SIZE = 50;

interface FounderNotesSectionProps {
  editConfigs: Record<string, string>;
  setEditConfigs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSaveConfig: () => Promise<void>;
}

const FounderNotesSection: React.FC<FounderNotesSectionProps> = ({ editConfigs, setEditConfigs, onSaveConfig }) => {
  const [founderNoteRows, setFounderNoteRows] = useState<FounderNoteRow[]>([]);
  const [founderNoteTotal, setFounderNoteTotal] = useState(0);
  const [founderNotePage, setFounderNotePage] = useState(0);
  const [founderNoteLoading, setFounderNoteLoading] = useState(false);

  const founderNotePct = editConfigs['founder_note_pct'] ?? '';

  const loadFounderNotes = async (page = 0) => {
    setFounderNoteLoading(true);
    try {
      const res = await adminGetFounderNotes(page);
      setFounderNoteRows(res.rows);
      setFounderNoteTotal(res.total);
      setFounderNotePage(res.page);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load founder notes');
    } finally {
      setFounderNoteLoading(false);
    }
  };

  useEffect(() => {
    loadFounderNotes();
  }, []);

  return (
    <section id="section-founder-notes">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-rose-500" />
            Founder Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">
            A short, casual note "from Curt" — written by Claude, reacting to the specific deed —
            triggered by a random slice of deed completions and sent 12-24h later (once per player
            per day, max). Requires an <code>ANTHROPIC_API_KEY</code> secret and{' '}
            <code>RESEND_API_KEY</code> to actually send.
          </p>
          <div className="max-w-xs">
            <label className="text-sm font-medium text-slate-700 mb-1 block">% Chance per Deed Completion (0 = off)</label>
            <Input
              type="number"
              min="0"
              max="100"
              value={founderNotePct}
              onChange={(e) => setEditConfigs((prev) => ({ ...prev, founder_note_pct: e.target.value }))}
            />
          </div>
          <Button onClick={onSaveConfig} className="bg-rose-600 hover:bg-rose-700 text-white">
            <Save className="w-4 h-4 mr-1" /> Save Founder Note Settings
          </Button>

          <div className="border rounded-lg overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Deed</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Scheduled</th>
                    <th className="px-3 py-2">Sent</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {founderNoteRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{row.player_name}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={row.generated_message ?? row.deed_text_snapshot}>
                        {row.deed_text_snapshot}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          row.status === 'sent' ? 'bg-emerald-50 text-emerald-700'
                          : row.status === 'failed' ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(row.scheduled_send_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.sent_at ? new Date(row.sent_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                  {founderNoteRows.length === 0 && !founderNoteLoading && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                        No founder notes queued yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {founderNoteTotal === 0 ? '0 results' : `${founderNotePage * FOUNDER_NOTES_PAGE_SIZE + 1}–${Math.min(founderNoteTotal, (founderNotePage + 1) * FOUNDER_NOTES_PAGE_SIZE)} of ${founderNoteTotal}`}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={founderNoteLoading || founderNotePage === 0}
                onClick={() => loadFounderNotes(founderNotePage - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={founderNoteLoading || (founderNotePage + 1) * FOUNDER_NOTES_PAGE_SIZE >= founderNoteTotal}
                onClick={() => loadFounderNotes(founderNotePage + 1)}
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

export default FounderNotesSection;
