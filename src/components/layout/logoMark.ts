export const LOGO_NAME = 'Devora';
export const LOGO_WORDMARK = 'DEVOR';

export const LOGO_MARK_VIEWBOX = '0 0 78 80';

// Recadré sur les tracés (sans l'approche gauche), pour un usage isolé type favicon.
export const LOGO_MARK_TIGHT_VIEWBOX = '12 8 66 72';

export const LOGO_MARK_PATHS = [
	'M 12 80 L 46 8 L 66 8 L 32 80 Z',
	'M 44 8 L 78 80 L 58 80 L 24 8 Z',
	'M 22 56 L 42 42 L 42 56 L 30 64 L 56 64 L 56 74 L 18 74 Z',
];

// Lockup source : wordmark à font-size 92 / letter-spacing 3, glyphe "A" de 78×80.
const SOURCE_FONT_SIZE = 92;
const SOURCE_MARK_WIDTH = 78;
const SOURCE_MARK_HEIGHT = 80;
const SOURCE_LETTER_SPACING = 3;

// Exprimés en em pour que le glyphe suive la taille de police du wordmark.
export const LOGO_MARK_WIDTH_EM = SOURCE_MARK_WIDTH / SOURCE_FONT_SIZE;
export const LOGO_MARK_HEIGHT_EM = SOURCE_MARK_HEIGHT / SOURCE_FONT_SIZE;
export const LOGO_LETTER_SPACING_EM = SOURCE_LETTER_SPACING / SOURCE_FONT_SIZE;
