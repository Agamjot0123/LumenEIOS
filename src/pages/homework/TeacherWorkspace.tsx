import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/apiClient';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { AiQuestionGenerator } from './AiQuestionGenerator';
import {
  COMPETENCY_NAMES, CompetencyTag, Empty, Messages, ReleasedResult, Section, StatusBadge, Tabs,
  answerText, enc, errorText, formatDate, inputClass, labelClass, useRunner,
} from './ui';

const hw = apiClient.homework;
type Tab = 'create' | 'drafts' | 'assignments' | 'bank';

/** Teacher / principal / admin homework workspace. Every action calls the live backend. */
export const TeacherWorkspace: React.FC = () => {
  const [tab, setTab] = useState<Tab>('create');
  const [openDraftId, setOpenDraftId] = useState('');
  const [openAssignmentId, setOpenAssignmentId] = useState('');
  return <div className="space-y-5">
    <Tabs active={tab} onChange={id => setTab(id as Tab)} tabs={[['create', '1. Create homework'], ['drafts', '2. Review & assign'],
      ['assignments', '3. Submissions & marking'], ['bank', 'Question bank']]} />
    {tab === 'create' && <CreateHomework onSaved={id => { setOpenDraftId(id); setTab('drafts'); }} />}
    {tab === 'drafts' && <Drafts openId={openDraftId} setOpenId={setOpenDraftId}
      onAssigned={id => { setOpenAssignmentId(id); setTab('assignments'); }} />}
    {tab === 'assignments' && <Assignments openId={openAssignmentId} setOpenId={setOpenAssignmentId} />}
    {tab === 'bank' && <QuestionBank />}
  </div>;
};

// --- 1. Create: roster pickers, gap analysis, preview, save draft ---------------------------

