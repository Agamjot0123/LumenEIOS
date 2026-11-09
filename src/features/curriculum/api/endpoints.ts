/**
 * Curriculum catalogue endpoints, copied from the ONLY backend document that names them:
 * apps/lumeneios/docs/NCERT_DATABASE_INTEGRATION.md (contract v1, "New /api/v1/ncert ...").
 *
 * These are PROPOSED and NOT IMPLEMENTED in the backend at the time of writing.
 * The canonical contract (CURRICULUM_API_INTEGRATION_CONTRACT.md) is owned by Codex.
 * Do not add endpoints here that the backend contract does not define.
 */
export const NCERT_ENDPOINTS = {
  releases: '/ncert/releases',
  hierarchy: (releaseId: string) => `/ncert/releases/${encodeURIComponent(releaseId)}/hierarchy`,
  nodeOutcomes: (nodeId: string) => `/ncert/nodes/${encodeURIComponent(nodeId)}/outcomes`,
  nodeRelationships: (nodeId: string) => `/ncert/nodes/${encodeURIComponent(nodeId)}/relationships`,
  nodeCitations: (nodeId: string) => `/ncert/nodes/${encodeURIComponent(nodeId)}/citations`,
} as const;

/**
 * Capabilities the prototype UI needs that the documented contract does not yet define.
 * Each one surfaces as a "contract pending" state in API mode.
 */
export const PENDING_CAPABILITIES = {
  resourceAvailability:
    'Syllabus, learning-outcome, framework and textbook-edition availability per class/subject/language',
  chapterExplorer: 'Class/subject → subject node identity lookup for the hierarchy endpoint',
  candidateMappings: 'Listing AI-suggested topic→outcome candidates per class/subject (verified_only=false access)',
  reviewDecision: 'Recording a human review decision (approve / reject / request revision) with rationale',
} as const;
