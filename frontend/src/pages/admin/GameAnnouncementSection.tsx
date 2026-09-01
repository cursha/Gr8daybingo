import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminAnnounceGame } from '@/lib/game-utils';

interface GameAnnouncementSectionProps {
  editConfigs: Record<string, string>;
  setEditConfigs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSaveConfig: () => Promise<void>;
}

const GameAnnouncementSection: React.FC<GameAnnouncementSectionProps> = ({ editConfigs, setEditConfigs, onSaveConfig }) => {
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announcePrize, setAnnouncePrize] = useState('');
  const [announceGameType, setAnnounceGameType] = useState('');
  const [announceTheme, setAnnounceTheme] = useState('');
  const [announceExtra, setAnnounceExtra] = useState('');

  const gameAnnouncementPromptTemplate = editConfigs['game_announcement_prompt_template'] || '';

  const handleAnnounceGame = async () => {
    if (!announcePrize.trim() || !announceGameType.trim()) {
      toast.error('Prize and Game Type are required.');
      return;
    }
    setAnnounceLoading(true);
    try {
      const res = await adminAnnounceGame({
        prize: announcePrize.trim(),
        game_type: announceGameType.trim(),
        theme: announceTheme.trim(),
        extra_message: announceExtra.trim() || undefined,
      });
      toast.success(`Game announcement sent: ${res.sent} delivered, ${res.failed} failed.`);
      setAnnouncePrize('');
      setAnnounceGameType('');
      setAnnounceTheme('');
      setAnnounceExtra('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send game announcement.');
    } finally {
      setAnnounceLoading(false);
    }
  };

  return (
    <section id="section-announce">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-500" />
            Announce New Game to All Players
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Send an email to all verified players announcing a new game. Include the prize, game type, and optional theme. A button overview is automatically included at the bottom of every announcement.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Prize <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="e.g. $50 Amazon Gift Card"
              value={announcePrize}
              onChange={(e) => setAnnouncePrize(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Game Type <span className="text-red-500">*</span></label>
            <input
              type="text"
              placeholder="e.g. One Line, Four Corners, Full Card"
              value={announceGameType}
              onChange={(e) => setAnnounceGameType(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Theme <span className="text-slate-400 text-xs">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Summer of Kindness"
              value={announceTheme}
              onChange={(e) => setAnnounceTheme(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Additional Message <span className="text-slate-400 text-xs">(optional — leave blank to have Claude write one)</span></label>
            <textarea
              placeholder="Leave blank and Claude will write a short warm note from the Prize/Game Type/Theme above, using the AI Prompt Template below."
              value={announceExtra}
              onChange={(e) => setAnnounceExtra(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>
          <Button
            onClick={handleAnnounceGame}
            disabled={announceLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {announceLoading ? 'Sending…' : 'Send Announcement to All Players'}
          </Button>

          <div className="pt-3 mt-3 border-t border-slate-200 space-y-2">
            <label className="text-sm font-medium text-slate-700 block">AI Prompt Template <span className="text-slate-400 text-xs">(optional)</span></label>
            <Textarea
              placeholder="Leave blank to use the built-in default prompt."
              value={gameAnnouncementPromptTemplate}
              onChange={(e) => setEditConfigs((prev) => ({ ...prev, game_announcement_prompt_template: e.target.value }))}
              className="min-h-[140px] font-mono text-xs"
            />
            <p className="text-xs text-slate-400">
              Used only when Additional Message above is left blank, and only if an <code>ANTHROPIC_API_KEY</code>{' '}
              secret is configured — otherwise the email just sends with no extra message. Include{' '}
              <code>{'{{PRIZE}}'}</code>, <code>{'{{GAME_TYPE}}'}</code>, and <code>{'{{THEME}}'}</code> so Claude
              knows this week's details.
            </p>
            <Button onClick={onSaveConfig} variant="outline" size="sm">
              <Save className="w-4 h-4 mr-1" /> Save AI Prompt
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default GameAnnouncementSection;
