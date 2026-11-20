import React from "react";
const shapes: Record<string, React.ReactNode> = {
  pad: (
    <>
      <path
        d="M5 6h14v2h2v9h-2v2h-3l-3-3h-2l-3 3H4v-2H2v-7h1V8h2z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M6 11h5m-2.5-2.5v5M15 12h1m1-2h1"
        stroke="var(--pad-ink,#302738)"
      />
    </>
  ),
  sound: (
    <>
      <path d="M3 9h4l5-4v14l-5-4H3z" />
      <path d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" />
    </>
  ),
  mute: (
    <>
      <path d="M3 9h4l5-4v14l-5-4H3z" />
      <path d="m16 9 5 6m0-6-5 6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 2v1" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4z" />
      <path d="M15 6v2m0 3v2m0 3v2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19v-2a6 6 0 0 1 12 0v2zM16 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5" />
    </>
  ),
  enter: (
    <>
      <path d="M14 4h6v16h-6m-3-4 4-4-4-4m3 4H3" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8z" fill="currentColor" stroke="none" />,
  plus: <path d="M12 4v16M4 12h16" />,
  layers: (
    <>
      <path d="m2 9 10-6 10 6-10 6zm1 5 9 5 9-5" />
    </>
  ),
  book: (
    <>
      <path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1zM12 6v14" />
    </>
  ),
  close: <path d="m5 5 14 14M19 5 5 19" />,
  copy: (
    <>
      <path d="M8 8h12v13H8zM4 16H3V3h12v1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 3h10v6a5 5 0 0 1-10 0zM7 6H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 1v5m-4 2h8" />
    </>
  ),
};
export function Icon({ name, size = 19 }: { name: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {shapes[name]}
    </svg>
  );
}
