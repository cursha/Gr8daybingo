import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { PrizeClaim, getAdminPrizeClaims, updatePrizeClaimStatus } from '@/lib/game-utils';

const PrizeClaimsSection: React.FC = () => {
  const [prizeClaims, setPrizeClaims] = useState<PrizeClaim[]>([]);

  const loadPrizeClaims = async () => {
    try {
      const res = await getAdminPrizeClaims();
      setPrizeClaims(res.claims || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load prize claims');
    }
  };

  useEffect(() => {
    loadPrizeClaims();
  }, []);

  const handleUpdateClaimStatus = async (id: number, status: string) => {
    try {
      await updatePrizeClaimStatus(id, status);
      toast.success('Claim status updated');
      await loadPrizeClaims();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update claim');
    }
  };

  return (
    <section id="section-prize-claims">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Prize Claims ({prizeClaims.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            Players who won bingo and submitted a claim. Update the status after contacting them.
          </p>
          {prizeClaims.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
              <Trophy className="w-8 h-8 text-slate-300" />
              No prize claims yet.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto divide-y">
                {prizeClaims.map((claim) => (
                  <div key={claim.id} className="px-3 py-3 text-sm hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="font-semibold text-slate-800">{claim.full_name}</p>
                        <p className="text-slate-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <a href={`mailto:${claim.email}`} className="text-indigo-600 hover:underline">{claim.email}</a>
                        </p>
                        {claim.phone && <p className="text-slate-500 text-xs">📞 {claim.phone}</p>}
                        {claim.mailing_address && <p className="text-slate-500 text-xs">📍 {claim.mailing_address}</p>}
                        {claim.notes && <p className="text-slate-400 italic text-xs">"{claim.notes}"</p>}
                        <p className="text-xs text-slate-400">
                          Week {claim.week_year} · {claim.created_at ? new Date(claim.created_at).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={claim.status}
                          onChange={(e) => handleUpdateClaimStatus(claim.id, e.target.value)}
                          className={`text-xs border rounded px-2 py-1 font-semibold ${
                            claim.status === 'fulfilled' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            claim.status === 'contacted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            claim.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="contacted">Contacted</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default PrizeClaimsSection;
