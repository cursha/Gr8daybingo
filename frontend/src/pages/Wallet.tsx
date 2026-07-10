import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { WalletData, Transaction, getWallet, getTransactions, createTopup } from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Heart,
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
} from 'lucide-react';
import Footer from '@/components/Footer';

const FUND_OPTIONS = [5, 10, 20];

const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [redirectingAmount, setRedirectingAmount] = useState<number | null>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { state: { from: '/wallet' } });
  }, [loading, user, navigate]);

  // Handle ?success=1 and ?cancelled=1 query params
  useEffect(() => {
    if (searchParams.get('success') === '1') {
      toast.success('Funds added to your wallet!');
    } else if (searchParams.get('cancelled') === '1') {
      toast.info('Payment cancelled.');
    }
  }, [searchParams]);

  const loadWalletData = useCallback(async () => {
    try {
      const [walletData, txnData] = await Promise.all([getWallet(), getTransactions()]);
      setWallet(walletData);
      setTransactions(txnData.transactions || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load wallet');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadWalletData();
  }, [user, loadWalletData]);

  const handleTopUp = async (amount: number) => {
    setRedirectingAmount(amount);
    try {
      const { url } = await createTopup(amount);
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.message || 'Could not start payment. Please try again.');
      setRedirectingAmount(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={() => navigate('/game')}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-1.5 text-white font-bold text-sm">
          <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
          Havagr8day Bingo
        </div>
        <div className="w-16" />
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-4">
        {/* Balance card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-indigo-500/20 rounded-full p-2">
              <WalletIcon className="w-5 h-5 text-indigo-300" />
            </div>
            <span className="text-white/60 text-sm font-medium">Current Balance</span>
          </div>
          {dataLoading ? (
            <div className="h-10 w-24 bg-white/10 rounded animate-pulse" />
          ) : (
            <div className="text-4xl font-black text-white">
              {wallet?.balance?.toFixed(2) ?? '0.00'} <span className="text-xl text-white/50">Gr8Day Bucks</span>
            </div>
          )}
          <p className="text-white/40 text-xs mt-2">
            Use your Gr8Day Bucks to purchase power-up squares on your Gr8Day card.
          </p>
        </div>

        {/* Add funds */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Add Funds</h2>
          </div>
          <p className="text-white/50 text-sm mb-4">
            Select an amount to add that many Gr8Day Bucks. You'll be taken to Stripe's secure checkout and returned here when done.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {FUND_OPTIONS.map((amount) => {
              const isRedirecting = redirectingAmount === amount;
              const anyRedirecting = redirectingAmount !== null;
              return (
                <Button
                  key={amount}
                  onClick={() => handleTopUp(amount)}
                  disabled={anyRedirecting}
                  className="h-16 text-lg font-black bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-all"
                >
                  {isRedirecting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    `$${amount}`
                  )}
                </Button>
              );
            })}
          </div>
          <p className="text-white/30 text-xs mt-3 text-center">
            🔒 Payments processed securely by Stripe
          </p>
        </div>

        {/* Transaction history */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Transaction History</h2>
          </div>
          {dataLoading ? (
            <div className="px-4 py-8 text-center text-white/40 text-sm">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/40 text-sm">No transactions yet</div>
          ) : (
            <div className="divide-y divide-white/5">
              {transactions.map((txn) => {
                const isDeposit = txn.transaction_type === 'deposit';
                const isPending = txn.status === 'pending';
                return (
                  <div key={txn.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-full p-1.5 ${
                          isDeposit
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {isDeposit ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {txn.item_description || txn.transaction_type}
                          {isPending && (
                            <span className="ml-2 text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold uppercase">
                              Pending
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-white/40">
                          {txn.created_at
                            ? new Date(txn.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`font-bold text-sm ${
                        txn.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {txn.amount >= 0 ? '+' : ''}${Math.abs(txn.amount).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default WalletPage;
