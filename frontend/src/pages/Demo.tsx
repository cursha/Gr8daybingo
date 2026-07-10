import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Auto-playing ~75s demo reel, ported from a standalone prototype. Kept as a
// single imperative timeline (matching how it was built and tested) rather
// than converted to React state — this is a one-off animated showcase, not
// an interactive page, so there's no benefit to re-modeling it in React.
const DEMO_CSS = `
:root {
  --indigo-950: #1e1b4b; --indigo-900: #312e81; --purple-950: #3b0764; --slate-900: #0f172a;
  --white: #ffffff; --ink-dim: rgba(255,255,255,0.7); --ink-faint: rgba(255,255,255,0.45);
  --panel: rgba(255,255,255,0.06); --panel-border: rgba(255,255,255,0.12);
  --rose-500: #f43f5e; --pink-600: #db2777; --amber-500: #f59e0b; --orange-600: #ea580c;
  --emerald-400: #34d399; --emerald-500: #10b981; --green-600: #16a34a;
  --sky-500: #0ea5e9; --blue-600: #2563eb; --violet-500: #8b5cf6; --purple-600: #9333ea;
  --yellow-300: #fde047; --indigo-400: #818cf8;
  --demo-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.demo-root { width: 100vw; height: 100vh; margin: 0; padding: 0; overflow: hidden; background: #000;
  font-family: var(--demo-font); -webkit-font-smoothing: antialiased; display: flex; align-items: center; justify-content: center; }
.demo-root .stage {
  position: relative;
  width: min(100vw, 177.77vh);
  height: min(100vh, 56.25vw);
  aspect-ratio: 16/9;
  background: linear-gradient(160deg, var(--indigo-950), var(--purple-950) 55%, var(--slate-900));
  overflow: hidden;
  box-shadow: 0 0 80px rgba(0,0,0,0.6);
}
.demo-root .scene {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.5s ease;
  padding: 6%;
}
.demo-root .scene.active { opacity: 1; }
.demo-root .tabular { font-variant-numeric: tabular-nums; }
.demo-root .demo-close {
  position: absolute; top: 16px; right: 16px; z-index: 60;
  background: rgba(0,0,0,0.4); color: #fff; border: 1px solid rgba(255,255,255,0.2);
  border-radius: 999px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
}
.demo-root .progress-track { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,0.1); z-index: 50; }
.demo-root .progress-fill { height: 100%; background: linear-gradient(90deg, var(--rose-500), var(--amber-500), var(--emerald-400), var(--sky-500), var(--violet-500)); width: 0%; }

#scene-hook .chips { display: flex; gap: 10px; margin-bottom: 22px; }
#scene-hook .chip {
  width: 54px; height: 54px; border-radius: 12px; display: grid; place-items: center;
  color: #fff; font-size: 22px; font-weight: 900; opacity: 0; transform: translateY(16px) scale(0.7);
  animation: demo-chip-in 0.5s cubic-bezier(.34,1.56,.64,1) forwards;
}
@keyframes demo-chip-in { to { opacity: 1; transform: translateY(0) scale(1); } }
#scene-hook .tagline { font-size: clamp(20px,3vw,32px); color: var(--ink-dim); text-align: center; opacity: 0; animation: demo-fade-up 0.6s ease forwards; animation-delay: 1.1s; font-weight: 700; }
@keyframes demo-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

#scene-deeds .headline { font-size: clamp(22px,3.4vw,36px); color: #fff; margin-bottom: 5%; text-align: center; }
#scene-deeds .deed-stack { position: relative; width: min(560px, 70%); height: 90px; }
#scene-deeds .deed-card {
  position: absolute; inset: 0; display: flex; align-items: center; gap: 14px;
  background: var(--panel); border: 1px solid var(--panel-border); border-radius: 16px; padding: 0 24px;
  opacity: 0;
}
#scene-deeds .deed-card.show { animation: demo-deed-cycle 1.6s ease forwards; }
@keyframes demo-deed-cycle { 0% { opacity: 0; transform: translateX(24px); } 15%,80% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(-24px); } }
#scene-deeds .deed-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
#scene-deeds .deed-text { color: #fff; font-weight: 700; font-size: clamp(14px,1.8vw,18px); }

#scene-picker .picker-card { width: min(520px, 78%); background: var(--panel); border: 1px solid var(--panel-border); border-radius: 20px; padding: 5%; }
#scene-picker h1 { font-size: clamp(18px,2.6vw,24px); color: #fff; margin: 0 0 4px; text-align: center; }
#scene-picker p.sub { font-size: clamp(11px,1.4vw,13px); color: var(--ink-dim); text-align: center; margin: 0 0 18px; }
#scene-picker .mode-opt { border-radius: 14px; border: 2px solid var(--panel-border); background: var(--panel); padding: 14px 16px; margin-bottom: 10px; transition: all 0.4s ease; }
#scene-picker .mode-opt.selected { border-color: var(--emerald-400); background: rgba(52,211,153,0.14); }
#scene-picker .mode-opt p.t { font-weight: 800; color: #fff; margin: 0; font-size: clamp(13px,1.7vw,15px); }
#scene-picker .mode-opt p.d { font-size: clamp(10px,1.3vw,12px); color: var(--ink-dim); margin: 4px 0 0; }
#scene-picker .confirm-btn {
  margin-top: 8px; width: 100%; padding: 12px; border-radius: 12px; text-align: center;
  background: linear-gradient(90deg, var(--indigo-400), var(--violet-500)); color: #fff; font-weight: 800;
  font-size: clamp(12px,1.6vw,14px); opacity: 0.5; transition: opacity 0.3s;
}
#scene-picker .confirm-btn.ready { opacity: 1; }

#scene-grid .grid-wrap { display: flex; gap: 6%; align-items: center; }
#scene-grid .bingo-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 5px; width: min(46vh, 420px); aspect-ratio: 1; }
#scene-grid .cell { border-radius: 6px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
#scene-grid .cell.blank { background: rgba(255,255,255,0.9); }
#scene-grid .cell.done { background: linear-gradient(135deg, var(--emerald-400), var(--green-600)); }
#scene-grid .cell.free { background: linear-gradient(135deg, #fde68a, #f59e0b, #ea580c); }
#scene-grid .cell.center { background: linear-gradient(135deg, #78350f, #92400e, #7c2d12); }
#scene-grid .cell .check { width: 46%; height: 46%; color: #fff; opacity: 0; transform: scale(0.3); }
#scene-grid .cell.pop .check { animation: demo-pop-check 0.45s cubic-bezier(.34,1.56,.64,1) forwards; }
@keyframes demo-pop-check { to { opacity: 1; transform: scale(1); } }
#scene-grid .cell.pulse, #scene-blackout .bcell.pulse { animation: demo-cell-pulse 1s ease-in-out infinite; }
@keyframes demo-cell-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.5); } 50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); } }
#scene-grid .side { width: min(30vw, 260px); }
#scene-grid .side .caption { color: #fff; font-weight: 800; font-size: clamp(16px,2.2vw,22px); margin-bottom: 10px; }
#scene-grid .side .sub { color: var(--ink-dim); font-size: clamp(11px,1.5vw,14px); }
#scene-grid .confirm-toast {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) scale(0.8); opacity: 0;
  background: var(--indigo-900); border: 1px solid var(--panel-border); border-radius: 16px; padding: 18px 22px; text-align: center;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}
#scene-grid .confirm-toast.show { animation: demo-toast-pop 1.4s ease forwards; }
@keyframes demo-toast-pop { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.8); } 15%,75% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(0.9); } }
#scene-grid .confirm-toast p { color: #fff; font-weight: 800; margin: 0 0 10px; font-size: clamp(13px,1.7vw,16px); }
#scene-grid .confirm-toast .yes { background: var(--emerald-500); color: #fff; font-weight: 800; padding: 8px 20px; border-radius: 10px; display: inline-block; font-size: clamp(12px,1.5vw,14px); }

#scene-blackout .headline { font-size: clamp(18px,2.6vw,24px); color: #fff; margin-bottom: 4%; text-align: center; font-weight: 800; }
#scene-blackout .row { display: flex; gap: 10px; }
#scene-blackout .bcell {
  width: min(15vh, 120px); aspect-ratio: 1; border-radius: 10px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px; position: relative; overflow: hidden;
}
#scene-blackout .bcell.hidden { background: linear-gradient(135deg, #1e40af, #1e3a8a); }
#scene-blackout .bcell.hidden span { color: var(--yellow-300); font-size: clamp(20px,3vw,28px); font-weight: 900; }
#scene-blackout .bcell.passed { background: rgba(30,64,175,0.8); border: 1px solid rgba(136,19,55,0.4); }
#scene-blackout .bcell.passed .x { color: var(--yellow-300); font-size: clamp(16px,2.2vw,22px); font-weight: 900; }
#scene-blackout .bcell.passed .lbl { color: var(--yellow-300); opacity: 0.7; font-size: clamp(7px,0.9vw,9px); font-weight: 800; letter-spacing: 0.08em; }
#scene-blackout .bcell.done { background: linear-gradient(135deg, var(--emerald-400), var(--green-600)); }
#scene-blackout .bcell.done .check { width: 40%; height: 40%; color: #fff; }
#scene-blackout .bcell.revealing { animation: demo-reveal-flip 0.5s ease forwards; }
@keyframes demo-reveal-flip { 0% { transform: rotateY(0deg); } 50% { transform: rotateY(90deg); } 100% { transform: rotateY(0deg); } }
#scene-blackout .sub { margin-top: 5%; color: var(--ink-dim); font-size: clamp(11px,1.5vw,14px); text-align: center; max-width: 480px; }

#scene-betya .betya-circle {
  width: min(30vh, 260px); aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fcd34d, #f59e0b 55%, #7c2d12);
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  box-shadow: 0 0 0 0 rgba(245,158,11,0.6); animation: demo-betya-ring 1.6s ease-in-out infinite;
  margin-bottom: 24px;
}
@keyframes demo-betya-ring { 0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.5); } 50% { box-shadow: 0 0 0 22px rgba(245,158,11,0); } }
#scene-betya .betya-circle span { color: #451a03; font-weight: 900; font-size: clamp(15px,2vw,20px); text-align: center; }
#scene-betya .result { opacity: 0; text-align: center; }
#scene-betya .result.show { animation: demo-fade-up 0.6s ease forwards; }
#scene-betya .result .label { font-size: clamp(20px,3vw,30px); color: var(--yellow-300); font-weight: 900; }
#scene-betya .result .amt { font-size: clamp(14px,2vw,18px); color: #fff; margin-top: 4px; font-weight: 700; }

#scene-refer .refer-card { width: min(420px, 78%); background: var(--panel); border: 1px solid var(--panel-border); border-radius: 18px; padding: 6%; position: relative; }
#scene-refer .refer-card h2 { color: #fff; font-size: clamp(15px,2vw,18px); margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
#scene-refer .refer-card p { color: var(--ink-dim); font-size: clamp(11px,1.4vw,13px); margin: 0 0 16px; }
#scene-refer .refer-row { display: flex; gap: 8px; }
#scene-refer .refer-input { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid var(--panel-border); border-radius: 10px; padding: 10px 12px; color: var(--ink-dim); font-size: clamp(11px,1.4vw,13px); }
#scene-refer .refer-btn { background: #14b8a6; color: #fff; font-weight: 800; border-radius: 10px; padding: 10px 18px; font-size: clamp(11px,1.4vw,13px); white-space: nowrap; }
#scene-refer .toast {
  position: absolute; top: -18px; right: -14px; background: var(--emerald-500); color: #fff; font-weight: 900;
  border-radius: 999px; padding: 8px 16px; font-size: clamp(12px,1.6vw,15px); opacity: 0; transform: scale(0.5) translateY(10px);
  box-shadow: 0 8px 24px rgba(16,185,129,0.4);
}
#scene-refer .toast.show { animation: demo-toast-in 0.5s cubic-bezier(.34,1.56,.64,1) forwards; }
@keyframes demo-toast-in { to { opacity: 1; transform: scale(1) translateY(0); } }

#scene-share .device { display: flex; align-items: center; gap: 5%; }
#scene-share .card {
  width: min(30vh, 240px); aspect-ratio: 4/5; border-radius: 20px; padding: 6%;
  background: var(--panel); border: 1px solid var(--panel-border);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transform: scale(0.85) translateY(20px); opacity: 0; animation: demo-card-rise 0.8s cubic-bezier(.34,1.56,.64,1) forwards; animation-delay: 0.3s;
}
@keyframes demo-card-rise { to { transform: scale(1) translateY(0); opacity: 1; } }
#scene-share .card .eyebrow { color: var(--yellow-300); font-size: clamp(9px,1.1vw,11px); font-weight: 900; letter-spacing: 0.08em; text-align: center; }
#scene-share .card .num { font-size: clamp(48px,7vw,64px); font-weight: 900; background: linear-gradient(90deg, var(--emerald-400), var(--sky-500)); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1; margin: 6px 0; }
#scene-share .card .lbl { color: #fff; font-weight: 800; font-size: clamp(11px,1.4vw,14px); text-align: center; }
#scene-share .caption { max-width: 280px; }
#scene-share .caption h2 { color: #fff; font-size: clamp(18px,2.6vw,26px); margin: 0 0 8px; }
#scene-share .caption p { color: var(--ink-dim); font-size: clamp(12px,1.6vw,15px); margin: 0; }

#scene-quicktap .headline { color: #fff; font-size: clamp(18px,2.6vw,24px); font-weight: 800; margin-bottom: 5%; text-align: center; }
#scene-quicktap .qrow { display: flex; gap: 12px; }
#scene-quicktap .qchip {
  background: var(--panel); border: 2px solid var(--panel-border); border-radius: 14px;
  padding: 14px 18px; display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative;
  transition: all 0.3s ease;
}
#scene-quicktap .qchip .emoji { font-size: clamp(20px,2.8vw,26px); }
#scene-quicktap .qchip .lbl { color: #fff; font-size: clamp(10px,1.3vw,12px); font-weight: 700; text-align: center; max-width: 90px; }
#scene-quicktap .qchip.tapped { border-color: var(--emerald-400); background: rgba(52,211,153,0.16); transform: scale(0.94); }
#scene-quicktap .qchip .badge {
  position: absolute; top: -10px; right: -8px; background: var(--emerald-500); color: #fff; font-weight: 900;
  font-size: clamp(9px,1.1vw,11px); border-radius: 999px; padding: 3px 9px; opacity: 0; transform: scale(0.5);
}
#scene-quicktap .qchip.tapped .badge { animation: demo-toast-in 0.4s cubic-bezier(.34,1.56,.64,1) forwards; }
#scene-quicktap .sub { margin-top: 5%; color: var(--ink-dim); font-size: clamp(11px,1.5vw,14px); text-align: center; }

#scene-team .headline { color: #fff; font-size: clamp(18px,2.6vw,24px); font-weight: 800; margin-bottom: 5%; text-align: center; }
#scene-team .trow { display: flex; gap: 14px; }
#scene-team .topt {
  width: min(200px, 40vw); background: var(--panel); border: 2px solid var(--panel-border); border-radius: 16px;
  padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.4s ease;
}
#scene-team .topt.selected { border-color: var(--violet-500); background: rgba(139,92,246,0.16); }
#scene-team .avatars { display: flex; }
#scene-team .avatar {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--indigo-950);
  display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 900; font-size: 11px;
  margin-left: -8px;
}
#scene-team .avatar:first-child { margin-left: 0; }
#scene-team .topt .tname { color: #fff; font-weight: 800; font-size: clamp(12px,1.6vw,14px); }
#scene-team .topt .tsub { color: var(--ink-faint); font-size: clamp(9px,1.2vw,11px); }

#scene-dash { align-items: stretch; justify-content: flex-start; padding-top: 5%; }
#scene-dash .dash-hero { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 3%; }
#scene-dash .dash-hero .n { font-size: clamp(30px,4.5vw,44px); font-weight: 900; color: #fff; }
#scene-dash .dash-hero .l { font-size: clamp(9px,1.1vw,11px); color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.08em; }
#scene-dash .ticker { display: flex; gap: 10px; overflow: hidden; margin-bottom: 3%; }
#scene-dash .tcard { flex: 0 0 auto; width: 30%; background: var(--panel); border: 1px solid var(--panel-border); border-radius: 12px; padding: 10px 12px; }
#scene-dash .tcard p { color: #fff; font-size: clamp(9px,1.2vw,12px); font-weight: 700; margin: 0 0 6px; }
#scene-dash .tcard span { color: var(--emerald-400); font-size: clamp(8px,1vw,10px); font-weight: 800; }
#scene-dash .reach { display: flex; gap: 8%; margin-bottom: 3%; opacity: 0; animation: demo-fade-up 0.6s ease forwards; animation-delay: 0.4s; }
#scene-dash .reach .stat { display: flex; align-items: baseline; gap: 6px; }
#scene-dash .reach .stat .v { color: #fff; font-weight: 900; font-size: clamp(16px,2.2vw,20px); }
#scene-dash .reach .stat .l { color: var(--ink-faint); font-size: clamp(9px,1.1vw,11px); text-transform: uppercase; letter-spacing: 0.06em; }
#scene-dash .voice { background: linear-gradient(135deg, rgba(245,158,11,0.14), var(--panel)); border: 1px solid rgba(245,158,11,0.25); border-radius: 14px; padding: 3%; opacity: 0; animation: demo-fade-up 0.6s ease forwards; animation-delay: 1s; }
#scene-dash .voice p.q { color: #fff; font-weight: 700; font-size: clamp(12px,1.6vw,15px); margin: 0; }
#scene-dash .voice p.a { color: var(--yellow-300); font-size: clamp(9px,1.2vw,11px); font-weight: 800; margin: 8px 0 0; }

#scene-cta .wordmark { font-size: clamp(30px,5vw,52px); font-weight: 900; color: #fff; margin-bottom: 4px; }
#scene-cta .wordmark em { font-style: italic; background: linear-gradient(90deg, var(--rose-500), var(--amber-500), var(--emerald-400), var(--sky-500), var(--violet-500)); -webkit-background-clip: text; background-clip: text; color: transparent; }
#scene-cta .tag { color: var(--ink-dim); font-size: clamp(13px,1.8vw,18px); margin-bottom: 22px; text-align: center; }
#scene-cta .url { padding: 12px 28px; border-radius: 999px; background: linear-gradient(90deg, var(--indigo-400), var(--violet-500)); color: #fff; font-weight: 800; font-size: clamp(13px,1.8vw,16px); }

@media (prefers-reduced-motion: reduce) {
  #scene-hook .chip, #scene-hook .tagline, #scene-deeds .deed-card.show, #scene-grid .cell.pop .check,
  #scene-grid .cell.pulse, #scene-grid .confirm-toast.show, #scene-betya .betya-circle, #scene-betya .result.show,
  #scene-share .card, #scene-dash .voice { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`;

