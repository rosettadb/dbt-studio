import { useEffect, useRef, useState } from 'react';
import { DuckLakeService } from '../services';

interface UseDuckLakeConnectionResult {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
}

/**
 * Custom hook to manage DuckLake connection lifecycle
 * Automatically acquires connection on mount and releases on unmount
 *
 * @param instanceId - The DuckLake instance ID to connect to (null/undefined to skip connection)
 * @returns Connection status information
 *
 * @example
 * const { isConnected, isConnecting, error } = useDuckLakeConnection(instanceId);
 */
const useDuckLakeConnection = (
  instanceId: string | null | undefined,
): UseDuckLakeConnectionResult => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const acquiredInstanceIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if no instanceId provided
    if (!instanceId) {
      setIsConnected(false);
      setIsConnecting(false);
      setError(null);
      return;
    }

    let isMounted = true;

    const acquireConnection = async () => {
      setIsConnecting(true);
      setError(null);

      try {
        await DuckLakeService.acquireConnection(instanceId);

        if (isMounted) {
          acquiredInstanceIdRef.current = instanceId;
          setIsConnected(true);
          setIsConnecting(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err
              : new Error('Failed to acquire DuckLake connection'),
          );
          setIsConnected(false);
          setIsConnecting(false);
        }
      }
    };

    acquireConnection();

    // eslint-disable-next-line consistent-return
    return () => {
      isMounted = false;

      if (acquiredInstanceIdRef.current) {
        DuckLakeService.releaseConnection(acquiredInstanceIdRef.current).catch(
          () => {
            // Silently handle errors during cleanup
          },
        );
        acquiredInstanceIdRef.current = null;
      }

      setIsConnected(false);
      setIsConnecting(false);
    };
  }, [instanceId]);

  return {
    isConnected,
    isConnecting,
    error,
  };
};

export default useDuckLakeConnection;
