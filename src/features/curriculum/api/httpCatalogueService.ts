import { apiRequest } from '../../../lib/apiClient';
import type { CatalogueDashboardData, CatalogueMeta } from '../types';
import { ContractPendingError, type CurriculumCatalogueService } from './catalogueService';
import { NCERT_ENDPOINTS, PENDING_CAPABILITIES } from './endpoints';

/** Shape of the documented empty response (NCERT_DATABASE_INTEGRATION.md, "Current empty JSON example"). */
interface ReleasesResponse {
  release_id?: string | null;
  items?: { id: string; release_key?: string; status?: string; published_at?: string | null }[];
  completeness?: string;
  reason?: string | null;
}

type Request = <T>(endpoint: string, options?: RequestInit) => Promise<T>;

/**
 * Backend-backed implementation. Calls only endpoints present in the documented contract;
 * every other capability raises ContractPendingError so the UI shows the true integration state.
 */
export function createHttpCatalogueService(request: Request = apiRequest): CurriculumCatalogueService {
  const pending = (capability: keyof typeof PENDING_CAPABILITIES) =>
    Promise.reject(
      new ContractPendingError(
        capability,
        `Not yet available from the backend API: ${PENDING_CAPABILITIES[capability]}.`
      )
    );

  return {
    kind: 'api',

    async getDashboard(): Promise<CatalogueDashboardData> {
      const res = await request<ReleasesResponse>(NCERT_ENDPOINTS.releases);
      const published = (res.items ?? []).filter((r) => r.status === 'PUBLISHED');
      const meta: CatalogueMeta = {
        dataSource: 'api',
        snapshotLabel: published.length ? `Release ${published[0].release_key ?? published[0].id}` : 'No published release',
        generatedAt: published[0]?.published_at ?? null,
        researchAccessedOn: null,
        releaseId: published[0]?.id ?? res.release_id ?? null,
        releaseStatus: published.length ? 'PUBLISHED' : res.reason ?? 'NO_PUBLISHED_RELEASE',
        scopeNote: 'Classes VI–VIII · Mathematics and Science',
      };
      // Per-combination availability is not in the contract; return no combinations rather than zeros.
      return { meta, combinations: [] };
    },

    getCombination: () => pending('resourceAvailability'),
    getChapterExplorer: () => pending('chapterExplorer'),
    listCandidateMappings: () => pending('candidateMappings'),
    submitReview: () => pending('reviewDecision'),
  };
}
