import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { echelle, fmtEchelle, groupeDe, ordonner } from './telemetrie';

// ---------------------------------------------------------------------------
// Export de TOUTES les courbes en une image PNG (toute la durée d'utilisation).
// Aucune bibliothèque d'image : on dessine les pixels nous-mêmes (rectangles,
// lignes, petite police intégrée), on fabrique le PNG, on l'écrit dans un
// fichier temporaire puis on ouvre la feuille de partage de l'iPhone
// (« Enregistrer l'image », AirDrop, Messages, Fichiers…).
// ---------------------------------------------------------------------------

// --- petite police 5x7 (majuscules, chiffres, quelques signes) -------------
// (chaque lettre = 7 lignes de 5 points)
const LIGNES = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '°': ['.##..', '#..#.', '#..#.', '.##..', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};

const CHIFFRES = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
};
Object.assign(LIGNES, CHIFFRES);

const sansAccent = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

// --- image indexée (1 octet par pixel) --------------------------------------
const PALETTE = [
  [11, 15, 20], // 0 fond
  [17, 24, 33], // 1 cadre
  [38, 49, 63], // 2 grille
  [143, 163, 189], // 3 texte discret
  [241, 245, 249], // 4 texte clair
  [75, 91, 112], // 5 ligne du zéro
  [56, 189, 248], // 6.. couleurs des courbes
  [245, 158, 11],
  [34, 197, 94],
  [244, 114, 182],
  [167, 139, 250],
  [251, 113, 133],
  [45, 212, 191],
  [250, 204, 21],
  [255, 255, 255], // 14 blanc
  [107, 124, 147], // 15 gris (mesures sans capteur)
];
// couleur de chaque groupe de capteurs (indices de la palette ci-dessus)
const COULEUR_GROUPE = { gps: 6, mpu: 7, mag: 10, carte: 8, aucun: 15 };

function creerImage(w, h) {
  const px = new Uint8Array(w * h); // tout à 0 = fond
  const rect = (x, y, rw, rh, c) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(w, Math.round(x + rw));
    const y1 = Math.min(h, Math.round(y + rh));
    for (let j = y0; j < y1; j++) px.fill(c, j * w + x0, j * w + Math.max(x0, x1));
  };
  const ligne = (xa, ya, xb, yb, ep, c) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya))));
    for (let i = 0; i <= n; i++) {
      const x = xa + ((xb - xa) * i) / n;
      const y = ya + ((yb - ya) * i) / n;
      rect(x - ep / 2, y - ep / 2, ep, ep, c);
    }
  };
  const largeurTexte = (txt, k) => sansAccent(txt).length * 6 * k - k;
  const texte = (txt, x, y, k, c, align) => {
    const t = sansAccent(txt);
    let cx = align === 'right' ? x - largeurTexte(txt, k) : x;
    for (const ch of t) {
      const g = LIGNES[ch];
      if (g) {
        for (let r = 0; r < 7; r++)
          for (let q = 0; q < 5; q++) if (g[r][q] === '#') rect(cx + q * k, y + r * k, k, k, c);
      }
      cx += 6 * k;
    }
  };
  return { w, h, px, rect, ligne, texte, largeurTexte };
}

