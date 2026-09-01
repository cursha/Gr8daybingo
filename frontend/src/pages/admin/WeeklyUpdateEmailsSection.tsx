import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { WeeklyUpdateLogEntry, getAdminWeeklyUpdates } from '@/lib/game-utils';

const WeeklyUpdateEmailsSection: React.FC = () => {
  const [weeklyUpdateLogs, setWeeklyUpdateLogs] = useState<WeeklyUpdateLogEntry[]>([]);

  const loadWeeklyUpdates = async () => {
    try {
      const res = await getAdminWeeklyUpdates();
      setWeeklyUpdateLogs(res.logs || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load weekly update log');
    }
  };

  useEffect(() => {
    loadWeeklyUpdates();
  }, []);

  return (
    <section id="section-weekly-updates">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-teal-500" />
            Weekly Update Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            History of the AI-generated weekly member update emails actually delivered, most recent first.
          </p>
          {weeklyUpdateLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
              <Mail className="w-8 h-8 text-slate-300" />
              No weekly update emails sent yet.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[360px] overflow-y-auto divide-y">
                {weeklyUpdateLogs.map((l) => {
                  const subjectLine = l.message_snapshot.split('\n')[0].replace(/^Subject:\s*/, '');
                  return (
                    <div key={l.id} className="px-3 py-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-800">{l.name ?? 'Unknown'}</p>
                        {l.email && (
                          <p className="text-slate-500 text-xs">
                            <a href={`mailto:${l.email}`} className="text-indigo-600 hover:underline">{l.email}</a>
                          </p>
                        )}
                        <p className="text-xs text-slate-600 italic">"{subjectLine}"</p>
                        <p className="text-xs text-slate-400">
                          Week of {l.week_of} · sent {new Date(l.sent_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default WeeklyUpdateEmailsSection;
