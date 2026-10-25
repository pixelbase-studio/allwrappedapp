const skin = '#f8d5b8';
const eyes = (y, x1 = 27, x2 = 37) => `<circle cx="${x1}" cy="${y}" r="2" fill="#2b2b2b"/><circle cx="${x2}" cy="${y}" r="2" fill="#2b2b2b"/>`;
const svg = (label, body) => `<svg viewBox="0 0 64 64" role="img" aria-label="${label}">${body}</svg>`;

export const AVATARS = {
  santa: svg('Santa', `<circle cx="32" cy="35" r="14" fill="${skin}"/>
    <path d="M17 37 Q32 66 47 37 Q41 45 32 43 Q23 45 17 37Z" fill="#fff"/>
    <path d="M16 28 Q28 2 49 11 L47 28Z" fill="#d42a2a"/><rect x="13" y="24" width="38" height="8" rx="4" fill="#fff"/>
    <circle cx="50" cy="12" r="5" fill="#fff"/>${eyes(35)}<circle cx="32" cy="39" r="2.5" fill="#e98a8a"/>`),
  elf: svg('Elf', `<path d="M18 36 L6 27 L20 43Z M46 36 L58 27 L44 43Z" fill="${skin}"/><circle cx="32" cy="39" r="14" fill="${skin}"/>
    <path d="M17 31 L32 4 L47 31Z" fill="#2e8b3e"/><rect x="16" y="28" width="32" height="6" rx="3" fill="#d42a2a"/>
    <circle cx="32" cy="5" r="3.5" fill="#f5c542"/>${eyes(39)}<circle cx="24" cy="44" r="2.5" fill="#f3a3a3"/><circle cx="40" cy="44" r="2.5" fill="#f3a3a3"/>
    <path d="M27 46 Q32 50 37 46" stroke="#2b2b2b" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  snowman: svg('Snowman', `<circle cx="32" cy="48" r="14" fill="#fff" stroke="#c9d3df" stroke-width="2"/>
    <circle cx="32" cy="27" r="11" fill="#fff" stroke="#c9d3df" stroke-width="2"/>
    <rect x="24" y="5" width="16" height="11" fill="#2b2b2b"/><rect x="20" y="15" width="24" height="3" rx="1" fill="#2b2b2b"/>
    ${eyes(25, 28, 36)}<path d="M32 28 L41 30 L32 31Z" fill="#f08a24"/><rect x="21" y="36" width="22" height="4" rx="2" fill="#d42a2a"/>
    <circle cx="32" cy="46" r="1.8" fill="#2b2b2b"/><circle cx="32" cy="52" r="1.8" fill="#2b2b2b"/>`),
  reindeer: svg('Reindeer', `<path d="M23 22 L16 6 M19 13 L11 11 M41 22 L48 6 M45 13 L53 11" stroke="#8a5a2b" stroke-width="3.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="17" cy="28" rx="6" ry="3.5" fill="#a0673a"/><ellipse cx="47" cy="28" rx="6" ry="3.5" fill="#a0673a"/>
    <ellipse cx="32" cy="38" rx="14" ry="17" fill="#a0673a"/><ellipse cx="32" cy="47" rx="8" ry="6" fill="#d9a877"/>
    ${eyes(34)}<circle cx="32" cy="43" r="4.5" fill="#e3262f"/>`),
  penguin: svg('Penguin', `<ellipse cx="32" cy="37" rx="18" ry="22" fill="#2b2f3a"/><ellipse cx="32" cy="41" rx="12" ry="16" fill="#fff"/>
    ${eyes(32, 28, 36)}<path d="M28 36 L36 36 L32 41Z" fill="#f5a524"/>
    <path d="M16 20 Q32 4 48 20Z" fill="#d42a2a"/><circle cx="32" cy="9" r="3.5" fill="#fff"/>`),
  gingerbread: svg('Gingerbread person', `<circle cx="32" cy="16" r="10" fill="#c7813e"/>
    <path d="M20 27 H44 L54 35 L50 40 L42 35 V43 L48 56 L42 59 L32 47 L22 59 L16 56 L22 43 V35 L14 40 L10 35Z" fill="#c7813e"/>
    <circle cx="28" cy="14" r="1.8" fill="#fff"/><circle cx="36" cy="14" r="1.8" fill="#fff"/>
    <path d="M28 19 Q32 22 36 19" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="2.2" fill="#d42a2a"/><circle cx="32" cy="39" r="2.2" fill="#2e8b3e"/>`),
};

export const avatar = key => AVATARS[key] || AVATARS.santa;
