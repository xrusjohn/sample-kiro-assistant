# Requirements Document

## Introduction

The "Send To" feature extends the Kiro Assistant web app's file management capabilities by allowing users to share files — created or accessed by agents — to various external destinations. Files currently appear as clickable chips in the FileBar and can be previewed or downloaded via the FileSidebar. This feature adds a pluggable "Send To" mechanism that routes files to destinations such as Email (Outlook MCP), Quip (Quip MCP), S3 (AWS SDK), the system clipboard, or another agent session. The architecture is designed for extensibility so new destinations (Slack, Teams, SharePoint, etc.) can be added with minimal effort.

## Glossary

- **FileSidebar**: The right-side panel component that displays file preview, metadata, and action buttons (Preview, Download) for a selected file.
- **FileBar**: The bottom bar component that shows file chips for all created and accessed files in the current session.
- **Send_To_Menu**: A dropdown menu UI element triggered from the FileSidebar that lists available destination options for sharing a file.
- **Destination_Provider**: A pluggable module that implements the logic for sending a file to a specific external service or target (e.g., Email, Quip, S3, Clipboard, Session).
- **Destination_Registry**: A central registry that manages the set of available Destination_Providers and exposes them to the UI and server.
- **MCP_Integration**: The existing Model Context Protocol server integrations (Outlook, Quip) used by the app to interact with external services.
- **CreatedFile**: A data type representing a file detected from agent activity, containing path, name, extension, session ID, and kind (created or accessed).
- **Send_To_Request**: A structured payload sent from the UI to the server containing the file path, chosen destination identifier, and destination-specific parameters.
- **Send_To_Status**: The state of a send operation — one of pending, in_progress, success, or error.

## Requirements

### Requirement 1: Send To Menu in FileSidebar

**User Story:** As a user, I want a "Send To" button in the FileSidebar alongside Preview and Download, so that I can share a file to an external destination without leaving the assistant.

#### Acceptance Criteria

1. WHEN a file is open in the FileSidebar, THE Send_To_Menu SHALL display a "Send To" button in the header action bar next to the existing Preview and Download buttons.
2. WHEN the user clicks the "Send To" button, THE Send_To_Menu SHALL display a dropdown listing all registered Destination_Providers with their name and icon.
3. WHILE the file content indicates `__not_found__` status, THE Send_To_Menu SHALL disable the "Send To" button and display a tooltip indicating the file is unavailable.
4. WHEN the user selects a Destination_Provider from the dropdown, THE Send_To_Menu SHALL open a destination-specific configuration panel (e.g., email recipient field, S3 bucket selector).

### Requirement 2: Pluggable Destination Provider Architecture

**User Story:** As a developer, I want destinations to be pluggable modules with a consistent interface, so that new destinations can be added without modifying existing code.

#### Acceptance Criteria

1. THE Destination_Registry SHALL maintain a list of registered Destination_Providers, each identified by a unique string key.
2. THE Destination_Provider interface SHALL define: a unique `id` string, a display `label`, an `icon` identifier, a `supportedFileTypes` filter (text-only, binary-only, or all), a `getConfigFields()` method returning required user inputs, and a `send(filePath, config)` method executing the transfer.
3. WHEN a new Destination_Provider is registered with the Destination_Registry, THE Destination_Registry SHALL make the new provider available in the Send_To_Menu without changes to existing providers or UI components.
4. WHEN a Destination_Provider's `supportedFileTypes` filter does not match the current file's type, THE Send_To_Menu SHALL display that destination as disabled with an explanatory tooltip.

### Requirement 3: Email Destination (Outlook MCP)

**User Story:** As a user, I want to send a file as an email attachment via Outlook, so that I can share agent-produced files with colleagues directly.

#### Acceptance Criteria

1. WHEN the user selects the Email destination, THE Send_To_Menu SHALL display input fields for recipient email address, subject line, and optional message body.
2. WHEN the user confirms the email send, THE Destination_Provider SHALL invoke the existing Outlook MCP_Integration to compose an email with the file attached.
3. IF the Outlook MCP_Integration is not configured or unavailable, THEN THE Email Destination_Provider SHALL display an error message indicating that Outlook MCP is not configured and provide guidance to enable it in settings.
4. THE Email Destination_Provider SHALL support both text and binary file attachments.

### Requirement 4: Quip Destination (Quip MCP)

**User Story:** As a user, I want to upload a file to Quip, so that I can create or append to collaborative documents from agent output.

#### Acceptance Criteria

1. WHEN the user selects the Quip destination, THE Send_To_Menu SHALL display an input field for the target Quip folder or document URL.
2. WHEN the user confirms the Quip upload, THE Destination_Provider SHALL invoke the existing Quip MCP_Integration to create a new document or upload the file to the specified location.
3. IF the Quip MCP_Integration is not configured or unavailable, THEN THE Quip Destination_Provider SHALL display an error message indicating that Quip MCP is not configured and provide guidance to enable it in settings.
4. WHEN the upload completes successfully, THE Quip Destination_Provider SHALL display a clickable link to the created Quip document.

