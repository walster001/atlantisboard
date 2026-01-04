---
name: Enable Strict TypeScript and Fix Type Safety Issues
overview: Enable strict TypeScript checking on the frontend, fix the syntax error in BoardImportDialog.tsx, replace all 201 instances of `any` with proper types, and enable unused variable checking. This will be done in phases to ensure the codebase remains functional throughout the process.
todos:
  - id: fix-syntax-error
    content: Fix syntax error in BoardImportDialog.tsx line 1067 (remove extra closing brace)
    status: completed
  - id: create-error-utilities
    content: Create error type guard utilities in src/lib/errorHandler.ts (isError, getErrorMessage, getErrorName) and update getUserFriendlyError to use unknown
    status: completed
  - id: enable-eslint-unused-vars
    content: Update eslint.config.js to enable @typescript-eslint/no-unused-vars with warn level
    status: completed
  - id: enable-strict-mode-basic
    content: Enable basic strict mode options in tsconfig.app.json (strict, noImplicitAny, strictNullChecks, etc.)
    status: completed
    dependencies:
      - fix-syntax-error
  - id: enable-strict-mode-additional
    content: Enable additional strict checks in tsconfig.app.json (noUnusedLocals, noUnusedParameters, noImplicitReturns, noFallthroughCasesInSwitch)
    status: completed
    dependencies:
      - enable-strict-mode-basic
  - id: fix-error-handling-catch-blocks
    content: "Replace all catch (error: any) with catch (error: unknown) and use type guards (Home.tsx, BoardPage.tsx, BoardImportDialog.tsx, useAuth.tsx, and all other files)"
    status: completed
    dependencies:
      - create-error-utilities
  - id: create-api-response-types
    content: Create API response types in src/types/api.ts for WorkspaceResponse, BoardResponse, etc.
    status: completed
  - id: fix-api-response-types
    content: Update API calls throughout codebase to use typed responses (Home.tsx, BoardPage.tsx, kanban components)
    status: completed
    dependencies:
      - create-api-response-types
  - id: create-realtime-event-types
    content: Define Board, Column, Card, Member types matching database schema for use in RealtimePostgresChangesPayload
    status: completed
  - id: fix-realtime-event-handlers
    content: Update realtime event handlers to use RealtimePostgresChangesPayload<T> with proper generics (Home.tsx, BoardPage.tsx, realtime files)
    status: completed
    dependencies:
      - create-realtime-event-types
  - id: create-import-export-types
    content: Create types for Wekan and Trello data structures in src/components/import/types.ts
    status: completed
  - id: fix-import-export-types
    content: Update BoardImportDialog.tsx to use proper types for import/export functions (isWekanFormat, isTrelloFormat, applyIconReplacements, etc.)
    status: completed
    dependencies:
      - create-import-export-types
  - id: fix-function-parameters
    content: Replace any in function parameters with proper types (event handlers, callbacks, transform functions)
    status: completed
    dependencies:
      - enable-strict-mode-basic
  - id: fix-state-props-types
    content: Define explicit interfaces for component props and useState types throughout components
    status: completed
    dependencies:
      - enable-strict-mode-basic
  - id: fix-generic-data-processing
    content: Replace any in data processing functions with generics or specific types (utility functions, JSON parsing, transformations)
    status: completed
    dependencies:
      - enable-strict-mode-basic
  - id: validate-typescript-compilation
    content: Run TypeScript compiler (tsc --noEmit) to ensure no type errors remain
    status: completed
    dependencies:
      - fix-error-handling-catch-blocks
      - fix-api-response-types
      - fix-realtime-event-handlers
      - fix-import-export-types
      - fix-function-parameters
      - fix-state-props-types
      - fix-generic-data-processing
  - id: validate-eslint
    content: Run ESLint to check for unused variables and other issues
    status: in_progress
    dependencies:
      - enable-eslint-unused-vars
      - validate-typescript-compilation
  - id: test-application
    content: Test application functionality (login, board operations, realtime updates, import functionality)
    status: pending
    dependencies:
      - validate-typescript-compilation
      - validate-eslint
---

# En

able Strict TypeScript and Fix Type Safety Issues

## Overview

This plan addresses type safety across the frontend codebase by:

1. Fixing the critical syntax error in BoardImportDialog.tsx
2. Enabling strict TypeScript checking gradually
3. Enabling unused variable checking in ESLint
4. Systematically replacing all 201 instances of `any` with proper types

## Phase 1: Critical Fixes (Immediate)

### 1.1 Fix Syntax Error in BoardImportDialog.tsx

