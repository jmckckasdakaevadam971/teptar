/**
 * Реалистичная сцена-герой: закатное небо, горы в дымке,
 * детальная вайнахская башня с каменной кладкой и горящим окном.
 * Используется на главной странице как фон hero-блока.
 */
export function HeroScene() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <svg
        className="hero-svg"
        viewBox="0 0 1440 760"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="hsSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#160f08" />
            <stop offset=".32" stopColor="#34230f" />
            <stop offset=".58" stopColor="#7a451a" />
            <stop offset=".78" stopColor="#bb6f24" />
            <stop offset="1" stopColor="#e2a341" />
          </linearGradient>
          <radialGradient id="hsSunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff4d6" />
            <stop offset=".3" stopColor="#ffdd8c" />
            <stop offset=".7" stopColor="#f0a83e" stopOpacity=".35" />
            <stop offset="1" stopColor="#f0a83e" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hsMFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7d5c39" />
            <stop offset="1" stopColor="#4a3826" />
          </linearGradient>
          <linearGradient id="hsMMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4d3a26" />
            <stop offset="1" stopColor="#241a10" />
          </linearGradient>
          <linearGradient id="hsMNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#241a10" />
            <stop offset="1" stopColor="#0c0a07" />
          </linearGradient>
          <linearGradient id="hsBody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9a8157" />
            <stop offset=".5" stopColor="#6d5839" />
            <stop offset="1" stopColor="#352818" />
          </linearGradient>
          <linearGradient id="hsRoof" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#a88f63" />
            <stop offset="1" stopColor="#3f3120" />
          </linearGradient>
          <radialGradient id="hsVig" cx="50%" cy="42%" r="75%">
            <stop offset=".55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".6" />
          </radialGradient>
          <filter id="hsSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id="hsSofter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* небо и солнце */}
        <rect width="1440" height="760" fill="url(#hsSky)" />
        <circle cx="1015" cy="215" r="44" fill="#fff0c6" />
        <circle cx="1015" cy="215" r="155" fill="url(#hsSunGlow)" />

        {/* дальние горы в дымке */}
        <g filter="url(#hsSofter)" opacity=".75">
          <path
            fill="url(#hsMFar)"
            d="M0 470 L190 320 L350 405 L520 300 L710 400 L900 305 L1130 400 L1300 330 L1440 405 L1440 760 L0 760Z"
          />
        </g>
        <rect x="0" y="395" width="1440" height="90" fill="#d89a52" opacity=".16" filter="url(#hsSofter)" />

        {/* дальняя башня-силуэт */}
        <g transform="translate(232,268) scale(.5)" opacity=".5" filter="url(#hsSoft)">
          <path fill="#160f08" d="M18 372 L142 372 L132 70 L28 70 Z" />
          <path fill="#160f08" d="M12 70 L148 70 L80 6 Z" />
        </g>

        {/* средние горы */}
        <g filter="url(#hsSoft)">
          <path
            fill="url(#hsMMid)"
            d="M0 545 L250 410 L440 500 L650 390 L870 500 L1090 410 L1290 500 L1440 450 L1440 760 L0 760Z"
          />
        </g>
        <rect x="0" y="505" width="1440" height="80" fill="#c98944" opacity=".18" filter="url(#hsSofter)" />

        {/* ближние холмы */}
        <path
          fill="url(#hsMNear)"
          d="M0 660 L300 582 L560 652 L820 560 L1100 650 L1320 600 L1440 642 L1440 760 L0 760Z"
        />

        {/* Главная башня */}
        <g transform="translate(862,238)">
          <ellipse cx="80" cy="390" rx="96" ry="16" fill="#000" opacity=".4" filter="url(#hsSoft)" />
          <path d="M8 390 L152 390 L142 370 L18 370 Z" fill="#241a10" />
          <path d="M18 370 L142 370 L132 70 L28 70 Z" fill="url(#hsBody)" />
          <path d="M18 370 L28 70 L40 70 L30 370 Z" fill="#ffe7a8" opacity=".2" />
          <path d="M142 370 L132 70 L120 70 L130 370 Z" fill="#000" opacity=".26" />
          <g stroke="#1c140b" strokeWidth="1.4" opacity=".45">
            <line x1="22" y1="346" x2="138" y2="346" />
            <line x1="23" y1="320" x2="137" y2="320" />
            <line x1="24" y1="294" x2="136" y2="294" />
            <line x1="25" y1="268" x2="135" y2="268" />
            <line x1="25" y1="242" x2="135" y2="242" />
            <line x1="26" y1="216" x2="134" y2="216" />
            <line x1="26" y1="190" x2="134" y2="190" />
            <line x1="27" y1="164" x2="133" y2="164" />
            <line x1="27" y1="138" x2="133" y2="138" />
            <line x1="28" y1="112" x2="132" y2="112" />
          </g>
          <g stroke="#1c140b" strokeWidth="1.1" opacity=".3">
            <line x1="58" y1="370" x2="59" y2="346" />
            <line x1="100" y1="370" x2="100" y2="346" />
            <line x1="80" y1="346" x2="80" y2="320" />
            <line x1="120" y1="346" x2="119" y2="320" />
            <line x1="40" y1="346" x2="41" y2="320" />
            <line x1="60" y1="320" x2="60" y2="294" />
            <line x1="100" y1="320" x2="100" y2="294" />
            <line x1="80" y1="294" x2="80" y2="268" />
            <line x1="118" y1="294" x2="117" y2="268" />
            <line x1="60" y1="216" x2="60" y2="190" />
            <line x1="100" y1="216" x2="100" y2="190" />
          </g>
          <path d="M66 370 L66 320 Q80 302 94 320 L94 370 Z" fill="#0c0905" />
          <path d="M70 370 L70 322 Q80 310 90 322 L90 370 Z" fill="#1c130a" />
          <rect x="73" y="120" width="14" height="26" rx="7" fill="#0c0905" />
          <rect x="52" y="208" width="11" height="22" rx="5" fill="#0c0905" />
          <rect x="97" y="208" width="11" height="22" rx="5" fill="#0c0905" />
          <rect x="72" y="258" width="16" height="30" rx="8" fill="#0c0905" />
          <rect x="75" y="272" width="10" height="13" rx="4" fill="#dc922f" />
          <path d="M12 70 L148 70 L142 52 L18 52 Z" fill="#52401f" />
          <g fill="#241a10">
            <rect x="15" y="52" width="9" height="18" />
            <rect x="33" y="52" width="9" height="18" />
            <rect x="51" y="52" width="9" height="18" />
            <rect x="69" y="52" width="9" height="18" />
            <rect x="87" y="52" width="9" height="18" />
            <rect x="105" y="52" width="9" height="18" />
            <rect x="123" y="52" width="9" height="18" />
            <rect x="138" y="52" width="9" height="18" />
          </g>
          <path d="M14 52 L146 52 L80 4 Z" fill="url(#hsRoof)" />
          <path d="M14 52 L80 4 L80 15 L27 52 Z" fill="#ffe7a8" opacity=".22" />
          <path d="M146 52 L80 4 L80 15 L133 52 Z" fill="#000" opacity=".26" />
          <g stroke="#241a10" strokeWidth="1.6" fill="none" opacity=".65">
            <path d="M28 40 L132 40" />
            <path d="M40 30 L120 30" />
            <path d="M52 20 L108 20" />
            <path d="M64 12 L96 12" />
          </g>
          <circle cx="80" cy="6" r="4.5" fill="#eccd63" />
        </g>

        {/* виньетка */}
        <rect width="1440" height="760" fill="url(#hsVig)" />
      </svg>
      <div className="hero-grain" />
    </div>
  );
}
