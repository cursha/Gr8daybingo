import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';

const TermsOfService: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
          <span className="font-black text-slate-800">Havagr8day!</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 prose prose-slate">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: June 2026</p>

        <p className="text-slate-600 mb-6">
          Welcome to Havagr8day Bingo ("the Game", "we", "us", or "our"). By creating an account or
          playing the Game, you agree to these Terms of Service. Please read them carefully.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">1. Eligibility</h2>
        <p className="text-slate-600">
          You must be at least 18 years old to create an account and participate in the Game. By
          registering, you confirm that you meet this requirement.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">2. How the Game Works</h2>
        <p className="text-slate-600">
          Havagr8day Bingo is a community-based bingo game where players complete real-world acts of
          kindness ("Gr8Day Deeds") to mark squares on a 5×5 bingo card. A new card is generated for
          each player every Monday. Winners are determined by the active win condition set by the
          administrator (e.g., One Line, Two Lines, Four Corners, or Fill the Card).
        </p>
        <p className="text-slate-600 mt-3">
          The Game is based on your genuine completion of acts of kindness. By marking a square as
          complete, you confirm that you have performed the corresponding deed. False or fraudulent
          marking may result in disqualification and account suspension.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">3. Wallet and Payments</h2>
        <p className="text-slate-600">
          The Game includes a wallet feature allowing players to add funds and use them to purchase
          selected squares on their bingo card. All payments are processed securely through Stripe.
          Funds added to your wallet are non-refundable once used to purchase a square. Unused wallet
          balances may be refunded at our discretion upon request.
        </p>
        <p className="text-slate-600 mt-3">
          The Game is not a form of gambling. Purchased squares do not guarantee a win. The outcome
          of the Game depends primarily on a player's completion of Gr8Day Deeds.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">4. Prizes</h2>
        <p className="text-slate-600">
          A prize is offered each game week. To claim a prize, a winning player must submit their
          contact information through the prize claim form within 14 days of winning. Unclaimed prizes
          forfeit. Prize details, value, and availability are determined by the Game administrator and
          may change week to week. We reserve the right to substitute prizes of equal or greater value.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">5. Referrals</h2>
        <p className="text-slate-600">
          Players may refer others by submitting a valid email address. A referral square is marked
          complete when a referral is submitted. We reserve the right to validate referrals and reverse
          completions if a referral is found to be fraudulent or self-referential.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">6. Prohibited Conduct</h2>
        <ul className="text-slate-600 space-y-2 list-disc pl-6">
          <li>Falsely claiming to have completed Gr8Day Deeds</li>
          <li>Creating multiple accounts to gain an unfair advantage</li>
          <li>Using automated tools or scripts to interact with the Game</li>
          <li>Attempting to manipulate the winner selection system</li>
          <li>Submitting fraudulent referrals or payment information</li>
        </ul>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">7. Account Suspension and Termination</h2>
        <p className="text-slate-600">
          We reserve the right to suspend or terminate any account at our discretion for violation of
          these Terms, fraudulent activity, or any conduct that we determine to be harmful to the Game
          or its community.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">8. Limitation of Liability</h2>
        <p className="text-slate-600">
          To the fullest extent permitted by law, Havagr8day Bingo and its operators shall not be
          liable for any indirect, incidental, or consequential damages arising from your use of the
          Game. The Game is provided "as is" without warranty of any kind.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">9. Changes to These Terms</h2>
        <p className="text-slate-600">
          We may update these Terms from time to time. Continued use of the Game after changes are
          posted constitutes your acceptance of the updated Terms.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">10. Contact</h2>
        <p className="text-slate-600">
          For questions about these Terms, please contact us at{' '}
          <a href="mailto:support@havagr8day.com" className="text-indigo-600 underline">
            support@havagr8day.com
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default TermsOfService;
