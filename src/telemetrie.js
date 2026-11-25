// ---------------------------------------------------------------------------
// Télémétrie : lecture de la réponse de la carte + simulation (mode démo).
// La carte répond "OK;cle=valeur;cle=valeur" (ex. "OK;GPS alt=12.4 m;roulis=1.5").
// ---------------------------------------------------------------------------

// "OK;batt=7.4;GPS lat=48.85" -> [["batt","7.4"], ["GPS lat","48.85"]]
export const lireCapteurs = (texte) =>
  texte
    .split(';')
    .filter((p) => p.includes('='))
    .map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    });

// "12.4" -> 12.4 ; "12.4 m" -> 12.4 ; "180 °" -> 180 ; "abc" -> null
export const nombre = (txt) => {
  const m = String(txt).trim().replace(',', '.').match(/^-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

// vrai si la valeur est un nombre seul (sans unité déjà écrite par la carte)
export const estNombrePur = (txt) => /^-?\d+(?:[.,]\d+)?$/.test(String(txt).trim());

// Unité affichée derrière la valeur quand la carte n'en envoie pas
const UNITES = [
  ['alt', ' m'],
  ['vitesse', ' km/h'],
  ['batt', ' V'],
  ['temp', ' °C'],
  ['roulis', '°'],
  ['tangage', '°'],
  ['moteur', ' %'],
];
export const unite = (nom) => {
  const n = nom.toLowerCase();
  const u = UNITES.find(([k]) => n.includes(k));
  return u ? u[1] : '';
};

// ---------------------------------------------------------------------------
// Groupes : chaque mesure vient d'un capteur précis. L'ordre ci-dessous est
// l'ordre d'affichage (les mesures sans capteur sont tout à la fin).
// ---------------------------------------------------------------------------
export const GROUPES = [
  { id: 'gps', titre: 'GPS', detail: 'Adafruit Ultimate GPS', couleur: '#38bdf8', test: (k) => /^gps\b/i.test(k) },
  {
    id: 'mpu',
    titre: 'MPU6050',
    detail: 'accéléromètre + gyroscope',
    couleur: '#f59e0b',
    test: (k) => /^(accel|gyro)\b/i.test(k) || /^(roulis|tangage)$/i.test(k),
  },
  { id: 'mag', titre: 'BMM150', detail: 'magnétomètre (boussole)', couleur: '#a78bfa', test: (k) => /^mag\b/i.test(k) },
  {
    id: 'mot',
    titre: 'Moteurs',
    detail: 'puissance commandée aux 4 ESC (pas une mesure)',
    couleur: '#fb7185',
    test: (k) => /^moteur\b/i.test(k),
  },
  { id: 'carte', titre: 'Carte Arduino', detail: 'temps de fonctionnement', couleur: '#22c55e', test: (k) => /^carte\b/i.test(k) },
  { id: 'aucun', titre: 'Sans capteur', detail: 'pas encore de capteur branché', couleur: '#6b7c93', test: () => true },
];

export const groupeDe = (cle) => GROUPES.find((g) => g.test(cle));

// "GPS lat" -> "lat" ; "Mag cap" -> "cap" ; "Accel x" reste "Accel x"
export const NOMS_MOTEURS = ['avant gauche', 'avant droite', 'arrière gauche', 'arrière droite'];

// Les 4 puissances (en %) que la carte dit appliquer : [m1, m2, m3, m4] ou null si elle ne les envoie pas
export const moteursDe = (capteurs) => {
  const d = {};
  for (const [k, v] of capteurs) d[k.toLowerCase()] = nombre(v);
  const m = [1, 2, 3, 4].map((i) => d[`moteur ${i}`]);
  return m.every((v) => v != null) ? m : null;
};

export const nomCourt = (cle) => {
  const g = groupeDe(cle);
  if (g && g.id === 'mot') {
    const i = parseInt(cle.replace(/\D+/g, ''), 10);
    return NOMS_MOTEURS[i - 1] ? `${i} · ${NOMS_MOTEURS[i - 1]}` : cle;
  }
  if (g && (g.id === 'gps' || g.id === 'mag' || g.id === 'carte')) {
    const reste = cle.replace(/^\S+\s*/, '');
    return reste || cle;
  }
  return cle;
};

// Range une liste de clés par groupe : [{ groupe, cles: [...] }, ...] (groupes vides retirés)
export const parGroupe = (cles) =>
  GROUPES.map((g) => ({ groupe: g, cles: cles.filter((k) => groupeDe(k).id === g.id) })).filter(
    (b) => b.cles.length > 0
  );

// Liste de clés dans l'ordre d'affichage (groupe par groupe)
export const ordonner = (cles) => parGroupe(cles).flatMap((b) => b.cles);

// ---------------------------------------------------------------------------
// Échelle d'une courbe.
// - valeurs qui varient de 0 vers un maximum (altitude, vitesse…) : de 0 au max
// - valeurs presque constantes loin de 0 (latitude 48.8566…) : zoom sur la plage
// ---------------------------------------------------------------------------
const pasJoli = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function echelle(min, max) {
  const etendue = max - min;
  const loin = min > 0 && etendue < 0.2 * max; // plage étroite, loin de zéro
  if (!loin && min >= 0) {
    const ymax = max > 0 ? pasJoli(max) : 1;
    return { ymin: 0, ymax, plage: ymax };
  }
  if (max <= 0 && min < 0 && etendue >= 0.2 * -min) {
    const ymin = -pasJoli(-min);
    return { ymin, ymax: 0, plage: -ymin };
  }
  if (min < 0 && max > 0) {
    const ymin = -pasJoli(-min);
    const ymax = pasJoli(max);
    return { ymin, ymax, plage: ymax - ymin };
  }
  const pas = pasJoli((etendue > 0 ? etendue : Math.abs(min) * 0.01 || 1) / 2);
  const ymin = Math.floor(min / pas) * pas;
  let ymax = Math.ceil(max / pas) * pas;
  if (ymax === ymin) ymax = ymin + pas;
  return { ymin, ymax, plage: ymax - ymin };
}

// Texte d'une graduation, avec assez de décimales pour la plage affichée
export const fmtEchelle = (v, plage) => {
  const dec = Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(plage || 1))));
  const t = Number(v).toFixed(dec);
  return dec > 0 ? t.replace(/\.?0+$/, '') : t;
};

