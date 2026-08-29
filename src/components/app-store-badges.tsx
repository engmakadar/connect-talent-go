/**
 * Official-style Google Play / App Store download badges.
 * Kept in one place so the footer and any promotional section stay identical.
 */

function GooglePlayGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" focusable="false">
      <path fill="#00D2FF" d="M47 20 300 256 47 492c-9-6-15-17-15-31V51c0-14 6-25 15-31z" />
      <path fill="#00F076" d="M47 20c8-5 19-5 30 1l246 137-73 68L47 20z" />
      <path fill="#FFCE00" d="M323 158l70 39c26 15 26 43 0 58l-70 39-73-68 73-68z" />
      <path fill="#FF3A44" d="M250 294l73 68L77 499c-11 6-22 6-30 1l203-206z" />
    </svg>
  );
}

function AppleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

interface Props {
  /** Visual theme: dark badge on light surfaces, light badge on dark surfaces. */
  variant?: "dark" | "light";
  className?: string;
}

export function AppStoreBadges({ variant = "dark", className = "" }: Props) {
  const base =
    variant === "dark"
      ? "bg-black text-white ring-white/20 hover:bg-black/85"
      : "bg-white text-black ring-black/10 hover:bg-white/90";

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <a
        href="https://play.google.com/store/apps/details?id=com.hormuud.sahan"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get the SahanJobs Android app on Google Play"
        className={`inline-flex h-[46px] items-center gap-2.5 rounded-lg px-3.5 ring-1 transition-colors ${base}`}
      >
        <GooglePlayGlyph className="h-6 w-6" />
        <span className="text-left leading-none">
          <span className="block text-[9px] uppercase tracking-[0.12em] opacity-80">Get it on</span>
          <span className="mt-1 block text-[15px] font-semibold leading-none">Google Play</span>
        </span>
      </a>

      <a
        href="https://apps.apple.com/za/app/sahanjob-app/id6763006880"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download the SahanJobs iOS app on the App Store"
        className={`inline-flex h-[46px] items-center gap-2.5 rounded-lg px-3.5 ring-1 transition-colors ${
          variant === "dark" ? "bg-white text-black ring-black/10 hover:bg-white/90" : base
        }`}
      >
        <AppleGlyph className="h-6 w-6" />
        <span className="text-left leading-none">
          <span className="block text-[9px] tracking-[0.02em] opacity-80">Download on the</span>
          <span className="mt-1 block text-[15px] font-semibold leading-none">App Store</span>
        </span>
      </a>
    </div>
  );
}
