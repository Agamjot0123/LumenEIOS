import React, { useCallback, useState } from 'react';
import { Badge } from '../../components/common/Badge';

// Shared helpers for the live homework workspaces. All data comes from the live API;
// nothing here is synthetic.

export const enc = encodeURIComponent;
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
export const inputClass = 'w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-gray-50';
export const labelClass = 'block text-xs font-medium text-content-secondary mb-1';

export function formatDate(value?: string | null): string {
  if (!value) return 'No due date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Runs one request at a time, exposing busy/error/notice state for a panel. */
export function useRunner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const run = useCallback(async (operation: () => Promise<void | string>) => {
    setBusy(true); setError(''); setNotice('');
    try { const message = await operation(); if (typeof message === 'string') setNotice(message); }
    catch (ex) { setError(errorText(ex)); }
    finally { setBusy(false); }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}

export const Messages: React.FC<{ error?: string; notice?: string }> = ({ error, notice }) => <>
  {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
  {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
</>;

export const Section: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> =
  ({ title, subtitle, action, children }) => <section className="rounded-xl border border-surface-border bg-white shadow-subtle">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-3">
      <div><h2 className="text-base font-semibold text-content-primary">{title}</h2>
        {subtitle && <p className="text-xs text-content-secondary">{subtitle}</p>}</div>
      {action}
    </header>
    <div className="space-y-4 p-5">{children}</div>
  </section>;

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  <p className="rounded-lg border border-dashed border-surface-border px-4 py-6 text-center text-sm text-content-secondary">{children}</p>;

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'teal'> = {
  draft: 'warning', approved: 'info', rejected: 'danger', assigned: 'teal',
  not_started: 'default', in_progress: 'warning', submitted: 'success',
  pending: 'warning', marked: 'info', released: 'success',
};
const STATUS_LABELS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress' };

export const StatusBadge: React.FC<{ status: string }> = ({ status }) =>
  <Badge variant={STATUS_VARIANTS[status] ?? 'default'} size="sm" dot>{STATUS_LABELS[status] ?? status[0].toUpperCase() + status.slice(1)}</Badge>;

// Same names as components/common/CompetencyScoreBadge.tsx.
export const COMPETENCY_NAMES: Record<string, string> = {
  LU: 'Language Understanding', CU: 'Concept Understanding', AU: 'Application Understanding', CT: 'Critical Thinking',
};
export const CompetencyTag: React.FC<{ code: string }> = ({ code }) =>
  <span title={COMPETENCY_NAMES[code] ?? code} className="rounded bg-navy-50 px-1.5 py-0.5 text-[11px] font-semibold text-navy-800">{code}</span>;

export function answerText(q: { answer_text?: string | null; selected_option_index?: number | null; options?: unknown[] }): string {
  if (q.answer_text) return q.answer_text;
  if (q.selected_option_index != null) return String(q.options?.[q.selected_option_index] ?? `Option ${q.selected_option_index + 1}`);
  return 'Not answered';
}

/** Released result. Shared by the student and parent views (same server serializer). */
export const ReleasedResult: React.FC<{ result: any }> = ({ result }) => {
  const pct = result.total_max ? Math.round((result.total_awarded / result.total_max) * 100) : 0;
  return <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold text-content-primary">Released teacher evaluation</h3>
      <p className="text-sm text-content-secondary">Released {formatDate(result.released_at)}</p>
    </div>
    <p className="mt-1 text-2xl font-bold text-emerald-800">{result.total_awarded} / {result.total_max} <span className="text-sm font-medium">marks ({pct}%)</span></p>
    <ol className="mt-3 space-y-3">
      {result.items.map((q: any) => <li key={q.position} className="rounded-lg border border-surface-border bg-white p-3">
        <div className="flex justify-between gap-3"><p className="text-sm font-medium">{q.position}. {q.text}</p>
          <span className="shrink-0 text-sm font-semibold">{q.awarded_marks} / {q.max_marks}</span></div>
        <p className="mt-1 text-sm text-content-secondary">Answer: {answerText(q)}</p>
        {q.feedback && <p className="mt-1 text-sm text-teal-800">Teacher feedback: {q.feedback}</p>}
      </li>)}
    </ol>
  </div>;
};

export const Tabs: React.FC<{ tabs: [string, string][]; active: string; onChange: (id: string) => void }> = ({ tabs, active, onChange }) =>
  <nav className="flex flex-wrap gap-1 rounded-xl border border-surface-border bg-white p-1" role="tablist">
    {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={active === id} onClick={() => onChange(id)}
      className={'rounded-lg px-4 py-2 text-sm font-medium ' + (active === id ? 'bg-navy-800 text-white' : 'text-content-secondary hover:bg-gray-100')}>{label}</button>)}
  </nav>;
