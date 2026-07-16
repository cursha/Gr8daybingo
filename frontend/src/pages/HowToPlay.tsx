import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Heart, Grid3x3, EyeOff, Eye, Sparkles, DollarSign, Users, Gift,
  Flame, ArrowLeftRight, Trophy, RefreshCw, Ban, Pause, Lock,
} from 'lucide-react';

// ── Shared section shell ─────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ icon, title, children }) => (
  <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
    <h3 className="font-bold text-white flex items-center gap-2 mb-2">
      {icon}
      {title}
    </h3>
    <div className="text-sm text-indigo-200/80 space-y-2">{children}</div>
  </div>
);

// ── Classic Mode content ─────────────────────────────────────────────────────

const ClassicContent: React.FC = () => (
  <div className="space-y-3">
    <Section icon={<Grid3x3 className="w-4 h-4 text-indigo-300" />} title="The Goal">
      <p>
        Your card is a 5×5 grid. Complete real acts of kindness — Gr8Day Deeds — to mark squares,
        and get Bingo by matching whatever win pattern is active that week (one line, two lines,
        four corners, an X, around the edges, or the whole card). You can keep playing the same
        card past a win, all the way to the end of the week.
      </p>
    </Section>

    <Section icon={<Sparkles className="w-4 h-4 text-amber-300" />} title="Marking a Square">
      <p>
        Tap a square, confirm you did the deed, and it's marked. Some deeds need a few reps
        (e.g. "Buy 3 coffees for strangers") — those show progress like <strong>1 · 2 · 3</strong>,
        and tapping cycles through until it's complete.
      </p>
    </Section>

    <Section icon={<DollarSign className="w-4 h-4 text-emerald-300" />} title="Special Squares">
      <p>
        A couple of squares on every card aren't plain deeds:
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Purchasable</strong> — 1 to 3 squares can be unlocked instantly with Gr8Day Bucks instead of doing the deed.</li>
        <li><strong>Secret</strong> — one square hides a small Gr8Day Bucks bonus, revealed only once you complete it.</li>
      </ul>
    </Section>

    <Section icon={<Users className="w-4 h-4 text-teal-300" />} title="Invite a Friend">
      <p>
        Invite a friend by email from the game board. When they sign up and verify their email,
        you <em>both</em> get a Gr8Day Bucks bonus in your wallet — $5 by default, admin-adjustable.
        It's a wallet credit, not a square.
      </p>
    </Section>

    <Section icon={<Gift className="w-4 h-4 text-rose-300" />} title="I Dare Ya! (Centre Square)">
      <p>
        The centre square is always free and always counts toward your Bingo. When you tap it,
        one of six outcomes (rolled and locked in when your card was generated) is revealed — a
        free square, a chance to refer a friend, a Gr8Day Bucks credit, a small deduction, three
        of your squares getting swapped for new deeds, or simply nothing. It's a surprise every
        card — you don't have to interact with it if you'd rather not.
      </p>
    </Section>

    <Section icon={<ArrowLeftRight className="w-4 h-4 text-sky-300" />} title="Team Trades">
      <p>
        Once a week, you can offer to swap one of your uncompleted squares for a teammate's.
        They have 48 hours to accept or decline — nothing changes on either card until they say yes.
      </p>
    </Section>

    <Section icon={<Flame className="w-4 h-4 text-orange-300" />} title="Streaks & Bonus Draws">
      <p>
        Complete at least one deed a day to build a streak, with milestones along the way.
        Completing a full Bingo line also earns bonus entries into the prize draw — the more
        lines, the more entries.
      </p>
    </Section>

    <Section icon={<RefreshCw className="w-4 h-4 text-teal-300" />} title="Weekly Reset & Prizes">
      <p>
        A new card is generated each week. If you get Bingo, you can submit a prize claim —
        check <strong>My Wins</strong> for your history and the winners page for who's won recently.
      </p>
    </Section>
  </div>
);

// ── Blackout Mode content ────────────────────────────────────────────────────

const BlackoutContent: React.FC = () => (
  <div className="space-y-3">
    <Section icon={<EyeOff className="w-4 h-4 text-slate-300" />} title="The Goal">
      <p>
        Same underlying game as Classic — same Bingo win pattern, same win checking — but every
        square except the free centre space starts completely hidden. You don't know what's
        behind a square, or even that anyone knows, until it's revealed. No purchasable, secret,
        or referral squares in this mode — every hidden square is a plain deed.
      </p>
    </Section>

    <Section icon={<Eye className="w-4 h-4 text-indigo-300" />} title="Revealing Squares">
      <p>
        Tap any hidden square to reveal it. Most of the time that's all that opens up, but
        occasionally 1–3 neighboring hidden squares flip open with it too — the odds are set by
        the admins and skew heavily toward "just the one you tapped."
      </p>
    </Section>

    <Section icon={<Ban className="w-4 h-4 text-rose-300" />} title="Resolving an Open Group">
      <p>
        Every square that opens has to be dealt with — either completed like a normal deed, or
        passed on if you don't want it. A passed square is permanently blocked; it can't be
        completed or traded later. You can't reveal anything new until every square currently
        open has been resolved one way or the other.
      </p>
    </Section>

    <Section icon={<Pause className="w-4 h-4 text-amber-300" />} title="Pausing">
      <p>
        There's no timer, so you can step away any time — just not in the middle of an open
        group. Resolve what's open first, then pause and pick it back up whenever you like.
      </p>
    </Section>

    <Section icon={<Lock className="w-4 h-4 text-purple-300" />} title="Team Trades — Blind Picks">
      <p>
        Trades work in Blackout too, and you can even offer a square you haven't revealed
        yourself yet — otherwise there'd rarely be enough open squares to trade at all. When you
        pick from a teammate's card, you'll see the names of what's available, not where any of
        it sits on their board. If a trade goes through on a square that was still hidden, you'll
        learn <em>what</em> you now have from the trade offer — but not <em>where</em> it landed
        on your own card. You'll still have to reveal it for real to find out.
      </p>
    </Section>

    <Section icon={<Trophy className="w-4 h-4 text-emerald-300" />} title="Everything Else">
      <p>
        Streaks, bonus draw entries for completed lines, the weekly reset, and prize claims all
        work exactly the same as Classic mode.
      </p>
    </Section>
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────

const HowToPlay: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'classic' | 'blackout'>('classic');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
      <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/game')}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
            <span className="text-base font-bold text-white">How to Play</span>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
          <button
            onClick={() => setMode('classic')}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-lg transition-all',
              mode === 'classic' ? 'bg-indigo-500 text-white' : 'text-white/60 hover:text-white',
            ].join(' ')}
          >
            <Grid3x3 className="w-4 h-4" />
            Classic Mode
          </button>
          <button
            onClick={() => setMode('blackout')}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-lg transition-all',
              mode === 'blackout' ? 'bg-slate-700 text-white' : 'text-white/60 hover:text-white',
            ].join(' ')}
          >
            <EyeOff className="w-4 h-4" />
            Blackout Mode
          </button>
        </div>

        {mode === 'classic' ? <ClassicContent /> : <BlackoutContent />}
      </div>
    </div>
  );
};

export default HowToPlay;
