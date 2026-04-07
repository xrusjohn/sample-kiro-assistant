// Keyword-to-tag mapping for capability-based routing
export const KEYWORD_TAG_MAP: Record<string, string[]> = {
  diagram: ['diagrams'],
  diagrams: ['diagrams'],
  mermaid: ['diagrams'],
  plantuml: ['diagrams'],
  architecture: ['diagrams'],
  email: ['email', 'outlook'],
  outlook: ['email', 'outlook'],
  calendar: ['calendar', 'outlook'],
  pdf: ['pdf'],
  document: ['pdf'],
  powershell: ['powershell', 'windows'],
  windows: ['windows'],
  filesystem: ['files'],
  workshop: ['workshop'],
  'workshops.aws': ['workshop'],
  'workshop studio': ['workshop'],
  'knowledge base': ['knowledge'],
  'index knowledge': ['knowledge'],
};

/**
 * Extract tags from a prompt string using the keyword-to-tag mapping.
 * Returns a deduplicated array of tags.
 */
export function extractTagsFromPrompt(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const tags = new Set<string>();
  for (const [keyword, mappedTags] of Object.entries(KEYWORD_TAG_MAP)) {
    if (lower.includes(keyword)) {
      for (const tag of mappedTags) tags.add(tag);
    }
  }
  return Array.from(tags);
}
