import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cpu, Send, RefreshCw } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { GRADE_LABEL, PLANNING_GRADES, PLANNING_SUBJECTS, PlanningSubject, summarizeCalendar, validateConfig } from '../../lib/planning/calendar';
import { generateSchedule, requirementSnapshot } from '../../lib/planning/engine';
import { attachProposal, configChangedSinceApproval, createDraft, generateRecovery, pendingProposal, Plan, planLabel, recalculationBlocked } from '../../lib/planning/execution';
import { effectiveAsOf, PACE_LABEL, paceReport } from '../../lib/planning/pace';
import { planProgress } from '../../lib/planning/progress';
import { defaultDatasetFor, syllabusFor } from '../../lib/planning/syllabus';
import { usePlanning } from '../../lib/planning/usePlanning';
import { ClassBadge, ConflictList, CoverageTag, dateRange, inputCls, labelCls, LegacyRequirementNote, PageHeader, SectionCard, selectCls, Stat, StoreBanner, tdCls, thCls } from './planningUi';
import { SyllabusPanel } from './SyllabusPanel';
import { RelationshipsPanel } from './RelationshipsPanel';
import { DayTracker } from './DayTracker';
import { LostPeriodRecorder } from './LostPeriodRecorder';
import { TeacherLostDays } from '../../features/teacherPlan/TeacherLostDays';
import { PlanCapacitySummary } from '../../features/teacherPlan/PlanCapacitySummary';
import { invalidateRequirements, useStoreVersion } from '../../features/teacherPlan/requirementsStore';
import { useRemote } from '../../features/teacherPlan/useRemote';
import { teacherPlanApi } from '../../lib/teacherPlanApi';

type Tab = 'planner' | 'tracker' | 'requirements' | 'relationships';

const PlanStatusBadge: React.FC<{ plan: Plan }> = ({ plan }) => {
  const variant = { DRAFT: 'info', APPROVED: 'success', SUPERSEDED: 'default', REJECTED: 'danger' }[plan.status] as 'info' | 'success' | 'default' | 'danger';
  return (
    <Badge size="sm" variant={variant}>
      {plan.status === 'DRAFT' ? 'Draft — awaiting approval' : plan.status.toLowerCase()}
    </Badge>
  );
};

