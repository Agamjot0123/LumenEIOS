import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import type { CatalogueActor, CurriculumCatalogueService } from './catalogueService';
import { createHttpCatalogueService } from './httpCatalogueService';

/** Mock fixtures are loaded via dynamic import so they live in a separate chunk, never in API mode. */
function createLazyMockService(getActor: () => CatalogueActor | null): CurriculumCatalogueService {
  let loaded: Promise<CurriculumCatalogueService> | null = null;
  const get = () =>
    (loaded ??= import('../mocks/mockCatalogueService').then((m) => m.createMockCatalogueService({ getActor })));
  return {
    kind: 'mock',
    getDashboard: () => get().then((s) => s.getDashboard()),
    getCombination: (g, s) => get().then((svc) => svc.getCombination(g, s)),
    getChapterExplorer: (g, s) => get().then((svc) => svc.getChapterExplorer(g, s)),
    listCandidateMappings: (g, s) => get().then((svc) => svc.listCandidateMappings(g, s)),
    submitReview: (id, input) => get().then((svc) => svc.submitReview(id, input)),
  };
}

/**
 * Data source selection. Defaults to 'mock' until the backend contract is implemented.
 * Set VITE_CURRICULUM_DATA_SOURCE=api to call the backend.
 */
export function configuredDataSource(): 'mock' | 'api' {
  const value = (import.meta as any).env?.VITE_CURRICULUM_DATA_SOURCE;
  return value === 'api' ? 'api' : 'mock';
}

const CatalogueServiceContext = createContext<CurriculumCatalogueService | null>(null);

export const CatalogueServiceProvider: React.FC<{
  children: React.ReactNode;
  /** Inject a service (tests). */
  service?: CurriculumCatalogueService;
}> = ({ children, service }) => {
  const { currentUser } = useAuth();
  const actorRef = useRef<CatalogueActor | null>(null);
  actorRef.current = currentUser ? { name: currentUser.name, role: currentUser.role } : null;

  const value = useMemo(() => {
    if (service) return service;
    return configuredDataSource() === 'api'
      ? createHttpCatalogueService()
      : createLazyMockService(() => actorRef.current);
  }, [service]);

  return <CatalogueServiceContext.Provider value={value}>{children}</CatalogueServiceContext.Provider>;
};

export function useCatalogueService(): CurriculumCatalogueService {
  const ctx = useContext(CatalogueServiceContext);
  if (!ctx) throw new Error('useCatalogueService must be used within CatalogueServiceProvider');
  return ctx;
}
