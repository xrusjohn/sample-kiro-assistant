# Implementation Plan: Shared Memories

## Overview

Implement a persistent, cross-session knowledge base for the Kiro Assistant web app. The feature adds a SQLite-backed memory store, REST API, automatic memory injection into session prompts, agent auto-extraction of memories from user directives, a Memory Manager UI panel, and a "Send To Memory" destination provider. Implementation follows the existing architectural patterns: Express routes on the server, Zustand store on the frontend, shared TypeScript types in `src/shared/`.

## Tasks

- [ ] 1. Define shared types and constants
  - [ ] 1.1 Create `src/shared/memory-types.ts` with `MemoryEntry`, `CreateMemoryInput`, `UpdateMemoryInput` interfaces, `MEMORY_CATEGORIES` array, `MemoryCategory` type, and constants (`MAX_MEMORY_CONTENT_LENGTH`, `DEFAULT_CONTEXT_BUDGET`, `CONTEXT_BUDGET_WARNING_THRESHOLD`)
    - _Requirements: 1.1, 1.2, 8.1, 8.4, 8.5, 10.1_

- [ ] 2. Implement the memory store (server)
  - [ ] 2.1 Create `src/server/memory-store.ts` with `IMemoryStore` interface and `SqliteMemoryStore` class
    - Define `IMemoryStore` with methods: `create`, `getById`, `list`, `update`, `delete`, `getEnabled`, `getTotalEnabledSize`
    - Implement `SqliteMemoryStore` using `better-sqlite3` against the existing `sessions.db`
    - Create `memories` table with `CREATE TABLE IF NOT EXISTS` in constructor (columns: `id`, `content`, `category`, `source_type`, `source_session_id`, `enabled`, `created_at`, `updated_at`)
    - Create indexes on `category`, `enabled`, `created_at`
    - Generate UUID v4 for each new entry
    - Handle snake_case ↔ camelCase field mapping and boolean ↔ integer conversion
    - Enforce max content length of 2000 chars on `create` and `update`
    - Validate `source_type` is one of `"manual"`, `"agent"`, `"send-to"`
    - Implement `list` with optional `category` and `search` (case-insensitive substring) filters
    - Return results sorted by `created_at` descending
    - Implement `createMemoryStore()` factory function with `MEMORY_BACKEND` env var
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.7, 8.1, 10.2, 10.3_

  - [ ]* 2.2 Write property test: Memory serialization round-trip
    - **Property 1: Memory serialization round-trip**
    - **Validates: Requirements 2.2, 10.1, 10.2, 10.3**

  - [ ]* 2.3 Write property test: Unique ID generation
    - **Property 2: Unique ID generation**
    - **Validates: Requirements 1.3**

  - [ ]* 2.4 Write property test: List sort order invariant
    - **Property 3: List sort order invariant**
    - **Validates: Requirements 2.1**

  - [ ]* 2.5 Write property test: Partial update preserves unchanged fields
    - **Property 4: Partial update preserves unchanged fields**
    - **Validates: Requirements 2.3**

  - [ ]* 2.6 Write property test: Delete removes entry
    - **Property 5: Delete removes entry**
    - **Validates: Requirements 2.4**

  - [ ]* 2.7 Write property test: Filter correctness
    - **Property 6: Filter correctness**
    - **Validates: Requirements 2.7, 4.3, 4.4**

  - [ ]* 2.8 Write property test: Content length enforcement
    - **Property 9: Content length enforcement**
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 2.9 Write property test: Source type validation
    - **Property 10: Source type validation**
    - **Validates: Requirements 1.2**

- [ ] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement memory API routes (server)
  - [ ] 4.1 Create `src/server/memory-routes.ts` Express router
    - `GET /api/memories` — list all memories, accept optional `category` and `search` query params
    - `POST /api/memories` — create memory, validate `content` (required) and `sourceType` (required, must be valid), return 400 on validation failure
    - `PUT /api/memories/:id` — partial update (`content`, `category`, `enabled`), return 404 if not found
    - `DELETE /api/memories/:id` — delete by id, return 404 if not found
    - Return proper HTTP status codes (400, 404, 500) with descriptive error messages
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.2_

  - [ ] 4.2 Mount memory routes in `src/server/index.ts`
    - Import `createMemoryStore` and `createMemoryRouter` (or equivalent)
    - Initialize the memory store at boot
    - Mount router at `/api/memories`
    - _Requirements: 1.4, 2.1_

  - [ ]* 4.3 Write unit tests for memory API routes
    - Test 400 responses for missing `content`, missing `sourceType`, content > 2000 chars, invalid `sourceType`
    - Test 404 responses for PUT/DELETE with non-existent id
    - Test query param filtering (`category`, `search`)
    - _Requirements: 2.5, 2.6, 2.7, 8.2_

