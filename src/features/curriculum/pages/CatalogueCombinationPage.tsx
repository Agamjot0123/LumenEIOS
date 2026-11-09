import React, { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, LayoutList, ListTree, Scale } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../lib/permissions';
import { cn } from '../../../lib/utils';
import { CombinationSelector } from '../components/CombinationSelector';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { UnauthorizedState } from '../components/StateViews';
import { ROMAN, SUBJECT_LABEL, parseGrade, parseSubject, type EvidenceRecord } from '../types';
import { OverviewView } from './views/OverviewView';
import { ExplorerView } from './views/ExplorerView';
import { ReviewView } from './views/ReviewView';

export type OpenEvidence = (evidence: EvidenceRecord, heading?: string) => void;

const TABS = [
  { key: 'overview', label: 'Curriculum overview', Icon: LayoutList },
  { key: 'explorer', label: 'Chapters & topics', Icon: ListTree },
  { key: 'review', label: 'Mapping review', Icon: Scale },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export const CatalogueCombinationPage: React.FC = () => {
  const params = useParams();
  const grade = parseGrade(params.grade);
  const subject = parseSubject(params.subject);
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [evidence, setEvidence] = useState<{ record: EvidenceRecord; heading?: string } | null>(null);
  const openEvidence = useCallback<OpenEvidence>((record, heading) => setEvidence({ record, heading }), []);
  const closeEvidence = useCallback(() => setEvidence(null), []);

  if (!grade || !subject) return <Navigate to="/curriculum/catalogue" replace />;
  if (!currentUser || !hasPermission(currentUser.role, 'VIEW_CURRICULUM_CATALOGUE')) return <UnauthorizedState />;

  const tab: TabKey = (TABS.find((t) => t.key === search.get('view'))?.key ?? 'overview') as TabKey;

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-surface-border shadow-subtle space-y-4">
        <nav aria-label="Breadcrumb" className="text-xs text-content-secondary flex items-center gap-1">
          <Link to="/curriculum/catalogue" className="hover:text-teal-700 underline-offset-2 hover:underline">
            Curriculum Catalogue
          </Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span aria-current="page" className="text-content-primary font-medium">
            Class {ROMAN[grade]} · {SUBJECT_LABEL[subject]}
          </span>
        </nav>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-navy-900 tracking-tight">
              Class {ROMAN[grade]} {SUBJECT_LABEL[subject]}
            </h1>
            <p className="text-xs text-content-secondary mt-0.5">
              NCERT curriculum sources, textbook editions, explored topics and candidate outcome mappings
            </p>
          </div>
          <CombinationSelector
            grade={grade}
            subject={subject}
            onChange={(g, s) => navigate(`/curriculum/catalogue/${g}/${s}${tab !== 'overview' ? `?view=${tab}` : ''}`)}
          />
        </div>
        <div role="tablist" aria-label="Catalogue sections" className="flex gap-1 border-b border-surface-border -mb-5 overflow-x-auto">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              onClick={() => setSearch(key === 'overview' ? {} : { view: key })}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-t',
                tab === key ? 'border-teal-500 text-teal-800' : 'border-transparent text-content-secondary hover:text-content-primary'
              )}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-2">
        {tab === 'overview' && <OverviewView grade={grade} subject={subject} openEvidence={openEvidence} />}
        {tab === 'explorer' && <ExplorerView grade={grade} subject={subject} openEvidence={openEvidence} />}
        {tab === 'review' && (
          <ReviewView
            grade={grade}
            subject={subject}
            openEvidence={openEvidence}
            canReview={hasPermission(currentUser.role, 'REVIEW_CURRICULUM_MAPPINGS')}
            role={currentUser.role}
          />
        )}
      </div>

      <EvidenceDrawer evidence={evidence?.record ?? null} heading={evidence?.heading} onClose={closeEvidence} />
    </div>
  );
};
