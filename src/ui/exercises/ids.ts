// Exercise ids per lesson (for mastery). Filled from the static practice index.
import { PRACTICE_INDEX } from './index-data';
export const practiceIds = (lesson: number): string[] => PRACTICE_INDEX[lesson] ?? [];
