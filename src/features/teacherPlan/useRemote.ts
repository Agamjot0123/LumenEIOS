import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { describeError } from '../../lib/teacherPlanApi';

/** Loads backend data and reloads when the active school changes. Errors are surfaced, never swallowed. */
export function useRemote<T>(load: () => Promise<T>, deps: unknown[]) {
  const { currentSchoolId } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.resolve()
      .then(load)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(describeError(e).message);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSchoolId, ...deps]);
  useEffect(run, [run]);
  return { data, error, loading, reload: run };
}