// ---------------------------------------------------------------------------
// Mode démo : fausses mesures, mêmes noms et mêmes unités que le sketch Arduino
// (GPS, MPU6050, BMM150, carte), plus quelques mesures "sans capteur" à la fin.
// ---------------------------------------------------------------------------
const f = (v, n) => Number(v).toFixed(n);

export function creerDemo() {
  const t0 = Date.now();
  let alt = 0;
  let batt = 12.6;
  let lat = 48.8566;
  let lon = 2.3522;
  let cap = 40;
  let roulis = 0;
  let tangage = 0;
  let t = 0;

  // c = { gaz: 0..1, dir: -1..1, pitch: -1..1, moteurs?: [4 puissances en %] }
  return (c) => {
    t += 0.1;
    alt += (c.gaz * 40 - alt) * 0.03;
    batt = Math.max(9.6, batt - 0.0004 - c.gaz * 0.0006);
    lat += c.pitch * 0.000002;
    lon += c.dir * 0.000002;
    cap = (cap + c.dir * 1.5 + 360) % 360;

    const prevRoulis = roulis;
    const prevTangage = tangage;
    roulis += (c.dir * 25 + Math.sin(t) * 1.5 - roulis) * 0.3;
    tangage += (c.pitch * 25 + Math.cos(t * 0.7) * 1.5 - tangage) * 0.3;

    const vitesse = Math.abs(c.pitch) * 25 + c.gaz * 5;
    const rr = (roulis * Math.PI) / 180;
    const tt = (tangage * Math.PI) / 180;
    const accX = -Math.sin(tt) + Math.sin(t * 3) * 0.01;
    const accY = Math.sin(rr) * Math.cos(tt) + Math.cos(t * 2.3) * 0.01;
    const accZ = Math.cos(rr) * Math.cos(tt) + c.gaz * 0.2;
    const gyrX = (roulis - prevRoulis) * 10 + Math.sin(t * 4) * 0.4;
    const gyrY = (tangage - prevTangage) * 10 + Math.cos(t * 3) * 0.4;
    const gyrZ = c.dir * 15 + Math.sin(t * 2) * 0.5;
    const rad = (cap * Math.PI) / 180;
    const magX = 22 * Math.cos(rad) + Math.sin(t * 5) * 0.3;
    const magY = 22 * Math.sin(rad) + Math.cos(t * 4) * 0.3;
    const magZ = -38 + Math.sin(t * 3) * 0.3;
    const secondes = Math.floor((Date.now() - t0) / 1000);

    return [
      ['Carte temps', `${secondes} s`],
      ['GPS etat', 'position OK'],
      ['GPS sat', '9'],
      ['GPS lat', f(lat, 5)],
      ['GPS lon', f(lon, 5)],
      ['GPS alt', `${f(alt, 1)} m`],
      ['GPS vitesse', `${f(vitesse, 1)} km/h`],
      ['Accel x', `${f(accX, 2)} g`],
      ['Accel y', `${f(accY, 2)} g`],
      ['Accel z', `${f(accZ, 2)} g`],
      ['Gyro x', `${f(gyrX, 1)} °/s`],
      ['Gyro y', `${f(gyrY, 1)} °/s`],
      ['Gyro z', `${f(gyrZ, 1)} °/s`],
      ['roulis', f(roulis, 1)],
      ['tangage', f(tangage, 1)],
      ['Mag cap', `${f(cap, 0)} °`],
      ['Mag x', `${f(magX, 1)} µT`],
      ['Mag y', `${f(magY, 1)} µT`],
      ['Mag z', `${f(magZ, 1)} µT`],
      ...(c.moteurs ? c.moteurs.map((v, i) => [`Moteur ${i + 1}`, String(v)]) : []),
      // pas de capteur pour ces deux-là aujourd'hui : fin de liste
      ['Batterie', f(batt, 2)],
      ['Temp', f(24 + c.gaz * 6, 1)],
    ];
  };
}
