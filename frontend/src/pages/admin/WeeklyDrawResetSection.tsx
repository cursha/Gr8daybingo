import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import { adminPreviewDraw, adminConfirmDraw, adminGetPendingDraw, PendingDrawWinner } from '@/lib/game-utils';

const WeeklyDrawResetSection: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<PendingDrawWinner | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    adminGetPendingDraw()
      .then((res) => setPending(res.pending))
      .catch(() => { /* silent — admin can just tap Run Draw */ });
  }, []);

  const handleRunDraw = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await adminPreviewDraw();
      if (res.already_ran) {
        setPending(null);
        setStatusMessage(`Already confirmed for ${res.week_year}${res.winner?.display_name ? ` — winner: ${res.winner.display_name}` : ''}.`);
      } else if (res.pending && res.winner) {
        setPending({
          week_year: res.week_year,
          user_id: res.winner.user_id,
          display_name: res.winner.display_name,
          winning_entries: res.winner.winning_entries ?? 0,
          pool_entries: res.winner.pool_entries ?? 0,
          eligible_players: res.winner.eligible_players ?? 0,
        });
      } else {
        setPending(null);
        setStatusMessage(`No winner could be picked for ${res.week_year} (${res.reason ?? 'no eligible players'}).`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to run the draw.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setConfirming(true);
    try {
      const res = await adminConfirmDraw(pending.week_year);
      if (res.already_ran) {
        toast.info('This week\'s draw was already confirmed.');
      } else {
        toast.success(
          `Winner announced: ${res.winner?.display_name ?? 'player'}. Emailed ${res.announced?.sent ?? 0} players${res.announced?.failed ? ` (${res.announced.failed} failed)` : ''}.`
        );
      }
      setPending(null);
      setStatusMessage(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to confirm the draw.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section id="section-reset">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-sky-500" />
            Weekly Draw Run
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Manually run the weekly prize draw. Tapping "Run Draw Now" computes the winner and shows it here for
            review — nothing is finalized or announced until you tap "Confirm &amp; Announce Winner". You'll get an
            email reminder every Monday to do this.
          </p>

          {!pending && (
            <Button
              onClick={handleRunDraw}
              disabled={loading}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
            >
              {loading ? 'Running…' : 'Run Draw Now'}
            </Button>
          )}

          {statusMessage && !pending && (
            <p className="text-sm text-slate-600">{statusMessage}</p>
          )}

          {pending && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-emerald-600" />
                <p className="font-bold text-emerald-900">Proposed winner for {pending.week_year}</p>
              </div>
              <p className="text-lg font-bold text-slate-800">{pending.display_name ?? 'Unnamed player'}</p>
              <p className="text-sm text-slate-600">
                {pending.winning_entries} of {pending.pool_entries} pool entries · {pending.eligible_players} eligible players
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {confirming ? 'Confirming…' : 'Confirm & Announce Winner'}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Confirming emails the winner directly, emails you an audit copy, and announces the winner to every player.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default WeeklyDrawResetSection;
