# Implementation Plan: Send To

## Overview

Implement a pluggable "Send To" mechanism that lets users share files to external destinations (Email, Quip, S3, Clipboard, Session, Memory) from the FileSidebar and FileBar. The architecture follows a provider pattern with a central registry on the server and a Zustand-driven UI with dynamic config panels.

## Tasks

- [ ] 1. Create shared types and server-side provider infrastructure
  - [ ] 1.1 Create shared Send To types
    - Create `src/shared/send-to-types.ts` with `DestinationInfo`, `ConfigField`, `SendToRequest`, `SendToResponse`, `SendToStatus`, `TEXT_EXTENSIONS`, and `isTextFile()` as defined in the design
    - _Requirements: 2.2, 9.1_

  - [ ] 1.2 Implement DestinationProvider interface and DestinationRegistry
    - Create `src/server/send-to/destination-provider.ts` with the `DestinationProvider` interface
    - Create `src/server/send-to/destination-registry.ts` with the `DestinationRegistry` class (`register`, `get`, `getAll`, `has`, `getAvailableIds`)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 1.3 Write property tests for DestinationRegistry
    - **Property 1: Registry maintains unique provider IDs**
    - **Validates: Requirements 2.1, 2.3**
    - Create `src/server/send-to/destination-registry.test.ts`
    - Use fast-check to generate mock providers with distinct IDs and verify `getAll()` count and `get(id)` correctness

  - [ ]* 1.4 Write property test for file type filtering
    - **Property 2: File type filtering correctness**
    - **Validates: Requirements 2.4, 6.3**
    - In `src/server/send-to/destination-registry.test.ts`, verify that text-only providers are disabled for non-text extensions and enabled for text extensions

- [ ] 2. Implement destination providers
  - [ ] 2.1 Implement EmailProvider
    - Create `src/server/send-to/providers/email-provider.ts`
    - Config fields: `to` (email, required), `subject` (text, required), `body` (textarea, optional)
    - `supportedFileTypes: "all"`, invokes Outlook MCP `send_email` tool
    - Check MCP availability; return descriptive error if not configured
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 2.2 Implement QuipProvider
    - Create `src/server/send-to/providers/quip-provider.ts`
    - Config fields: `folderUrl` (text, required)
    - `supportedFileTypes: "all"`, invokes Quip MCP tool
    - Return clickable link on success; error with setup guidance if MCP not configured
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 2.3 Implement S3Provider
    - Create `src/server/send-to/providers/s3-provider.ts`
    - Config fields: `bucket` (text, required), `keyPrefix` (text, optional)
    - Uses `@aws-sdk/client-s3` `PutObjectCommand`, returns `s3://bucket/key` URI on success
    - Returns AWS error code/message on failure
    - `supportedFileTypes: "all"`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.4 Write property test for S3 URI format
    - **Property 3: S3 URI format**
    - **Validates: Requirements 5.4**
    - Create `src/server/send-to/providers/s3-provider.test.ts`
    - Use fast-check to generate valid bucket names and keys, verify `data.uri` matches `s3://{bucket}/{key}`

  - [ ] 2.5 Implement ClipboardProvider
    - Create `src/server/send-to/providers/clipboard-provider.ts`
    - No config fields; server reads file as UTF-8 and returns content in `data.content`
    - `supportedFileTypes: "text"`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 2.6 Implement SessionProvider
    - Create `src/server/send-to/providers/session-provider.ts`
    - Config fields: `sessionId` (select, required — populated from active sessions)
    - Sends `session.continue` event to target session with file path as context
    - Filters out current session from list; handles empty session list
    - `supportedFileTypes: "all"`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 2.7 Write property test for session list filtering
    - **Property 4: Session list excludes current session**
    - **Validates: Requirements 7.1**
    - Create `src/server/send-to/providers/session-provider.test.ts`
    - Use fast-check to generate session lists and a current session ID, verify current session is excluded

  - [ ] 2.8 Implement MemoryProvider
    - Create `src/server/send-to/providers/memory-provider.ts`
    - Config fields: `category` (select, optional), `content` (textarea, optional)
    - Creates memory entry via `IMemoryStore` with `sourceType: "send-to"`
    - `supportedFileTypes: "text"`
    - _Requirements: 2.2_

  - [ ]* 2.9 Write property test for provider parameter validation
    - **Property 8: Provider parameter validation**
    - **Validates: Requirements 3.1, 4.1, 5.1**
    - In `src/server/send-to/send-to-routes.test.ts`, use fast-check to generate params with missing required fields and verify `validateParams()` returns non-null error; generate complete params and verify null return

