import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

// ---------------------------------------------------------------------------
// Manette Drone pour Arduino UNO R4 WiFi (sketch drone_wifi.ino)
// Envoie 10 fois par seconde : GET http://192.168.4.1/c?t=GAZ&s=DIRECTION&b=FEUX
//   gaz 0-255, direction 0-255 (128 = centre), feux/LED 0/1
// La carte répond "OK;cle=valeur;cle=valeur" : les valeurs sont affichées
// dans l'encadré "Infos capteurs".
//
// Disposition (téléphone en paysage) :
//   haut gauche  : encadré infos capteurs        haut droite : bouton LED
//   centre       : niveau d'inclinaison (roulis / tangage du capteur MPU6050)
//   bas gauche   : joystick gaz (vers le haut)   bas droite  : joystick direction
// ---------------------------------------------------------------------------
const BASE_URL = 'http://192.168.4.1';
const SEND_MS = 100;
const DEADZONE = 0.06;
const MARGE_X = 44; // évite l'encoche / la Dynamic Island en paysage
const NB_BARRES = 7;
const SENS_ROULIS = 1; // mettre -1 si les barres s'inclinent à l'envers

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// "OK;uptime=12;batt=7.4" -> [["uptime","12"], ["batt","7.4"]]
const lireCapteurs = (texte) =>
  texte
    .split(';')
    .filter((p) => p.includes('='))
    .map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    });

// ---------------------------------------------------------------------------
// Niveau d'inclinaison : les barres tournent (roulis) et montent/descendent
// (tangage) par rapport à la ligne pointillée fixe. Vert < 5°, orange < 15°.
// ---------------------------------------------------------------------------
function Niveau({ inclin, taille }) {
  const roll = inclin ? clamp(inclin.roll, -45, 45) : 0;
  const pitch = inclin ? clamp(inclin.pitch, -45, 45) : 0;
  const ecart = Math.max(Math.abs(roll), Math.abs(pitch));
  const couleur = !inclin ? '#2a3441' : ecart < 5 ? '#2ecc71' : ecart < 15 ? '#f59e0b' : '#ef4444';
  const decal = (pitch / 45) * taille * 0.3;
  return (
    <View pointerEvents="none" style={{ width: taille, alignItems: 'center' }}>
      <View style={{ width: taille, height: taille, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            alignItems: 'center',
            gap: 5,
            transform: [{ translateY: decal }, { rotate: `${-roll * SENS_ROULIS}deg` }],
          }}
        >
          {Array.from({ length: NB_BARRES }).map((_, i) => (
            <View
              key={i}
              style={{ width: taille * 0.8, height: 9, borderRadius: 4, backgroundColor: couleur }}
            />
          ))}
        </View>
        <View style={styles.repere}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={styles.tiret} />
          ))}
        </View>
      </View>
      <Text style={styles.niveauTxt}>
        {inclin
          ? `Roulis ${Math.round(inclin.roll)}° · Tangage ${Math.round(inclin.pitch)}°`
          : "Pas de capteur d'inclinaison"}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Joystick fixe : axis 'y' = gaz (vers le haut seulement), axis 'x' = direction
