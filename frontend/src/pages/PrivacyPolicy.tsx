import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';

const PrivacyPolicy: React.FC = () => {
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

      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-8">Last updated: June 2026</p>

        <p className="text-slate-600 mb-6">
          Havagr8day Bingo ("we", "us", or "our") is committed to protecting your personal
          information. This Privacy Policy explains what information we collect, how we use it, and
          your rights regarding it.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">1. Information We Collect</h2>
        <ul className="text-slate-600 space-y-3 list-disc pl-6">
          <li>
            <strong>Account information:</strong> When you register, we collect your first name, last
            name, and email address.
          </li>
          <li>
            <strong>Game activity:</strong> We store your bingo card progress, completed deeds,
            purchased squares, referrals submitted, and win history.
          </li>
          <li>
            <strong>Payment information:</strong> When you add funds to your wallet, your payment is
            processed by Stripe. We do not store your credit card number or payment details — Stripe
            handles all payment data securely.
          </li>
          <li>
            <strong>Wallet transactions:</strong> We record the amount and type of each wallet
            transaction (deposits, purchases, rewards) to maintain your account balance.
          </li>
          <li>
            <strong>Prize claims:</strong> If you win and submit a prize claim, we collect the contact
            details you provide (name, address, or phone) solely for the purpose of delivering your
            prize.
          </li>
        </ul>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">2. How We Use Your Information</h2>
        <ul className="text-slate-600 space-y-2 list-disc pl-6">
          <li>To create and maintain your account</li>
          <li>To operate the bingo game and track your progress</li>
          <li>To process wallet transactions through Stripe</li>
          <li>To deliver prizes to winners</li>
          <li>To send game-related notifications (win alerts, referral confirmations, password resets)</li>
          <li>To prevent fraud and enforce our Terms of Service</li>
        </ul>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">3. Information Sharing</h2>
        <p className="text-slate-600">
          We do not sell, rent, or share your personal information with third parties for marketing
          purposes. We share your data only in the following limited circumstances:
        </p>
        <ul className="text-slate-600 space-y-2 list-disc pl-6 mt-3">
          <li>
            <strong>Stripe:</strong> Payment processing only. Stripe's privacy policy governs how
            they handle your payment data.
          </li>
          <li>
            <strong>Supabase:</strong> Our database and authentication provider. Your data is stored
            on Supabase's infrastructure.
          </li>
          <li>
            <strong>Legal requirements:</strong> We may disclose your information if required by law
            or to protect our rights.
          </li>
        </ul>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">4. Data Security</h2>
        <p className="text-slate-600">
          We use industry-standard security measures to protect your data, including encrypted
          connections (HTTPS) and secure token-based authentication. Passwords are never stored in
          plain text.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">5. Data Retention</h2>
        <p className="text-slate-600">
          We retain your account information for as long as your account is active. If you request
          account deletion, we will delete your personal information within 30 days, except where
          retention is required for legal or financial compliance purposes.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">6. Your Rights</h2>
        <p className="text-slate-600">You have the right to:</p>
        <ul className="text-slate-600 space-y-2 list-disc pl-6 mt-3">
          <li>Access the personal information we hold about you</li>
          <li>Correct inaccurate information</li>
          <li>Request deletion of your account and data</li>
          <li>Opt out of non-essential communications</li>
        </ul>
        <p className="text-slate-600 mt-3">
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:support@havagr8day.com" className="text-indigo-600 underline">
            support@havagr8day.com
          </a>
          .
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">7. Cookies</h2>
        <p className="text-slate-600">
          We use local storage (not cookies) to store your authentication token on your device. This
          is necessary for the Game to function and keep you logged in. We do not use tracking or
          advertising cookies.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">8. Changes to This Policy</h2>
        <p className="text-slate-600">
          We may update this Privacy Policy from time to time. We will notify you of significant
          changes by email or by posting a notice in the Game. Continued use of the Game after changes
          are posted constitutes your acceptance of the updated Policy.
        </p>

        <h2 className="text-xl font-bold text-slate-800 mt-8 mb-3">9. Contact</h2>
        <p className="text-slate-600">
          For privacy questions or requests, contact us at{' '}
          <a href="mailto:support@havagr8day.com" className="text-indigo-600 underline">
            support@havagr8day.com
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
