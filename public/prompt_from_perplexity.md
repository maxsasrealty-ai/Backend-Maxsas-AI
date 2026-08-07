@import "tailwindcss";

/* ════════════════════════════════════════════════════════════════════
   ──  MAXSAS AI — MODERNIZED DESIGN SYSTEM  ──
   ──  v2.0 · Glassmorphism · Animated · Layered  ──
   ════════════════════════════════════════════════════════════════════ */

:root {
  /* ── Background Layers (deep navy → near-black) ────────────────── */
  --bg-base:      #030712;
  --bg-surface:   #0a1120;
  --bg-card:      #0e162f;
  --bg-elevated:  #131d3a;
  --bg-hover:     #1a274d;
  --bg-frosted:   rgba(19, 29, 58, 0.82);
  
  /* ── Borders (subtle, layered) ──────────────────────────────────── */
  --border:       #1e2a52;
  --border-subtle:#131d3a;
  --border-glow:  rgba(0, 212, 255, 0.18);
  --border-strong:rgba(255, 255, 255, 0.08);
  
  /* ── Accent Palette (refined saturation) ────────────────────────── */
  --accent-cyan:   #00e5ff;
  --accent-cyan-dim:rgba(0, 229, 255, 0.4);
  --accent-violet: #8b5cf6;
  --accent-violet-dim:rgba(139, 92, 246, 0.4);
  --accent-emerald:#10b981;
  --accent-emerald-dim:rgba(16, 185, 129, 0.4);
  --accent-amber:  #f59e0b;
  --accent-amber-dim:rgba(245, 158, 11, 0.4);
  --accent-rose:   #f43f5e;
  --accent-rose-dim:rgba(244, 63, 94, 0.4);
  --accent-pink:   #ec4899;
  --accent-pink-dim:rgba(236, 72, 153, 0.4);
  
  /* ── Text Hierarchy (crisp, high contrast) ──────────────────────── */
  --text-primary:   #f1f5ff;
  --text-secondary: #94a3b8;
  --text-muted:     #475569;
  --text-glow:      rgba(0, 229, 255, 0.35);
  
  /* ── Gradients ──────────────────────────────────────────────────── */
  --grad-primary:   linear-gradient(135deg, #00e5ff 0%, #8b5cf6 55%, #ec4899 100%);
  --grad-cyan-v:    linear-gradient(135deg, #00e5ff 0%, #8b5cf6 100%);
  --grad-void:      linear-gradient(180deg, rgba(11, 18, 40, 0) 0%, rgba(11, 18, 40, 0.95) 100%);
  --grad-card:      linear-gradient(145deg, rgba(23, 38, 82, 0.8), rgba(13, 22, 47, 0.95));
  --grad-glass:     linear-gradient(135deg, rgba(19, 29, 58, 0.7), rgba(13, 21, 47, 0.85));
  
  /* ── Shadows (layered, diffused) ────────────────────────────────── */
  --shadow-sm:   0 2px 8px rgba(0, 0, 0, 0.35);
  --shadow-md:   0 4px 20px rgba(0, 0, 0, 0.45);
  --shadow-lg:   0 8px 40px rgba(0, 0, 0, 0.5);
  --shadow-glow-cyan:  0 0 40px rgba(0, 229, 255, 0.25), 0 0 80px rgba(139, 92, 246, 0.15);
  --shadow-glow-v:     0 0 35px rgba(139, 92, 246, 0.25), 0 0 70px rgba(0, 229, 255, 0.12);
  --shadow-glow-em:    0 0 35px rgba(16, 185, 129, 0.2);
  --shadow-inner: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  
  /* ── Dimensions ─────────────────────────────────────────────────── */
  --sidebar-width:     270px;
  --sidebar-collapsed: 76px;
  --topbar-height:     72px;
  
  /* ── Radii (softer, modern) ─────────────────────────────────────── */
  --radius-sm:  10px;
  --radius-md:  16px;
  --radius-lg:  22px;
  --radius-xl:  28px;
  --radius-2xl: 36px;
  
  /* ── Typography ─────────────────────────────────────────────────── */
  --font-inter:  "Inter", system-ui, -apple-system, sans-serif;
  --font-space:  "Space Grotesk", system-ui, sans-serif;
  --font-mono:   "JetBrains Mono", "Fira Code", monospace;
  
  /* ── Timing ─────────────────────────────────────────────────────── */
  --ease-out:     cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring:  cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --ease-elastic: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* ════════════════════════════════════════════════════════════════════
   ──  RESET  ────────────────────────────────────────────
   ════════════════════════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; font-size: 16px; }

::selection { background: rgba(0, 229, 255, 0.25); color: #fff; }

body {
  background: radial-gradient(100% 100% at 50% 0%, #0a1120 0%, #030712 100%);
  color: var(--text-primary);
  font-family: var(--font-inter);
  line-height: 1.6;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100vh;
}

/* ════════════════════════════════════════════════════════════════════
   ──  NOISE TEXTURE (depth layer)  ──
   ════════════════════════════════════════════════════════════════════ */
.noise-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.018;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' num