- [ ] 3. Implement server route and registry wiring
  - [ ] 3.1 Create Send To Express routes
    - Create `src/server/send-to/send-to-routes.ts` with:
      - `POST /api/files/send-to` — validates file exists, looks up destination, validates params, calls `provider.send()`, returns `SendToResponse`
      - `GET /api/files/send-to/destinations` — returns `DestinationInfo[]` from registry
    - HTTP 404 for non-existent file, HTTP 400 for unknown destination (listing available IDs), HTTP 400 for invalid params
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 3.2 Create registry initialization and mount routes in server
    - Create `src/server/send-to/index.ts` with `createSendToRegistry()` that registers all 6 providers
    - Mount the send-to router in `src/server/index.ts`
    - _Requirements: 2.1, 2.3, 9.1_

  - [ ]* 3.3 Write property tests for server route validation
    - **Property 6: Server rejects invalid requests before provider delegation**
    - **Validates: Requirements 9.2, 9.3, 9.4**
    - In `src/server/send-to/send-to-routes.test.ts`, use fast-check to generate non-existent file paths and unregistered destination IDs, verify correct HTTP status codes

  - [ ]* 3.4 Write property test for response structure
    - **Property 7: Response structure invariant**
    - **Validates: Requirements 9.5**
    - In `src/server/send-to/send-to-routes.test.ts`, verify all responses contain `success` boolean and `message` string, and that successful responses have non-empty `message`

- [ ] 4. Checkpoint - Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement frontend store and UI components
  - [ ] 5.1 Create useSendToStore Zustand store
    - Create `src/ui/store/useSendToStore.ts` with state: `status`, `activeDestination`, `result`, `destinations`, `menuOpen`, `configPanelOpen`, `targetFile`
    - Actions: `fetchDestinations()`, `openMenu()`, `closeMenu()`, `selectDestination()`, `sendFile()`, `reset()`
    - Special handling for clipboard destination: intercept response and call `navigator.clipboard.writeText()`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 6.1_

  - [ ]* 5.2 Write property test for send button disabled state
    - **Property 5: Send button disabled during in-progress operation**
    - **Validates: Requirements 8.4**
    - Create `src/ui/store/useSendToStore.test.ts`
    - Use fast-check to generate `SendToState` objects and verify disabled logic based on `status` and file validity

  - [ ] 5.3 Create SendToMenu component
    - Create `src/ui/components/SendToMenu.tsx`
    - Radix `DropdownMenu` listing destinations from `useSendToStore.destinations`
    - Show icon + label per destination; disable destinations whose `supportedFileTypes` don't match the current file
    - Show disabled tooltip for incompatible file types
    - Disable entire menu when file is `__not_found__`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4_

  - [ ] 5.4 Create SendToConfigPanel component
    - Create `src/ui/components/SendToConfigPanel.tsx`
    - Dynamically render form inputs from `configFields`
    - For Session destination, fetch active sessions and populate select
    - Show "No other active sessions" message when session list is empty
    - "Send" button triggers `useSendToStore.sendFile()`
    - _Requirements: 1.4, 3.1, 4.1, 5.1, 7.1, 7.3_

  - [ ] 5.5 Create SendToStatusIndicator component
    - Create `src/ui/components/SendToStatusIndicator.tsx`
    - `in_progress`: spinner + "Sending to {destination}..."
    - `success`: green checkmark + destination-specific details, auto-dismiss after 5 seconds
    - `error`: red icon + error message + "Retry" button
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 6. Integrate Send To into FileSidebar and FileBar
  - [ ] 6.1 Add Send To button to FileSidebar header
    - Add a "Send To" button in the FileSidebar header action bar next to Preview and Download
    - Wire button click to open `SendToMenu`
    - Disable button when `content === '__not_found__'` with tooltip
    - Disable button while a send is in progress
    - Render `SendToStatusIndicator` in the header area
    - _Requirements: 1.1, 1.2, 1.3, 8.1, 8.2, 8.3, 8.4_

  - [ ] 6.2 Add context menu to FileBar file chips
    - Add `onContextMenu` handler to `FileChip` in `FileBar.tsx`
    - Render Radix `ContextMenu` with "Open", "Preview", "Download", and "Send To ▸" submenu
    - "Send To" submenu lists destinations; selecting one opens `SendToConfigPanel` in a modal
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementations use TypeScript
- `fast-check` is used for property-based testing with vitest
