import React from 'react';

interface LogoMarkProps {
  className?: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({ className = 'w-8 h-8' }) => {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="koraLogoBg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="60%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        <linearGradient id="koraLogoAccent" x1="128" y1="128" x2="384" y2="384" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#koraLogoBg)" />
      <rect x="14" y="14" width="484" height="484" rx="108" stroke="#334155" strokeOpacity="0.65" strokeWidth="6" />
      <path
        d="M256 104C167.634 104 96 170.262 96 252C96 293.75 114.696 331.464 144.812 358.316L128 416L194.286 389.486C213.688 396.292 234.422 400 256 400C344.366 400 416 333.738 416 252C416 170.262 344.366 104 256 104Z"
        fill="#F8FAFC"
      />
      <rect x="180" y="228" width="24" height="48" rx="12" fill="#0F172A" />
      <rect x="222" y="188" width="24" height="128" rx="12" fill="url(#koraLogoAccent)" />
      <rect x="264" y="206" width="24" height="92" rx="12" fill="#0F172A" />
      <rect x="306" y="224" width="24" height="56" rx="12" fill="url(#koraLogoAccent)" />
    </svg>
  );
};
