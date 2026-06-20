/**
 * Design tokens — derived directly from the product's own "Premium Product
 * Experience Definition": clarity + speed + zero confusion, large numbers,
 * minimal icons, high spacing, authoritative-not-decorative language.
 *
 * Signature element: the post-verification confirmation state (see
 * VerifiedFlash component) is where this app spends its one moment of
 * visual boldness — a deliberate amber pulse + checkmark. Everywhere else
 * stays quiet and disciplined, per that same restraint principle.
 */

export const colors = {
  // Warm off-black / off-white — authoritative without being cold or
  // "fintech generic." Avoids the templated near-black-with-neon-accent
  // look; this is a ledger, not a trading app.
  ink: "#1A1A1A",
  paper: "#FAF9F6",
  paperMuted: "#F1EFE9",
  hairline: "#E5E1D8",

  // Single accent, used sparingly: the moment of payment confirmation,
  // and the queue's pending-indicator pulse. Amber reads as "money /
  // attention" without the alarm connotation of red.
  amber: "#C8862B",
  amberSoft: "#F4E6D2",

  // Status — used only on session rows, never decoratively elsewhere.
  success: "#2F6B4F",
  successSoft: "#E3EFE8",
  danger: "#A23E3E",
  dangerSoft: "#F4E3E1",

  textPrimary: "#1A1A1A",
  textSecondary: "#6B6358",
  textOnDark: "#FAF9F6",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  full: 999,
} as const;

export const typography = {
  // One display weight for "the number that matters" (today's revenue,
  // amount due) — everything else is a plain system font at restrained
  // sizes. This mirrors the spec's "Large numbers, simple labels" law
  // directly; no separate display typeface is loaded; weight + size do
  // the work without adding a font-loading dependency to a phone-only
  // dev workflow.
  display: {
    fontSize: 48,
    fontWeight: "300" as const,
    letterSpacing: -1,
  },
  h1: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
  },
  caption: {
    fontSize: 13,
    fontWeight: "400" as const,
  },
} as const;
