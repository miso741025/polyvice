// What's new in Vice Web: the entries live in changelog.json at the top of the repository, newest first, one per release a player
// would notice: { "date": "YYYY-MM-DD", "en": "One short sentence.", "zh": "一句話。" } (plain text, under about 90 characters).
// It is imported, not fetched, so the web build bundles it into the hashed script and a returning player's cache can never show an old list.
import entries from '../changelog.json' with { type: 'json' };
export const WHATS_NEW = entries;
