# Development Workflow & Best Practices

## Overview
This document outlines the development workflow, coding standards, and best practices for contributing to the DBT Studio Electron application.

## Project Setup & Development

### Prerequisites
- Node.js 14+ (specified in devEngines)
- npm 7+ (specified in devEngines)
- Git for version control
- VSCode (recommended) with extensions:
  - TypeScript + JavaScript
  - ESLint
  - Prettier
  - Electron

### Development Commands
```bash
# Install dependencies
npm install

# Start development server
npm start

# Build application
npm run build

# Package for distribution
npm run package

# Run tests
npm test

# Lint code
npm run lint
npm run lint:fix
```

### Project Structure Navigation
```
src/
├── main/                    # Electron main process
│   ├── services/           # Backend business logic (11 services)
│   ├── ipcHandlers/        # IPC communication handlers (10 categories)
│   ├── extractor/          # Database schema extractors (6 implemented)
│   ├── helpers/            # Utility functions and helpers
│   └── types/              # Main process TypeScript types
├── renderer/               # React frontend
│   ├── components/         # Reusable UI components
│   ├── screens/            # Page-level components
│   ├── services/           # Frontend service clients
│   ├── controllers/        # React Query hooks (7 controllers)
│   ├── context/            # React context providers (3 providers)
│   ├── hooks/              # Custom React hooks (12 hooks)
│   └── utils/              # Frontend utility functions
└── types/                  # Shared TypeScript definitions
```

## Coding Standards

### TypeScript Configuration
- **Strict Mode**: Enabled for type safety
- **No Implicit Any**: All types must be explicit
- **Unused Locals**: Flagged as errors
- **Consistent Return**: Enforced for functions

### ESLint Configuration
```json
{
  "extends": [
    "erb",
    "@typescript-eslint/recommended",
    "airbnb-base"
  ],
  "rules": {
    "import/no-extraneous-dependencies": "off",
    "import/no-unresolved": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
}
```

### Prettier Configuration
```json
{
  "singleQuote": true,
  "overrides": [
    {
      "files": [".prettierrc", ".eslintrc"],
      "options": { "parser": "json" }
    }
  ]
}
```

## Component Development Patterns

### Functional Components with Hooks
```typescript
import React from 'react';
import { Box, Typography } from '@mui/material';

interface ComponentProps {
  title: string;
  children?: React.ReactNode;
}

export const MyComponent: React.FC<ComponentProps> = ({ title, children }) => {
  const [state, setState] = React.useState<string>('');
  
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6">{title}</Typography>
      {children}
    </Box>
  );
};
```

### Material-UI Styling Patterns
```typescript
// Use sx prop for styling
<Box 
  sx={{
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    p: 3,
    borderRadius: 1,
    bgcolor: 'background.paper',
  }}
>

// Theme access
const theme = useTheme();
const isDarkMode = theme.palette.mode === 'dark';
```

### Form Handling with React Hook Form
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
});

type FormData = z.infer<typeof schema>;

const MyForm: React.FC = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    // Handle form submission
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <TextField
        {...register('name')}
        error={!!errors.name}
        helperText={errors.name?.message}
      />
    </form>
  );
};
```

## State Management Guidelines

### React Query Controller Pattern
```typescript
// src/renderer/controllers/example.controller.ts
import { useQuery, useMutation, useQueryClient } from 'react-query';

const QUERY_KEYS = {
  GET_ITEMS: 'GET_ITEMS',
  GET_ITEM: 'GET_ITEM',
};

export const useGetItems = (customOptions?: UseQueryOptions<Item[], CustomError>) => {
  return useQuery({
    queryKey: [QUERY_KEYS.GET_ITEMS],
    queryFn: () => exampleService.getItems(),
    ...customOptions,
  });
};

export const useAddItem = (customOptions?: UseMutationOptions<Item, CustomError, CreateItemData>) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data) => exampleService.addItem(data),
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries([QUERY_KEYS.GET_ITEMS]);
      customOptions?.onSuccess?.(...args);
    },
    onError: (...args) => {
      customOptions?.onError?.(...args);
    },
  });
};
```

### Context Provider Pattern
```typescript
// Context definition
export const ExampleContext = React.createContext<ExampleContextType>({
  // Default values
});

// Provider component
export const ExampleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState(defaultState);
  
  const contextValue = React.useMemo(() => ({
    ...state,
    updateState: setState,
  }), [state]);
  
  return (
    <ExampleContext.Provider value={contextValue}>
      {children}
    </ExampleContext.Provider>
  );
};

// Hook for consuming context
export const useExample = () => {
  const context = React.useContext(ExampleContext);
  if (!context) {
    throw new Error('useExample must be used within ExampleProvider');
  }
  return context;
};
```

## Service Layer Architecture

### Frontend Service Pattern
```typescript
// src/renderer/services/example.service.ts
import { client } from '../config/client';

class ExampleService {
  static async getItems(): Promise<Item[]> {
    return client.get('example:getItems');
  }
  
  static async addItem(data: CreateItemData): Promise<Item> {
    return client.post('example:addItem', data);
  }
  
  static async updateItem(id: string, data: UpdateItemData): Promise<Item> {
    return client.post('example:updateItem', { id, ...data });
  }
  
  static async deleteItem(id: string): Promise<void> {
    return client.post('example:deleteItem', { id });
  }
}