const DEMO_MARKUP = `
<div class="stage" id="stage">
  <div class="scene" id="scene-hook">
    <div class="chips" id="hookChips"></div>
    <p class="tagline">Real acts of kindness.<br>Turned into a game.</p>
  </div>

  <div class="scene" id="scene-deeds">
    <p class="headline">Every square is something you actually do.</p>
    <div class="deed-stack" id="deedStack"></div>
  </div>

  <div class="scene" id="scene-picker">
    <div class="picker-card">
      <h1>Choose Your Game</h1>
      <p class="sub">This locks in for the whole week once you confirm.</p>
      <div class="mode-opt" id="modeClassic">
        <p class="t">Regular Bingo</p>
        <p class="d">The classic card — every square visible from the start.</p>
      </div>
      <div class="mode-opt" id="modeBlackout">
        <p class="t">Blackout Bingo</p>
        <p class="d">Every square starts hidden. Reveal a few at a time.</p>
      </div>
      <div class="confirm-btn" id="confirmBtn">Confirm</div>
    </div>
  </div>

  <div class="scene" id="scene-grid">
    <div class="grid-wrap">
      <div class="bingo-grid" id="bingoGrid"></div>
      <div class="side">
        <p class="caption">Mark a square by actually doing it.</p>
        <p class="sub">Tap → confirm → done. That's it.</p>
      </div>
    </div>
    <div class="confirm-toast" id="confirmToast">
      <p>Mark this square?</p>
      <div class="yes">✓ Yes</div>
    </div>
  </div>

  <div class="scene" id="scene-blackout">
    <p class="headline">Blackout Mode: every square starts hidden.</p>
    <div class="row" id="blackoutRow"></div>
    <p class="sub">Reveal a few at a time — complete it, or pass and move on.</p>
  </div>

  <div class="scene" id="scene-betya">
    <div class="betya-circle"><span>I BET<br>YA!</span></div>
    <div class="result" id="betyaResult">
      <p class="label">Fund Credit!</p>
      <p class="amt">+10 Gr8Day Bucks to your wallet</p>
    </div>
  </div>

  <div class="scene" id="scene-refer">
    <div class="refer-card">
      <div class="toast" id="referToast">+5 Bucks</div>
      <h2>💌 Invite a Friend</h2>
      <p>When they join and verify their email, you get 5 Gr8Day Bucks.</p>
      <div class="refer-row">
        <div class="refer-input">friend@example.com</div>
        <div class="refer-btn">Invite</div>
      </div>
    </div>
  </div>

  <div class="scene" id="scene-quicktap">
    <p class="headline">Quick Tap: log a deed in one tap. No card needed.</p>
    <div class="qrow" id="quickTapRow"></div>
    <p class="sub">Perfect for the small stuff you'd do anyway.</p>
  </div>

  <div class="scene" id="scene-team">
    <p class="headline">Play solo, or team up.</p>
    <div class="trow">
      <div class="topt" id="soloOpt">
        <div class="avatars"><div class="avatar" style="background:linear-gradient(135deg,#0ea5e9,#2563eb)">Y</div></div>
        <p class="tname">Just You</p>
        <p class="tsub">Your own card, your own pace</p>
      </div>
      <div class="topt" id="teamOpt">
        <div class="avatars">
          <div class="avatar" style="background:linear-gradient(135deg,#f43f5e,#db2777)">M</div>
          <div class="avatar" style="background:linear-gradient(135deg,#f59e0b,#ea580c)">S</div>
          <div class="avatar" style="background:linear-gradient(135deg,#10b981,#16a34a)">L</div>
          <div class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#9333ea)">+3</div>
        </div>
        <p class="tname">Kindness Crew</p>
        <p class="tsub">312 combined deeds</p>
      </div>
    </div>
  </div>

  <div class="scene" id="scene-share">
    <div class="device">
      <div class="card">
        <p class="eyebrow">THIS MONTH I DELIVERED</p>
        <p class="num">12</p>
        <p class="lbl">Gr8Day Deeds</p>
      </div>
      <div class="caption">
        <h2>Share your impact.</h2>
        <p>One tap generates a card you're actually proud to post.</p>
      </div>
    </div>
  </div>

  <div class="scene" id="scene-dash">
    <div class="dash-hero">
      <div><div class="n tabular" id="dashCount">0</div><div class="l">Community Gr8Day Deeds</div></div>
      <div style="text-align:right"><div class="n tabular" style="color:var(--emerald-400); font-size:clamp(20px,3vw,28px)">+312</div><div class="l">This Week</div></div>
    </div>
    <div class="reach">
      <div class="stat"><span class="v">🌍 24</span><span class="l">Countries</span></div>
      <div class="stat"><span class="v">340+</span><span class="l">Cities</span></div>
      <div class="stat"><span class="v">241</span><span class="l">Active Players</span></div>
    </div>
    <div class="ticker">
      <div class="tcard"><p>Held the door and got a five-minute conversation out of it.</p><span>TORONTO · 2m ago</span></div>
      <div class="tcard"><p>Paid for the coffee behind them in line.</p><span>AUSTIN · 6m ago</span></div>
      <div class="tcard"><p>Called a friend they hadn't spoken to in a year.</p><span>MANCHESTER · 11m ago</span></div>
    </div>
    <div class="voice">
      <p class="q">"It gave me a reason to actually follow through instead of just meaning to be kind."</p>
      <p class="a">@sofia_smiles</p>
    </div>
  </div>

  <div class="scene" id="scene-cta">
    <p class="wordmark">Havagr8day <em>Bingo</em></p>
    <p class="tag">Play the game. Do the good. See the global impact.</p>
    <div class="url">havagr8day.com</div>
  </div>

  <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
</div>
`;

