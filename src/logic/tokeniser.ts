import type { Entry } from '../types';

export interface Token {
  text: string;
  entryId: number | null;
}

export function tokenise(sentence: string, entries: Entry[]): Token[] {
  // Split into word parts and punctuation
  const parts = sentence.match(/[a-zA-ZäöüÄÖÜß0-9]+|[^a-zA-ZäöüÄÖÜß0-9\s]/g) ?? [];

  // Sort entries by word count descending (greedy multi-word matching)
  const sorted = [...entries].sort((a, b) => {
    const aWords = a.german.trim().split(/\s+/).length;
    const bWords = b.german.trim().split(/\s+/).length;
    return bWords - aWords;
  });

  const tokens: Token[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];

    // Skip punctuation tokens
    if (!/[a-zA-ZäöüÄÖÜß0-9]/.test(part)) {
      tokens.push({ text: part, entryId: null });
      i++;
      continue;
    }

    // Try to match entries (longest first)
    let matched = false;
    for (const entry of sorted) {
      const entryWords = entry.german.trim().split(/\s+/);
      const wordCount = entryWords.length;

      if (wordCount < 1) continue;

      // Collect the next wordCount consecutive word-parts from parts array
      // We need to skip punctuation when counting words for multi-word matching
      if (wordCount === 1) {
        // Single word match
        if (entryWords[0].toLowerCase() === part.toLowerCase()) {
          tokens.push({ text: part, entryId: entry.id ?? null });
          i++;
          matched = true;
          break;
        }
      } else {
        // Multi-word match: collect next wordCount word-parts (non-punctuation)
        const wordParts: string[] = [];
        const wordPartIndices: number[] = [];
        let j = i;
        while (wordParts.length < wordCount && j < parts.length) {
          if (/[a-zA-ZäöüÄÖÜß0-9]/.test(parts[j])) {
            wordParts.push(parts[j]);
            wordPartIndices.push(j);
          }
          j++;
        }

        if (wordParts.length === wordCount) {
          const allMatch = entryWords.every(
            (w, idx) => w.toLowerCase() === wordParts[idx].toLowerCase()
          );
          if (allMatch) {
            // Emit all parts (word parts + any punctuation between) as one token
            const joinedText = wordParts.join(' ');
            tokens.push({ text: joinedText, entryId: entry.id ?? null });
            // Advance past the last word part index
            i = wordPartIndices[wordPartIndices.length - 1] + 1;
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      tokens.push({ text: part, entryId: null });
      i++;
    }
  }

  return tokens;
}
