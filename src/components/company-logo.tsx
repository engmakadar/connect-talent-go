interface CompanyLogoProps {
  company: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

// Deterministic color from company name so each company gets a stable brand color.
const PALETTE = [
  "0f5132", "064e3b", "1e3a8a", "7c2d12", "78350f", "4c1d95",
  "831843", "365314", "134e4a", "1e293b", "92400e", "0c4a6e",
];

export function CompanyLogo({ company, logoUrl, size = 56, className = "" }: CompanyLogoProps) {
  // Stable hash → palette index for fallback initial avatar
  let hash = 0;
  for (let i = 0; i < company.length; i++) hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  const bg = PALETTE[hash % PALETTE.length];

  const src = logoUrl
    ? logoUrl
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(company)}&background=${bg}&color=fff&bold=true&size=${size * 2}&font-size=0.42&rounded=false`;

  return (
    <img
      src={src}
      alt={`${company} logo`}
      width={size}
      height={size}
      loading="lazy"
      className={`rounded-lg object-cover ring-1 ring-black/5 bg-white ${className}`}
    />
  );
}
