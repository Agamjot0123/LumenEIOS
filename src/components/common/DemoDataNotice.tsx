import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * Honest labelling for prototype modules. Pages backed by the shared planning workspace (Academic Configuration,
 * Time-Aware Engine, Daily Curriculum, Curriculum Oversight) show live records; the modules listed here run on seeded
 * demonstration records and must not be read as school data.
 */
const NOTICES: { match: (path: string) => boolean; text: string }[] = [
  { match: (p) => p === '/admin/schools', text: 'Campus profiles are seeded demonstration records. Adding or editing a campus is kept in this browser only.' },
  { match: (p) => p === '/admin/users', text: 'These are the five demonstration personas plus seeded staff records; role switching is for demonstration.' },
  { match: (p) => p === '/principal/teachers', text: 'Teacher assignments are seeded demonstration records; reassignments are kept in this browser only.' },
  { match: (p) => p === '/teacher/classes', text: 'Student rosters and competency scores are seeded demonstration data, not school assessment records.' },
  { match: (p) => p === '/teacher/assessments', text: 'Prototype module: questions come from built-in deterministic templates — no AI model is connected in this build. Source documents and cycles are seeded demonstration records; review every item before classroom use.' },
  { match: (p) => p === '/teacher/remediation', text: 'Remediation assignments are seeded demonstration records based on sample competency scores.' },
];

export function demoNoticeFor(pathname: string): string | null {
  return NOTICES.find((n) => n.match(pathname))?.text ?? null;
}

export const DemoDataNotice: React.FC<{ text: string }> = ({ text }) => (
  <div role="note" aria-label="Demonstration data" className="mb-5 flex items-start gap-2.5 rounded-xl border border-dashed border-navy-200 bg-white/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-content-secondary print:hidden" data-testid="demo-data-notice">
    <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-500" aria-hidden />
    <p>
      <span className="font-semibold text-content-primary">Demonstration data · </span>
      {text}
    </p>
  </div>
);
