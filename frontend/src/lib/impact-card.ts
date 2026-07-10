// Shareable "impact card" image — a player's personal kindness summary for
// this week, rendered client-side via the Canvas 2D API (not html2canvas,
// which is bundled as a jsPDF dependency but never used directly anywhere in
// this codebase — drawing directly keeps this dependency-free and avoids
// DOM-to-image font/CORS quirks). Visual identity matches the real game
// screens (GameBoard.tsx): indigo-950 ground, the GR8DAY gradient sequence,
// bold system-font headings — not an invented palette.

export interface ImpactCardData {
  /** Player's username — never a real name (this is shareable/public). */
  username: string;
  /** e.g. "This Week", "This Month", "This Quarter", "This Year", "All Time". */
  periodLabel: string;
  /** Count of real Gr8Day Deeds in the chosen period — either the period
   *  total, or the count for featuredDeedText when one is picked. Purchased
   *  and referral squares are excluded, matching the leaderboard's rule. */
  count: number;
  /** When set, the card features one specific deed ("Bought a stranger's
   *  coffee") instead of a plain total — a more concrete, less boastful
   *  thing to be proud of than a bare number. */
  featuredDeedText?: string | null;
  totalDeeds: number;
  badgeName?: string | null;
  badgeEmoji?: string | null;
}

const WIDTH = 1080;
const HEIGHT = 1350;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Greedy word-wrap for canvas text — canvas has no native wrapping. Caps at
// maxLines so a long deed_text can never overflow the card; the last kept
// line gets an ellipsis if any words had to be dropped.
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  let consumedAll = true;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      if (lines.length === maxLines) { consumedAll = i === words.length - 1; current = ''; break; }
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (!consumedAll) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]*$/, '') + '…';
  return lines;
}

