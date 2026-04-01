# Requirements Document

## Introduction

The Shared Memories feature adds a persistent, cross-session knowledge base to the Kiro Assistant web app. Currently, each agent session (Kiro, Claude Code) maintains independent conversation history in SQLite with no shared context between sessions. This feature introduces a memory store that accumulates learnings, facts, preferences, and decisions over time. Memories are injected into new sessions as system context, giving agents awareness of prior knowledge without requiring users to repeat themselves. Users can create memories manually, agents can extract them automatically, and the existing "Send To" feature gains a "Memory" destination. A Memory Manager UI provides full visibility and control over stored memories.

## Glossary

- **Memory_Store**: The SQLite-backed persistence layer that stores memory entries in a dedicated `memories` table.
- **Memory_Entry**: A single unit of stored knowledge containing content text, category tag, source metadata, enabled/disabled state, and timestamps.
- **Memory_Manager**: The UI panel where users view, search, filter, edit, delete, and toggle memory entries.
- **Memory_Injector**: The server-side component that retrieves enabled memories and prepends them as system context when a new session starts or resumes.
- **Memory_API**: The set of REST endpoints (`/api/memories/*`) that handle CRUD operations on memory entries.
- **Category_Tag**: A classification label assigned to each Memory_Entry (e.g., "preferences", "project-context", "decisions", "people", "general").
- **Context_Budget**: The maximum total character count of memory content that the Memory_Injector will include in a single session prompt.
- **Send_To_Memory**: The Destination_Provider in the Send To feature that creates a Memory_Entry from a file's content.
- **Auto_Extract**: The mechanism by which an agent session automatically identifies and stores key facts or decisions as Memory_Entries during conversation.

## Requirements

### Requirement 1: Memory Store Schema

**User Story:** As a developer, I want a well-defined SQLite schema for memories, so that memory entries are persisted reliably across server restarts.

#### Acceptance Criteria

1. THE Memory_Store SHALL create a `memories` table in the existing SQLite database with columns: `id` (TEXT PRIMARY KEY), `content` (TEXT NOT NULL), `category` (TEXT NOT NULL DEFAULT 'general'), `source_type` (TEXT NOT NULL), `source_session_id` (TEXT), `enabled` (INTEGER NOT NULL DEFAULT 1), `created_at` (INTEGER NOT NULL), `updated_at` (INTEGER NOT NULL).
2. THE Memory_Store SHALL accept `source_type` values of "manual", "agent", or "send-to".
3. THE Memory_Store SHALL generate a unique UUID for each new Memory_Entry `id`.
4. WHEN the server starts, THE Memory_Store SHALL create the `memories` table if the table does not already exist.

### Requirement 2: Memory CRUD API

**User Story:** As a developer, I want REST endpoints for creating, reading, updating, and deleting memories, so that the UI and agents can manage the memory store programmatically.

#### Acceptance Criteria

1. THE Memory_API SHALL expose a `GET /api/memories` endpoint that returns all Memory_Entries sorted by `created_at` descending.
2. THE Memory_API SHALL expose a `POST /api/memories` endpoint that accepts `content` (string, required), `category` (string, optional), `source_type` (string, required), and `source_session_id` (string, optional) and creates a new Memory_Entry.
3. THE Memory_API SHALL expose a `PUT /api/memories/:id` endpoint that accepts partial updates to `content`, `category`, and `enabled` fields.
4. THE Memory_API SHALL expose a `DELETE /api/memories/:id` endpoint that removes a Memory_Entry by its `id`.
5. IF a `POST /api/memories` request is missing the `content` field, THEN THE Memory_API SHALL respond with HTTP 400 and a descriptive error message.
6. IF a `PUT /api/memories/:id` or `DELETE /api/memories/:id` request references a non-existent `id`, THEN THE Memory_API SHALL respond with HTTP 404 and a descriptive error message.
7. THE `GET /api/memories` endpoint SHALL accept optional query parameters `category` (string) and `search` (string) to filter results by category match and case-insensitive content substring match respectively.

### Requirement 3: Memory Context Injection

**User Story:** As a user, I want my stored memories automatically included when I start a new session, so that agents have context about my preferences and prior decisions without me repeating them.

#### Acceptance Criteria

1. WHEN a new session starts via the `session.start` client event, THE Memory_Injector SHALL retrieve all enabled Memory_Entries from the Memory_Store.
2. THE Memory_Injector SHALL format enabled memories as a structured text block prefixed with a header (e.g., "## Shared Memories") and prepend the block to the user's initial prompt.
3. WHILE the total character count of formatted memories exceeds the Context_Budget, THE Memory_Injector SHALL include memories in reverse chronological order (newest first) and truncate the list at the Context_Budget boundary.
4. THE Memory_Injector SHALL use a default Context_Budget of 8000 characters.
5. IF no enabled memories exist, THEN THE Memory_Injector SHALL send the prompt without modification.
6. WHEN a session resumes via the `session.continue` client event, THE Memory_Injector SHALL NOT re-inject memories into the continuation prompt.

### Requirement 4: Memory Manager UI Panel

**User Story:** As a user, I want a dedicated panel to view and manage all my memories, so that I can maintain control over what context agents receive.

#### Acceptance Criteria

