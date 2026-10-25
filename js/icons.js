// One icon set: rounded line drawings in the current text colour, to sit beside the avatars.
const PATHS = {
  tree: '<path d="M12 3l5 6h-3l4 5h-3l4 5H5l4-5H6l4-5H7z"/><path d="M12 19v3"/>',
  pound: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5a2.5 2.5 0 0 0-5 0c0 2 1 3 1 5s-1 2.5-2 3h7M8.5 13h5"/>',
  gear: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13.5h18M12 9v12"/><path d="M12 9C10.5 6 7 5 7 7.5S10 9 12 9zm0 0c1.5-3 5-4 5-1.5S14 9 12 9z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.3-1-1.4-1-2.6 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><path d="M7.5 11h.01M10 7h.01M15 7.5h.01"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  child: '<circle cx="12" cy="13" r="7"/><path d="M9.5 15.5a3 3 0 0 0 5 0M9.5 12h.01M14.5 12h.01"/><path d="M12 6c0-2 2-3 3.5-2"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  bow: '<path d="M12 11C9 7 4 6 4 9s5 3 8 2zm0 0c3-4 8-5 8-2s-5 3-8 2z"/><path d="M12 11l-3 7M12 11l3 7"/>',
};

export const icon = name => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