// Chaque joystick gère son propre doigt, donc les deux marchent en même temps.
// ---------------------------------------------------------------------------
function Stick({ axis, rayon, zoneStyle, label, onChange }) {
  const KNOB = rayon * 0.8;
  const course = rayon - KNOB / 2 - 4;
  const [pos, setPos] = useState({ dx: 0, dy: 0 });
  const [actif, setActif] = useState(false);
  const touchId = useRef(null);
  const origine = useRef({ x: 0, y: 0 });

  const onStart = (e) => {
    if (touchId.current !== null) return;
    const t = e.nativeEvent.changedTouches[0];
    touchId.current = t.identifier;
    origine.current = { x: t.pageX, y: t.pageY };
    setActif(true);
  };

  const onMove = (e) => {
    if (touchId.current === null) return;
    for (const t of e.nativeEvent.touches) {
      if (t.identifier !== touchId.current) continue;
      if (axis === 'y') {
        const dy = clamp(t.pageY - origine.current.y, -course, 0);
        setPos({ dx: 0, dy });
        onChange(-dy / course); // 0 à 1
      } else {
        const dx = clamp(t.pageX - origine.current.x, -course, course);
        setPos({ dx, dy: 0 });
        onChange(dx / course); // -1 à 1
      }
    }
  };

  const onEnd = (e) => {
    if (touchId.current === null) return;
    for (const t of e.nativeEvent.changedTouches) {
      if (t.identifier === touchId.current) {
        touchId.current = null;
        setPos({ dx: 0, dy: 0 });
        setActif(false);
        onChange(0);
      }
    }
  };

  return (
    <View
      style={[styles.zone, zoneStyle]}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      <View
        pointerEvents="none"
        style={[styles.base, { width: rayon * 2, height: rayon * 2, borderRadius: rayon }]}
      >
        <View
          style={[
            styles.knob,
            {
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: actif ? '#60a5fa' : '#3b82f6',
              transform: [{ translateX: pos.dx }, { translateY: pos.dy }],
            },
          ]}
        />
      </View>
      <Text pointerEvents="none" style={styles.zoneLabel}>
        {label}
      </Text>
    </View>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const W = width - 2 * MARGE_X;
  const rayon = Math.min(70, height * 0.17);

  const [connected, setConnected] = useState(false);
  const [led, setLed] = useState(false);
  const [capteurs, setCapteurs] = useState([]);
  const [inclin, setInclin] = useState(null); // { roll, pitch } en degrés
  const [gazPct, setGazPct] = useState(0);
  const [dirPct, setDirPct] = useState(0);

  const values = useRef({ gaz: 0, dir: 0 });
  const ledRef = useRef(false);
  const busy = useRef(false);

  // Envoi périodique des commandes à la carte + lecture des capteurs
  useEffect(() => {
    const id = setInterval(async () => {
      if (busy.current) return;
      busy.current = true;
      const v = values.current;

      const gaz = v.gaz > DEADZONE ? Math.round(clamp(v.gaz, 0, 1) * 255) : 0;
      const dir = Math.abs(v.dir) > DEADZONE ? Math.round(128 + clamp(v.dir, -1, 1) * 127) : 128;
      const b = ledRef.current ? 1 : 0;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 400);
      try {
        const res = await fetch(`${BASE_URL}/c?t=${gaz}&s=${dir}&b=${b}`, {
          signal: controller.signal,
        });
        setConnected(res.ok);
        if (res.ok) {
          const texte = await res.text();
          const liste = lireCapteurs(texte);
          const lire = (nom) => {
            const e = liste.find(([n]) => n === nom);
            const x = e ? parseFloat(e[1]) : NaN;
            return isNaN(x) ? null : x;
          };
          const r = lire('roulis');
          const p = lire('tangage');
          setInclin(r === null || p === null ? null : { roll: r, pitch: p });
          setCapteurs(liste.filter(([n]) => n !== 'roulis' && n !== 'tangage'));
        }
      } catch (e) {
        setConnected(false);
        setInclin(null);
      } finally {
        clearTimeout(timeout);
        busy.current = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, []);

  const toggleLed = () => {
    ledRef.current = !ledRef.current;
    setLed(ledRef.current);
  };

  const onGaz = (v) => {
    values.current.gaz = v;
    setGazPct(Math.round(clamp(v, 0, 1) * 100));
  };
  const onDir = (v) => {
    values.current.dir = v;
    setDirPct(Math.round(clamp(v, -1, 1) * 100));
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <View style={{ flex: 1, marginHorizontal: MARGE_X }}>
        {/* Haut gauche : informations transmises par les capteurs */}
        <View style={[styles.infoBox, { width: W * 0.38, height: height * 0.35 }]}>
          <View style={styles.infoHeader}>
            <View style={[styles.dot, { backgroundColor: connected ? '#2ecc71' : '#e74c3c' }]} />
            <Text style={styles.status}>{connected ? 'Connecté' : 'Hors ligne'}</Text>
          </View>
          <Text style={styles.infoTitre}>Infos capteurs (faire défiler)</Text>
          {!connected ? (
            <Text style={styles.infoVide}>En attente de la carte…</Text>
          ) : capteurs.length === 0 ? (
            <Text style={styles.infoVide}>Aucune donnée reçue</Text>
          ) : (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
              {capteurs.map(([k, v], i) => {
                // "GPS lat" -> groupe "GPS", nom "lat"
                const [groupe, ...reste] = k.split(' ');
                const nom = reste.join(' ');
                const premier = i === 0 || capteurs[i - 1][0].split(' ')[0] !== groupe;
                return (
                  <View key={k}>
                    {premier && <Text style={styles.groupe}>{groupe}</Text>}
                    <Text style={styles.infoLigne}>
                      {nom || groupe} : <Text style={styles.infoValeur}>{v}</Text>
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Haut droite : bouton test LED */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={toggleLed}
          style={[styles.ledBtn, { backgroundColor: led ? '#f1c40f' : '#3b4a5f' }]}
        >
          <Text style={[styles.ledTxt, led && { color: '#000' }]}>LED</Text>
        </TouchableOpacity>

        {/* Centre : niveau d'inclinaison */}
        <View style={{ position: 'absolute', left: W / 2 - 70, top: height * 0.27 }}>
          <Niveau inclin={inclin} taille={140} />
        </View>

        {/* Bas gauche : joystick gaz / bas droite : joystick direction */}
        <Stick
          axis="y"
          rayon={rayon}
          label={`Gaz ${gazPct} %`}
          zoneStyle={{ left: 0, width: W * 0.34 }}
          onChange={onGaz}
        />
        <Stick
          axis="x"
          rayon={rayon}
          label={`Direction ${dirPct} %`}
          zoneStyle={{ right: 0, width: W * 0.34 }}
          onChange={onDir}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#10141a' },
  infoBox: {
    position: 'absolute',
    left: 0,
    top: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3b4a5f',
    backgroundColor: '#161c25',
    padding: 10,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { color: '#fff', fontWeight: '700', fontSize: 13 },
  infoTitre: { color: '#6b7c93', fontSize: 11, marginTop: 6, marginBottom: 4, textTransform: 'uppercase' },
  infoVide: { color: '#6b7c93', fontSize: 13 },
  infoLigne: { color: '#9fb0c6', fontSize: 13, marginBottom: 1 },
  groupe: { color: '#3b82f6', fontSize: 11, fontWeight: '700', marginTop: 5, textTransform: 'uppercase' },
  infoValeur: { color: '#fff', fontWeight: '700' },
  ledBtn: {
    position: 'absolute',
    right: 0,
    top: 14,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4b5b70',
  },
  ledTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  repere: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tiret: { width: 8, height: 2, backgroundColor: '#8fa3bd', borderRadius: 1 },
  niveauTxt: { color: '#6b7c93', fontSize: 12, marginTop: 2, textAlign: 'center' },
  zone: {
    position: 'absolute',
    bottom: 0,
    height: '62%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    borderWidth: 2.5,
    borderColor: '#3b4a5f',
    backgroundColor: 'rgba(59,74,95,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  zoneLabel: { position: 'absolute', bottom: 6, color: '#6b7c93', fontSize: 13 },
});
