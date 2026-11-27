export function AppLogoMark({
  className,
  size = 40,
  title,
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
      <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill="#2c4777" />
      <path d="M30 2h4.5A11.5 11.5 0 0 1 46 13.5V27L30 2Z" fill="#3b5688" opacity="0.78" />
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="11.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.22"
      />
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
        stroke="#ffcf1f"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