**File:** `src/components/import/BoardImportDialog.tsx`**Line:** 1067**Issue:** Extra closing brace before `catch` blockRemove the extra `}` on line 1067. The correct structure should be:

```typescript
      }
    } catch (error: unknown) {  // Will be changed to unknown in Phase 3
```



### 1.2 Create Error Type Guard Utility

**File:** `src/lib/errorHandler.ts`**Purpose:** Create reusable type guards for error handling with `unknown` typeAdd a type guard function:

```typescript
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}

export function getErrorName(error: unknown): string | undefined {
  if (isError(error)) {
    return error.name;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return String(error.name);
  }
  return undefined;
}
```

Update `getUserFriendlyError` to use `unknown` instead of `any`.

## Phase 2: Enable TypeScript Strict Mode (Gradual)

### 2.1 Update tsconfig.app.json

**File:** `tsconfig.app.json`Enable strict mode options one at a time to catch errors incrementally:**Step 1:** Enable basic strict checks:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

**Step 2:** Enable additional checks:

```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Note:** This will reveal many type errors. Fix them incrementally as they appear.

### 2.2 Update ESLint Configuration

**File:** `eslint.config.js`Enable unused variable checking:

```typescript
rules: {
  ...reactHooks.configs.recommended.rules,
  "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  "@typescript-eslint/no-unused-vars": ["warn", { 
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_"
  }],
}
```



## Phase 3: Replace `any` Types by Category

### 3.1 Error Handling (Catch Blocks) - ~20 instances

**Files:** `src/pages/Home.tsx`, `src/pages/BoardPage.tsx`, `src/components/import/BoardImportDialog.tsx`, etc.**Strategy:** Replace `catch (error: any)` with `catch (error: unknown)` and use type guards:

```typescript
// Before
} catch (error: any) {
  console.error('Error:', error);
  toast({ description: error.message });
}

// After
} catch (error: unknown) {
  console.error('Error:', error);
  const message = getErrorMessage(error);
  toast({ description: message });
  
  // For specific error types
  if (getErrorName(error) === 'AbortError') {
    return;
  }
}
```

**Key Files:**

- `src/pages/Home.tsx` (2 instances, lines 295, 323)
- `src/pages/BoardPage.tsx` (1 instance, line 157)
- `src/components/import/BoardImportDialog.tsx` (1 instance, line 1067)
- `src/hooks/useAuth.tsx` (check for error handling)
- All other files with catch blocks

### 3.2 API Response Types - ~30 instances

**Files:** `src/integrations/api/client.ts`, files using API responses**Strategy:** Use generic types and create specific response types:

1. Create API response types in `src/types/api.ts`:
```typescript
export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  // ... other properties
}

export interface BoardResponse {
  id: string;
  name: string;
  workspaceId: string;
  // ... other properties
}
```




2. Update API calls to use typed responses:
```typescript
// Before
const result: any = await api.request('/workspaces');

