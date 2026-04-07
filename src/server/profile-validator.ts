import type { AgentProfile } from './a2a-types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_PLATFORMS = new Set(['any', 'linux', 'cdm', 'windows', 'agentcore']);

/**
 * Validates that a profile object has all required fields with correct types.
 * Used by the registry and tests.
 */
export function validateProfile(profile: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  const p = profile as Record<string, unknown>;

  // id
  if (typeof p.id !== 'string' || p.id.trim() === '') {
    errors.push('id must be a non-empty string');
  }

  // label
  if (typeof p.label !== 'string' || p.label.trim() === '') {
    errors.push('label must be a non-empty string');
  }

  // description
  if (typeof p.description !== 'string' || p.description.trim() === '') {
    errors.push('description must be a non-empty string');
  }

  // platform
  if (typeof p.platform !== 'string' || !VALID_PLATFORMS.has(p.platform)) {
    errors.push(`platform must be one of: ${[...VALID_PLATFORMS].join(', ')}`);
  }

  // skills
  if (!Array.isArray(p.skills) || !p.skills.every((s) => typeof s === 'string')) {
    errors.push('skills must be an array of strings');
  }

  // tools
  if (!Array.isArray(p.tools) || !p.tools.every((t) => typeof t === 'string')) {
    errors.push('tools must be an array of strings');
  }

  // tags
  if (!Array.isArray(p.tags) || !p.tags.every((t) => typeof t === 'string')) {
    errors.push('tags must be an array of strings');
  }

  // cardTemplate
  const ct = p.cardTemplate;
  if (typeof ct !== 'object' || ct === null || Array.isArray(ct)) {
    errors.push('cardTemplate must be a non-null object');
  } else {
    const card = ct as Record<string, unknown>;
    if (typeof card.name !== 'string' || card.name.trim() === '') {
      errors.push('cardTemplate.name must be a non-empty string');
    }
    if (typeof card.description !== 'string' || card.description.trim() === '') {
      errors.push('cardTemplate.description must be a non-empty string');
    }
    if (typeof card.version !== 'string' || card.version.trim() === '') {
      errors.push('cardTemplate.version must be a non-empty string');
    }
    if (!Array.isArray(card.skills)) {
      errors.push('cardTemplate.skills must be an array');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Type guard — returns true and narrows to AgentProfile if the profile is valid.
 */
export function isValidProfile(profile: unknown): profile is AgentProfile {
  return validateProfile(profile).valid;
}