- [ ] 5. Implement memory injector (server)
  - [ ] 5.1 Create `src/server/memory-injector.ts`
    - Implement `buildMemoryContext(memories, budget?)` — formats enabled memories as `## Shared Memories` block, newest first, within budget
    - Implement `injectMemories(prompt, store, budget?)` — retrieves enabled memories, builds context, prepends to prompt
    - Return prompt unmodified if no enabled memories exist
    - Use `DEFAULT_CONTEXT_BUDGET` (8000) as default budget
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.2 Write property test: Injection includes only enabled memories within budget
    - **Property 7: Injection includes only enabled memories within budget**
    - **Validates: Requirements 3.1, 3.3, 8.4**

  - [ ]* 5.3 Write property test: Injection format structure
    - **Property 8: Injection format structure**
    - **Validates: Requirements 3.2**

  - [ ]* 5.4 Write property test: Context usage calculation
    - **Property 12: Context usage calculation**
    - **Validates: Requirements 4.8, 8.5**

- [ ] 6. Implement auto-extraction middleware (server)
  - [ ] 6.1 Add auto-extract logic to `src/server/session-handler.ts`
    - Parse incoming prompts for patterns: `"remember that [content]"`, `"save to memory: [content]"`, `"remember: [content]"` (case-insensitive)
    - Create memory via `IMemoryStore.create()` with `sourceType: "agent"` and current `sourceSessionId`
    - Ignore extracted content shorter than 5 characters
    - Emit `stream.message` event confirming memory was saved
    - Log errors but do not interrupt session flow on failure
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 6.2 Write property test: Auto-extraction round-trip
    - **Property 11: Auto-extraction round-trip**
    - **Validates: Requirements 6.1, 6.2, 6.4**

- [ ] 7. Wire memory injection into session start
  - [ ] 7.1 Integrate `injectMemories` into `session.start` handler in `src/server/session-handler.ts`
    - Call `injectMemories(prompt, memoryStore)` before sending prompt to agent on `session.start`
    - Do NOT inject on `session.continue`
    - _Requirements: 3.1, 3.5, 3.6_

- [ ] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement frontend memory store
  - [ ] 9.1 Create `src/ui/store/useMemoryStore.ts` Zustand store
    - State: `memories`, `loading`, `error`, `searchQuery`, `selectedCategories`, `editingId`
    - Actions: `fetchMemories`, `createMemory`, `updateMemory`, `deleteMemory`, `setSearchQuery`, `toggleCategory`
    - All actions call REST API (`/api/memories`) and update local state
    - Optimistic toggle for `enabled` with rollback on failure
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.5_

- [ ] 10. Implement Memory Manager UI
  - [ ] 10.1 Create `src/ui/components/MemoryForm.tsx`
    - Shared form for create and edit modes
    - Content textarea with character counter (current / 2000 max)
    - Category selector with predefined options from `MEMORY_CATEGORIES`
    - Disable submit when content is empty (after trim)
    - Show inline validation error for empty content
    - _Requirements: 5.3, 5.4, 8.3_

  - [ ] 10.2 Create `src/ui/components/MemoryCard.tsx`
    - Display content preview (first 120 chars), category badge, source type badge, creation date
    - Enabled/disabled toggle switch
    - Edit and delete action buttons
    - Clickable session link when `sourceSessionId` is non-null (plain text with "deleted" indicator if session not found)
    - _Requirements: 4.2, 4.6, 4.7, 9.1, 9.2, 9.3, 9.4_

  - [ ] 10.3 Create `src/ui/components/MemoryManager.tsx`
    - Main panel component rendering memory list, search bar, category filter chips, "Add Memory" button, and creation form
    - Search input filters memories by case-insensitive content substring (client-side)
    - Category filter chips for toggling category filters
    - Context usage progress indicator (total enabled chars vs. budget, yellow warning at 80%)
    - Total memory count display
    - Delete confirmation prompt before deletion
    - Fetch memories on panel open via `useMemoryStore.fetchMemories()`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.5, 8.3, 8.5_

- [ ] 11. Add Memories navigation to Sidebar
  - [ ] 11.1 Update `src/ui/components/Sidebar.tsx` to add a "Memories" navigation button with brain icon
    - _Requirements: 4.1_

  - [ ] 11.2 Update `src/ui/App.tsx` to handle Memories panel visibility and render `MemoryManager`
    - Add state for memory panel open/closed
    - Render `MemoryManager` when open
    - _Requirements: 4.1_

- [ ] 12. Implement Send To Memory destination
  - [ ] 12.1 Create Send To Memory destination provider
    - Register with id `"memory"`, label `"Memory"`, `supportedFileTypes` text-only
    - Display category selector and content override textarea (pre-filled, truncated to 2000 chars)
    - Create memory via `POST /api/memories` with `sourceType: "send-to"`
    - Show success confirmation with content preview
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Install `fast-check` as a dev dependency before running property tests: `npm install --save-dev fast-check`
