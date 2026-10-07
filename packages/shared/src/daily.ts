/** A local calendar date, never the UTC date of a user's instant. */
export function localDate(now: Date, timeZone: string): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid instant');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// v1 is immutable: changing order/length changes date assignments. Add a new
// version with an effective local date rather than editing this published pool.
const scriptures = [
  {
    id: 'kjv-proverbs-16-3',
    book: 'Proverbs',
    chapter: 16,
    verse: 3,
    text: 'Commit thy works unto the LORD, and thy thoughts shall be established.',
  },
  {
    id: 'kjv-psalms-46-10',
    book: 'Psalms',
    chapter: 46,
    verse: 10,
    text: 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.',
  },
  {
    id: 'kjv-james-1-5',
    book: 'James',
    chapter: 1,
    verse: 5,
    text: 'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.',
  },
  {
    id: 'kjv-proverbs-4-23',
    book: 'Proverbs',
    chapter: 4,
    verse: 23,
    text: 'Keep thy heart with all diligence; for out of it are the issues of life.',
  },
  {
    id: 'kjv-matthew-6-34',
    book: 'Matthew',
    chapter: 6,
    verse: 34,
    text: 'Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself. Sufficient unto the day is the evil thereof.',
  },
  {
    id: 'kjv-psalms-119-105',
    book: 'Psalms',
    chapter: 119,
    verse: 105,
    text: 'Thy word is a lamp unto my feet, and a light unto my path.',
  },
  {
    id: 'kjv-micah-6-8',
    book: 'Micah',
    chapter: 6,
    verse: 8,
    text: 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?',
  },
] as const;

const thoughts = [
  'A clear priority is a decision about what can wait.',
  'Protect the hours in which your most important work can happen.',
  'Let the work you finish reflect the life you intend to build.',
  'Progress begins when attention becomes a deliberate choice.',
  'Make a promise small enough to keep and important enough to matter.',
  'An honest review is an investment in better judgment.',
  'Ambition needs direction. Direction needs the courage to say no.',
] as const;

export function dailyContent(now: Date, timeZone: string) {
  const date = localDate(now, timeZone);
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const index = ((day % scriptures.length) + scriptures.length) % scriptures.length;
  return {
    date,
    scripture: { ...scriptures[index]!, translation: 'KJV' as const },
    thought: { id: `life-os-v1-${index}`, text: thoughts[index]!, author: 'Life OS' },
  };
}