// --- encodage PNG (palette, sans compression) --------------------------------
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf, debut, fin) => {
  let c = 0xffffffff;
  for (let i = debut; i < fin; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const adler32 = (buf) => {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
};

export function encoderPNG(img) {
  const { w, h, px } = img;
  // lignes brutes : 1 octet de filtre (0) + les pixels
  const brut = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) brut.set(px.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);

  // flux zlib "stocké" (blocs de 65535 octets max)
  const nbBlocs = Math.ceil(brut.length / 65535);
  const zlib = new Uint8Array(2 + brut.length + nbBlocs * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let o = 2;
  for (let i = 0; i < nbBlocs; i++) {
    const debut = i * 65535;
    const len = Math.min(65535, brut.length - debut);
    zlib[o++] = i === nbBlocs - 1 ? 1 : 0;
    zlib[o++] = len & 0xff;
    zlib[o++] = len >>> 8;
    zlib[o++] = ~len & 0xff;
    zlib[o++] = (~len >>> 8) & 0xff;
    zlib.set(brut.subarray(debut, debut + len), o);
    o += len;
  }
  const ad = adler32(brut);
  zlib[o++] = ad >>> 24;
  zlib[o++] = (ad >>> 16) & 0xff;
  zlib[o++] = (ad >>> 8) & 0xff;
  zlib[o++] = ad & 0xff;

  const plte = new Uint8Array(PALETTE.length * 3);
  PALETTE.forEach((c, i) => plte.set(c, i * 3));
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 3; // palette

  const morceaux = [
    ['IHDR', ihdr],
    ['PLTE', plte],
    ['IDAT', zlib],
    ['IEND', new Uint8Array(0)],
  ];
  let total = 8;
  for (const [, d] of morceaux) total += 12 + d.length;
  const png = new Uint8Array(total);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let p = 8;
  for (const [nom, d] of morceaux) {
    const dvp = new DataView(png.buffer);
    dvp.setUint32(p, d.length);
    for (let i = 0; i < 4; i++) png[p + 4 + i] = nom.charCodeAt(i);
    png.set(d, p + 8);
    dvp.setUint32(p + 8 + d.length, crc32(png, p + 4, p + 8 + d.length));
    p += 12 + d.length;
  }
  return png;
}

// --- mise en page des courbes -------------------------------------------------
const fmt = (v) => String(parseFloat(Number(v).toPrecision(7)));
const duree = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function dessinerCourbes(historique, dateTxt) {
  const noms = ordonner(Object.keys(historique).filter((k) => historique[k] && historique[k].length >= 2));
  const W = 1600;
  const CELL_W = 780;
  const CELL_H = 300;
  const MARGE = 20;
  const HAUT = 96;
  const lignes = Math.max(1, Math.ceil(noms.length / 2));
  const H = HAUT + lignes * (CELL_H + MARGE) + MARGE;
  const img = creerImage(W, H);

  let tmin = Infinity;
  let tmax = -Infinity;
  for (const k of noms) {
    const s = historique[k];
    tmin = Math.min(tmin, s[0].t);
    tmax = Math.max(tmax, s[s.length - 1].t);
  }
  const dureeTotale = noms.length ? tmax - tmin : 0;

  img.texte('COURBES DU DRONE', MARGE, 18, 5, 4);
  img.texte(`DUREE ${duree(dureeTotale)}   ${dateTxt || ''}`, MARGE, 62, 3, 3);

  if (!noms.length) {
    img.texte('AUCUNE DONNEE ENREGISTREE', MARGE, HAUT + 20, 4, 3);
    return img;
  }

  noms.forEach((nom, i) => {
    const col = i % 2;
    const lig = Math.floor(i / 2);
    const x = MARGE + col * (CELL_W + MARGE);
    const y = HAUT + lig * (CELL_H + MARGE);
    const serie = historique[nom];
    const groupe = groupeDe(nom);
    const couleur = COULEUR_GROUPE[groupe.id];

    img.rect(x, y, CELL_W, CELL_H, 1);

    let min = Infinity;
    let max = -Infinity;
    for (const p of serie) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    const { ymin, ymax, plage } = echelle(min, max);

    img.texte(nom, x + 16, y + 12, 3, 4);
    // capteur d'origine, en haut à droite, dans la couleur de son groupe
    img.texte(groupe.titre + ' - ' + groupe.detail, x + CELL_W - 16, y + 16, 2, couleur, 'right');
    const dernier = serie[serie.length - 1].v;
    img.texte(`MAX ${fmt(max)}   MIN ${fmt(min)}   FIN ${fmt(dernier)}`, x + 16, y + 38, 2, 3);

    const gauche = x + 92;
    const droite = x + CELL_W - 24;
    const haut = y + 62;
    const bas = y + CELL_H - 44;
    const X = (t) => gauche + ((t - tmin) / (dureeTotale || 1)) * (droite - gauche);
    const Y = (v) => haut + (1 - (v - ymin) / plage) * (bas - haut);

    for (const f of [0, 0.5, 1]) {
      const yy = haut + f * (bas - haut);
      img.rect(gauche, yy - 1, droite - gauche, 2, 2);
      img.texte(fmtEchelle(ymax - f * plage, plage), gauche - 10, yy - 7, 2, 3, 'right');
    }
    if (ymin < 0) img.rect(gauche, Y(0) - 1, droite - gauche, 3, 5);

    // repères de temps : début, milieu, fin
    for (const f of [0, 0.5, 1]) {
      const t = tmin + f * dureeTotale;
      const xx = X(t);
      img.rect(xx - 1, haut, 2, bas - haut, 2);
      const lab = duree(t - tmin);
      const lw = img.largeurTexte(lab, 2);
      const lx = f === 0 ? xx : f === 1 ? xx - lw : xx - lw / 2;
      img.texte(lab, lx, bas + 12, 2, 3);
    }

    for (let j = 1; j < serie.length; j++) {
      img.ligne(X(serie[j - 1].t), Y(serie[j - 1].v), X(serie[j].t), Y(serie[j].v), 3, couleur);
    }
    const fin = serie[serie.length - 1];
    img.rect(X(fin.t) - 6, Y(fin.v) - 6, 12, 12, 14);
    img.rect(X(fin.t) - 4, Y(fin.v) - 4, 8, 8, couleur);
  });
  return img;
}

// --- base64 (pour le plan B du partage) --------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function versBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

export function genererPNG(historique) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const dateTxt = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return encoderPNG(dessinerCourbes(historique, dateTxt));
}

// Crée l'image puis ouvre la feuille de partage. Retourne un court message.
export async function exporterCourbes(historique) {
  const png = genererPNG(historique);
  try {
    const fichier = new File(Paths.cache, 'courbes-drone.png');
    if (fichier.exists) fichier.delete();
    fichier.create();
    fichier.write(png);
    await Share.share({ url: fichier.uri });
    return 'Image prête';
  } catch (e) {
    // plan B : on donne l'image directement à la feuille de partage
    try {
      await Share.share({ url: `data:image/png;base64,${versBase64(png)}` });
      return 'Image prête';
    } catch (e2) {
      return "Export impossible : " + (e2 && e2.message ? e2.message : 'erreur');
    }
  }
}
