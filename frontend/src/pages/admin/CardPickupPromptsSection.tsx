import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircleQuestion, Edit2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  CardPickupPrompt,
  adminGetCardPickupPrompts,
  adminCreateCardPickupPrompt,
  adminUpdateCardPickupPrompt,
  adminDeleteCardPickupPrompt,
  PromptResponse,
  adminGetPromptResponses,
  adminApprovePromptResponse,
} from '@/lib/game-utils';

const PROMPT_STATUSES = ['Draft', 'Review', 'Approved', 'Retired'] as const;

const CardPickupPromptsSection: React.FC = () => {
  const [pickupPrompts, setPickupPrompts] = useState<CardPickupPrompt[]>([]);
  const [newPickupPrompt, setNewPickupPrompt] = useState({ question_text: '', status: 'Approved' as CardPickupPrompt['status'], is_active: true });
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [editPromptData, setEditPromptData] = useState({ question_text: '', status: 'Approved' as CardPickupPrompt['status'], is_active: true });
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptResponses, setPromptResponses] = useState<PromptResponse[]>([]);
  const [responseApprovalLoading, setResponseApprovalLoading] = useState<number | null>(null);

  useEffect(() => {
    adminGetCardPickupPrompts()
      .then(res => setPickupPrompts(res.prompts || []))
      .catch(() => {});
    adminGetPromptResponses()
      .then(res => setPromptResponses(res.responses || []))
      .catch(() => {});
  }, []);

  const handleAddPickupPrompt = async () => {
    if (!newPickupPrompt.question_text.trim()) { toast.error('Question text is required'); return; }
    setPromptLoading(true);
    try {
      const res = await adminCreateCardPickupPrompt({
        question_text: newPickupPrompt.question_text.trim(),
        status: newPickupPrompt.status,
        is_active: newPickupPrompt.is_active,
      });
      setPickupPrompts(prev => [...prev, res.prompt]);
      setNewPickupPrompt({ question_text: '', status: 'Approved', is_active: true });
      toast.success('Prompt added');
    } catch (e: any) { toast.error(e?.message || 'Failed to add prompt'); }
    finally { setPromptLoading(false); }
  };

  const handleUpdatePickupPrompt = async (id: number) => {
    if (!editPromptData.question_text.trim()) { toast.error('Question text is required'); return; }
    setPromptLoading(true);
    try {
      const res = await adminUpdateCardPickupPrompt(id, {
        question_text: editPromptData.question_text.trim(),
        status: editPromptData.status,
        is_active: editPromptData.is_active,
      });
      setPickupPrompts(prev => prev.map(p => p.id === id ? res.prompt : p));
      setEditingPromptId(null);
      toast.success('Prompt updated');
    } catch (e: any) { toast.error(e?.message || 'Failed to update prompt'); }
    finally { setPromptLoading(false); }
  };

  const handleDeletePickupPrompt = async (id: number) => {
    if (!confirm('Delete this prompt?')) return;
    setPromptLoading(true);
    try {
      await adminDeleteCardPickupPrompt(id);
      setPickupPrompts(prev => prev.filter(p => p.id !== id));
      toast.success('Prompt deleted');
    } catch (e: any) { toast.error(e?.message || 'Failed to delete prompt'); }
    finally { setPromptLoading(false); }
  };

  const handleToggleResponseApproval = async (id: number, approved: boolean) => {
    setResponseApprovalLoading(id);
    try {
      const res = await adminApprovePromptResponse(id, approved);
      setPromptResponses(prev => prev.map(r => r.id === id ? res.response : r));
      toast.success(approved ? 'Response approved for Community Voices' : 'Response hidden');
    } catch (e: any) { toast.error(e?.message || 'Failed to update response'); }
    finally { setResponseApprovalLoading(null); }
  };

  return (
    <section id="section-pickup-prompts">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="w-5 h-5 text-violet-500" />
            Card-Pickup Reflection Prompts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            A short, optional self-reflection question shown when a player picks up a new card, drawn at random from
            the active/Approved rows below. Answering is never required and never blocks card generation.
          </p>

          {/* Prompt list */}
          <div className="space-y-2">
            {pickupPrompts.map(prompt => (
              <div key={prompt.id} className={`border rounded-lg p-3 ${prompt.is_active ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                {editingPromptId === prompt.id ? (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-500 font-medium">Question</label>
                      <Textarea value={editPromptData.question_text} onChange={e => setEditPromptData(d => ({ ...d, question_text: e.target.value }))} className="text-sm min-h-[60px]" maxLength={300} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 font-medium">Status</label>
                        <select value={editPromptData.status} onChange={e => setEditPromptData(d => ({ ...d, status: e.target.value as CardPickupPrompt['status'] }))} className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm h-8">
                          {PROMPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm mt-5">
                        <input type="checkbox" checked={editPromptData.is_active} onChange={e => setEditPromptData(d => ({ ...d, is_active: e.target.checked }))} />
                        Active
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdatePickupPrompt(prompt.id)} disabled={promptLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingPromptId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{prompt.question_text}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{prompt.status}{!prompt.is_active && ' · Inactive'}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setEditingPromptId(prompt.id); setEditPromptData({ question_text: prompt.question_text, status: prompt.status, is_active: prompt.is_active }); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeletePickupPrompt(prompt.id)} className="text-rose-600 hover:text-rose-700">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {pickupPrompts.length === 0 && (
              <p className="text-sm text-slate-400 italic">No prompts yet — add one below.</p>
            )}
          </div>

          {/* Add new prompt */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <label className="text-xs text-slate-500 font-medium">New Prompt</label>
            <Textarea
              placeholder="e.g. What deed are you most proud of?"
              value={newPickupPrompt.question_text}
              onChange={e => setNewPickupPrompt(d => ({ ...d, question_text: e.target.value }))}
              className="text-sm min-h-[60px]"
              maxLength={300}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 font-medium">Status</label>
                <select value={newPickupPrompt.status} onChange={e => setNewPickupPrompt(d => ({ ...d, status: e.target.value as CardPickupPrompt['status'] }))} className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm h-8">
                  {PROMPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm mt-5">
                <input type="checkbox" checked={newPickupPrompt.is_active} onChange={e => setNewPickupPrompt(d => ({ ...d, is_active: e.target.checked }))} />
                Active
              </label>
            </div>
            <Button
              size="sm"
              onClick={handleAddPickupPrompt}
              disabled={promptLoading || !newPickupPrompt.question_text.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Plus className="w-3 h-3 mr-1" /> Add Prompt
            </Button>
          </div>

          {/* Response review queue — nothing a player typed goes public until approved here */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <label className="text-xs text-slate-500 font-medium">
              Player Responses — approve to show on the GR8Day Leaderboard's Community Voices (username shown, never a real name)
            </label>
            {promptResponses.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No responses yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {promptResponses.map(r => (
                  <div key={r.id} className={`border rounded-lg p-3 ${r.is_approved_for_display ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <p className="text-xs text-slate-500 font-medium">{r.question_text}</p>
                    <p className="text-sm text-slate-800 mt-0.5">{r.response_text}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-slate-400">@{r.username ?? 'unknown'}</p>
                      <Button
                        size="sm"
                        variant={r.is_approved_for_display ? 'outline' : 'default'}
                        onClick={() => handleToggleResponseApproval(r.id, !r.is_approved_for_display)}
                        disabled={responseApprovalLoading === r.id}
                        className={r.is_approved_for_display ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
                      >
                        {r.is_approved_for_display ? 'Hide' : 'Approve'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default CardPickupPromptsSection;
