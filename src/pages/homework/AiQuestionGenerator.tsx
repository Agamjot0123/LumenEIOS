import React, { useState } from 'react';
import { apiClient } from '../../lib/apiClient';
import { Button } from '../../components/common/Button';
import { COMPETENCY_NAMES, CompetencyTag, Empty, Messages, Section, inputClass, labelClass, useRunner } from './ui';

const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const TYPES: [string, string][] = [['mcq', 'Multiple choice (MCQ)'], ['short', 'Short answer'], ['descriptive', 'Long answer']];
const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Gujarati', 'Punjabi'];

type Draft = { key: number; approved: boolean; q: any };
let nextKey = 1;

/** Gemini question generation: parameters -> preview -> edit -> approve & save. Nothing is saved
 * until the teacher clicks "Save approved". Saved questions are flagged AI-generated in the bank. */
export const AiQuestionGenerator: React.FC<{ subjects: string[]; defaultSubject: string; onSaved: () => Promise<void> }> =
  ({ subjects, defaultSubject, onSaved }) => {
  const { busy, error, notice, run } = useRunner();
  const [params, setParams] = useState({
    subject_id: defaultSubject, grade: 8, topic: '', competency: 'AU', bloom_level: 'Apply', question_type: 'mcq',
    marks: 2, count: 3, language: 'English', instructions: '',
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [meta, setMeta] = useState<any>(null);  // provenance summary of the last AI response
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const subject = params.subject_id || defaultSubject;
  const set = (patch: Partial<typeof params>) => setParams(p => ({ ...p, ...patch }));
  const body = (count = params.count, avoid: string[] = []) =>
    ({ ...params, subject_id: subject, count, instructions: params.instructions.trim() || undefined, avoid_texts: avoid });

  const generate = () => run(async () => {
    setDrafts([]); setMeta(null);  // never leave earlier results on screen if this request fails
    const res = await apiClient.assessments.aiGenerateQuestions(body());
    if (res.source !== 'ai_generated') throw new Error('Unexpected response: these are not AI-generated questions.');
    setDrafts(res.questions.map((q: any) => ({ key: nextKey++, approved: true, q })));
    setMeta(res);
    return `Gemini generated ${res.generated} new question(s)${res.generated < res.requested ? ` of ${res.requested} requested` : ''}. Review, edit and approve before saving.`;
  });
  const regenerateOne = (key: number) => { setRegenerating(key); run(async () => {
    try {
      // Questions still on screen are sent only for the server's duplicate check.
      const res = await apiClient.assessments.aiGenerateQuestions(body(1, drafts.map(d => d.q.text)));
      setDrafts(ds => ds.map(d => d.key === key ? { key: nextKey++, approved: true, q: res.questions[0] } : d));
      return 'Question regenerated with a new one from Gemini.';
    } finally { setRegenerating(null); }
  }); };
  const update = (key: number, patch: any) => setDrafts(ds => ds.map(d => d.key === key ? { ...d, q: { ...d.q, ...patch } } : d));
  const approved = drafts.filter(d => d.approved);

  return <Section title={<span>Generate questions with AI <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Gemini - teacher review required</span></span>}
    subtitle="Only the teaching parameters below are sent to the AI service - never student names, IDs or scores. Nothing is saved until you approve it.">
    <Messages error={error} notice={notice} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label><span className={labelClass}>Subject</span>
        <select aria-label="AI subject" className={inputClass} value={subject} disabled={busy} onChange={e => set({ subject_id: e.target.value })}>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label><span className={labelClass}>Class / grade</span>
        <input aria-label="AI grade" type="number" min={1} max={12} className={inputClass} value={params.grade} disabled={busy} onChange={e => set({ grade: Number(e.target.value) })} /></label>
      <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Topic or chapter</span>
        <input aria-label="AI topic" className={inputClass} placeholder="e.g. Mensuration - volume of cuboids" value={params.topic} disabled={busy} onChange={e => set({ topic: e.target.value })} /></label>
      <label><span className={labelClass}>Competency</span>
        <select aria-label="AI competency" className={inputClass} value={params.competency} disabled={busy} onChange={e => set({ competency: e.target.value })}>
          {Object.entries(COMPETENCY_NAMES).map(([c, n]) => <option key={c} value={c}>{c} - {n}</option>)}</select></label>
      <label><span className={labelClass}>Bloom level</span>
        <select aria-label="AI Bloom level" className={inputClass} value={params.bloom_level} disabled={busy} onChange={e => set({ bloom_level: e.target.value })}>
          {BLOOM.map(b => <option key={b}>{b}</option>)}</select></label>
      <label><span className={labelClass}>Question type</span>
        <select aria-label="AI question type" className={inputClass} value={params.question_type} disabled={busy} onChange={e => set({ question_type: e.target.value })}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label><span className={labelClass}>Marks per question</span>
        <input aria-label="AI marks" type="number" min={1} max={20} className={inputClass} value={params.marks} disabled={busy} onChange={e => set({ marks: Number(e.target.value) })} /></label>
      <label><span className={labelClass}>Number of questions (max 10)</span>
        <input aria-label="AI count" type="number" min={1} max={10} className={inputClass} value={params.count} disabled={busy} onChange={e => set({ count: Number(e.target.value) })} /></label>
      <label><span className={labelClass}>Language</span>
        <select aria-label="AI language" className={inputClass} value={params.language} disabled={busy} onChange={e => set({ language: e.target.value })}>
          {LANGUAGES.map(l => <option key={l}>{l}</option>)}</select></label>
      <label className="sm:col-span-2 lg:col-span-4"><span className={labelClass}>Teacher instructions (optional)</span>
        <input aria-label="AI instructions" className={inputClass} maxLength={1000} placeholder="e.g. Use Indian real-life contexts; avoid trigonometry" value={params.instructions}
          disabled={busy} onChange={e => set({ instructions: e.target.value })} /></label>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="teal" disabled={busy || !subject || params.topic.trim().length < 2} loading={busy && regenerating === null} onClick={generate}>
        {busy && regenerating === null ? 'Generating with Gemini...' : drafts.length ? 'Regenerate all' : 'Generate'}</Button>
      {busy && <span role="status" className="text-sm text-content-secondary">Waiting for the AI service - this can take up to a minute.</span>}
    </div>

    {meta && <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-content-secondary">
      <p data-testid="ai-provenance"><span className="font-semibold text-amber-800">New questions generated just now by {meta.provider} / {meta.model}</span>{' - '}
        {meta.generated} of {meta.requested} requested, from {meta.attempts} AI request(s). Checked against {meta.checked_against} existing
        {' '}{subject} bank question(s): none of the questions below are copies of them.
        {meta.discarded > 0 && ` Rejected: ${meta.rejected_duplicates} bank duplicate(s), ${meta.rejected_repeats} repeat(s), ${meta.rejected_invalid} invalid.`}</p>
      {meta.warnings.length > 0 && <ul className="ml-4 list-disc">{meta.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
    </div>}
    {meta && drafts.length === 0 && <Empty>All generated questions were rejected. Generate again to get new ones.</Empty>}
    <ol className="space-y-3">{drafts.map((d, index) => <li key={d.key}
      className={'rounded-lg border p-3 ' + (d.approved ? 'border-teal-400 bg-teal-50/30' : 'border-surface-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={d.approved}
          onChange={e => setDrafts(ds => ds.map(x => x.key === d.key ? { ...x, approved: e.target.checked } : x))} />
          Approve question {index + 1}</label>
        <span className="flex items-center gap-2 text-xs text-content-secondary"><CompetencyTag code={d.q.competency} />{d.q.bloom_level} - {d.q.question_type} -
          <span className="font-semibold text-amber-700">AI-generated</span></span>
        <span className="flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} loading={regenerating === d.key} onClick={() => regenerateOne(d.key)}>Regenerate</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDrafts(ds => ds.filter(x => x.key !== d.key))}>Reject</Button>
        </span>
      </div>
      <label className="mt-2 block"><span className={labelClass}>Question</span>
        <textarea aria-label={`AI question ${index + 1} text`} rows={2} className={inputClass} value={d.q.text} onChange={e => update(d.key, { text: e.target.value })} /></label>
      {d.q.question_type === 'mcq' && <div className="mt-2 grid gap-2 sm:grid-cols-2">{d.q.options.map((o: string, i: number) =>
        <label key={i} className="flex items-center gap-2 text-sm">
          <input type="radio" name={`ai-correct-${d.key}`} aria-label={`Option ${String.fromCharCode(65 + i)} is correct`} checked={d.q.correct_answer === o}
            onChange={() => update(d.key, { correct_answer: o })} />
          <span className="w-4 font-semibold">{String.fromCharCode(65 + i)}</span>
          <input aria-label={`AI question ${index + 1} option ${String.fromCharCode(65 + i)}`} className={inputClass} value={o} onChange={e => {
            const options = [...d.q.options]; options[i] = e.target.value;
            update(d.key, { options, ...(d.q.correct_answer === o ? { correct_answer: e.target.value } : {}) });
          }} /></label>)}
        <p className="text-xs text-content-secondary sm:col-span-2">Select the radio button of the correct option.</p></div>}
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_6rem]">
        {d.q.question_type !== 'mcq' && <label><span className={labelClass}>Correct answer</span>
          <textarea aria-label={`AI question ${index + 1} answer`} rows={2} className={inputClass} value={d.q.correct_answer} onChange={e => update(d.key, { correct_answer: e.target.value })} /></label>}
        <label className={d.q.question_type === 'mcq' ? 'sm:col-span-2' : ''}><span className={labelClass}>Marking rubric</span>
          <textarea aria-label={`AI question ${index + 1} rubric`} rows={2} className={inputClass} value={d.q.marking_rubric} onChange={e => update(d.key, { marking_rubric: e.target.value })} /></label>
        <label><span className={labelClass}>Marks</span>
          <input aria-label={`AI question ${index + 1} marks`} type="number" min={1} max={20} className={inputClass} value={d.q.marks} onChange={e => update(d.key, { marks: Number(e.target.value) })} /></label>
      </div>
      {d.q.explanation && <p className="mt-1 text-xs text-content-secondary">Explanation (saved with the rubric): {d.q.explanation}</p>}
    </li>)}</ol>
    {drafts.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
      <Button variant="primary" disabled={busy || approved.length === 0} onClick={() => run(async () => {
        const res = await apiClient.assessments.aiSaveQuestions(subject, approved.map(d => d.q), meta?.model);
        setDrafts(ds => ds.filter(d => !d.approved)); await onSaved();
        return `${res.saved_count} approved question(s) saved to the ${subject} question bank.`;
      })}>Save {approved.length} approved to question bank</Button>
      <span className="text-xs text-content-secondary">Unapproved questions stay here and are not saved.</span>
    </div>}
  </Section>;
};
