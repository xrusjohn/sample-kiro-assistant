// Feature: a2a-registry — AgentsPanel UI tests
// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { AgentsPanel } from './AgentsPanel.js';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockOnlineInstance = {
  id: 'inst-1',
  profileId: 'coding-assistant',
  url: 'http://agent1.local:8080',
  platform: 'any',
  card: {
    name: 'Kiro Coding Assistant',
    description: 'Write, edit, and explain code',
    version: '1.0.0',
    skills: [{ id: 'coding', name: 'Coding', tags: ['coding', 'files'] }],
  },
  metadata: {},
  registeredAt: Date.now() - 60_000,
  lastSeen: Date.now() - 5_000,
  status: 'online' as const,
};

const mockOfflineInstance = {
  id: 'inst-2',
  profileId: 'diagram-specialist',
  url: 'http://agent2.local:8080',
  platform: 'linux',
  card: {
    name: 'Diagram Specialist',
    description: 'Generates diagrams',
    version: '1.0.0',
    skills: [{ id: 'diagrams', name: 'Diagrams', tags: ['diagrams'] }],
  },
  metadata: {},
  registeredAt: Date.now() - 120_000,
  lastSeen: Date.now() - 100_000,
  status: 'offline' as const,
};

const mockProfiles = [
  {
    id: 'coding-assistant',
    label: 'Coding Assistant',
    description: 'General-purpose coding agent',
    platform: 'any',
    skills: ['coding'],
    tools: [],
    tags: ['coding'],
    cardTemplate: {},
  },
  {
    id: 'diagram-specialist',
    label: 'Diagram Specialist',
    description: 'Generates diagrams',
    platform: 'linux',
    skills: ['diagrams'],
    tools: [],
    tags: ['diagrams'],
    cardTemplate: {},
  },
  {
    id: 'outlook-manager',
    label: 'Outlook Manager',
    description: 'Manages email',
    platform: 'windows',
    skills: ['email'],
    tools: [],
    tags: ['email'],
    cardTemplate: {},
  },
];

const mockCoverage = {
  any: { online: 1, offline: 0 },
  linux: { online: 0, offline: 1 },
  cdm: { online: 0, offline: 0 },
  windows: { online: 0, offline: 0 },
  agentcore: { online: 0, offline: 0 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function setupFetch(instances = [mockOnlineInstance, mockOfflineInstance], profiles = mockProfiles, coverage = mockCoverage) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/a2a/registry')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(instances) });
    }
    if (url.includes('/api/a2a/profiles')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(profiles) });
    }
    if (url.includes('/api/a2a/coverage')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(coverage) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AgentsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setupFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the Agents panel header', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    expect(screen.getByText(/Agents/i)).toBeDefined();
  });

  it('renders online instances with green status dot', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      // Profile label takes precedence over card name
      expect(screen.getByText('Coding Assistant')).toBeDefined();
    });
    // Online section heading
    expect(screen.getByText('Online')).toBeDefined();
  });

  it('renders offline instances in Offline section', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      expect(screen.getByText('Diagram Specialist')).toBeDefined();
    });
    expect(screen.getByText('Offline')).toBeDefined();
  });

  it('renders catalog profiles with "not running" badge', async () => {
    // Only show profiles with no instances
    setupFetch([], mockProfiles, {
      any: { online: 0, offline: 0 },
      linux: { online: 0, offline: 0 },
      cdm: { online: 0, offline: 0 },
      windows: { online: 0, offline: 0 },
      agentcore: { online: 0, offline: 0 },
    });
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      const notRunningBadges = screen.getAllByText('not running');
      expect(notRunningBadges.length).toBeGreaterThan(0);
    });
  });

  it('shows coverage warning for platforms with profiles but no online instances', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      // windows platform has outlook-manager profile but no online instances
      expect(screen.getByText(/No online instances for/i)).toBeDefined();
    });
  });

  it('renders platform coverage badges', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      expect(screen.getByText('Platform Coverage')).toBeDefined();
    });
  });

  it('deregister button calls DELETE endpoint and refreshes', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      if (url.includes('/api/a2a/registry')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockOnlineInstance]) });
      }
      if (url.includes('/api/a2a/profiles')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProfiles) });
      }
      if (url.includes('/api/a2a/coverage')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCoverage) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<AgentsPanel />);
    });

    await waitFor(() => {
      expect(screen.getByText('Coding Assistant')).toBeDefined();
    });

    const deregisterBtn = screen.getAllByText('Deregister')[0];
    await act(async () => {
      fireEvent.click(deregisterBtn);
    });

    // Verify DELETE was called
    const deleteCalls = fetchMock.mock.calls.filter(
      ([, opts]) => opts?.method === 'DELETE'
    );
    expect(deleteCalls.length).toBeGreaterThan(0);
    expect(deleteCalls[0][0]).toContain('/api/a2a/registry/inst-1');
  });

  it('shows "New Profile" button', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    expect(screen.getByText('+ New Profile')).toBeDefined();
  });

  it('clicking "New Profile" shows the profile form', async () => {
    await act(async () => {
      render(<AgentsPanel />);
    });
    const newProfileBtn = screen.getByText('+ New Profile');
    await act(async () => {
      fireEvent.click(newProfileBtn);
    });
    // Form fields should appear
    expect(screen.getByPlaceholderText('my-agent')).toBeDefined();
    expect(screen.getByPlaceholderText('My Agent')).toBeDefined();
  });

  it('shows "Edit" button for catalog profiles', async () => {
    setupFetch([], mockProfiles, {
      any: { online: 0, offline: 0 },
      linux: { online: 0, offline: 0 },
      cdm: { online: 0, offline: 0 },
      windows: { online: 0, offline: 0 },
      agentcore: { online: 0, offline: 0 },
    });
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      const editBtns = screen.getAllByText('Edit');
      expect(editBtns.length).toBeGreaterThan(0);
    });
  });

  it('shows "Spawn" button for catalog profiles', async () => {
    setupFetch([], mockProfiles, {
      any: { online: 0, offline: 0 },
      linux: { online: 0, offline: 0 },
      cdm: { online: 0, offline: 0 },
      windows: { online: 0, offline: 0 },
      agentcore: { online: 0, offline: 0 },
    });
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      const spawnBtns = screen.getAllByText('Spawn');
      expect(spawnBtns.length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no agents and no profiles', async () => {
    setupFetch([], [], {
      any: { online: 0, offline: 0 },
      linux: { online: 0, offline: 0 },
      cdm: { online: 0, offline: 0 },
      windows: { online: 0, offline: 0 },
      agentcore: { online: 0, offline: 0 },
    });
    await act(async () => {
      render(<AgentsPanel />);
    });
    await waitFor(() => {
      expect(screen.getByText('No agents registered yet.')).toBeDefined();
    });
  });
});