function CreateHomework({ onSaved }: { onSaved: (draftId: string) => void }) {
  const { currentSchoolId, currentUser } = useAuth();
  const { busy, error, notice, run } = useRunner();
  const [classes, setClasses] = useState<any[]>([]); const [classId, setClassId] = useState('');
  const [rosterLoaded, setRosterLoaded] = useState(false);
  // The teacher's own classes (class_teacher_id) first; access itself is school-wide on the server.
  const sortedClasses = useMemo(() => [...classes].sort((a, b) =>
    Number(b.class_teacher_id === currentUser?.id) - Number(a.class_teacher_id === currentUser?.id) || a.name.localeCompare(b.name)),
  [classes, currentUser?.id]);
  const [students, setStudents] = useState<any[]>([]); const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [gap, setGap] = useState<any>(null);
  const [count, setCount] = useState(5); const [maxMarks, setMaxMarks] = useState('');
  const [includeAI, setIncludeAI] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  useEffect(() => { let active = true;
    hw.call<any[]>(`/schools/${enc(currentSchoolId)}/classes`).then(rows => { if (active) setClasses(rows); })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; }; }, [currentSchoolId]);

  const selectedClass = classes.find(c => c.id === classId);
  const chooseClass = (id: string) => run(async () => {
    setClassId(id); setStudentId(''); setStudents([]); setGap(null); setPreview(null); setRosterLoaded(false);
    setSubjectId(classes.find(c => c.id === id)?.subject_ids_json?.[0] ?? '');
    if (id) { setStudents(await hw.call<any[]>(`/classes/${enc(id)}/students`)); setRosterLoaded(true); }
  });
  const chooseStudent = (id: string) => run(async () => {
    setStudentId(id); setGap(null); setPreview(null);
    if (id) setGap(await hw.call(`/students/${enc(id)}/homework/gap-analysis`));
  });
  const request = () => ({
    subject_id: subjectId, max_questions: count, include_ai_generated: includeAI,
    ...(maxMarks ? { max_total_marks: Number(maxMarks) } : {}),
  });
  const ready = studentId && subjectId && count >= 1;

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <Section title="Student and settings" subtitle="Questions are chosen from the school question bank, targeting the student's weakest competencies.">
      <Messages error={error} notice={notice} />
      {classes.length === 0 ? <Empty>No classes are visible in school {currentSchoolId}.</Empty> : <>
        <label className="block"><span className={labelClass}>Class</span>
          <select aria-label="Class" className={inputClass} value={classId} disabled={busy} onChange={e => chooseClass(e.target.value)}>
            <option value="">Choose a class</option>
            {sortedClasses.map(c => <option key={c.id} value={c.id}>
              {c.name} ({c.student_count} {c.student_count === 1 ? 'student' : 'students'}){c.class_teacher_id === currentUser?.id ? ' - your class' : ''}</option>)}
          </select></label>
        <label className="block"><span className={labelClass}>Student</span>
          <select aria-label="Student" className={inputClass} value={studentId} disabled={busy || !classId || students.length === 0} onChange={e => chooseStudent(e.target.value)}>
            <option value="">{!classId ? 'Choose a class first' : rosterLoaded && students.length === 0 ? 'No students enrolled' : 'Choose a student'}</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.roll_no}. {s.name}</option>)}
          </select></label>
        {classId && rosterLoaded && students.length === 0 &&
          <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">No students are enrolled in {selectedClass?.name}. Choose another class.</p>}
        <label className="block"><span className={labelClass}>Subject</span>
          <select aria-label="Subject" className={inputClass} value={subjectId} disabled={busy || !selectedClass}
            onChange={e => { setSubjectId(e.target.value); setPreview(null); }}>
            {(selectedClass?.subject_ids_json ?? []).map((id: string) => <option key={id} value={id}>{id}</option>)}
          </select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={labelClass}>Number of questions</span>
            <input aria-label="Question count" type="number" min={1} max={50} className={inputClass} value={count} disabled={busy}
              onChange={e => { setCount(Number(e.target.value)); setPreview(null); }} /></label>
          <label className="block"><span className={labelClass}>Max total marks (optional)</span>
            <input aria-label="Max total marks" type="number" min={1} className={inputClass} value={maxMarks} disabled={busy}
              onChange={e => { setMaxMarks(e.target.value); setPreview(null); }} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeAI} disabled={busy}
          onChange={e => { setIncludeAI(e.target.checked); setPreview(null); }} />Include AI-generated questions already approved into the bank</label>
        <Button variant="teal" disabled={busy || !ready} onClick={() => run(async () => {
          setPreview(await hw.call(`/students/${enc(studentId)}/homework/preview`, 'POST', request()));
        })}>Preview homework</Button>
      </>}
      {gap && <GapPanel gap={gap} />}
    </Section>

    <Section title="Homework preview" subtitle="Selects EXISTING questions from the school question bank for this student (no AI generation). Nothing is saved until you save the draft.">
      {!preview ? <Empty>Choose a student and subject, then preview.</Empty> : <>
        <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-800">{preview.rationale.summary}</p>
        <p className="text-sm text-content-secondary">{preview.question_count} questions, {preview.total_marks} marks
          {preview.shortfall > 0 && <span className="text-amber-700"> - {preview.shortfall} fewer than requested (not enough matching bank questions)</span>}</p>
        {preview.items.length === 0 ? <Empty>The question bank has no matching questions for {subjectId} in this school. Add questions in the Question bank tab or choose another subject.</Empty>
          : <QuestionTable items={preview.items} />}
        {preview.notes?.length > 0 && <details className="text-xs text-content-secondary"><summary>Selection notes</summary>
          <ul className="ml-4 list-disc">{preview.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></details>}
        <Button variant="primary" disabled={busy || preview.items.length === 0} onClick={() => run(async () => {
          const saved = await hw.call(`/students/${enc(studentId)}/homework/drafts`, 'POST',
            { ...request(), expected_question_ids: preview.items.map((q: any) => q.question_id) });
          setPreview(null); onSaved(saved.id);
        })}>Save draft for review</Button>
      </>}
    </Section>
  </div>;
}

function GapPanel({ gap }: { gap: any }) {
  return <div className="rounded-lg border border-surface-border p-3">
    <h3 className="text-sm font-semibold">Competency gap analysis</h3>
    <p className="text-xs text-content-secondary">Lowest score first. Source: {gap.source}</p>
    <ul className="mt-2 space-y-1.5">
      {gap.ranked.map((g: any) => <li key={g.competency} className="text-sm">
        <div className="flex items-center justify-between gap-2">
          <span><CompetencyTag code={g.competency} /> {COMPETENCY_NAMES[g.competency]}
            {gap.weakest.includes(g.competency) && <span className="ml-1 text-xs font-semibold text-rose-700">weakest</span>}</span>
          <span className="tabular-nums">{g.score}{g.change_from_baseline != null &&
            <span className="ml-1 text-xs text-content-secondary">({g.change_from_baseline >= 0 ? '+' : ''}{g.change_from_baseline} vs baseline)</span>}</span>
        </div>
        <div className="mt-0.5 h-1.5 rounded bg-gray-100"><div className="h-1.5 rounded bg-teal-500" style={{ width: `${Math.max(0, Math.min(100, g.score))}%` }} /></div>
      </li>)}
    </ul>
    {gap.notes?.length > 0 && <ul className="mt-2 ml-4 list-disc text-xs text-content-secondary">{gap.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>}
  </div>;
}

function QuestionTable({ items, onRemove, disabled }: { items: any[]; onRemove?: (position: number) => void; disabled?: boolean }) {
  return <ol className="space-y-2">
    {items.map(q => <li key={q.position} className="rounded-lg border border-surface-border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm"><span className="font-semibold">{q.position}.</span> {q.text}</p>
        {onRemove && <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(q.position)}>Remove</Button>}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
        <CompetencyTag code={q.competency} /> <span>Bloom: {q.bloom_level}</span> <span>{q.type}</span> <span>{q.marks} marks</span>
        {q.is_ai_generated && <span className="text-amber-700">AI-generated</span>}
      </p>
      {q.options?.length > 0 && <ul className="mt-1 ml-5 list-[upper-alpha] text-xs">{q.options.map((o: any, i: number) => <li key={i}>{String(o)}</li>)}</ul>}
    </li>)}
  </ol>;
}

