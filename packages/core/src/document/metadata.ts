/** What the output file says about itself. Empty fields are left out; nothing is added silently. */
export interface MetadataSettings {
  readonly title: string;
  readonly author: string;
  readonly subject: string;
  readonly keywords: readonly string[];
}

export const NO_METADATA: MetadataSettings = { title: '', author: '', subject: '', keywords: [] };

export const MAX_METADATA_LENGTH = 500;

/** Splits "a, b; c" into keywords: trimmed, without repeats, empty ones dropped. */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (word !== '' && !seen.has(key)) {
      seen.add(key);
      keywords.push(word);
    }
  }
  return keywords;
}

/** Cuts every field to a sensible length and trims it; control characters have no place in it. */
export function cleanMetadata(metadata: MetadataSettings): MetadataSettings {
  const clean = (value: string) =>
    value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_METADATA_LENGTH);
  return {
    title: clean(metadata.title),
    author: clean(metadata.author),
    subject: clean(metadata.subject),
    keywords: parseKeywords(metadata.keywords.map(clean).join(',')),
  };
}

export function hasMetadata(metadata: MetadataSettings): boolean {
  return (
    metadata.title !== '' ||
    metadata.author !== '' ||
    metadata.subject !== '' ||
    metadata.keywords.length > 0
  );
}
