import React from 'react';
import { Button, CircularProgress, Chip } from '@mui/material';
import { Cable, CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useTestTemporaryProvider } from '../../controllers/aiProviders.controller';
import type { NewAIProvider } from '../../controllers/aiProviders.controller';

interface TestProviderConnectionProps {
  providerType: string;
  apiKey?: string;
  baseUrl?: string;
  onTestComplete?: (success: boolean, models?: any[]) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const TestProviderConnection: React.FC<TestProviderConnectionProps> = ({
  providerType,
  apiKey,
  baseUrl,
  onTestComplete,
  disabled = false,
  size = 'medium',
}) => {
  const [lastResult, setLastResult] = React.useState<{
    success: boolean;
    error?: string;
    models?: any[];
  } | null>(null);

  const { mutate: testTemporaryProvider, isLoading } = useTestTemporaryProvider(
    {
      onSuccess: (result) => {
        setLastResult({
          success: result.success,
          error: result.error,
          models: result.models || [],
        });
        if (result.success) {
          toast.success(
            `Connection test successful! ${result.modelsAvailable ? `Found ${result.modelsAvailable} models` : ''}`,
          );
        } else {
          toast.error(`Connection test failed: ${result.error}`);
        }
        onTestComplete?.(result.success, result.models);
      },
      onError: (error) => {
        const errorMessage = error.message || 'Connection test failed';
        setLastResult({
          success: false,
          error: errorMessage,
        });
        toast.error(`Connection test failed: ${errorMessage}`);
        onTestComplete?.(false);
      },
    },
  );

  const testConnection = async () => {
    if (!providerType) return;

    // Create a temporary provider config for testing
    const config: NewAIProvider = {
      name: 'Test Provider',
      type: providerType as any,
      config: JSON.stringify({
        baseUrl: baseUrl || undefined,
      }),
      isActive: false,
    };

    const credentials: Record<string, any> = {};
    if (apiKey) {
      credentials.apiKey = apiKey;
    }

    testTemporaryProvider({ config, credentials });
  };

  const canTest = () => {
    switch (providerType) {
      case 'openai':
      case 'anthropic':
      case 'gemini':
        return !!apiKey;
      case 'ollama':
        return true;
      default:
        return false;
    }
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

  const getButtonColor = (): 'primary' | 'success' | 'error' => {
    if (lastResult?.success) {
      return 'success';
    }
    if (lastResult?.success === false) {
      return 'error';
    }
    return 'primary';
  };

  const getRequirementText = () => {
    switch (providerType) {
      case 'openai':
        return 'Enter OpenAI API key to test';
      case 'anthropic':
        return 'Enter Anthropic API key to test';
      case 'gemini':
        return 'Enter Google AI API key to test';
      case 'ollama':
        return 'Blank URL uses local Ollama';
      default:
        return 'Select provider type first';
    }
  };

  return (
    <div>
      <Button
        size={size}
        variant="outlined"
        color={getButtonColor()}
        onClick={testConnection}
        disabled={disabled || isLoading || !canTest()}
        startIcon={getButtonIcon()}
        sx={{ mb: 1 }}
      >
        {isLoading ? 'Testing...' : 'Test Connection'}
      </Button>

      {!canTest() && (
        <Chip
          label={getRequirementText()}
          size="small"
          variant="outlined"
          color="default"
        />
      )}

      {lastResult && (
        <Chip
          label={
            lastResult.success
              ? `✓ Connected (${lastResult.models?.length || 0} models)`
              : `✗ ${lastResult.error}`
          }
          size="small"
          color={lastResult.success ? 'success' : 'error'}
          sx={{ ml: 1 }}
        />
      )}
    </div>
  );
};
