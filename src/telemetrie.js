// ---------------------------------------------------------------------------
// Télémétrie : lecture de la réponse de la carte + simulation (mode démo).
// La carte répond "OK;cle=valeur;cle=valeur" (ex. "OK;Altitude=12.4;GPS lat=48.85").
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

// "12.4" -> 12.4 ; "abc" -> null
export const nombre = (txt) => {
  const s = String(txt).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
};

// Unité affichée derrière la valeur (d'après le nom du capteur)
const UNITES = [
  ['alt', ' m'],
  ['vitesse', ' km/h'],
  ['batt', ' V'],
  ['temp', ' °C'],
  ['roulis', '°'],
  ['tangage', '°'],
];
export const unite = (nom) => {
  const n = nom.toLowerCase();
  const u = UNITES.find(([k]) => n.includes(k));
  return u ? u[1] : '';
};

// Mode démo : fausses mesures qui réagissent aux joysticks (pour tester sans la carte)
export function creerDemo() {
  let alt = 0;
  let batt = 12.6;
  let lat = 48.8566;
  let lon = 2.3522;
  let t = 0;
  // c = { gaz: 0..1, dir: -1..1, pitch: -1..1 }
  return (c) => {
    t += 0.1;
    alt += (c.gaz * 40 - alt) * 0.03;
    batt = Math.max(9.6, batt - 0.0004 - c.gaz * 0.0006);
    lat += c.pitch * 0.000002;
    lon += c.dir * 0.000002;
    const vitesse = Math.abs(c.pitch) * 25 + c.gaz * 5;
    const roulis = c.dir * 25 + Math.sin(t) * 1.5;
    const tangage = c.pitch * 25 + Math.cos(t * 0.7) * 1.5;
    return [
      ['Altitude', alt.toFixed(1)],
      ['Vitesse', vitesse.toFixed(1)],
      ['Batterie', batt.toFixed(2)],
      ['Temp', (24 + c.gaz * 6).toFixed(1)],
      ['GPS lat', lat.toFixed(6)],
      ['GPS lon', lon.toFixed(6)],
      ['GPS sat', '9'],
      ['roulis', roulis.toFixed(1)],
      ['tangage', tangage.toFixed(1)],
    ];
  };
}
