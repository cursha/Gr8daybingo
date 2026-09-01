import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { adminTriggerWeeklyReset } from '@/lib/game-utils';

const WeeklyDrawResetSection: React.FC = () => {
  const [weeklyResetLoading, setWeeklyResetLoading] = useState(false);

  const handleWeeklyReset = async () => {
    setWeeklyResetLoading(true);
    try {
      const res = await adminTriggerWeeklyReset();
      toast.success(res.draw.already_ran ? 'Weekly draw already ran for this week.' : `Weekly draw run for ${res.week}${res.draw.winner_name ? ` — winner: ${res.draw.winner_name}` : ' — no winner selected'}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send weekly emails.');
    } finally {
      setWeeklyResetLoading(false);
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
            Runs the weekly prize draw and emails the winner. This runs automatically every Monday at 8am UTC (safe to re-run — it's a no-op if the draw already ran this week). The "new card is ready" email is sent separately and automatically, the first time any player loads a card for the new week.
          </p>
          <Button
            onClick={handleWeeklyReset}
            disabled={weeklyResetLoading}
            className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
          >
            {weeklyResetLoading ? 'Running…' : 'Run Draw Now'}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
};

export default WeeklyDrawResetSection;
