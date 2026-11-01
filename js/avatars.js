// The cut-paper characters from the Figma file, one transparent WebP each in avatars/.
// The key is what the database stores, so the first six keep the names they always had.
const NAMES = {
  santa: 'Santa',
  'mrs-claus': 'Mrs Claus',
  elf: 'Elf (male)',
  'elf-female': 'Elf (female)',
  snowman: 'Snowman',
  reindeer: 'Reindeer',
  penguin: 'Penguin',
  gingerbread: 'Gingerbread man',
};

export const AVATARS = Object.fromEntries(
  Object.entries(NAMES).map(([key, name]) => [key, `<img src="avatars/${key}.webp" alt="${name}" decoding="async">`]),
);

export const avatar = key => AVATARS[key] || AVATARS.santa;