// --- 2. Drafts: review, edit (remove items), approve / reject / reopen, assign -------------

function Drafts({ openId, setOpenId, onAssigned }: { openId: string; setOpenId: (id: string) => void; onAssigned: (id: string) => void }) {
  const { busy, error, notice, run } = useRunner();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<any>(null);
  const [note, setNote] = useState(''); const [due, setDue] = useState('');

  const refresh = async () => setDrafts(await hw.call<any[]>('/homework/drafts' + (filter ? `?status=${filter}` : '')));
  useEffect(() => { run(refresh); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openId) run(async () => setDraft(await hw.call(`/homework/drafts/${enc(openId)}`))); else setDraft(null); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (path: string, method = 'POST', body?: unknown, message?: string) => run(async () => {
    setDraft(await hw.call(`/homework/drafts/${enc(draft.id)}${path}`, method, body)); setNote(''); await refresh(); return message;
  });

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <Section title="Homework drafts" action={<select aria-label="Draft status filter" className="rounded border px-2 py-1 text-sm" value={filter} onChange={e => setFilter(e.target.value)}>
      <option value="">All statuses</option>{['draft', 'approved', 'rejected', 'assigned'].map(s => <option key={s} value={s}>{s}</option>)}</select>}>
      {drafts.length === 0 ? <Empty>No drafts yet. Create one in step 1.</Empty> :
        <ul className="divide-y divide-surface-border">{drafts.map(d => <li key={d.id}>
          <button className={'w-full px-2 py-2.5 text-left hover:bg-gray-50 ' + (d.id === openId ? 'bg-teal-50' : '')} onClick={() => setOpenId(d.id)}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{d.student_id} - {d.subject_id}</span><StatusBadge status={d.status} /></div>
            <p className="text-xs text-content-secondary">{d.question_count} questions, {d.total_marks} marks - updated {formatDate(d.updated_at)}</p>
          </button></li>)}</ul>}
    </Section>

    <Section title={draft ? <span className="flex items-center gap-2">Review draft <StatusBadge status={draft.status} /></span> : 'Review draft'}
      subtitle={draft ? `Student ${draft.student_id} - ${draft.subject_id} - ${draft.question_count} questions, ${draft.total_marks} marks` : undefined}>
      <Messages error={error} notice={notice} />
      {!draft ? <Empty>Select a draft to review it.</Empty> : <>
        <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-800">{draft.rationale.summary}</p>
        {draft.review_note && <p className="text-sm">Review note: <em>{draft.review_note}</em></p>}
        <QuestionTable items={draft.items} disabled={busy}
          onRemove={draft.status === 'draft' && draft.items.length > 1 ? position => {
            if (window.confirm(`Remove question ${position} from this draft?`)) act(`/items/${position}`, 'DELETE', undefined, `Question ${position} removed.`);
          } : undefined} />
        {(draft.status === 'draft') && <div className="space-y-2 border-t border-surface-border pt-3">
          <label className="block"><span className={labelClass}>Review note (optional)</span>
            <textarea aria-label="Review note" className={inputClass} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button variant="teal" disabled={busy} onClick={() => act('/approve', 'POST', note ? { note } : undefined, 'Draft approved. You can now assign it.')}>Approve</Button>
            <Button variant="outline" disabled={busy} onClick={() => act('/reject', 'POST', note ? { note } : undefined, 'Draft rejected.')}>Reject</Button>
          </div></div>}
        {draft.status === 'rejected' && <Button variant="outline" disabled={busy} onClick={() => act('/reopen', 'POST', undefined, 'Draft reopened for editing.')}>Reopen for editing</Button>}
        {draft.status === 'approved' && <div className="space-y-2 border-t border-surface-border pt-3">
          <label className="block"><span className={labelClass}>Due date (optional, must be in the future)</span>
            <input aria-label="Due date" type="datetime-local" className={inputClass} value={due} onChange={e => setDue(e.target.value)} /></label>
          <Button variant="primary" disabled={busy} onClick={() => run(async () => {
            const body = due ? { due_at: new Date(due).toISOString() } : undefined;
            const assignment = await hw.call(`/homework/drafts/${enc(draft.id)}/assign`, 'POST', body);
            setDue(''); await refresh(); onAssigned(assignment.id);
          })}>Assign to student</Button></div>}
        {draft.status === 'assigned' && <p className="text-sm text-content-secondary">This draft has been assigned. See step 3 for submissions.</p>}
      </>}
    </Section>
  </div>;
}

// --- 3. Assignments: submission overview, answers, manual evaluation, release --------------

function Assignments({ openId, setOpenId }: { openId: string; setOpenId: (id: string) => void }) {
  const { busy, error, run } = useRunner();
  const [assignments, setAssignments] = useState<any[]>([]);
  const refresh = async () => setAssignments(await hw.call<any[]>('/homework/assignments'));
  useEffect(() => { run(refresh); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = assignments.find(a => a.id === openId);

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <Section title="Assigned homework" action={<Button size="sm" variant="outline" disabled={busy} onClick={() => run(refresh)}>Refresh</Button>}>
      <Messages error={error} />
      {assignments.length === 0 ? <Empty>No homework has been assigned yet.</Empty> :
        <ul className="divide-y divide-surface-border">{assignments.map(a => <li key={a.id}>
          <button className={'w-full px-2 py-2.5 text-left hover:bg-gray-50 ' + (a.id === openId ? 'bg-teal-50' : '')} onClick={() => setOpenId(a.id)}>
            <p className="text-sm font-medium">{a.student_id} - {a.subject_id}</p>
            <p className="text-xs text-content-secondary">{a.question_count} questions, {a.total_marks} marks - due {formatDate(a.due_at)}</p>
          </button></li>)}</ul>}
    </Section>
    {selected ? <AssignmentDetail key={selected.id} assignment={selected} /> :
      <Section title="Submission and marking"><Empty>Select an assignment.</Empty></Section>}
  </div>;
}

function AssignmentDetail({ assignment }: { assignment: any }) {
  const { busy, error, notice, run } = useRunner();
  const [overview, setOverview] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const base = `/homework/assignments/${enc(assignment.id)}`;
  const load = async () => {
    const o = await hw.call(`${base}/submissions`); setOverview(o);
    const row = o.students[0];
    if (row && row.status !== 'not_started') setSubmission(await hw.call(`${base}/submissions/${enc(row.student_id)}`));
    if (row?.status === 'submitted') {
      try { setEvaluation(await hw.call(`${base}/evaluation`)); } catch { setEvaluation(null); }
    }
  };
  useEffect(() => { run(load); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const row = overview?.students?.[0];

  return <Section title={`${row?.student_name ?? assignment.student_id} - ${overview?.subject_name ?? assignment.subject_id}`}
    subtitle={<>Assignment ID <code className="select-all">{assignment.id}</code> - due {formatDate(assignment.due_at)}</>}
    action={<Button size="sm" variant="outline" disabled={busy} onClick={() => run(load)}>Reload</Button>}>
    <Messages error={error} notice={notice} />
    {row && <div className="flex flex-wrap items-center gap-3 text-sm">
      <StatusBadge status={row.status} /> <span>{row.answered_count} / {row.question_count} answered</span>
      {row.submitted_at && <span>Submitted {formatDate(row.submitted_at)}</span>}
      {row.is_late && <span className="font-semibold text-amber-700">Late</span>}
    </div>}
    {row?.status !== 'submitted' && <Empty>Marking opens after the student submits. {submission ? 'Their saved progress is shown below.' : ''}</Empty>}
    {submission && !evaluation && <ol className="space-y-2">{submission.questions.map((q: any) => <li key={q.position} className="rounded-lg border border-surface-border p-3 text-sm">
      <p className="font-medium">{q.position}. {q.text}</p><p className="mt-1 text-content-secondary">Answer: {answerText(q)}</p></li>)}</ol>}
    {row?.status === 'submitted' && !evaluation &&
      <Button variant="teal" disabled={busy} onClick={() => run(async () => setEvaluation(await hw.call(`${base}/evaluation`, 'POST')))}>Start marking</Button>}
    {evaluation && <Evaluation assignmentId={assignment.id} base={base} evaluation={evaluation} setEvaluation={setEvaluation} />}
  </Section>;
}

type SuggestionDecision = 'accepted' | 'rejected' | null;

function suggestionMap(payload: any | null): Record<number, any> {
  if (!payload?.items) return {};
  return Object.fromEntries(payload.items.map((item: any) => [item.position, item]));
}

function Evaluation({
  assignmentId, base, evaluation, setEvaluation,
}: {
  assignmentId: string; base: string; evaluation: any; setEvaluation: (e: any) => void;
}) {
  const { busy, error, notice, run, setError, setNotice } = useRunner();
  const fromEvaluation = (e: any) => ({
    marks: Object.fromEntries(e.items.map((q: any) => [q.position, q.awarded_marks == null ? '' : String(q.awarded_marks)])) as Record<number, string>,
    feedback: Object.fromEntries(e.items.map((q: any) => [q.position, q.feedback ?? ''])) as Record<number, string>,
  });
  const [form, setForm] = useState(() => fromEvaluation(evaluation));
  const [suggestions, setSuggestions] = useState<Record<number, any>>({});
  const [decisions, setDecisions] = useState<Record<number, SuggestionDecision>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNotice, setAiNotice] = useState('');
  const update = (e: any) => { setEvaluation(e); setForm(fromEvaluation(e)); };
  const editable = evaluation.status === 'pending';
  const runningTotal = useMemo(() => Object.values(form.marks).reduce((sum, v) => sum + (v === '' ? 0 : Number(v) || 0), 0), [form]);
  const dirty = evaluation.items.some((q: any) => (form.marks[q.position] ?? '') !== (q.awarded_marks == null ? '' : String(q.awarded_marks))
    || (form.feedback[q.position] ?? '') !== (q.feedback ?? ''));
  const hasSuggestions = Object.keys(suggestions).length > 0;
  const attentionCount = Object.values(suggestions).filter((s: any) => s.needs_teacher_attention || s.confidence === 'low').length;

  useEffect(() => {
    if (!editable) return;
    let active = true;
    hw.aiSuggestions(assignmentId).then(payload => {
      if (!active) return;
      setSuggestions(suggestionMap(payload));
      setDecisions({});
    }).catch(() => { /* no stored suggestions yet — manual marking still works */ });
    return () => { active = false; };
  }, [assignmentId, editable, evaluation.id]);

  const setMarkField = (position: number, marks: string, feedback: string) => {
    setForm(prev => ({
      marks: { ...prev.marks, [position]: marks },
      feedback: { ...prev.feedback, [position]: feedback },
    }));
  };

  const acceptSuggestion = (position: number) => {
    const suggestion = suggestions[position];
    if (!suggestion) return;
    setMarkField(position, String(suggestion.suggested_marks), suggestion.feedback ?? '');
    setDecisions(prev => ({ ...prev, [position]: 'accepted' }));
    setAiNotice(`Accepted AI suggestion for question ${position}. Review and save when ready.`);
    setAiError('');
  };

  const rejectSuggestion = (position: number) => {
    setDecisions(prev => ({ ...prev, [position]: 'rejected' }));
    setAiNotice(`Rejected AI suggestion for question ${position}. Enter marks manually.`);
    setAiError('');
  };

  const runAi = async (mode: 'generate' | 'rerun') => {
    setAiBusy(true); setAiError(''); setAiNotice('');
    try {
      const payload = mode === 'rerun'
        ? await hw.rerunAiSuggestions(assignmentId)
        : await hw.generateAiSuggestions(assignmentId, hasSuggestions ? { replace: true } : {});
      setSuggestions(suggestionMap(payload));
      setDecisions({});
      setAiNotice(mode === 'rerun'
        ? 'AI suggestions regenerated. Accept, edit or reject each one before saving.'
        : 'AI suggestions ready. They are not saved marks until you accept and save.');
    } catch (ex) {
      setAiError(errorText(ex));
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    const items = evaluation.items.map((q: any) => {
      const raw = form.marks[q.position] ?? '';
      if (raw !== '' && (!Number.isInteger(Number(raw)) || Number(raw) < 0 || Number(raw) > q.max_marks))
        throw new Error(`Question ${q.position}: marks must be a whole number from 0 to ${q.max_marks}.`);
      return { position: q.position, feedback: form.feedback[q.position] ?? '', ...(raw === '' ? {} : { awarded_marks: Number(raw) }) };
    });
    const saved = await hw.call(`${base}/evaluation/items`, 'PATCH', { expected_version: evaluation.version, items });
    update(saved); return saved;
  };

  return <div className="space-y-3 border-t border-surface-border pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold">Evaluation <StatusBadge status={evaluation.status} /></h3>
      <p className="text-sm">{evaluation.marked_count} / {evaluation.question_count} marked - {evaluation.total_awarded ?? runningTotal} / {evaluation.total_max} marks</p>
    </div>

    {editable && <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-sky-950">AI-assisted suggestions</p>
          <p className="text-xs text-sky-900/80">Optional. Suggestions never finalize or release results. You keep full control of marks and feedback.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasSuggestions && <Button variant="teal" size="sm" loading={aiBusy} disabled={busy || aiBusy}
            onClick={() => runAi('generate')}>Evaluate with AI</Button>}
          {hasSuggestions && <Button variant="outline" size="sm" loading={aiBusy} disabled={busy || aiBusy}
            onClick={() => runAi('rerun')}>Regenerate suggestions</Button>}
        </div>
      </div>
      {aiBusy && <p role="status" className="text-sm text-sky-900">Evaluating answers against keys and rubrics…</p>}
      {hasSuggestions && !aiBusy && <p className="text-xs text-content-secondary">
        {Object.keys(suggestions).length} suggestion{Object.keys(suggestions).length === 1 ? '' : 's'} loaded
        {attentionCount > 0 ? ` · ${attentionCount} need teacher attention` : ''}.
        Purple panels are AI proposals; the mark fields below are your working marks.
      </p>}
      <Messages error={aiError} notice={aiNotice} />
    </div>}

    <Messages error={error} notice={notice} />
    {evaluation.items.map((q: any) => {
      const suggestion = suggestions[q.position];
      const decision = decisions[q.position] ?? null;
      const showSuggestion = Boolean(suggestion) && decision !== 'rejected';
      const uncertain = Boolean(suggestion?.needs_teacher_attention || suggestion?.confidence === 'low');
      const formMatchesSuggestion = suggestion
        && (form.marks[q.position] ?? '') === String(suggestion.suggested_marks)
        && (form.feedback[q.position] ?? '') === (suggestion.feedback ?? '');
      const editedAfterAccept = decision === 'accepted' && suggestion && !formMatchesSuggestion;

      return <article key={q.position}
        className={'rounded-lg border p-3 ' + (uncertain && showSuggestion ? 'border-amber-300 bg-amber-50/30' : 'border-surface-border')}>
        <p className="text-sm font-medium">{q.position}. {q.text} <span className="text-content-secondary">({q.max_marks} marks)</span></p>
        <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-sm">Student answer: {answerText(q)}</p>
        <div className="mt-1 grid gap-1 text-xs text-content-secondary sm:grid-cols-2">
          <p>Answer key (teacher only): {q.correct_answer ?? 'Unavailable'}</p>
          <p>Rubric (teacher only): {q.marking_rubric ?? 'Unavailable'}</p>
        </div>

        {showSuggestion && <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/70 p-3 space-y-2" data-testid={`ai-suggestion-${q.position}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" size="sm">AI suggestion</Badge>
            <span title="Heuristic certainty label from the model or scorer — not a calibrated probability">
              <Badge variant={suggestion.confidence === 'high' ? 'success' : suggestion.confidence === 'low' ? 'warning' : 'default'} size="sm">
                Certainty (heuristic): {suggestion.confidence}
              </Badge>
            </span>
            {suggestion.needs_teacher_attention && <Badge variant="warning" size="sm">Needs attention</Badge>}
            <Badge variant="outline" size="sm">{
              suggestion.source === 'deterministic_mcq' ? 'Answer-key match'
                : suggestion.source === 'teacher_required' ? 'Teacher review required'
                  : 'Gemini'}</Badge>
            {decision === 'accepted' && !editedAfterAccept && <Badge variant="teal" size="sm">Accepted into form</Badge>}
            {editedAfterAccept && <Badge variant="warning" size="sm">Edited after accept</Badge>}
          </div>
          <p className="text-sm"><span className="font-medium">Suggested marks:</span> {suggestion.suggested_marks} / {suggestion.max_marks}
            {' · '}<span className="font-medium">Assessment:</span> {String(suggestion.correctness).replace(/_/g, ' ')}</p>
          <p className="text-xs text-content-secondary"><span className="font-medium text-content-primary">Why (teacher only):</span> {suggestion.explanation}</p>
          <p className="text-xs"><span className="font-medium">Proposed student feedback:</span> {suggestion.feedback}</p>
          {Array.isArray(suggestion.rubric_criteria) && suggestion.rubric_criteria.length > 0 && (
            <ul className="text-xs text-content-secondary space-y-1 border-t border-violet-100 pt-2">
              {suggestion.rubric_criteria.map((c: any, idx: number) => (
                <li key={idx}><span className="font-medium text-content-primary">{c.criterion}</span>
                  {' — '}{c.awarded_marks}/{c.max_marks}{c.comment ? `: ${c.comment}` : ''}</li>
              ))}
            </ul>
          )}
          {editable && <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="teal" disabled={busy || aiBusy} onClick={() => acceptSuggestion(q.position)}>Accept suggestion</Button>
            <Button size="sm" variant="outline" disabled={busy || aiBusy} onClick={() => rejectSuggestion(q.position)}>Reject</Button>
          </div>}
        </div>}

        {decision === 'rejected' && editable && suggestion && (
          <p className="mt-2 text-xs text-content-secondary">AI suggestion rejected for this question.
            <button type="button" className="ml-1 text-teal-700 underline" onClick={() => setDecisions(prev => ({ ...prev, [q.position]: null }))}>Show again</button>
          </p>
        )}

        <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
          <label className="block"><span className={labelClass}>Your marks / {q.max_marks}</span>
            <input aria-label={`Marks for question ${q.position}`} className={inputClass} type="number" min={0} max={q.max_marks} step={1}
              value={form.marks[q.position] ?? ''} disabled={busy || !editable}
              onChange={e => {
                setForm({ ...form, marks: { ...form.marks, [q.position]: e.target.value } });
                if (decisions[q.position] === 'accepted') setDecisions(prev => ({ ...prev, [q.position]: 'accepted' }));
              }} /></label>
          <label className="block"><span className={labelClass}>Your feedback</span>
            <textarea aria-label={`Feedback for question ${q.position}`} className={inputClass} rows={2} maxLength={2000}
              value={form.feedback[q.position] ?? ''} disabled={busy || !editable}
              onChange={e => setForm({ ...form, feedback: { ...form.feedback, [q.position]: e.target.value } })} /></label>
        </div>
      </article>;
    })}
    <div className="flex flex-wrap gap-2">
      {editable && <>
        <Button variant="outline" disabled={busy || aiBusy || !dirty} onClick={() => run(async () => { await save(); return 'Marks and feedback saved.'; })}>Save marking</Button>
        <Button variant="primary" disabled={busy || aiBusy} onClick={() => run(async () => {
          setError(''); setNotice('');
          let current = evaluation; if (dirty) current = await save();
          if (current.marked_count < current.question_count) throw new Error('Mark every question (0 is allowed) before finalizing.');
          update(await hw.call(`${base}/evaluation/finalize`, 'POST', { expected_version: current.version }));
          return 'Marks finalized. Release them to share with the student and parent.';
        })}>Save and finalize</Button>
      </>}
      {evaluation.status === 'marked' && <Button variant="teal" disabled={busy} onClick={() => run(async () => {
        if (!window.confirm('Release these results to the student and their linked parents?')) return;
        update(await hw.call(`${base}/evaluation/release`, 'POST', { expected_version: evaluation.version }));
        return 'Results released.';
      })}>Release results</Button>}
    </div>
    {evaluation.status === 'released' && <p className="text-sm text-emerald-800">Released {formatDate(evaluation.released_at)}. The student and linked parents can now view this result.</p>}
  </div>;
}

// --- Question bank ----------------------------------------------------------------------

const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

function QuestionBank() {
  const { currentSchoolId } = useAuth();
  const { busy, error, notice, run } = useRunner();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [filters, setFilters] = useState({ competency: '', bloom: '', type: '', text: '' });
  const [selected, setSelected] = useState<any>(null);
  const [edit, setEdit] = useState<any>({});
  const [genBloom, setGenBloom] = useState('Apply');

  useEffect(() => { let active = true;
    hw.call<any[]>(`/schools/${enc(currentSchoolId)}/classes`).then(rows => {
      if (!active) return;
      const ids = Array.from(new Set(rows.flatMap(c => c.subject_ids_json ?? []))) as string[];
      setSubjects(ids); setSubject(s => s || ids[0] || '');
    }).catch(() => undefined);
    return () => { active = false; }; }, [currentSchoolId]);
  const reload = async () => setQuestions(await apiClient.assessments.getQuestionBank(subject || undefined));
  useEffect(() => { if (subject) run(reload); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = questions.filter(q => (!filters.competency || q.competency === filters.competency) && (!filters.bloom || q.bloomLevel === filters.bloom)
    && (!filters.type || q.type === filters.type) && (!filters.text || q.text.toLowerCase().includes(filters.text.toLowerCase())));
  const types = Array.from(new Set(questions.map(q => q.type)));
  const open = (q: any) => { setSelected(q); setEdit({ text: q.text, correctAnswer: q.correctAnswer ?? '', markingRubric: q.markingRubric ?? '',
    marks: q.marks, competency: q.competency, bloomLevel: q.bloomLevel }); };

  return <div className="space-y-5">
    <AiQuestionGenerator subjects={subjects} defaultSubject={subject} onSaved={async () => { await reload(); }} />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <Section title="Question bank" subtitle={`School ${currentSchoolId}. Answer keys and rubrics are visible to educators only.`}>
      <Messages error={error} notice={notice} />
      <div className="grid gap-2 sm:grid-cols-5">
        <select aria-label="Bank subject" className={inputClass} value={subject} onChange={e => { setSubject(e.target.value); setSelected(null); }}>
          {subjects.length === 0 && <option value="">No subjects</option>}{subjects.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select aria-label="Competency filter" className={inputClass} value={filters.competency} onChange={e => setFilters({ ...filters, competency: e.target.value })}>
          <option value="">All competencies</option>{Object.keys(COMPETENCY_NAMES).map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select aria-label="Bloom filter" className={inputClass} value={filters.bloom} onChange={e => setFilters({ ...filters, bloom: e.target.value })}>
          <option value="">All Bloom levels</option>{BLOOM.map(b => <option key={b}>{b}</option>)}</select>
        <select aria-label="Type filter" className={inputClass} value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>{types.map(t => <option key={t}>{t}</option>)}</select>
        <input aria-label="Search questions" placeholder="Search" className={inputClass} value={filters.text} onChange={e => setFilters({ ...filters, text: e.target.value })} />
      </div>
      <p className="text-xs text-content-secondary">{shown.length} of {questions.length} questions</p>
      {shown.length === 0 ? <Empty>No questions match.</Empty> :
        <ul className="divide-y divide-surface-border">{shown.map(q => <li key={q.id}>
          <button className={'w-full px-2 py-2 text-left hover:bg-gray-50 ' + (selected?.id === q.id ? 'bg-teal-50' : '')} onClick={() => open(q)}>
            <p className="text-sm">{q.text}</p>
            <p className="mt-1 flex flex-wrap gap-2 text-xs text-content-secondary"><CompetencyTag code={q.competency} /><span>{q.bloomLevel}</span><span>{q.type}</span><span>{q.marks} marks</span>
              {q.isAiGenerated && <span className="font-semibold text-amber-700">AI-generated</span>}</p>
          </button></li>)}</ul>}
      <div className="flex flex-wrap items-end gap-2 border-t border-surface-border pt-3">
        <label><span className={labelClass}>Bloom level for new question</span>
          <select aria-label="Generation Bloom level" className={inputClass} value={genBloom} onChange={e => setGenBloom(e.target.value)}>{BLOOM.map(b => <option key={b}>{b}</option>)}</select></label>
        <Button variant="outline" disabled={busy || !subject} onClick={() => run(async () => {
          await apiClient.assessments.generateQuestions({ subjectId: subject, sourceDocumentIds: [], mcqCount: 1, theoryCount: 0, bloomLevel: genBloom, saveToBank: true });
          await reload(); return 'Template question (no AI) added to the bank. Review and edit it before use.';
        })}>Add template question (no AI)</Button>
      </div>
    </Section>
    <Section title="Edit question">
      {!selected ? <Empty>Select a question to edit it.</Empty> : <>
        <label className="block"><span className={labelClass}>Question</span>
          <textarea aria-label="Question" rows={3} className={inputClass} value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} /></label>
        <div className="grid grid-cols-3 gap-2">
          <label><span className={labelClass}>Competency</span><select aria-label="Competency" className={inputClass} value={edit.competency}
            onChange={e => setEdit({ ...edit, competency: e.target.value })}>{Object.keys(COMPETENCY_NAMES).map(c => <option key={c}>{c}</option>)}</select></label>
          <label><span className={labelClass}>Bloom</span><select aria-label="Bloom level" className={inputClass} value={edit.bloomLevel}
            onChange={e => setEdit({ ...edit, bloomLevel: e.target.value })}>{BLOOM.map(b => <option key={b}>{b}</option>)}</select></label>
          <label><span className={labelClass}>Marks</span><input aria-label="Marks" type="number" min={1} className={inputClass} value={edit.marks}
            onChange={e => setEdit({ ...edit, marks: Number(e.target.value) })} /></label>
        </div>
        <label className="block"><span className={labelClass}>Correct answer</span>
          <textarea aria-label="Correct answer" className={inputClass} value={edit.correctAnswer} onChange={e => setEdit({ ...edit, correctAnswer: e.target.value })} /></label>
        <label className="block"><span className={labelClass}>Rubric</span>
          <textarea aria-label="Rubric" className={inputClass} value={edit.markingRubric} onChange={e => setEdit({ ...edit, markingRubric: e.target.value })} /></label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => run(async () => { await apiClient.assessments.updateQuestion(selected.id, edit); setSelected(null); await reload(); return 'Question saved.'; })}>Save edits</Button>
          <Button variant="outline" disabled={busy} onClick={() => run(async () => { const q = await apiClient.assessments.regenerateQuestion(selected.id, selected, edit.bloomLevel); await reload(); open(q); return 'Question regenerated from template.'; })}>Regenerate</Button>
          <Button variant="danger" disabled={busy} onClick={() => run(async () => { if (!window.confirm('Delete this bank question? Existing homework keeps its frozen copy.')) return;
            await apiClient.assessments.deleteQuestion(selected.id); setSelected(null); await reload(); return 'Question deleted.'; })}>Delete</Button>
        </div>
      </>}
    </Section>
    </div>
  </div>;
}