1. THE Memory_Manager SHALL be accessible from the main Sidebar as a navigation item labeled "Memories" with a brain icon.
2. WHEN the user opens the Memory_Manager, THE Memory_Manager SHALL display all Memory_Entries as a scrollable list showing content preview (first 120 characters), category badge, source type, creation date, and enabled/disabled toggle.
3. THE Memory_Manager SHALL display a search input at the top that filters the displayed memories by case-insensitive content substring match as the user types.
4. THE Memory_Manager SHALL display category filter chips that allow the user to filter memories by one or more Category_Tags.
5. WHEN the user clicks the delete button on a Memory_Entry, THE Memory_Manager SHALL prompt for confirmation and then delete the entry via the Memory_API.
6. WHEN the user clicks on a Memory_Entry, THE Memory_Manager SHALL open an inline editor allowing the user to modify the content and category of the entry.
7. WHEN the user toggles the enabled/disabled switch on a Memory_Entry, THE Memory_Manager SHALL update the entry's `enabled` field via the Memory_API without requiring confirmation.
8. THE Memory_Manager SHALL display the total memory count and the current context usage (total characters of enabled memories vs. Context_Budget) as a progress indicator.

### Requirement 5: Manual Memory Creation

**User Story:** As a user, I want to manually add memories through the UI, so that I can store important context that agents should know about.

#### Acceptance Criteria

1. THE Memory_Manager SHALL display an "Add Memory" button that opens a creation form.
2. WHEN the user submits the creation form, THE Memory_Manager SHALL send a `POST /api/memories` request with `source_type` set to "manual" and the user-provided `content` and `category`.
3. THE creation form SHALL include a text area for content (required) and a category selector with predefined options: "preferences", "project-context", "decisions", "people", and "general".
4. IF the user submits the form with an empty content field, THEN THE Memory_Manager SHALL display a validation error and prevent submission.
5. WHEN a memory is created successfully, THE Memory_Manager SHALL add the new entry to the displayed list without requiring a full page refresh.

### Requirement 6: Agent Auto-Extraction of Memories

**User Story:** As a user, I want agents to automatically remember key facts and decisions from our conversations, so that important context is preserved without manual effort.

#### Acceptance Criteria

1. WHEN an agent session produces a message containing an explicit "remember this" or "save to memory" directive from the user, THE session handler SHALL extract the referenced content and create a Memory_Entry via the Memory_API with `source_type` set to "agent" and `source_session_id` set to the current session ID.
2. THE session handler SHALL parse the user prompt for patterns matching "remember that [content]", "save to memory: [content]", or "remember: [content]" (case-insensitive).
3. WHEN a memory is auto-extracted, THE session handler SHALL emit a `stream.message` event to the UI confirming the memory was saved, including the content preview.
4. IF the extracted content is empty or contains fewer than 5 characters, THEN THE session handler SHALL ignore the extraction and not create a Memory_Entry.

### Requirement 7: Send To Memory Destination

**User Story:** As a user, I want to send file content to the memory store using the Send To feature, so that I can quickly save agent-produced artifacts as persistent context.

#### Acceptance Criteria

1. THE Send_To_Memory Destination_Provider SHALL be registered in the Destination_Registry with id "memory", label "Memory", and `supportedFileTypes` set to text-only.
2. WHEN the user selects the Memory destination, THE Send_To_Menu SHALL display a category selector and an optional content override text area pre-filled with the file content (truncated to 2000 characters).
3. WHEN the user confirms the send, THE Send_To_Memory Destination_Provider SHALL create a Memory_Entry via the Memory_API with `source_type` set to "send-to" and the selected category.
4. WHEN the memory is created successfully, THE Send_To_Memory Destination_Provider SHALL display a success confirmation with the memory content preview.
5. THE Send_To_Memory Destination_Provider SHALL set `supportedFileTypes` to text-only, causing the Send_To_Menu to disable this option for binary files.

### Requirement 8: Memory Size Management

**User Story:** As a user, I want the system to manage memory size automatically, so that the context injection stays within useful bounds and does not overwhelm agent prompts.

#### Acceptance Criteria

1. THE Memory_Store SHALL enforce a maximum content length of 2000 characters per individual Memory_Entry.
2. IF a `POST /api/memories` or `PUT /api/memories/:id` request contains content exceeding 2000 characters, THEN THE Memory_API SHALL respond with HTTP 400 and a message indicating the maximum content length.
3. THE Memory_Manager SHALL display a character count indicator in the memory creation and edit forms showing current length vs. the 2000-character limit.
4. THE Memory_Injector SHALL respect the Context_Budget when assembling memories for injection, as specified in Requirement 3.
5. THE Memory_Manager SHALL visually indicate (e.g., yellow warning) when total enabled memory content exceeds 80% of the Context_Budget.

### Requirement 9: Memory Source Traceability

**User Story:** As a user, I want to see which session created each memory, so that I can trace context back to its origin.

#### Acceptance Criteria

1. THE Memory_Manager SHALL display the `source_type` for each Memory_Entry as a labeled badge ("Manual", "Agent", "Send To").
2. WHEN a Memory_Entry has a non-null `source_session_id`, THE Memory_Manager SHALL display the originating session title as a clickable link.
3. WHEN the user clicks the session link on a Memory_Entry, THE Memory_Manager SHALL navigate to that session's conversation history.
4. IF the originating session has been deleted, THEN THE Memory_Manager SHALL display the session ID as plain text with a "deleted" indicator instead of a clickable link.

### Requirement 10: Memory Data Serialization

**User Story:** As a developer, I want memory entries to be serializable to and from JSON, so that the API responses are consistent and the data can be reliably transported between server and client.

#### Acceptance Criteria

1. THE Memory_API SHALL serialize each Memory_Entry as a JSON object with fields: `id` (string), `content` (string), `category` (string), `sourceType` (string), `sourceSessionId` (string or null), `enabled` (boolean), `createdAt` (number), `updatedAt` (number).
2. THE Memory_API SHALL deserialize incoming JSON request bodies using camelCase field names (`sourceType`, `sourceSessionId`) and map them to the snake_case database columns.
3. FOR ALL valid Memory_Entry objects, serializing to JSON then deserializing back SHALL produce an equivalent Memory_Entry object (round-trip property).