export default ExampleService;
```

### Backend Service Pattern
```typescript
// src/main/services/example.service.ts
class ExampleService {
  static async getItems(): Promise<Item[]> {
    try {
      // Business logic implementation
      const items = await database.query('SELECT * FROM items');
      return items.map(this.mapDatabaseToItem);
    } catch (error) {
      console.error('Failed to get items:', error);
      throw new Error('Failed to retrieve items');
    }
  }
  
  private static mapDatabaseToItem(dbItem: any): Item {
    return {
      id: dbItem.id,
      name: dbItem.name,
      createdAt: new Date(dbItem.created_at),
    };
  }
}

export default ExampleService;
```

### IPC Handler Pattern
```typescript
// src/main/ipcHandlers/example.ipcHandlers.ts
import { ipcMain } from 'electron';
import ExampleService from '../services/example.service';

const registerExampleHandlers = (ipcMain: Electron.IpcMain) => {
  ipcMain.handle('example:getItems', async () => {
    return ExampleService.getItems();
  });
  
  ipcMain.handle('example:addItem', async (_, data: CreateItemData) => {
    return ExampleService.addItem(data);
  });
  
  ipcMain.handle('example:updateItem', async (_, { id, ...data }: UpdateItemRequest) => {
    return ExampleService.updateItem(id, data);
  });
  
  ipcMain.handle('example:deleteItem', async (_, { id }: { id: string }) => {
    return ExampleService.deleteItem(id);
  });
};

export default registerExampleHandlers;
```

## Error Handling Patterns

### Service Layer Error Handling
```typescript
class ExampleService {
  static async riskyOperation(): Promise<Result> {
    try {
      const result = await externalAPI.call();
      return this.processResult(result);
    } catch (error) {
      // Log for debugging
      console.error('External API call failed:', error);
      
      // Return user-friendly error
      if (error.code === 'NETWORK_ERROR') {
        throw new Error('Network connection failed. Please check your internet connection.');
      }
      
      if (error.code === 'AUTH_ERROR') {
        throw new Error('Authentication failed. Please check your credentials.');
      }
      
      // Generic fallback
      throw new Error('Operation failed. Please try again.');
    }
  }
}
```

### Component Error Handling
```typescript
const MyComponent: React.FC = () => {
  const { data, error, isLoading } = useGetItems();
  const { mutate: addItem } = useAddItem({
    onSuccess: () => {
      toast.success('Item added successfully');
    },
    onError: (error) => {
      toast.error(`Failed to add item: ${error.message}`);
    },
  });
  
  if (isLoading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  
  return (
    <Box>
      {/* Component content */}
    </Box>
  );
};
```

## Testing Guidelines

### Unit Testing Pattern
```typescript
// src/__tests__/services/example.service.test.ts
import ExampleService from '../services/example.service';

describe('ExampleService', () => {
  beforeEach(() => {
    // Setup test environment
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  it('should get items successfully', async () => {
    const items = await ExampleService.getItems();
    expect(items).toBeInstanceOf(Array);
    expect(items.length).toBeGreaterThan(0);
  });
  
  it('should handle errors gracefully', async () => {
    // Mock failure scenario
    await expect(ExampleService.getItems()).rejects.toThrow('Failed to retrieve items');
  });
});
```

### Component Testing Pattern
```typescript
// src/__tests__/components/MyComponent.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import MyComponent from '../components/MyComponent';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Test" />, { wrapper: createWrapper() });
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
  
  it('handles user interactions', () => {
    render(<MyComponent title="Test" />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('button'));
    // Assert expected behavior
  });
});
```

## Performance Best Practices

### React Optimization
```typescript
// Memoization for expensive calculations
const expensiveValue = React.useMemo(() => {
  return heavyCalculation(data);
}, [data]);

// Callback memoization
const handleClick = React.useCallback((id: string) => {
  onItemClick(id);
}, [onItemClick]);

// Component memoization
const MemoizedComponent = React.memo(ExpensiveComponent);
```

### Query Optimization
```typescript
// Stale time for cached data
useQuery({
  queryKey: ['items'],
  queryFn: getItems,
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// Background refetch
useQuery({
  queryKey: ['items'],
  queryFn: getItems,
  refetchOnWindowFocus: false,
  refetchInterval: 30000, // 30 seconds
});
```

## Git Workflow

### Branch Naming
- `feature/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `refactor/component-name` - Code refactoring
- `docs/update-description` - Documentation updates

### Commit Message Format
```
type(scope): description

Optional body providing more context

Closes #issue-number
```

### Pre-commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "pre-push": "npm test"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

## Deployment & Build

### Electron Builder Configuration
```json
{
  "build": {
    "productName": "Rosetta dbt Studio",
    "appId": "org.rosettadb.dbtStudio",
    "directories": {
      "buildResources": "assets",
      "output": "release/build"
    },
    "files": ["dist", "node_modules", "package.json"],
    "mac": {
      "target": {
        "target": "default",
        "arch": ["arm64", "x64"]
      }
    }
  }
}
```

### Release Process
1. Update version in package.json
2. Update CHANGELOG.md
3. Create release branch
4. Run full test suite
5. Build and test packages
6. Create GitHub release
7. Deploy artifacts

This development workflow ensures code quality, maintainability, and team collaboration while following industry best practices for TypeScript, React, and Electron development.
