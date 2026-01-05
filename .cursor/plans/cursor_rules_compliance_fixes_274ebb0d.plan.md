---
name: Cursor Rules Compliance Fixes
overview: "Implement comprehensive fixes to align the codebase with cursor rules across three phases: (1) Configuration and type system improvements, (2) Code quality enhancements, and (3) Component renaming with import updates."
todos:
  - id: phase1-tsconfig
    content: Add exactOptionalPropertyTypes to all TypeScript config files (tsconfig.json, tsconfig.app.json, backend/tsconfig.json)
    status: completed
  - id: phase1-type-to-interface
    content: Convert object type definitions to interfaces in backend/src/routes/rpc.ts, src/realtime/realtimeClient.ts, src/components/ui/sidebar.tsx and other files
    status: completed
  - id: phase1-vite-optimization
    content: Add build.rollupOptions.output.manualChunks configuration to vite.config.ts for code splitting
    status: completed
  - id: phase2-jsdoc-removal
    content: Remove all JSDoc comments from TypeScript files (backend/src/realtime/server.ts, src/hooks/usePermissions.ts, and ~15+ other files)
    status: completed
  - id: phase2-constants
    content: Create src/lib/constants.ts and extract magic numbers (RGB limits, default colors, hex base) from component files
    status: completed
  - id: phase2-function-keyword
    content: Convert arrow functions to function keyword for pure utility functions across codebase
    status: completed
  - id: phase2-return-types
    content: Add explicit return types to all exported public functions missing them
    status: completed
  - id: phase3-rename-strategy
    content: Create mapping of component file names (PascalCase → kebab-case) and document all files to rename
    status: completed
  - id: phase3-rename-files
    content: Rename all component files from PascalCase to kebab-case while maintaining PascalCase component exports
    status: completed
    dependencies:
      - phase3-rename-strategy
  - id: phase3-update-imports
    content: Update all import statements throughout codebase to use new kebab-case file names
    status: completed
    dependencies:
      - phase3-rename-files
  - id: phase3-verify
    content: Run TypeScript compiler, linter, build process, and comprehensive testing to verify all changes
    status: completed
    dependencies:
      - phase3-update-imports
---

# Cursor Rules Compliance Im

plementation PlanThis plan organizes fixes into three phases, starting with low-risk foundational changes and progressing to more invasive refactoring.

## Phase 1: Configuration & Type System Foundation

### 1.1 TypeScript Configuration Updates

**Files**: `tsconfig.json`, `tsconfig.app.json`, `backend/tsconfig.json`

- Add `exactOptionalPropertyTypes: true` to all TypeScript config files
- Ensure all strict flags are enabled consistently across frontend and backend
- Verify `noEmitOnError` is set appropriately

### 1.2 Type Definition Standardization

**Files**: `backend/src/routes/rpc.ts`, `src/realtime/realtimeClient.ts`, `src/components/ui/sidebar.tsx`, and others using `type` for object definitions

- Convert object `type` definitions to `interface` where appropriate
- Keep `type` for unions, intersections, and mapped types (as per rules)
- Files to update:
- `backend/src/routes/rpc.ts` - Convert all object types to interfaces
- `src/realtime/realtimeClient.ts` - Convert `RealtimeChannel`, `PostgresChangeBinding` to interfaces
- `src/components/ui/sidebar.tsx` - Convert `SidebarContext` type to interface
- Review and convert similar patterns across codebase

### 1.3 Vite Build Optimization

**File**: `vite.config.ts`

- Add `build.rollupOptions.output.manualChunks` configuration
- Implement code splitting for:
- Vendor chunks (React, React Router, etc.)
- UI component library chunks
- Route-based chunks for pages
- Large feature modules (kanban, admin, import)
- Configure chunk size warnings and optimization

**Note**: Prisma schema enum (`BoardRole`) will remain as-is since it's a database-level concern. The TypeScript code already uses union types, which is correct.---

## Phase 2: Code Quality Improvements

### 2.1 Remove JSDoc Comments

**Files**: All TypeScript files with JSDoc comments identified in analysis

- Remove all JSDoc comment blocks from TypeScript files
- Keep only essential inline comments explaining "why" (not "what")
- Files to update:
- `backend/src/realtime/server.ts` - Remove all JSDoc blocks
- `backend/src/types/prisma.ts` - Remove header JSDoc
- `backend/src/middleware/permissions.ts` - Remove JSDoc comments
- `backend/src/middleware/errorHandler.ts` - Remove JSDoc comments
- `src/hooks/usePermissions.ts` - Remove JSDoc comments
- `src/lib/errorHandler.ts` - Remove JSDoc comments
- `src/lib/permissions/runTests.ts` - Remove JSDoc comments
- `src/lib/twemojiUtils.ts` - Remove JSDoc comments
- `src/components/admin/permissions/PermissionsSettings.tsx` - Remove JSDoc
- `src/components/admin/permissions/CategoriesList.tsx` - Remove JSDoc
- `src/components/admin/permissions/ToggleSlider.tsx` - Remove JSDoc
- All other files with JSDoc comments

