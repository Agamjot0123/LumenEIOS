import React, { useEffect, useState } from 'react';
import { apiClient, ApiError } from '../../lib/apiClient';
import { Button } from '../../components/common/Button';
import { Empty, Messages, ReleasedResult, Section, StatusBadge, formatDate, inputClass, useRunner } from './ui';

const hw = apiClient.homework;

/** Student homework: own assignments only (server resolves the student from the login). */
export const StudentWorkspace: React.FC = () => {
  const { busy, error, run } = useRunner();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState('');
  const refresh = async () => {
    const rows = await hw.assignments(); setAssignments(rows);
    const entries = await Promise.all(rows.map(async (a: any) => [a.id, (await hw.submission(a.id)).status] as const));
    setStatuses(Object.fromEntries(entries));
  };
  useEffect(() => { run(refresh); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <Section title="My homework" action={<Button size="sm" variant="outline" disabled={busy} onClick={() => run(refresh)}>Refresh</Button>}>
      <Messages error={error} />
      {assignments.length === 0 && !error ? <Empty>No homework has been assigned to you yet.</Empty> :
        <ul className="divide-y divide-surface-border">{assignments.map(a => <li key={a.id}>
          <button className={'w-full px-2 py-2.5 text-left hover:bg-gray-50 ' + (a.id === selected ? 'bg-teal-50' : '')} onClick={() => setSelected(a.id)}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{a.subject_name || a.subject_id}</span>
              {statuses[a.id] && <StatusBadge status={statuses[a.id]} />}</div>
            <p className="text-xs text-content-secondary">{a.question_count} questions, {a.total_marks} marks - due {formatDate(a.due_at)}</p>
          </button></li>)}</ul>}
    </Section>
    {selected ? <StudentAssignment key={selected} id={selected}
      onStatus={status => setStatuses(s => ({ ...s, [selected]: status }))} /> :
      <Section title="Assignment"><Empty>Select an assignment to open it.</Empty></Section>}
  </div>;
};

function StudentAssignment({ id, onStatus }: { id: string; onStatus: (status: string) => void }) {
  const { busy, error, notice, run } = useRunner();
  const [assignment, setAssignment] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [result, setResult] = useState<any>(null);
  const [resultChecked, setResultChecked] = useState(false);

  const apply = (s: any) => {
    setSubmission(s); onStatus(s.status);
    const values = Object.fromEntries(s.answers.map((v: any) => [v.position, v.answer_text ?? String(v.selected_option_index ?? '')]));
    setAnswers(values); setSaved(values);
  };
  const checkResult = async () => {
    try { setResult(await hw.result(id)); }
    catch (ex) { if (!(ex instanceof ApiError && ex.status === 404)) throw ex; setResult(null); }
    setResultChecked(true);
  };
  const load = async () => {
    const [a, s] = await Promise.all([hw.assignment(id), hw.submission(id)]);
    setAssignment(a); apply(s);
    if (s.status === 'submitted') await checkResult();
  };
  useEffect(() => { run(load); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = submission?.status === 'submitted';
  const dirty = assignment?.items.some((q: any) => (answers[q.position] ?? '') !== (saved[q.position] ?? ''));
  const save = async () => {
    const updates = assignment.items.filter((q: any) => (answers[q.position] ?? '') !== (saved[q.position] ?? '')).map((q: any) => {
      const value = answers[q.position] ?? '';
      if (value === '') return { position: q.position, clear: true };
      return q.type === 'mcq' ? { position: q.position, selected_option_index: Number(value) } : { position: q.position, answer_text: value };
    });
    if (updates.length === 0) return submission;
    const updated = await hw.save(id, updates, submission.version); apply(updated); return updated;
  };
  const answered = assignment ? assignment.items.filter((q: any) => (answers[q.position] ?? '') !== '').length : 0;

  if (!assignment || !submission) return <Section title="Assignment"><Messages error={error} />{!error && <p className="text-sm">Loading...</p>}</Section>;
  return <Section title={<span className="flex items-center gap-2">{assignment.subject_name || assignment.subject_id} <StatusBadge status={submission.status} /></span>}
    subtitle={`${assignment.question_count} questions, ${assignment.total_marks} marks - due ${formatDate(assignment.due_at)}`}>
    <Messages error={error} notice={notice} />
    {locked && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm">Submitted {formatDate(submission.submitted_at)}{submission.is_late ? ' (late)' : ''}. Your answers are locked.</p>}
    {result ? <ReleasedResult result={result} /> : <>
      {locked && resultChecked && <p className="text-sm text-content-secondary">Your teacher has not released the evaluation yet.</p>}
      <ol className="space-y-3">{assignment.items.map((q: any) => <li key={q.position} className="rounded-lg border border-surface-border p-3">
        <div>
          <p className="text-sm font-medium">{q.position}. {q.text} <span className="text-content-secondary">({q.marks} marks)</span></p>
          {q.type === 'mcq' ? <div className="mt-2 space-y-1" role="radiogroup" aria-label={`Answer for question ${q.position}`}>
            {q.options.map((option: any, i: number) => <label key={i} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`q-${q.position}`} disabled={busy || locked} checked={answers[q.position] === String(i)}
                onChange={() => setAnswers({ ...answers, [q.position]: String(i) })} />{String(option)}</label>)}
            {!locked && answers[q.position] && <button type="button" className="text-xs text-content-secondary underline" onClick={() => setAnswers({ ...answers, [q.position]: '' })}>Clear answer</button>}
          </div> : <textarea aria-label={`Answer for question ${q.position}`} rows={3} className={inputClass + ' mt-2'} disabled={busy || locked}
            value={answers[q.position] ?? ''} onChange={e => setAnswers({ ...answers, [q.position]: e.target.value })} />}
        </div></li>)}</ol>
    </>}
    {!locked && <div className="flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
      <Button variant="outline" disabled={busy || !dirty} onClick={() => run(async () => { await save(); return 'Answers saved. You can come back and continue later.'; })}>Save progress</Button>
      <Button variant="teal" disabled={busy} onClick={() => {
        const blanks = assignment.items.length - answered;
        if (!window.confirm(`Submit this homework? ${blanks ? `${blanks} question(s) are unanswered. ` : ''}You cannot change answers after submitting.`)) return;
        run(async () => { const current = await save(); apply(await hw.submit(id, current.version)); setResultChecked(true); return 'Submitted for teacher evaluation.'; });
      }}>Submit homework</Button>
      <span className="text-xs text-content-secondary">{answered} / {assignment.items.length} answered{dirty ? ' - unsaved changes' : ''}</span>
    </div>}
    {locked && !result && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await checkResult(); })}>Check for released result</Button>}
  </Section>;
}
