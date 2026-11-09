import type {
  CandidateMapping,
  CatalogueDashboardData,
  ChapterExplorerData,
  CombinationDetail,
  DataSourceKind,
  GradeNumber,
  ReviewDecision,
  SubjectKey,
} from '../types';
import type { Role } from '../../../types';

/** Who is acting. The HTTP implementation relies on the bearer token instead; the backend is the authority. */
export interface CatalogueActor {
  name: string;
  role: Role;
}

export interface ReviewInput {
  decision: ReviewDecision;
  rationale: string;
}

/**
 * Single seam between curriculum UI and data. UI components never import fixtures
 * or call fetch directly — they go through this interface.
 */
export interface CurriculumCatalogueService {
  readonly kind: DataSourceKind;
  getDashboard(): Promise<CatalogueDashboardData>;
  getCombination(grade: GradeNumber, subject: SubjectKey): Promise<CombinationDetail>;
  getChapterExplorer(grade: GradeNumber, subject: SubjectKey): Promise<ChapterExplorerData>;
  listCandidateMappings(grade: GradeNumber, subject: SubjectKey): Promise<CandidateMapping[]>;
  submitReview(mappingId: string, input: ReviewInput): Promise<CandidateMapping>;
}

/**
 * Raised when the UI needs data that the backend API contract does not (yet) define.
 * Rendered as an explicit "contract pending" state rather than guessing an endpoint.
 */
export class ContractPendingError extends Error {
  constructor(public readonly capability: string, message: string) {
    super(message);
    this.name = 'ContractPendingError';
  }
}

export const MIN_RATIONALE_LENGTH = 10;

export function validateReviewInput(input: ReviewInput): string | null {
  if (!['APPROVE', 'REJECT', 'REQUEST_REVISION'].includes(input.decision)) {
    return 'Choose a review decision.';
  }
  if (input.rationale.trim().length < MIN_RATIONALE_LENGTH) {
    return `A decision rationale of at least ${MIN_RATIONALE_LENGTH} characters is required.`;
  }
  return null;
}