### Requirement 5: S3 Destination (AWS SDK)

**User Story:** As a user, I want to upload a file to an S3 bucket, so that I can persist agent-produced artifacts in cloud storage.

#### Acceptance Criteria

1. WHEN the user selects the S3 destination, THE Send_To_Menu SHALL display input fields for the S3 bucket name and optional key prefix (object path).
2. WHEN the user confirms the S3 upload, THE Destination_Provider SHALL read the file from the server filesystem and upload it to the specified S3 bucket and key using the AWS SDK.
3. IF AWS credentials are not configured or the upload fails, THEN THE S3 Destination_Provider SHALL display a descriptive error message including the AWS error code and message.
4. WHEN the upload completes successfully, THE S3 Destination_Provider SHALL display the resulting S3 URI (`s3://bucket/key`) as a copyable string.
5. THE S3 Destination_Provider SHALL support both text and binary files.

### Requirement 6: Clipboard Destination

**User Story:** As a user, I want to copy a file's text content to my clipboard, so that I can quickly paste it into other applications.

#### Acceptance Criteria

1. WHEN the user selects the Clipboard destination for a text file, THE Destination_Provider SHALL read the file content and copy it to the system clipboard using the browser Clipboard API.
2. WHEN the clipboard copy completes successfully, THE Clipboard Destination_Provider SHALL display a brief success confirmation.
3. THE Clipboard Destination_Provider SHALL set `supportedFileTypes` to text-only, causing the Send_To_Menu to disable this option for binary files (images, PDFs, Excel, etc.).
4. IF the browser Clipboard API is unavailable or the copy fails, THEN THE Clipboard Destination_Provider SHALL display an error message describing the failure.

### Requirement 7: Session Destination (Send to Another Agent Session)

**User Story:** As a user, I want to send a file reference to another active agent session, so that a different agent can use the file as context.

#### Acceptance Criteria

1. WHEN the user selects the Session destination, THE Send_To_Menu SHALL display a list of other active sessions (excluding the current session) with their titles and status.
2. WHEN the user selects a target session and confirms, THE Destination_Provider SHALL send a message to the target session containing the file path as context, using the existing `session.continue` client event mechanism.
3. IF no other sessions are active, THEN THE Session Destination_Provider SHALL display a message indicating no other sessions are available.
4. WHEN the file reference is sent successfully, THE Session Destination_Provider SHALL display a confirmation with the target session title.

### Requirement 8: Send Operation Progress and Feedback

**User Story:** As a user, I want to see progress, success, and error states during a send operation, so that I know whether the file was shared successfully.

#### Acceptance Criteria

1. WHEN a send operation begins, THE FileSidebar SHALL display a progress indicator (spinner) with the destination name and a "Sending..." label.
2. WHEN a send operation completes successfully, THE FileSidebar SHALL display a success message with destination-specific details (e.g., S3 URI, Quip link) for 5 seconds.
3. IF a send operation fails, THEN THE FileSidebar SHALL display an error message with the failure reason and a "Retry" button.
4. WHILE a send operation is in progress, THE Send_To_Menu SHALL disable the "Send To" button to prevent concurrent sends for the same file.

### Requirement 9: Server-Side Send Endpoint

**User Story:** As a developer, I want a server API endpoint that handles send-to requests, so that the UI can delegate file transfer logic to the server where filesystem access and SDK credentials reside.

#### Acceptance Criteria

1. THE Server SHALL expose a `POST /api/files/send-to` endpoint that accepts a Send_To_Request payload containing `filePath` (string), `destination` (string), and `params` (destination-specific object).
2. WHEN the server receives a Send_To_Request, THE Server SHALL validate that the file exists and is readable before delegating to the appropriate Destination_Provider.
3. IF the specified file does not exist or is not readable, THEN THE Server SHALL respond with HTTP 404 and a descriptive error message.
4. IF the specified destination is not registered, THEN THE Server SHALL respond with HTTP 400 and list the available destinations.
5. WHEN the Destination_Provider completes the operation, THE Server SHALL respond with a JSON body containing `success` (boolean), `message` (string), and optional `data` (destination-specific result such as a URL or URI).

### Requirement 10: FileBar Send To Shortcut

**User Story:** As a user, I want to right-click a file chip in the FileBar to access the Send To menu directly, so that I can share files without opening the FileSidebar first.

#### Acceptance Criteria

1. WHEN the user right-clicks a file chip in the FileBar, THE FileBar SHALL display a context menu containing "Open", "Preview", "Download", and "Send To" options.
2. WHEN the user selects "Send To" from the context menu, THE FileBar SHALL open the Send_To_Menu dropdown anchored to the file chip.
3. WHEN the user selects a destination from the FileBar context Send_To_Menu, THE FileBar SHALL open the destination-specific configuration panel in a popover or modal.
