import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CellData, isCellCompleted } from '@/lib/game-utils';
import { Check, Lock, Gift, Star, ShoppingCart, Users } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

interface BingoCellProps {
  cell: CellData;
  completedCells: number[];
  purchasedCells: number[];
  referralCells: number[];
  onMark: (index: number) => void;
  onPurchase: (index: number) => void;
  locked?: boolean;
  prizeImageUrl?: string;
  progress?: number;
  onProgressChange?: (index: number, newProgress: number) => void;
  onUnmark?: (index: number) => void;
  onDare?: (index: number) => void;
  dareUsed?: boolean;
  winCondition?: string;
  /** Pick Three: when active, taps toggle selection instead of the normal
   *  mark/purchase/dare flow. Eligibility is computed by the parent (same
   *  "unplayed, non-special" rule the backend enforces). */
  pickThreeMode?: boolean;
  pickThreeEligible?: boolean;
  pickThreeSelected?: boolean;
  onTogglePickThree?: (index: number) => void;
}

const BingoCell: React.FC<BingoCellProps> = ({
  cell,
  completedCells,
  purchasedCells,
  referralCells,
  onMark,
  onPurchase,
  locked = false,
  prizeImageUrl,
  progress = 0,
  onProgressChange,
  onUnmark,
  onDare,
  dareUsed = false,
  winCondition,
  pickThreeMode = false,
  pickThreeEligible = false,
  pickThreeSelected = false,
  onTogglePickThree,
}) => {
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isCompleted = isCellCompleted(
    cell.index,
    completedCells,
    purchasedCells,
    referralCells,
    cell.is_free_space
  );
  const isPurchased = purchasedCells.includes(cell.index);
  const isReferralFree = referralCells.includes(cell.index);

  const anyOverlay = pendingConfirm || pendingPurchase;
  const closeOverlays = () => { setPendingConfirm(false); setPendingPurchase(false); };

  // Cancel on Escape key. The popups are full-screen modals (portaled to body),
  // so tapping their dark backdrop handles outside-clicks — no document listener needed.
  useEffect(() => {
    if (!anyOverlay) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlays(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [anyOverlay]);

  const qty = cell.quantity ?? 1;

  const handleConfirm = () => {
    if (isCompleted) {
      onUnmark?.(cell.index);
    } else if (progress + 1 >= qty) {
      onMark(cell.index);
      onProgressChange?.(cell.index, 0);
    } else {
      onProgressChange?.(cell.index, progress + 1);
    }
    setPendingConfirm(false);
  };

  // Step a multi-action cell back down one (so partial progress can be undone).
  const handleUndoStep = () => {
    onProgressChange?.(cell.index, Math.max(0, progress - 1));
    setPendingConfirm(false);
  };

  // Show the undo button when a multi-action cell has progress but isn't complete.
  const canUndoStep = !isCompleted && qty > 1 && progress > 0;

  const handlePurchaseConfirm = () => {
    onPurchase(cell.index);
    setPendingPurchase(false);
  };

  // Fill the Card (blackout) mode never rolls an I Dare Ya outcome onto the
  // centre cell (see supabase/functions/game/index.ts card generation) — it's
  // left as a plain free space there. The outcome itself is hidden from the
  // client until revealed, so win_condition (never secret) is what we gate
  // on here, not cell.dare_ya_outcome_type.
  const isCentreSquare = cell.index === 12 && cell.is_free_space && winCondition !== 'fill_card';

  const handleClick = () => {
    if (locked) return;
    if (pickThreeMode) {
      if (pickThreeEligible) onTogglePickThree?.(cell.index);
      return;
    }
    if (isCentreSquare) {
      if (!dareUsed) onDare?.(cell.index);
      return;
    }
    if (cell.is_free_space) return;
    if (cell.is_purchasable && !isPurchased) {
      setPendingPurchase(true);
      return;
    }
    if (cell.is_purchasable && isPurchased) return;
    if (cell.is_referral_free) return;
    // Revealed secret squares cannot be unmarked (wallet credit already paid out)
    if (cell.is_secret && cell.secret_revealed) return;
    setPendingConfirm(true);
  };

  // --- Determine visual state ---
  const isFree = cell.is_free_space;
  const needsPurchase = cell.is_purchasable && !isPurchased;
  const needsReferral = cell.is_referral_free && !isReferralFree && !isCompleted;
  const isRegularDeed = !isFree && !cell.is_purchasable && !cell.is_referral_free;

  const shouldShowHoverCard =
    !pendingConfirm &&
    !isFree &&
    !cell.is_purchasable &&
    !cell.is_referral_free &&
    Boolean(cell.deed_text_long && cell.deed_text_long.trim());

  const buttonEl = (
    <button
      ref={buttonRef}
      onClick={handleClick}
      disabled={locked || (pickThreeMode
        ? !pickThreeEligible
        : (isFree && !isCentreSquare) || cell.is_referral_free || (cell.is_purchasable && isPurchased) || (isCentreSquare && dareUsed))}
      aria-label={
        isFree
          ? 'Free space'
          : needsPurchase
            ? `Buy this square for ${cell.purchase_price} Gr8Day Bucks`
            : cell.is_referral_free
              ? 'Refer a Player'
              : cell.deed_text
      }
      title={shouldShowHoverCard ? (cell.deed_text_long as string) : undefined}
      className={`
        relative flex flex-col items-center justify-center
        w-full h-full
        transition-all duration-200 ease-out
        overflow-hidden select-none
        ${locked && !isCompleted && !isFree ? 'opacity-50 grayscale cursor-not-allowed' : ''}
        ${pickThreeMode && !pickThreeEligible ? 'opacity-40 grayscale cursor-not-allowed' : ''}
        ${pickThreeMode && pickThreeEligible && pickThreeSelected ? 'ring-4 ring-purple-500 ring-inset' : ''}
        ${pickThreeMode && pickThreeEligible && !pickThreeSelected ? 'ring-2 ring-purple-300 ring-inset hover:ring-purple-400 cursor-pointer' : ''}
        ${isCentreSquare
          ? dareUsed
            ? 'bg-slate-700 cursor-not-allowed opacity-60'
            : 'bg-gradient-to-br from-yellow-900 via-amber-800 to-orange-900 cursor-pointer hover:from-yellow-800 hover:to-orange-800 active:scale-95'
          : isFree
          ? prizeImageUrl
            ? 'cursor-default'
            : 'bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-400 cursor-default'
          : isCompleted
            ? `bg-gradient-to-br from-emerald-400 to-green-500 ${
                isRegularDeed ? 'cursor-pointer hover:from-emerald-500 hover:to-green-600' : 'cursor-default'
              }`
            : needsPurchase
              ? 'bg-gradient-to-br from-amber-50 via-amber-100 to-yellow-100 hover:from-amber-100 hover:to-yellow-200 cursor-pointer border border-amber-300/50'
              : needsReferral
                ? 'bg-gradient-to-br from-teal-50 to-cyan-100 cursor-default border border-teal-300/50'
                : 'bg-white hover:bg-indigo-50 cursor-pointer active:bg-indigo-100'
        }
      `}
    >
      {/* ===== CONFIRMATION POPUP (screen-centered so it is never clipped on mobile) ===== */}
      {pendingConfirm && createPortal((
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setPendingConfirm(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div
            className="bg-indigo-950 rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 w-full max-w-[280px]"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <p className="text-base font-black text-white text-center leading-tight">
              {isCompleted ? 'Unmark this square?' : qty > 1 ? 'Did it?' : 'Mark this square?'}
            </p>
            <p className="text-xs text-indigo-200 text-center leading-snug line-clamp-2">{cell.deed_text}</p>
            {!isCompleted && qty > 1 && (
              <p className="text-sm text-amber-300 font-bold">{progress} / {qty} done</p>
            )}
            <div className="flex flex-wrap gap-2 items-center justify-center mt-1 w-full">
              <div
                role="button"
                tabIndex={0}
                className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-emerald-500 active:bg-emerald-400 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirm(); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirm(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleConfirm(); }}
              >
                ✓ Yes
              </div>
              {canUndoStep && (
                <div
                  role="button"
                  tabIndex={0}
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-3 bg-amber-500 active:bg-amber-400 rounded-xl text-white font-bold text-sm cursor-pointer select-none"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleUndoStep(); }}
                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleUndoStep(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleUndoStep(); }}
                >
                  −1 Undo
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-rose-600 active:bg-rose-500 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setPendingConfirm(false); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setPendingConfirm(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPendingConfirm(false); }}
              >
                ✕ No
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== PURCHASE CONFIRMATION POPUP (screen-centered) ===== */}
      {pendingPurchase && createPortal((
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { e.stopPropagation(); setPendingPurchase(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div
            className="bg-amber-950 rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 w-full max-w-[280px]"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <p className="text-base font-black text-white text-center leading-tight">
              Buy this square for {cell.purchase_price} Gr8Day Bucks?
            </p>
            <p className="text-xs text-amber-200 text-center leading-snug">
              This will use your wallet balance.
            </p>
            <div className="flex gap-2 items-center justify-center mt-1 w-full">
              <div
                role="button"
                tabIndex={0}
                className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-emerald-500 active:bg-emerald-400 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handlePurchaseConfirm(); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handlePurchaseConfirm(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePurchaseConfirm(); }}
              >
                ✓ Buy
              </div>
              <div
                role="button"
                tabIndex={0}
                className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-rose-600 active:bg-rose-500 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setPendingPurchase(false); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setPendingPurchase(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPendingPurchase(false); }}
              >
                ✕ No
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== PICK THREE SELECTION BADGE ===== */}
      {pickThreeMode && pickThreeEligible && pickThreeSelected && (
        <span className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] font-black flex items-center justify-center shadow">
          ✓
        </span>
      )}

      {/* ===== CENTRE SQUARE — I DARE YA! ===== */}
      {isCentreSquare && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={dareUsed ? '/dare-centre.png' : '/dare-centre.png'}
            alt="I Dare Ya! Click & Commit"
            className={`w-full h-full object-cover transition-all duration-300 ${dareUsed ? 'grayscale opacity-40' : 'hover:scale-105'}`}
          />
          {dareUsed && (
            <span className="absolute bottom-1 text-[7px] sm:text-[9px] font-black text-white/70 uppercase tracking-widest bg-black/50 px-1 rounded">
              Used
            </span>
          )}
        </div>
      )}

      {/* ===== OTHER FREE SPACE ===== */}
      {isFree && !isCentreSquare && (
        <>
          {prizeImageUrl ? (
            <img
              src={prizeImageUrl}
              alt="Prize — free square"
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-0.5">
              <Star className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white drop-shadow-md fill-white/80" />
              <span className="text-[9px] sm:text-xs md:text-sm font-black text-white uppercase tracking-widest drop-shadow-sm">
                FREE
              </span>
            </div>
          )}
        </>
      )}

      {/* ===== COMPLETED CELL (marked, purchased, or referral) ===== */}
      {!isFree && isCompleted && (
        <div className="flex flex-col items-center justify-center gap-0.5 px-1">
          <div className="bg-white/30 rounded-full p-1 sm:p-1.5 mb-0.5">
            <Check className="w-4 h-4 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white drop-shadow" strokeWidth={3} />
          </div>
          {/* Purchasable completed */}
          {cell.is_purchasable && (
            <span className="text-[8px] sm:text-[10px] font-bold text-white/90 drop-shadow-sm">
              Purchased ✓
            </span>
          )}
          {/* Referral completed */}
          {cell.is_referral_free && !cell.is_purchasable && (
            <span className="text-[8px] sm:text-[10px] font-bold text-white/90 drop-shadow-sm">
              Referred ✓
            </span>
          )}
          {/* Regular deed completed */}
          {!cell.is_purchasable && !cell.is_referral_free && (
            <>
              <span className="text-[7px] sm:text-[9px] md:text-[10px] text-center leading-tight font-bold text-white/90 line-clamp-2 px-0.5 drop-shadow-sm">
                {cell.deed_text}
              </span>
              {qty > 1 && (
                qty <= 6 ? (
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: qty }).map((_, i) => (
                      <span key={i} className="text-[8px] sm:text-[10px] text-white/80">●</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[7px] sm:text-[9px] text-white/80 mt-0.5">Done {qty}×</span>
                )
              )}
            </>
          )}
        </div>
      )}

      {/* ===== PURCHASABLE (NOT YET PURCHASED) — No deed, just buy prompt ===== */}
      {!isFree && !isCompleted && needsPurchase && (
        <div className="flex flex-col items-center justify-center gap-1 px-1 w-full h-full">
          <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
          <span className="text-[8px] sm:text-[10px] md:text-xs font-bold text-amber-800 text-center leading-tight">
            Buy this Square
          </span>
          <div className="flex items-center gap-0.5 bg-amber-500 text-white rounded-full px-2 sm:px-2.5 py-0.5 shadow-md mt-0.5">
            <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span className="text-[9px] sm:text-[11px] md:text-xs font-black">
              {cell.purchase_price} Bucks
            </span>
          </div>
        </div>
      )}

      {/* ===== REFERRAL (NOT YET EARNED) — "Refer a Player" prompt ===== */}
      {!isFree && !isCompleted && !needsPurchase && needsReferral && (
        <div className="flex flex-col items-center justify-center gap-1 px-1">
          <Users className="w-5 h-5 sm:w-6 sm:h-6 text-teal-500" />
          <span className="text-[8px] sm:text-[10px] md:text-xs font-bold text-teal-700 text-center leading-tight">
            Refer a Player
          </span>
          <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-teal-400 mt-0.5" />
        </div>
      )}

      {/* ===== REGULAR DEED ===== */}
      {!isFree && !isCompleted && !needsPurchase && !needsReferral && (
        <div className="flex flex-col items-center justify-center px-1.5 sm:px-2">
          {cell.category && (
            <span className="text-[6px] sm:text-[7px] font-black tracking-widest text-indigo-400 uppercase mb-0.5">
              {cell.category}
            </span>
          )}
          <span className={`text-[8px] sm:text-[10px] md:text-[11px] text-center leading-snug font-semibold text-slate-700 ${qty > 1 ? 'line-clamp-3' : 'line-clamp-4'}`}>
            {cell.deed_text}
          </span>
          {qty > 1 && (
            <div className="flex flex-col items-center gap-0.5 mt-0.5">
              {qty <= 6 && (
                <div className="flex gap-0.5">
                  {Array.from({ length: qty }).map((_, i) => (
                    <span key={i} className={`text-[8px] sm:text-[10px] ${i < progress ? 'text-emerald-500' : 'text-slate-300'}`}>
                      {i < progress ? '●' : '○'}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-[8px] sm:text-[10px] font-bold text-indigo-600">
                {progress} / {qty}
              </span>
            </div>
          )}
        </div>
      )}
    </button>
  );

  // Wrap in HoverCard so users see the long-form description on hover.
  if (!shouldShowHoverCard) {
    return buttonEl;
  }

  return (
    <HoverCard openDelay={180} closeDelay={80}>
      <HoverCardTrigger asChild>{buttonEl}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        className="w-72 sm:w-80 max-w-[90vw]"
      >
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-900 leading-snug">
            {cell.deed_text}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {cell.deed_text_long}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default BingoCell;
