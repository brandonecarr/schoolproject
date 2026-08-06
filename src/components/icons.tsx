// Compact stroke icon set (24-grid, currentColor) for navigation.

const P = ({ d }: { d: string }) => <path d={d} />;

const PATHS: Record<string, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  attendance: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <P d="M3 9h18M8 2v4M16 2v4" />
      <P d="M8.5 15l2 2 4-4" />
    </>
  ),
  observations: <P d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />,
  courses: <P d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 3v18" />,
  assignments: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <P d="M9 3.5h6a1 1 0 011 1V6a1 1 0 01-1 1H9a1 1 0 01-1-1V4.5a1 1 0 011-1zM8.5 12h7M8.5 16h5" />
    </>
  ),
  grading: (
    <>
      <path d="M22 11.5V12a10 10 0 11-5.9-9.1" />
      <P d="M22 4L12 14l-3-3" />
    </>
  ),
  students: (
    <>
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <P d="M22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" />
    </>
  ),
  invites: (
    <>
      <path d="M15 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <P d="M19 8v6M22 11h-6" />
    </>
  ),
  evidence: <P d="M3 3v18h18M8 17V9M13 17V5M18 17v-6" />,
  invoices: (
    <>
      <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
      <P d="M14 2v6h6M9 13h6M9 17h6" />
    </>
  ),
  billing: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <P d="M2 10h20" />
    </>
  ),
  cashflow: <P d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  messages: <P d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-4-1L3 20l1.1-4A8.4 8.4 0 013 11.5a8.4 8.4 0 019-8.4 8.4 8.4 0 019 8.4z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-.7-2.7 1.6 1.6 0 010-3.2 1.6 1.6 0 00.7-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-.7 1.6 1.6 0 013.2 0 1.6 1.6 0 002.7.7l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.7 2.7h.1a1.6 1.6 0 010 3.2h-.1a1.6 1.6 0 00-1.5 1z" />
    </>
  ),
  audit: <P d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" />,
};

export function Icon({ name }: { name: string }) {
  const body = PATHS[name] ?? PATHS.dashboard;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