function runDemoTimeline(): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rafId = 0;
  const timeouts: number[] = [];
  const setTO = (fn: () => void, ms: number) => { timeouts.push(window.setTimeout(fn, ms)); };

  const letters = ['G', 'R', '8', 'D', 'A', 'Y'];
  const colors = [
    'linear-gradient(135deg,#f43f5e,#db2777)', 'linear-gradient(135deg,#f43f5e,#db2777)',
    'linear-gradient(135deg,#f59e0b,#ea580c)', 'linear-gradient(135deg,#10b981,#16a34a)',
    'linear-gradient(135deg,#0ea5e9,#2563eb)', 'linear-gradient(135deg,#8b5cf6,#9333ea)',
  ];
  const hookChips = document.getElementById('hookChips')!;
  letters.forEach((l, i) => {
    const d = document.createElement('div');
    d.className = 'chip';
    d.style.background = colors[i];
    d.style.animationDelay = i * 0.09 + 's';
    d.textContent = l;
    hookChips.appendChild(d);
  });

  const deeds = [
    { text: 'Hold the door for someone', color: '#38bdf8' },
    { text: 'Buy a stranger a coffee', color: '#fbbf24' },
    { text: 'Check in on a friend', color: '#a78bfa' },
    { text: 'Help a neighbour with a chore', color: '#34d399' },
  ];
  const deedStack = document.getElementById('deedStack')!;
  deeds.forEach((d) => {
    const el = document.createElement('div');
    el.className = 'deed-card';
    el.innerHTML = `<span class="deed-dot" style="background:${d.color}"></span><span class="deed-text">${d.text}</span>`;
    deedStack.appendChild(el);
  });

  const grid = document.getElementById('bingoGrid')!;
  const cells: HTMLDivElement[] = [];
  for (let i = 0; i < 25; i++) {
    const c = document.createElement('div');
    c.className = 'cell ' + (i === 12 ? 'center' : 'blank');
    c.innerHTML = i === 12
      ? '<span style="color:#fde68a;font-weight:900;font-size:10px">I BET<br>YA</span>'
      : '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
    grid.appendChild(c);
    cells.push(c);
  }
  const TARGET_CELL = 7;
  [1, 6, 8, 15, 19].forEach((idx) => {
    cells[idx].className = 'cell done';
    const chk = cells[idx].querySelector('.check') as HTMLElement;
    chk.style.opacity = '1';
    chk.style.transform = 'scale(1)';
  });
  cells[2].classList.add('free');
  cells[2].innerHTML = '<span style="color:#78350f;font-weight:900;font-size:11px">FREE</span>';

  const blackoutRow = document.getElementById('blackoutRow')!;
  const bcells: HTMLDivElement[] = [];
  for (let bi = 0; bi < 5; bi++) {
    const bc = document.createElement('div');
    bc.className = 'bcell hidden';
    bc.innerHTML = '<span>?</span>';
    blackoutRow.appendChild(bc);
    bcells.push(bc);
  }

  const qtDeeds = [
    { emoji: '☕', label: 'Bought a coffee' },
    { emoji: '🚪', label: 'Held a door' },
    { emoji: '📞', label: 'Called a friend' },
  ];
  const quickTapRow = document.getElementById('quickTapRow')!;
  const qchips: HTMLDivElement[] = [];
  qtDeeds.forEach((q) => {
    const el = document.createElement('div');
    el.className = 'qchip';
    el.innerHTML = `<span class="badge">+1</span><span class="emoji">${q.emoji}</span><span class="lbl">${q.label}</span>`;
    quickTapRow.appendChild(el);
    qchips.push(el);
  });

  const timeline = [
    { id: 'scene-hook', start: 0, end: 4 },
    { id: 'scene-deeds', start: 4, end: 7 },
    { id: 'scene-picker', start: 7, end: 13 },
    { id: 'scene-grid', start: 13, end: 20 },
    { id: 'scene-blackout', start: 20, end: 30 },
    { id: 'scene-betya', start: 30, end: 35 },
    { id: 'scene-refer', start: 35, end: 40 },
    { id: 'scene-share', start: 40, end: 47 },
    { id: 'scene-quicktap', start: 47, end: 53 },
    { id: 'scene-team', start: 53, end: 59 },
    { id: 'scene-dash', start: 59, end: 69 },
    { id: 'scene-cta', start: 69, end: 75 },
  ];
  const TOTAL = 75;
  const scenes: Record<string, HTMLElement> = {};
  timeline.forEach((t) => { scenes[t.id] = document.getElementById(t.id)!; });

  function showScene(id: string) {
    Object.keys(scenes).forEach((k) => scenes[k].classList.toggle('active', k === id));
  }

  const fired: Record<string, boolean> = {};
  function choreograph(id: string) {
    if (fired[id]) return;
    fired[id] = true;
    if (id === 'scene-picker') {
      setTO(() => document.getElementById('modeClassic')!.classList.add('selected'), 1400);
      setTO(() => document.getElementById('confirmBtn')!.classList.add('ready'), 2200);
    }
    if (id === 'scene-grid') {
      setTO(() => cells[TARGET_CELL].classList.add('pulse'), 800);
      setTO(() => {
        cells[TARGET_CELL].classList.remove('pulse');
        document.getElementById('confirmToast')!.classList.add('show');
      }, 2600);
      setTO(() => { cells[TARGET_CELL].className = 'cell done pop'; }, 4000);
    }
    if (id === 'scene-blackout') {
      setTO(() => bcells[1].classList.add('pulse'), 700);
      setTO(() => {
        bcells[1].classList.remove('pulse');
        bcells[1].classList.add('revealing');
        setTO(() => {
          bcells[1].className = 'bcell done';
          bcells[1].innerHTML = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
        }, 250);
      }, 2200);
      setTO(() => bcells[3].classList.add('pulse'), 4200);
      setTO(() => {
        bcells[3].classList.remove('pulse');
        bcells[3].classList.add('revealing');
        setTO(() => {
          bcells[3].className = 'bcell passed';
          bcells[3].innerHTML = '<span class="x">✕</span><span class="lbl">Passed</span>';
        }, 250);
      }, 5700);
    }
    if (id === 'scene-betya') {
      setTO(() => document.getElementById('betyaResult')!.classList.add('show'), 1600);
    }
    if (id === 'scene-refer') {
      setTO(() => document.getElementById('referToast')!.classList.add('show'), 1800);
    }
    if (id === 'scene-quicktap') {
      qchips.forEach((chip, idx) => setTO(() => chip.classList.add('tapped'), 900 + idx * 1500));
    }
    if (id === 'scene-team') {
      setTO(() => document.getElementById('teamOpt')!.classList.add('selected'), 1500);
    }
    if (id === 'scene-dash') {
      const el = document.getElementById('dashCount')!;
      const target = 4386;
      let start: number | null = null;
      const dur = 1200;
      function step(ts: number) {
        if (start === null) start = ts;
        const p = Math.min(1, (ts - start) / dur);
        el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target).toLocaleString();
        if (p < 1) rafId = requestAnimationFrame(step);
      }
      if (reduced) el.textContent = target.toLocaleString();
      else rafId = requestAnimationFrame(step);
    }
  }

  function resetSceneState() {
    cells[TARGET_CELL].className = 'cell blank';
    cells[TARGET_CELL].innerHTML = '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
    document.getElementById('confirmToast')!.classList.remove('show');
    bcells[1].className = 'bcell hidden'; bcells[1].innerHTML = '<span>?</span>';
    bcells[3].className = 'bcell hidden'; bcells[3].innerHTML = '<span>?</span>';
    document.getElementById('betyaResult')!.classList.remove('show');
    document.getElementById('referToast')!.classList.remove('show');
    qchips.forEach((chip) => chip.classList.remove('tapped'));
    document.getElementById('teamOpt')!.classList.remove('selected');
    document.getElementById('dashCount')!.textContent = '0';
  }

  const progressFill = document.getElementById('progressFill')!;
  let startTime: number | null = null;

  function tick(ts: number) {
    if (startTime === null) startTime = ts;
    let elapsed = (ts - startTime) / 1000;
    if (elapsed >= TOTAL) { startTime = ts; Object.keys(fired).forEach((k) => delete fired[k]); elapsed = 0; resetSceneState(); }
    const current = timeline.find((t) => elapsed >= t.start && elapsed < t.end) || timeline[timeline.length - 1];
    showScene(current.id);
    choreograph(current.id);
    progressFill.style.width = (elapsed / TOTAL) * 100 + '%';
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    timeouts.forEach((id) => clearTimeout(id));
  };
}

const Demo: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cleanup = runDemoTimeline();
    return cleanup;
  }, []);

  return (
    <div className="demo-root">
      <style>{DEMO_CSS}</style>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: DEMO_MARKUP }} />
      <button className="demo-close" onClick={() => navigate('/')}>✕ Close</button>
    </div>
  );
};

export default Demo;