### 2.2 Extract Magic Numbers to Constants

**Files**: `src/components/import/BoardImportDialog.tsx`, `src/components/kanban/ColorPicker.tsx`, `src/components/kanban/ThemeColorInput.tsx`, `src/components/kanban/BoardLabelsSettings.tsx`

- Create constants file `src/lib/constants.ts` for shared constants:
  ```typescript
      export const RGB_MIN = 0;
      export const RGB_MAX = 255;
      export const HEX_BASE = 16;
      export const DEFAULT_BLUE_RGB = { r: 59, g: 130, b: 246 };
      export const DEFAULT_BLUE_HEX = '#3b82f6';
  ```




- Update `BoardImportDialog.tsx`:
- Replace `Math.max(0, Math.min(255, ...))` with constants
- Extract default blue color values
- Consider extracting stage weight percentages if they're reused
- Update `ColorPicker.tsx` and `ThemeColorInput.tsx`:
- Use RGB_MIN/MAX constants
- Update `BoardLabelsSettings.tsx`:
- Use HEX_BASE constant for parseInt calls

### 2.3 Function Keyword for Pure Functions

**Files**: Review utility functions across codebase

- Convert arrow function exports to `function` keyword for pure utility functions
- Keep arrow functions for:
- Event handlers
- Callbacks
- React component props
- Files to review:
- `src/lib/errorHandler.ts` - Already uses `function` (good example)
- Utility functions in component files
- Helper functions in lib directories

### 2.4 Ensure Explicit Return Types

**Files**: All exported public functions

- Add explicit return types to all exported functions missing them
- Focus on:
- `backend/src/lib/permissions/registry.ts` - `isAppPermission`
- `backend/src/middleware/permissions.ts` - All exported functions
- `src/hooks/usePermissions.ts` - `usePermissions`, `useAppPermissions`
- Other exported functions identified during review

---

## Phase 3: Component Renaming & Import Updates

### 3.1 Create Renaming Strategy

- Generate mapping of old names → new names (PascalCase → kebab-case)
- Document all files that will be renamed
- Plan import update order to minimize conflicts

### 3.2 Rename Component Files

**Scope**: All components in `src/components/` including `ui/` directory

- Rename all component files from PascalCase to kebab-case:
- `NavLink.tsx` → `nav-link.tsx`
- `PermissionsSettings.tsx` → `permissions-settings.tsx`
- `BoardImportDialog.tsx` → `board-import-dialog.tsx`
- `KanbanCard.tsx` → `kanban-card.tsx`
- All UI components: `button.tsx`, `dialog.tsx`, `card.tsx`, etc. (already kebab-case)
- All admin components
- All kanban components
- All import components

### 3.3 Update Component Exports

- Update component file exports to maintain PascalCase component names (React convention)
- File names are kebab-case, but exported component names stay PascalCase
- Example: `nav-link.tsx` exports `NavLink` component

### 3.4 Update All Imports

**Strategy**: Use find-and-replace with care, verify each import

- Update import paths throughout codebase:
- `@/components/NavLink` → `@/components/nav-link`
- `@/components/admin/permissions/PermissionsSettings` → `@/components/admin/permissions/permissions-settings`
- Update all relative imports
- Update imports in:
    - All `.tsx` files in `src/pages/`
    - All `.tsx` files in `src/components/`
    - All `.ts` files that import components
    - Test files (if any)
    - Configuration files referencing components

### 3.5 Update References

- Update any string references to component paths (e.g., in routing configs, lazy loading)
- Update any documentation referencing component files
- Verify no hardcoded paths in build configs

### 3.6 Verification

- Run TypeScript compiler to catch any missed imports
- Run linter to verify no errors
- Test build process
- Verify runtime behavior (components load correctly)

---

## Implementation Order & Dependencies

```javascript
Phase 1 (Foundation)
  ↓
Phase 2 (Code Quality)
  ↓
Phase 3 (Renaming - Most Invasive)
```

**Rationale**:

- Phase 1 establishes foundation without breaking changes
- Phase 2 improves code quality without affecting imports
- Phase 3 requires careful execution due to import updates

## Risk Assessment

- **Low Risk**: Phase 1 (config changes, type conversions)
- **Low-Medium Risk**: Phase 2 (JSDoc removal, constants, function keywords)
- **High Risk**: Phase 3 (component renaming - affects many files and imports)

## Testing Strategy

After each phase:

1. Run TypeScript compiler: `tsc --noEmit`
2. Run linter: Check for errors
3. Build project: Verify no build errors
4. Quick smoke test: Verify app loads and key features work

After Phase 3:

- Comprehensive testing of all routes and features
- Verify all imports resolve correctly
- Check for any runtime errors

## Notes

- Prisma schema enum will remain unchanged (database-level concern)
- Component exports maintain PascalCase (React convention) while files use kebab-case