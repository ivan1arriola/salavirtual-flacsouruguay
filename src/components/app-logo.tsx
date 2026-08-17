export function AppLogoMark({
  className,
  size = 40,
  title
}: Readonly<{
  className?: string;
  size?: number;
  title?: string;
}>) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id="sala-virtual-logo-gradient" x1="7" y1="5" x2="42" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#163970" />
          <stop offset="0.68" stopColor="#0d4f78" />
          <stop offset="1" stopColor="#176c78" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="url(#sala-virtual-logo-gradient)" />
      <rect x="2" y="2" width="44" height="44" rx="11.5" fill="none" stroke="rgba(255,255,255,0.22)" />
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="-2"
      >
        SV
      </text>
      <path
        d="M11.5 35.3c7.7 4.2 17.4 4.5 25.5.7"
        fill="none"
        stroke="#62c5cf"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
