// Shared A2A type definitions used across registry, validator, and store.

export type Platform = 'any' | 'linux' | 'cdm' | 'windows' | 'agentcore';
export type InstanceStatus = 'online' | 'offline' | 'degraded' | 'unknown';

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  skills: Array<{ id: string; name: string; tags: string[]; [key: string]: unknown }>;
  platform?: Platform;
  [key: string]: unknown;
}

export interface AgentProfile {
  id: string;
  label: string;
  description: string;
  platform: Platform;
  skills: string[];
  tools: string[];
  tags: string[];
  cardTemplate: AgentCard;
}

export interface AgentInstance {
  id: string;
  profileId: string;
  url: string;
  platform: Platform;
  card: AgentCard;
  metadata: Record<string, unknown>;
  registeredAt: number; // epoch ms
  lastSeen: number;     // epoch ms
  status: InstanceStatus;
  degradedReason?: string;  // e.g. 'credentials-expired', 'acp-crashed'
}

export interface CoverageEntry {
  online: number;
  offline: number;
  degraded: number;
}

export type Coverage = Record<Platform, CoverageEntry>;
