import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Heart, Grid3x3, EyeOff, Eye, Sparkles, DollarSign, Users, Gift,
  Flame, ArrowLeftRight, Trophy, RefreshCw, Ban, Pause, Lock, Shuffle, Bomb, Crown, Ticket, Compass,
  Target, Globe, Zap, Star,
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

// ── The Two Goals (shared across both modes) ─────────────────────────────────

const TheGoalsContent: React.FC = () => (
  <div className="space-y-3 mb-6">
    <h2 className="text-white/50 text-xs font-bold uppercase tracking-wider px-1">Why This Game Exists</h2>
    <Section icon={<Target className="w-4 h-4 text-emerald-300" />} title="Goal 1: Do Gr8Day Deeds">
      <p>
        Realize how easy it actually is to make a difference in the lives of friends and
        strangers. Most of these deeds take minutes, not money — the game just gives you a reason
        to actually go do them.
      </p>
    </Section>
    <Section icon={<Globe className="w-4 h-4 text-sky-300" />} title="Goal 2: Track the Impact">
      <p>
        Just as important — capture it. Plenty of people do good; almost nobody records it, so the
        real scale of it never shows. Our goal is a bird's-eye view of the effort everyone's
        putting in, and how far it reaches over time — one coffee bought here is one thing, but it
        adds up to 5,000 coffees worldwide. The <strong>Leaderboard</strong> is where it all gets
        gathered and recorded.
      </p>
    </Section>
  </div>
);

// ── Spirit of the Game (shared across both modes) ────────────────────────────

const SpiritOfGameContent: React.FC = () => (
  <div className="space-y-3 mb-6">
    <h2 className="text-white/50 text-xs font-bold uppercase tracking-wider px-1">Spirit of the Game</h2>
    <Section icon={<Compass className="w-4 h-4 text-rose-300" />} title="New, Not Routine">
      <p>
        The whole point is encouraging new, unique kindness — not logging things you already do.
        If you already take your mother to lunch every Wednesday, that's wonderful, but it's not a
        Gr8Day Deed. Save your squares for something you wouldn't have done otherwise — a bit of a
        stretch, genuinely for someone else's day.
      </p>
    </Section>
    <Section icon={<Sparkles className="w-4 h-4 text-amber-300" />} title="Record As You Go">
      <p>
        Mark each deed when you actually do it, not in a batch afterward. Logging 3-4 at once
        tends to get flagged for a closer look — the game's built around real moments as they
        happen, not an end-of-day catch-up session.
      </p>
    </Section>
    <Section icon={<Heart className="w-4 h-4 text-pink-300" />} title="It's About Fun and Kindness">
      <p>
        At the end of the day, this game exists to get more kindness into the world — winning is a
        nice bonus, not the point. You can absolutely game the system if you want to. But the
        squares were never the reward; the deed was. Fake your way through it and the only person
        you've actually shortchanged is you.
      </p>
    </Section>
  </div>
);

// ── Quick Taps (shared across both modes) ────────────────────────────────────

const QuickTapContent: React.FC = () => (
  <div className="space-y-3 mb-6">
    <h2 className="text-white/50 text-xs font-bold uppercase tracking-wider px-1">Quick Taps</h2>
    <Section icon={<Zap className="w-4 h-4 text-emerald-300" />} title="Not Part of Your Bingo Card">
      <p>
        Quick Taps are separate from the 5×5 grid entirely — nothing about them marks a square or
        counts toward Bingo. They're just a fast way to log a good deed the moment you do it,
        without needing it to be on your card. Each tap still earns a draw entry and counts toward
        your streak, same as any deed.
      </p>
    </Section>
    <Section icon={<Sparkles className="w-4 h-4 text-amber-300" />} title="Yours to Customize">
      <p>
        You get up to three Quick Tap buttons. We start you off with a default set, but they're
        entirely yours to change — hit <strong>Customize</strong> and pick whichever eligible deeds
        fit your life best. Tap one as many times as you actually do it; there's no limit tied to
        the deed itself.
      </p>
    </Section>
    <Section icon={<Star className="w-4 h-4 text-amber-400" />} title="This Week's Spotlight">
      <p>
        A fourth button, set by us each week and visually called out from your own three — one
        deed we're hoping everyone gives a shot. It's optional like everything else, just a nudge
        toward something we think is worth doing this week.
      </p>
    </Section>
  </div>
);

// ── Team Play (shared across both modes) ─────────────────────────────────────

