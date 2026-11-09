import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookMarked, CheckCircle2, CircleDashed, FileQuestion, HelpCircle, Hourglass, Library, ShieldCheck, Eye } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../lib/permissions';
import { Button } from '../../../components/common/Button';
import { Card, CardBody, CardHeader } from '../../../components/common/Card';
import { useCatalogueMode, useCatalogueService } from '../api/CatalogueServiceContext';
import { ApiCatalogueDashboard } from './api/ApiCatalogueDashboard';
import { useAsync } from '../hooks/useAsync';
import { CombinationSelector } from '../components/CombinationSelector';
import { DataSourceBanner } from '../components/DataSourceBanner';
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from '../components/StateViews';
import { StatusLegend } from '../components/StatusBadge';
import { ROMAN, SUBJECT_LABEL, type CombinationSummary, type GradeNumber, type StatusCounts, type SubjectKey } from '../types';

const Tile: React.FC<{ label: string; value: React.ReactNode; hint: string; icon: React.ReactNode }> = ({ label, value, hint, icon }) => (
  <div className="bg-white rounded-xl border border-surface-border p-4 shadow-subtle">
    <div className="flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-content-secondary">{label}</p>
      <span className="text-content-muted" aria-hidden="true">
        {icon}
      </span>
    </div>
    <p className="text-2xl font-bold text-navy-900 mt-1.5 tabular-nums">{value}</p>
    <p className="text-[11px] text-content-muted mt-1 leading-snug">{hint}</p>
  </div>
);

/** Stacked bar with text labels underneath, so meaning never depends on colour alone. */
export const CountsBar: React.FC<{ counts: StatusCounts }> = ({ counts }) => {
  const parts = [
    { key: 'verified', n: counts.verified, cls: 'bg-emerald-500', label: 'verified' },
    { key: 'partial', n: counts.partiallyVerified, cls: 'bg-sky-400', label: 'partial' },
    { key: 'unverified', n: counts.unverified, cls: 'bg-gray-400', label: 'unverified' },
    { key: 'placeholder', n: counts.placeholder, cls: 'bg-[repeating-linear-gradient(45deg,#d1d5db_0,#d1d5db_3px,#fff_3px,#fff_6px)]', label: 'placeholder' },
  ];
  return (
    <div>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-surface-bg border border-surface-border" aria-hidden="true">
        {parts.map((p) => (p.n ? <div key={p.key} className={p.cls} style={{ width: `${(p.n / Math.max(counts.total, 1)) * 100}%` }} /> : null))}
      </div>
      <p className="text-[11px] text-content-secondary mt-1.5">
        {parts.map((p, i) => (
          <span key={p.key}>
            {i > 0 && ' · '}
            <strong className="text-content-primary tabular-nums">{p.n}</strong> {p.label}
          </span>
        ))}
      </p>
    </div>
  );
};

const CombinationCard: React.FC<{ c: CombinationSummary; selected: boolean }> = ({ c, selected }) => (
  <Link
    to={`/curriculum/catalogue/${c.grade}/${c.subject}`}
    data-testid={`combo-${c.grade}-${c.subject}`}
    className={
      'block rounded-xl border bg-white p-4 shadow-subtle transition hover:shadow-card hover:border-surface-borderHover focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ' +
      (selected ? 'border-teal-500 ring-1 ring-teal-500' : 'border-surface-border')
    }
  >
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-content-muted">Class {ROMAN[c.grade]}</p>
        <p className="font-semibold text-navy-900">{SUBJECT_LABEL[c.subject]}</p>
        <p className="text-[11px] text-content-secondary mt-0.5">
          Textbook: {c.textbookTitles.length ? c.textbookTitles.join(', ') : <em>not identified</em>}
        </p>
      </div>
      <ArrowRight className="w-4 h-4 text-content-muted shrink-0" aria-hidden="true" />
    </div>
    <div className="mt-3">
      <CountsBar counts={c.counts} />
    </div>
    <p className="text-[11px] mt-2 text-amber-800 flex items-center gap-1">
      <Hourglass className="w-3 h-3" aria-hidden="true" />
      {c.pendingReview} candidate mapping{c.pendingReview === 1 ? '' : 's'} awaiting review
    </p>
  </Link>
);

/** Screen 1. Mock mode renders the research snapshot; API mode renders the backend contract flow. */
export const CatalogueDashboard: React.FC = () =>
  useCatalogueMode() === 'api' ? <ApiCatalogueDashboard /> : <MockCatalogueDashboard />;

const MockCatalogueDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const service = useCatalogueService();
  const navigate = useNavigate();
  const [grade, setGrade] = useState<GradeNumber>(6);
  const [subject, setSubject] = useState<SubjectKey>('mathematics');
  const state = useAsync(() => service.getDashboard(), [service]);

  if (!currentUser || !hasPermission(currentUser.role, 'VIEW_CURRICULUM_CATALOGUE')) return <UnauthorizedState />;
  const canReview = hasPermission(currentUser.role, 'REVIEW_CURRICULUM_MAPPINGS');
  const selected = state.data?.combinations.find((c) => c.grade === grade && c.subject === subject);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-surface-border shadow-subtle flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 h-fit">
            <Library className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">Curriculum Catalogue</h1>
            <p className="text-xs text-content-secondary mt-0.5 max-w-2xl leading-relaxed">
              Check which official NCERT curriculum sources are verified, which are provisional and which are still missing,
              before they are used for planning. Each record links to its source evidence.
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-navy-800 bg-navy-50 border border-navy-100 rounded-full px-2.5 py-0.5">
              <BookMarked className="w-3 h-3" aria-hidden="true" /> Prototype scope: Classes VI–VIII · Mathematics and Science
            </p>
          </div>
        </div>
      </div>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={state.reload} />}

      {state.status === 'success' && (
        <>
          <DataSourceBanner meta={state.data.meta} />

          <Card>
            <CardBody className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <CombinationSelector
                grade={grade}
                subject={subject}
                onChange={(g, s) => {
                  setGrade(g);
                  setSubject(s);
                }}
              />
              <Button
                variant="teal"
                icon={<ArrowRight className="w-4 h-4" />}
                onClick={() => navigate(`/curriculum/catalogue/${grade}/${subject}`)}
              >
                Open Class {ROMAN[grade]} {SUBJECT_LABEL[subject]}
              </Button>
            </CardBody>
          </Card>

          {state.data.combinations.length === 0 ? (
            <EmptyState title="No catalogue data available yet">
              <p>
                The backend reports <strong>{state.data.meta.releaseStatus.replace(/_/g, ' ').toLowerCase()}</strong>. Resource
                counts appear here once a catalogue release is published.
              </p>
            </EmptyState>
          ) : (
            selected && (
              <section aria-labelledby="selected-summary">
                <h2 id="selected-summary" className="text-sm font-semibold text-navy-900 mb-3">
                  Class {ROMAN[grade]} {SUBJECT_LABEL[subject]}: summary
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <Tile label="Resources tracked" value={selected.counts.total} hint="Framework, syllabus, outcomes, textbook records" icon={<Library className="w-4 h-4" />} />
                  <Tile label="Verified" value={selected.counts.verified} hint="Checked against an official source" icon={<CheckCircle2 className="w-4 h-4" />} />
                  <Tile label="Partially verified" value={selected.counts.partiallyVerified} hint="Some attributes still open" icon={<CircleDashed className="w-4 h-4" />} />
                  <Tile label="Unverified" value={selected.counts.unverified} hint="Not yet source-checked" icon={<HelpCircle className="w-4 h-4" />} />
                  <Tile label="Placeholders" value={selected.counts.placeholder} hint="Expected but not found. No content shown" icon={<FileQuestion className="w-4 h-4" />} />
                  <Tile label="Pending review" value={selected.pendingReview} hint="AI-suggested mappings, none approved" icon={<Hourglass className="w-4 h-4" />} />
                </div>
              </section>
            )
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="lg:col-span-2">
              <CardHeader title="All class and subject combinations" subtitle="Select a combination to open its catalogue" />
              <CardBody>
                {state.data.combinations.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {state.data.combinations.map((c) => (
                      <CombinationCard key={c.combinationId} c={c} selected={c.grade === grade && c.subject === subject} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-content-muted italic">No combinations returned.</p>
                )}
              </CardBody>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title="Your permissions" />
                <CardBody className="text-xs space-y-2" >
                  <p className="flex items-center gap-2" data-testid="permission-status">
                    {canReview ? (
                      <ShieldCheck className="w-4 h-4 text-teal-600" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4 text-content-secondary" aria-hidden="true" />
                    )}
                    <span>
                      <strong className="capitalize">{currentUser.role}</strong>:{' '}
                      {canReview ? 'can view and review candidate mappings' : 'view only'}
                    </span>
                  </p>
                  <p className="text-content-muted leading-relaxed">
                    The screen only shows or hides the review buttons. The backend is responsible for enforcing who may record a decision.
                  </p>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Version" />
                <CardBody className="text-xs space-y-1.5">
                  <p>
                    <span className="text-content-muted">Snapshot:</span> {state.data.meta.snapshotLabel}
                  </p>
                  <p>
                    <span className="text-content-muted">Generated:</span>{' '}
                    {state.data.meta.generatedAt ? new Date(state.data.meta.generatedAt).toLocaleString() : 'n/a'}
                  </p>
                  <p>
                    <span className="text-content-muted">Sources last accessed:</span> {state.data.meta.researchAccessedOn ?? 'n/a'}
                  </p>
                  <p>
                    <span className="text-content-muted">Catalogue release:</span> {state.data.meta.releaseId ?? 'none published'}
                  </p>
                </CardBody>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader title="Status legend" subtitle="Every status has a text label and an icon, so colour is never the only signal" />
            <CardBody>
              <StatusLegend statuses={['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'PLACEHOLDER', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'BLOCKED']} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
};
