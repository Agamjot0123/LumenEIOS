import React from 'react';
import { AlertTriangle, FileQuestion, Loader2, PlugZap, ShieldAlert } from 'lucide-react';
import { ApiError } from '../../../lib/apiClient';
import { Button } from '../../../components/common/Button';
import { ContractPendingError } from '../api/catalogueService';
import { cn } from '../../../lib/utils';

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading curriculum catalogue…' }) => (
  <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-16 text-sm text-content-secondary">
    <Loader2 className="w-5 h-5 animate-spin text-teal-600" aria-hidden="true" />
    {label}
  </div>
);

const Panel: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  tone: 'neutral' | 'warning' | 'danger';
  action?: React.ReactNode;
  role?: string;
  testId?: string;
}> = ({ icon, title, children, tone, action, role, testId }) => (
  <div
    role={role}
    data-testid={testId}
    className={cn(
      'rounded-xl border p-5 flex flex-col sm:flex-row gap-4 items-start',
      tone === 'neutral' && 'bg-white border-dashed border-gray-300',
      tone === 'warning' && 'bg-amber-50/60 border-amber-200',
      tone === 'danger' && 'bg-rose-50/60 border-rose-200'
    )}
  >
    <div className="shrink-0 mt-0.5">{icon}</div>
    <div className="flex-1 text-sm">
      <p className="font-semibold text-content-primary">{title}</p>
      <div className="text-xs text-content-secondary mt-1 leading-relaxed space-y-1">{children}</div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const UnauthorizedState: React.FC<{ message?: string }> = ({ message }) => (
  <Panel
    tone="danger"
    role="alert"
    testId="state-unauthorized"
    icon={<ShieldAlert className="w-5 h-5 text-rose-600" aria-hidden="true" />}
    title="You do not have access to this area"
  >
    <p>{message ?? 'The curriculum catalogue is available to teachers, principals and administrators.'}</p>
    <p>Switch persona using the banner at the top of the page to continue the demonstration.</p>
  </Panel>
);

export const ContractPendingState: React.FC<{ error: ContractPendingError }> = ({ error }) => (
  <Panel
    tone="warning"
    testId="state-contract-pending"
    icon={<PlugZap className="w-5 h-5 text-amber-600" aria-hidden="true" />}
    title="Backend API not available yet for this view"
  >
    <p>{error.message}</p>
    <p>
      The frontend is running in <strong>API mode</strong>. This capability is waiting on the backend curriculum API
      contract. No data is shown, so nothing here is invented.
    </p>
  </Panel>
);

export const EmptyState: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Panel tone="neutral" testId="state-empty" icon={<FileQuestion className="w-5 h-5 text-gray-500" aria-hidden="true" />} title={title}>
    {children}
  </Panel>
);

export const ErrorState: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => {
  if (error instanceof ContractPendingError) return <ContractPendingState error={error} />;
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return <UnauthorizedState message={error.message} />;
  }
  const message =
    error instanceof ApiError && error.status === 0
      ? 'Could not reach the LumenEIOS backend. Check that the API server is running.'
      : error instanceof Error
      ? error.message
      : 'Unexpected error.';
  return (
    <Panel
      tone="danger"
      role="alert"
      testId="state-error"
      icon={<AlertTriangle className="w-5 h-5 text-rose-600" aria-hidden="true" />}
      title="The catalogue could not be loaded"
      action={
        onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      <p>{message}</p>
    </Panel>
  );
};

/** Inline notice for a missing / unverified value. Never substitutes content. */
export const MissingValue: React.FC<{ children?: React.ReactNode }> = ({ children = 'Not verified' }) => (
  <span className="italic text-content-muted">{children}</span>
);