// canvas.toDataURL is synchronous (unlike toBlob, which is a callback-based
// macrotask) — that matters here because navigator.share() must fire within
// a narrow window of the user's actual tap, or browsers (Safari especially)
// silently revoke it and we'd fall back to a plain download instead.
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function renderImpactCard(data: ImpactCardData): Blob {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Ground
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft brand-color glow, top-left and top-right (matches hero-glow pattern)
  const glow1 = ctx.createRadialGradient(WIDTH * 0.25, 120, 0, WIDTH * 0.25, 120, 520);
  glow1.addColorStop(0, 'rgba(244,63,94,0.28)');
  glow1.addColorStop(1, 'rgba(244,63,94,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, 700);

  const glow2 = ctx.createRadialGradient(WIDTH * 0.8, 60, 0, WIDTH * 0.8, 60, 480);
  glow2.addColorStop(0, 'rgba(139,92,246,0.24)');
  glow2.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, 700);

  // Wordmark + GR8DAY letter-gradient chip row
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('Havagr8day', 72, 130);

  const letters = ['G', 'R', '8', 'D', 'A', 'Y'];
  const letterColors: [string, string][] = [
    ['#f43f5e', '#db2777'], ['#f43f5e', '#db2777'],
    ['#f59e0b', '#ea580c'],
    ['#10b981', '#16a34a'],
    ['#0ea5e9', '#2563eb'],
    ['#8b5cf6', '#9333ea'],
  ];
  let chipX = 72;
  const chipY = 150, chipSize = 34, chipGap = 8;
  ctx.font = '900 18px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  letters.forEach((letter, i) => {
    const grad = ctx.createLinearGradient(chipX, chipY, chipX + chipSize, chipY + chipSize);
    grad.addColorStop(0, letterColors[i][0]);
    grad.addColorStop(1, letterColors[i][1]);
    ctx.fillStyle = grad;
    roundRectPath(ctx, chipX, chipY, chipSize, chipSize, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(letter, chipX + chipSize / 2, chipY + chipSize / 2 + 6);
    chipX += chipSize + chipGap;
  });

  // Username
  ctx.textAlign = 'left';
  ctx.font = '700 30px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`@${data.username}`, 72, 260);

  // Hero card panel
  const panelX = 72, panelY = 320, panelW = WIDTH - 144, panelH = 560;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  roundRectPath(ctx, panelX, panelY, panelW, panelH, 32);
  ctx.stroke();

  const periodUpper = data.periodLabel.toUpperCase();
  ctx.textAlign = 'center';
  ctx.font = '800 26px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = '#fde047';
  ctx.fillText(data.featuredDeedText ? 'PROUD TO HAVE' : `${periodUpper} I DELIVERED`, WIDTH / 2, panelY + 90);

  const grad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
  grad.addColorStop(0, '#34d399');
  grad.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = grad;
  ctx.font = '900 240px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(String(data.count), WIDTH / 2, panelY + 340);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  if (data.featuredDeedText) {
    // Deed text can run long — wrap to at most 2 lines so it never overflows.
    ctx.font = '800 34px system-ui, -apple-system, "Segoe UI", sans-serif';
    const lines = wrapText(ctx, data.featuredDeedText, panelW - 100, 2);
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, panelY + 400 + i * 42));
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(data.periodLabel, WIDTH / 2, panelY + 400 + lines.length * 42 + 34);
  } else {
    ctx.font = '800 38px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(data.count === 1 ? 'Gr8Day Deed' : 'Gr8Day Deeds', WIDTH / 2, panelY + 400);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText('Real deeds. Real kindness. Really happening.', WIDTH / 2, panelY + 460);
  }

  // Secondary stat row: lifetime total + badge
  const rowY = panelY + panelH + 70;
  ctx.font = '900 56px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(data.totalDeeds), WIDTH * 0.32, rowY);
  ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Lifetime Deeds', WIDTH * 0.32, rowY + 36);

  if (data.badgeName) {
    ctx.font = '900 48px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${data.badgeEmoji ?? ''} ${data.badgeName}`.trim(), WIDTH * 0.68, rowY - 8);
    ctx.font = '700 22px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('Current Badge', WIDTH * 0.68, rowY + 36);
  }

  // Footer
  ctx.font = '700 24px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('havagr8day.com', WIDTH / 2, HEIGHT - 60);

  return dataUrlToBlob(canvas.toDataURL('image/png'));
}

// Desktop's Web Share API (Windows Chrome, mainly) opens the OS-level Share
// flyout, whose useful targets are things like Mail/OneNote — not what a
// player wants here — and its image preview includes a built-in markup/edit
// view, which reads as "the button just opens the image for editing." Only
// worth attempting on touch/mobile devices, where real share targets
// (Messages, Instagram, WhatsApp) actually exist.
function isMobileDevice(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Shares via the Web Share API on mobile (where real share targets exist),
 *  otherwise falls back to a plain download — this codebase has no existing
 *  share pattern to match, so this is the new baseline. Image generation is
 *  synchronous (see renderImpactCard) so this reaches navigator.share() as
 *  close to the user's tap as possible. */
export async function shareOrDownloadImpactCard(data: ImpactCardData): Promise<'shared' | 'downloaded'> {
  const blob = renderImpactCard(data);
  const file = new File([blob], 'havagr8day-impact.png', { type: 'image/png' });

  if (isMobileDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Havagr8day Bingo — My Impact',
        text: data.featuredDeedText
          ? `${data.periodLabel}, I ${data.featuredDeedText.toLowerCase()} ${data.count} time${data.count === 1 ? '' : 's'}!`
          : `${data.periodLabel}, I delivered ${data.count} Gr8Day Deed${data.count === 1 ? '' : 's'}!`,
      });
      return 'shared';
    } catch (err) {
      // User cancelled the share sheet — not an error, don't fall back to download.
      if ((err as { name?: string })?.name === 'AbortError') return 'shared';
      // Any other failure (e.g. unsupported in this context) — fall through to download.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'havagr8day-impact.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
