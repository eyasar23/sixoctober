import { grappleMode } from './grapple';
import type { ModeDefinition } from './modeBand';
import { titanMode } from './titan';

/**
 * Every mode on the band, in Tab order (key 1 = first). A new mode is a new file like
 * titan.ts plus one entry here.
 */
export const MODE_LIST: readonly ModeDefinition[] = [grappleMode, titanMode];

export { grappleMode, titanMode };
