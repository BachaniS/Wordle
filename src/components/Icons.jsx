const Svg = ({ children, ...rest }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const BackIcon = () => <Svg><path d="M15 5l-7 7 7 7" /></Svg>;
export const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const ChatIcon = () => <Svg><path d="M4 5h16v11H9l-5 4z" /></Svg>;
export const StatsIcon = () => <Svg><path d="M5 20V12M12 20V5M19 20v-9" /></Svg>;
export const SettingsIcon = () => (
  <Svg>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);
export const HelpIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8" />
    <circle cx="12" cy="17.2" r=".6" className="fill" />
  </Svg>
);
export const BackspaceIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      fill="currentColor"
      d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H7.07L2.4 12l4.66-7H22v14zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z"
    />
  </svg>
);