const TeamPlayContent: React.FC = () => (
  <div className="space-y-3 mb-6">
    <h2 className="text-white/50 text-xs font-bold uppercase tracking-wider px-1">Team Play</h2>
    <Section icon={<Users className="w-4 h-4 text-teal-300" />} title="Getting on a Team">
      <p>
        Teams are set up by admins, not something you join yourself — if you're not on one yet,
        ask an admin to add you. Teams are capped at 4 players. Teams show up on the leaderboard
        ranked by total deeds completed, so it's a group effort, not just an individual score.
        Each team has a captain.
      </p>
    </Section>
    <Section icon={<Crown className="w-4 h-4 text-amber-300" />} title="Your Team Page">
      <p>
        See your whole roster, who's captain, and each teammate's card status from the{' '}
        <strong>Team</strong> menu on the game board. You can also print the whole team's cards
        together — up to 4, laid out on one sheet — handy for in-person events where you can help
        each other out.
      </p>
    </Section>
    <Section icon={<ArrowLeftRight className="w-4 h-4 text-sky-300" />} title="Trading With Teammates">
      <p>
        Once a week, offer to swap one of your uncompleted squares for a teammate's. It's
        completely optional — nothing about the game requires it. They have 48 hours to accept or
        decline, and nothing changes on either card until they say yes. (In Blackout mode, trades
        work a bit differently — see that tab below.)
      </p>
    </Section>
  </div>
);

// ── Classic Mode content ─────────────────────────────────────────────────────

const ClassicContent: React.FC = () => (
  <div className="space-y-3">
    <Section icon={<Grid3x3 className="w-4 h-4 text-indigo-300" />} title="The Goal">
      <p>
        Your card is a 5×5 grid. Complete real acts of kindness — Gr8Day Deeds — to mark squares,
        and get Bingo with 5 in a row — straight across, down, or diagonal. You can keep playing
        the same card past a win, all the way to the end of the week.
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

    <Section icon={<Shuffle className="w-4 h-4 text-cyan-300" />} title="Pick Three">
      <p>
        Once per card, you can choose exactly three of your own unplayed squares and swap them
        all for brand-new deeds — no waiting, no cost. Great for when a few challenges just don't
        fit your week. It's a one-time power-up per card, so use it wisely.
      </p>
    </Section>

    <Section icon={<Bomb className="w-4 h-4 text-red-400" />} title="The Bomb Square">
      <p>
        Here's the twist: roughly 1 in 100 cards hides a Bomb Square somewhere among its deeds —
        no different-looking, no warning. If you tap it, your entire card is instantly rewritten:
        every square, every challenge, brand new. Nothing you'd already completed carries over,
        but the new card is just as playable as the old one. Consider it an unexpected plot twist.
      </p>
    </Section>

    <Section icon={<Flame className="w-4 h-4 text-orange-300" />} title="Streaks">
      <p>
        Complete at least one deed a day to build a streak, with milestones along the way.
      </p>
    </Section>

    <Section icon={<Ticket className="w-4 h-4 text-fuchsia-300" />} title="Draw Entries">
      <p>
        Every single deed you complete earns you an entry into that week's prize draw — not just
        Bingo. On top of that, completing a full line earns a bonus of extra entries (a random
        roll every time, more for more lines), and each new card gives every completed line its
        own shot at another bonus. More deeds, more entries, better odds.
      </p>
      <p>
        Your entries never expire and never get wiped just because a week ends — they carry
        forward and keep stacking up. You've always got a chance, week after week, until the week
        you actually win.
      </p>
    </Section>

    <Section icon={<RefreshCw className="w-4 h-4 text-teal-300" />} title="Weekly Reset & Prizes">
      <p>
        A new card is generated each week. The prize winner is picked from the draw entry pool —
        so playing the deeds is what actually gives you a shot, whether or not you personally hit
        Bingo that week. Check <strong>My Wins</strong> for your history and the winners page for
        who's won recently.
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
        the admins and skew heavily toward "just the one you tapped." If extras do open with it,
        every one of them has to be completed or passed too — not just the square you tapped —
        before you can reveal anything new.
      </p>
    </Section>

    <Section icon={<Ban className="w-4 h-4 text-rose-300" />} title="Resolving an Open Group">
      <p>
        <strong>You cannot open another square until every square currently open is dealt with</strong> —
        either completed like a normal deed, or passed on if you don't want it. A passed square is
        permanently blocked; it can't be completed or traded later.
      </p>
    </Section>

    <Section icon={<Pause className="w-4 h-4 text-amber-300" />} title="Pausing">
      <p>
        There's no timer — walk away whenever you want, for as long as you want. Open three
        squares on Sunday and don't get back to it until Wednesday? That's fine. The only rule is
        you can't reveal anything new until whatever's already open gets played or passed.
      </p>
    </Section>

    <Section icon={<Lock className="w-4 h-4 text-purple-300" />} title="Team Trades — Blind Picks">
      <p>
        Trades still work in Blackout, and you can offer up a square you haven't even revealed
        yet. When picking from a teammate's card, you'll see the names of their available deeds —
        not where they sit on the board. So a trade can hand you a deed you know the name of, but
        you still won't know which square it's on until you actually reveal it.
      </p>
    </Section>

    <Section icon={<Trophy className="w-4 h-4 text-emerald-300" />} title="Everything Else">
      <p>
        Streaks, draw entries (every completed deed, plus bonus entries for lines), and the
        weekly reset all work exactly the same as Classic mode — same draw pool, same odds.
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
        <TheGoalsContent />
        <SpiritOfGameContent />
        <QuickTapContent />
        <TeamPlayContent />

        <h2 className="text-white/50 text-xs font-bold uppercase tracking-wider px-1 -mb-3">Game Modes</h2>
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