// After
const result = await api.request<WorkspaceResponse[]>('/workspaces');
```


**Key Files:**

- `src/pages/Home.tsx` - API responses for workspaces/boards
- `src/pages/BoardPage.tsx` - API responses for board data
- `src/components/kanban/*.tsx` - Various API responses
- `src/integrations/api/client.ts` - Already uses generics, ensure all callers use them

### 3.3 Realtime Event Handlers - ~15 instances

**Files:** `src/pages/Home.tsx`, `src/pages/BoardPage.tsx`, `src/realtime/*.ts`**Strategy:** Use existing `RealtimePostgresChangesPayload<T>` type with proper generics:

```typescript
// Before
onBoardUpdate: (board: any, event: any) => {
  const boardData = event.new as any;
}

// After
onBoardUpdate: (board: Board, event: RealtimePostgresChangesPayload<Board>) => {
  const boardData = event.new;
  // TypeScript knows boardData is Board | null
}
```

**Key Files:**

- `src/pages/Home.tsx` - Event handlers for workspaces/boards
- `src/pages/BoardPage.tsx` - Event handlers for columns/cards/members
- `src/realtime/workspaceSubscriptions.ts`
- `src/realtime/permissionsSubscriptions.ts`
- `src/hooks/useStableRealtimeHandlers.ts`

**Types to create:**

- Define `Board`, `Column`, `Card`, `Member` types matching database schema
- Use these types in `RealtimePostgresChangesPayload<Board>`, etc.

### 3.4 Import/Export Data Types - ~25 instances

**Files:** `src/components/import/BoardImportDialog.tsx`**Strategy:** Define proper types for Wekan and Trello data structures:

1. Create types in `src/components/import/types.ts`:
```typescript
export interface WekanBoard {
  _id: string;
  title: string;
  lists: WekanList[];
  // ... other Wekan properties
}

export interface TrelloBoard {
  id: string;
  name: string;
  cards: TrelloCard[];
  // ... other Trello properties
}
```




2. Update functions:
```typescript
// Before
function isWekanFormat(data: any): boolean {
  const checkBoard = (board: any) => {
    // ...
  }
}

// After
function isWekanFormat(data: unknown): data is WekanBoard | WekanBoard[] {
  // Type guard implementation
  if (!data || typeof data !== 'object') return false;
  // ... validation logic
}
```


**Key Functions to Update:**

- `isWekanFormat(data: any)` -> `isWekanFormat(data: unknown): data is WekanBoard | WekanBoard[]`
- `isTrelloFormat(data: any)` -> `isTrelloFormat(data: unknown): data is TrelloBoard`
- `getFormatMismatchError(selectedFormat: ImportSource, data: any)`
- `applyIconReplacements(wekanData: any, replacements: Map<string, string>): any`
- All import/transformation functions in BoardImportDialog.tsx

### 3.5 Function Parameters and Return Types - ~50 instances

**Files:** Various component files**Strategy:** Infer types from usage or define explicit types:

1. **Event Handlers:**
```typescript
// Before
const handleChange = (e: any) => {
  setValue(e.target.value);
}

// After
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
}
```




2. **Callback Functions:**
```typescript
// Before
const callback = (data: any) => {
  // ...
}

// After
const callback = (data: SpecificType) => {
  // ...
}
```


**Key Patterns to Fix:**

- React event handlers (ChangeEvent, MouseEvent, FormEvent)
- Callback functions in hooks
- Transform functions (map, filter callbacks)
- Handler functions in components

### 3.6 State and Props Types - ~30 instances

**Files:** Component files throughout `src/components/`**Strategy:** Define explicit interfaces for props and state:

```typescript
// Before
function Component(props: any) {
  const [data, setData] = useState<any>(null);
}

// After
interface ComponentProps {
  id: string;
  onComplete: (result: ResultType) => void;
}

function Component(props: ComponentProps) {
  const [data, setData] = useState<DataType | null>(null);
}
```



### 3.7 Generic Data Processing - ~31 instances

**Files:** Various utility and service files**Strategy:** Create specific types or use generics:

1. **Data Transformation:**
```typescript
// Before
const transform = (item: any) => ({ ...item, processed: true });

// After
const transform = <T extends { id: string }>(item: T): T & { processed: boolean } => ({
  ...item,
  processed: true,
});
```




2. **JSON Parsing:**
```typescript
// Before
const data = JSON.parse(json) as any;

// After
const data = JSON.parse(json) as ExpectedType;
// Or use a validator library like Zod
```




## Phase 4: Validation and Testing

### 4.1 Type Check All Files

Run TypeScript compiler to ensure no errors:

```bash
npm run build
# or
npx tsc --noEmit
```



### 4.2 Lint All Files

Run ESLint to check for unused variables:

```bash
npm run lint
```



### 4.3 Test Application

- Start development server
- Test critical user flows (login, board creation, card operations)
- Verify realtime updates work correctly
- Test import functionality

## Implementation Order

1. **Phase 1.1** - Fix syntax error (prevents compilation)
2. **Phase 1.2** - Create error utilities (needed for Phase 3.1)
3. **Phase 2.2** - Update ESLint config (won't break compilation)
4. **Phase 2.1** - Enable strict mode incrementally (one option at a time)
5. **Phase 3.1** - Fix error handling (most impactful, affects many files)
6. **Phase 3.2** - Fix API types (improves type safety for data fetching)
7. **Phase 3.3** - Fix realtime event types (improves realtime safety)
8. **Phase 3.4** - Fix import/export types (isolated to one file)
9. **Phase 3.5-3.7** - Fix remaining `any` types by file/component
10. **Phase 4** - Validate and test

## Files Requiring Significant Changes

**High Priority (Many `any` instances):**

- `src/pages/Home.tsx` (12 instances)
- `src/pages/BoardPage.tsx` (24 instances)
- `src/components/import/BoardImportDialog.tsx` (11 instances + syntax error)
- `src/components/kanban/InviteLinkButton.tsx` (2 instances)
- `src/integrations/api/client.ts` (3 instances)
- `src/realtime/realtimeClient.ts` (4 instances)

**Medium Priority:**

- Various component files in `src/components/kanban/`
- Hook files in `src/hooks/`
- Realtime subscription files

## Notes

- Work incrementally - enable strict mode options one at a time
- Fix errors as they appear during strict mode enablement
- Use type guards for runtime type checking where needed
- Prefer `unknown` over `any` for error handling