export const TimeAwareEngine: React.FC = () => {
  const p = usePlanning();
  const { workspace } = p;
  const [tab, setTab] = useState<Tab>('planner');
  const [grade, setGrade] = useState<number>(7);
  const [subject, setSubject] = useState<PlanningSubject>('Mathematics');
  // null = follow the default dataset for the chosen class and subject (the same one Course Curriculum shows).
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const dataset = defaultDatasetFor(p.datasets, grade, subject);
  const view = useMemo(() => syllabusFor(dataset, grade, subject), [dataset, grade, subject]);
  const configErrors = validateConfig(workspace.config);
  const calendar = configErrors.length ? null : summarizeCalendar(workspace.config);
  const referenceDate = effectiveAsOf(workspace);
  const calendarDay = calendar?.planningDates.filter((d) => d <= referenceDate).length ?? 0;
  const daysLeft = calendar?.planningDates.filter((d) => d > referenceDate).length ?? 0;
  const result = useMemo(
    () => (configErrors.length ? null : generateSchedule({ dataset, units: view.units, grade, subject, config: workspace.config, after: effectiveAsOf(workspace) }, p.ctx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, view.units, grade, subject, workspace.config, workspace.asOf, p.ctx, configErrors.length],
  );
  const plans = workspace.plans.filter((pl) => pl.grade === grade && pl.subject === subject);
  const approved = plans.find((pl) => pl.status === 'APPROVED');
  const pace = approved ? paceReport(approved, effectiveAsOf(workspace)) : null;
  const completion = approved ? planProgress(approved) : null;
const snapshotDiffers = !!approved && configChangedSinceApproval(approved, workspace.config);
  const approvedVersionNo = approved ? approved.versions[approved.versions.length - 1]?.version : undefined;
  const requirementGaps = pace?.topicsWithoutRequirement ?? result?.metrics.pending.units ?? 0;
  const canSubmit = !!result && !!view.units.length && !result.conflicts.some((c) => c.code === 'REQUIREMENT_MISSING' || c.code === 'PREREQUISITE_ORDER') && p.mode !== 'loading';

  const [, setSearch] = useSearchParams();
  const storeVersion = useStoreVersion();
  // A Principal/Admin has no plan of their own: the page needs a teacher context, exactly like Course Curriculum (?teacher=<id>).
  const teachersForCombo = useRemote(() => (p.isReviewer ? teacherPlanApi.planningOversight({ grade, subject }) : Promise.resolve({ rows: [] })), [p.isReviewer, grade, subject]);
  const comboTeachers = useMemo(() => (teachersForCombo.data?.rows ?? []).map((r) => ({ id: r.teacher_id, name: r.teacher_name })), [teachersForCombo.data]);
  useEffect(() => {
    if (!p.isReviewer || teachersForCombo.loading) return;
    if (!comboTeachers.some((t) => t.id === p.teacherId)) {
      setSearch(comboTeachers.length ? { teacher: comboTeachers[0].id } : {}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.isReviewer, teachersForCombo.loading, comboTeachers, p.teacherId]);
  const needsTeacher = p.isReviewer && !p.teacherId;
  const capacityPlan = useRemote(() => (p.teacherId ? teacherPlanApi.plan(p.teacherId, grade, subject) : Promise.resolve(null)), [p.teacherId, grade, subject, storeVersion]);
  // A teacher opening a class/subject for the first time gets their own persisted copy of the deterministic defaults (as Course Curriculum does).
  const initialised = useRef('');
  useEffect(() => {
    const key = `${p.teacherId}|${grade}|${subject}`;
    const covered = view.units.filter((u) => p.ctx.classifications[u.id]).length;
    if (p.ownsPlan && view.units.length > 0 && covered < view.units.length && initialised.current !== key) {
      initialised.current = key;
      teacherPlanApi.initialize(p.teacherId, grade, subject).then(() => invalidateRequirements()).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.ownsPlan, p.teacherId, grade, subject, view.units, p.ctx.classifications]);

  if (!['admin', 'principal', 'teacher'].includes(p.role)) return <PageHeader title="Time-Aware Engine" subtitle="Curriculum planning requires school staff access." />;

  const submitDraft = async () => {
    if (!result || !p.actor) return;
    setBusy(true);
    const draft = createDraft({
      grade,
      subject,
      datasetId: dataset.id,
      datasetLabel: dataset.label,
      datasetKind: dataset.kind,
      createdBy: p.actor,
      config: workspace.config,
      estimates: requirementSnapshot(result.lessons),
      draft: result,
    });
    const res = await p.commit('PLAN_DRAFT', `Draft schedule generated for ${planLabel(draft)} (${result.lessons.length} units)`, (w) => ({ ...w, plans: [draft, ...w.plans] }));
    setBusy(false);
    setMessage(res.ok ? `Draft saved for ${planLabel(draft)}. It does not replace any approved schedule until an Admin or Principal approves it in Curriculum Oversight.` : '');
  };

  const recalculate = async (plan: Plan) => {
    if (!p.actor) return;
    const locked = recalculationBlocked(plan, workspace.config);
    if (locked) {
      setMessage(locked);
      return;
    }
    const proposal = generateRecovery(plan, p.ctx, { trigger: { kind: 'CONFIG_CHANGE' }, config: workspace.config, actor: p.actor, asOf: effectiveAsOf(workspace) });
    if (!proposal) {
      setMessage('Recalculation produced no schedule changes.');
      return;
    }
    const res = await p.commit('RECOVERY_PROPOSE', `Recalculation proposed for ${planLabel(plan)} after configuration change`, (w) => ({
      ...w,
      plans: w.plans.map((x) => (x.id === plan.id ? attachProposal(x, proposal) : x)),
    }));
    if (res.ok) setMessage('Recalculation proposal created. Review it in Curriculum Oversight; the approved schedule is unchanged until then.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time-Aware Engine"
        subtitle="Plan the classroom periods still needed across the teaching days left. Scheduled periods count as taught only after classroom execution is recorded."
        badge={<Badge variant="teal" size="sm">Classes VI–VIII · Mathematics & Science</Badge>}
        actions={
          <>
            {p.isReviewer && (
              <Link className="text-xs font-semibold text-teal-700 underline" to={p.role === 'principal' ? '/principal/academic-config' : '/admin/academic-config'}>
                Academic Configuration
              </Link>
            )}
            <Link className="text-xs font-semibold text-teal-700 underline" to={p.isTeacher ? '/teacher/curriculum-180' : '/principal/curriculum'}>
              {p.isTeacher ? 'Daily Curriculum →' : 'Curriculum Oversight →'}
            </Link>
          </>
        }
      />
      <StoreBanner mode={p.mode} notice={p.notice} error={p.error} revision={p.revision} legacyPlans={p.legacyPlans} onDismiss={p.clearError} onRetry={p.reload} />

      <div className="bg-white p-4 rounded-xl border border-surface-border shadow-subtle flex flex-wrap items-end gap-4 text-xs">
        <label>
          <span className={labelCls}>Class</span>
          <select aria-label="Class" className={selectCls} value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {PLANNING_GRADES.map((g) => (
              <option key={g} value={g}>
                Class {GRADE_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Subject</span>
          <select aria-label="Subject" className={selectCls} value={subject} onChange={(e) => setSubject(e.target.value as PlanningSubject)}>
            {PLANNING_SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {p.isReviewer && (
          <label>
            <span className={labelCls}>Teacher</span>
            <select aria-label="Teacher" className={selectCls} value={p.teacherId} onChange={(e) => setSearch({ teacher: e.target.value })} disabled={!comboTeachers.length}>
              {!comboTeachers.length && <option value="">No teacher has a plan for this class and subject</option>}
              {comboTeachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-1 lg:ml-auto p-1 rounded-lg bg-surface-bg border border-surface-border" role="tablist" aria-label="Time-Aware Engine sections">
          {(
            [
              ['planner', 'Schedule planner'],
              ['tracker', 'Day tracker'],
              ['requirements', 'Requirements'],
              ['relationships', 'Relationships'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`px-3 py-1.5 rounded-md font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${tab === k ? 'bg-white text-navy-900 shadow-subtle' : 'text-content-secondary hover:text-content-primary'}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {needsTeacher && (
        <div className="bg-white p-4 rounded-xl border border-surface-border text-xs text-content-secondary" data-testid="select-teacher-notice">
          {teachersForCombo.loading ? 'Loading teachers…' : 'No teacher has a plan for this class and subject yet, so there are no requirements to show.'}
        </div>
      )}
      {capacityPlan.data && !needsTeacher && (
        <SectionCard title={`Current academic calendar${p.calendarVersion ? ` (version ${p.calendarVersion})` : ''}: capacity and remaining syllabus`} subtitle="Uses the school's current calendar. Persisted required, taught and remaining periods for this teacher's plan.">
          <PlanCapacitySummary plan={capacityPlan.data} />
        </SectionCard>
      )}

      {p.isTeacher && <TeacherLostDays grade={grade} subject={subject} calendarVersion={p.calendarVersion} />}

      {tab === 'requirements' && <SyllabusPanel dataset={dataset} grade={grade} subject={subject} />}
      {tab === 'relationships' && <RelationshipsPanel grade={grade} />}
      {tab === 'tracker' && <DayTracker grade={grade} subject={subject} />}

      {tab === 'planner' && !needsTeacher && (
        <>
          {configErrors.length > 0 ? (
            <SectionCard title="Academic Configuration is not valid">
              <ConflictList conflicts={configErrors.map((m) => ({ severity: 'error', code: 'CONFIG', message: m }))} />
              <p>Schedules cannot be generated until an Admin or Principal fixes the configuration.</p>
            </SectionCard>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="engine-metrics">
              <Stat label={pace ? `Approved schedule v${approvedVersionNo}: days left` : 'Teaching days left'} value={pace?.daysRemaining ?? daysLeft} hint={pace ? `Academic day ${pace.academicDay} of ${pace.academicDaysTotal} · calendar snapshot${snapshotDiffers ? ' (earlier than the current calendar)' : ''}` : `Academic day ${calendarDay} of ${calendar!.planningDates.length} · current calendar`} />
              <Stat label="Core periods" value={`${pace?.core.required ?? result!.metrics.core.requiredPeriods} ${pace ? 'approved' : 'configured'}`} hint={`${pace?.core.scheduled ?? result!.metrics.core.scheduledPeriods} scheduled · ${pace?.core.taught ?? 0} taught · ${pace?.core.remaining ?? result!.metrics.core.requiredPeriods} remaining${requirementGaps ? ` · ${requirementGaps} topic(s) missing counts` : ''}`} tone={requirementGaps ? 'rose' : 'teal'} />
              <Stat label="Non-Core periods" value={`${pace?.nonCore.required ?? result!.metrics.nonCore.requiredPeriods} ${pace ? 'approved' : 'configured'}`} hint={`${pace?.nonCore.scheduled ?? result!.metrics.nonCore.scheduledPeriods} scheduled · ${pace?.nonCore.taught ?? 0} taught · ${pace?.nonCore.remaining ?? result!.metrics.nonCore.requiredPeriods} remaining${requirementGaps ? ` · ${requirementGaps} topic(s) missing counts` : ''}`} tone={requirementGaps ? 'rose' : 'amber'} />
              <Stat label="Independent learning" value={`${pace?.nonCore.independent ?? result!.metrics.independentPeriods} periods`} hint="Never counted as classroom teaching" />
              <Stat label="Topics completed" value={`${completion?.unitsTaught ?? 0} / ${completion?.unitsTotal ?? view.units.length}`} hint={pace ? PACE_LABEL[pace.state] : 'No approved plan yet'} tone={pace?.state === 'BEHIND_CORE' || pace?.state === 'REQUIREMENTS_MISSING' ? 'rose' : 'teal'} />
              {snapshotDiffers && pace && approved && (
                <div className="col-span-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1" data-testid="calendar-snapshot-notice" role="status">
                  <p className="font-semibold">Two calendars are shown, on purpose.</p>
                  <p>
                    <b>Current academic calendar{p.calendarVersion ? ` (version ${p.calendarVersion})` : ''}:</b> {calendar!.planningDates.length} instructional days, {daysLeft} left. It drives the capacity card above and the recalculated requirements.{' '}
                    <b>Approved schedule v{approvedVersionNo}:</b> approved on an earlier calendar snapshot with {pace.academicDaysTotal} instructional days, {pace.daysRemaining} left. The schedule figures in this row are that historical snapshot until the schedule is recalculated and approved again.
                  </p>
                  {(() => {
                    const blocked = recalculationBlocked(approved, workspace.config);
                    return (
                      <p data-testid="calendar-snapshot-status">
                        Status:{' '}
                        <b>
                          {pendingProposal(approved)
                            ? 'Recalculation proposal is waiting for Principal/Admin approval.'
                            : blocked
                              ? 'School working days changed, so this approved schedule cannot be recalculated in place. A new schedule must be generated from the current calendar and approved by a Principal/Admin.'
                              : 'The approved schedule needs recalculation with the current calendar, then Principal/Admin approval.'}
                        </b>{' '}
                        Nothing changes the approved schedule until the new one is approved.
                        {p.isTeacher && !pendingProposal(approved) && (
                          blocked ? (
                            <Button size="sm" variant="outline" className="ml-2" icon={<RefreshCw className="w-3.5 h-3.5" />} disabled={busy || !canSubmit} onClick={submitDraft}>
                              Generate new draft from the current calendar
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="ml-2" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => recalculate(approved)}>
                              Recalculate with current calendar
                            </Button>
                          )
                        )}
                      </p>
                    );
                  })()}
                </div>
              )}
              {pace && <p className={`col-span-full rounded-lg border px-3 py-2 text-xs ${pace.state === 'BEHIND_CORE' || pace.state === 'REQUIREMENTS_MISSING' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-surface-border bg-white text-content-secondary'}`} data-testid="pace-status">{pace.headline}</p>}
            </div>
          )}

          <SectionCard title="Topic requirements" subtitle={`${view.units.length} teachable topic(s) for this subject`} action={<Cpu className="w-4 h-4 text-teal-600" />}>
            <p>Each topic uses its approved Core and Non-Core period counts. Missing requirements stay visible and are not scheduled. Actual teaching is recorded in Daily Curriculum.</p>
            {!view.units.length && <p className="text-rose-700 font-semibold">No teachable topics are available for Class {GRADE_LABEL[grade]} {subject}. View the Curriculum Catalogue or request curriculum data to be added there.</p>}
            {result && view.units.length > 0 && (
              <div className="overflow-x-auto border border-surface-border rounded-xl">
                <table className="w-full" aria-label="Generated schedule">
                  <thead>
                    <tr>
                      {['Topic', 'Classification', 'Required Core / Non-Core', 'Scheduled dates', 'Periods'].map((h) => (
                        <th key={h} className={thCls}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.lessons.map((l) => (
                      <tr key={l.nodeId}>
                        <td className={tdCls}>
                          <span className="font-semibold text-navy-900">
                            {l.number} {l.title}
                          </span>
                          <LegacyRequirementNote lesson={l} />
                          <CoverageTag nodeId={l.nodeId} grade={grade} subject={subject} />
                        </td>
                        <td className={tdCls}>
                          <ClassBadge value={l.classification} status={p.ctx.classifications[l.nodeId]?.status ?? 'PENDING'} />
                        </td>
                        <td className={`${tdCls} whitespace-nowrap`}>
                          {l.requirementStatus === 'MISSING' ? (
                            <span className="font-semibold text-rose-700">Not configured</span>
                          ) : (
                            <>
                              <b>{l.corePeriods}</b> Core / <b>{l.nonCorePeriods}</b> Non-Core
                              {l.requirementStatus === 'DEMO_DEFAULT' && <span className="block text-[11px] text-amber-700">Planning baseline; not reviewed</span>}
                            </>
                          )}
                        </td>
                        <td className={tdCls}>{dateRange(l)}</td>
                        <td className={tdCls}>
                          {l.slots.length} classroom / {l.independentPeriods} independent
                          {l.sharedReduction > 0 && <span className="block text-[11px] text-indigo-800">−{l.sharedReduction} shared</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result && <ConflictList conflicts={result.conflicts} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="teal" icon={<Send className="w-4 h-4" />} disabled={!canSubmit || busy} loading={busy} onClick={submitDraft}>
                Generate draft schedule for approval
              </Button>
              <span role="status" className="text-teal-800">
                {message}
              </span>
            </div>
          </SectionCard>

          <SectionCard title={`Plans for Class ${GRADE_LABEL[grade]} ${subject}`} subtitle="Every draft and approved plan is retained">
            {!plans.length && <p className="text-content-secondary">No plans yet for this class and subject.</p>}
            <ul className="space-y-2">
              {plans.map((pl) => (
                <li key={pl.id} className="p-3 rounded-lg border border-surface-border flex flex-wrap items-center gap-3">
                  <PlanStatusBadge plan={pl} />
                  <span>
                  Created {pl.createdAt.slice(0, 10)} by {pl.createdBy.name} · {pl.draft.lessons.length} topics
                    {pl.versions.length > 1 && ` · ${pl.versions.length - 1} approved revision(s)`}
                  </span>
                  {pendingProposal(pl) && <Badge size="sm" variant="warning">Proposal pending</Badge>}
                  {configChangedSinceApproval(pl, workspace.config) && (
                    <span className="flex items-center gap-2 text-amber-800">
                      Calendar changed since approval.
                      <Button size="sm" variant="outline" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => recalculate(pl)}>
                        Recalculate with current configuration
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {approved && <p className="text-[11px] text-content-muted">Current approved plan: first schedule {dateRange(approved.versions[0]?.lessons[0])} … Approvals and comparisons are in Curriculum Oversight.</p>}
          </SectionCard>
        </>
      )}

      <LostPeriodRecorder grade={grade} subject={subject} />
    </div>
  );
};
