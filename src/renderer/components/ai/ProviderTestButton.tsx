import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { CheckCircle, Error as ErrorIcon, Cable } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTestAIProvider } from '../../controllers/aiProviders.controller';
import type { ProviderTestResult } from '../../controllers/aiProviders.controller';

interface ProviderTestButtonProps {
  providerId: string;
  onTestComplete?: () => void;
  size?: 'small' | 'medium' | 'large';
  variant?: 'contained' | 'outlined' | 'text';
}

export const ProviderTestButton: React.FC<ProviderTestButtonProps> = ({
  providerId,
  onTestComplete,
  size = 'medium',
  variant = 'outlined',
}) => {
  const [lastResult, setLastResult] = React.useState<ProviderTestResult | null>(
    null,
  );

  const { mutate: testProvider, isLoading } = useTestAIProvider({
    onSuccess: (result: ProviderTestResult) => {
      setLastResult(result);
      if (result.success) {
        toast.success(
          `Provider test successful! ${result.latencyMs ? `(${result.latencyMs}ms)` : ''}`,
        );
      } else {
        toast.error(`Provider test failed: ${result.error}`);
      }
      onTestComplete?.();
    },
    onError: (error) => {
      const errorMessage = (error as any).message || 'Test failed';
      setLastResult({ success: false, error: errorMessage });
      toast.error(`Provider test failed: ${errorMessage}`);
      onTestComplete?.();
    },
  });

  const handleTest = () => {
    if (!providerId) {
      toast.error('[PROVIDER TEST BUTTON] No provider ID provided');
      return;
    }
    testProvider(providerId);
  };

  const getButtonIcon = () => {
    if (isLoading) {
      return <CircularProgress size={16} />;
    }
    if (lastResult?.success) {
      return <CheckCircle />;
    }
    if (lastResult?.success === false) {
      return <ErrorIcon />;
    }
    return <Cable />;
  };

  const getButtonColor = () => {
    if (lastResult?.success) {
      return 'success';
    }
    if (lastResult?.success === false) {
      return 'error';
    }
    return 'primary';
  };

  return (
    <Button
      size={size}
      variant={variant}
      color={getButtonColor() as any}
      onClick={handleTest}
      disabled={isLoading || !providerId}
      startIcon={getButtonIcon()}
    >
      {isLoading ? 'Testing...' : 'Test Connection'}
    </Button>
  );
};
