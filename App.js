import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Joystick from './src/Joystick';
import Niveau from './src/Niveau';
import Courbe from './src/Courbe';
import { lireCapteurs, nombre, unite, creerDemo } from './src/telemetrie';

const BASE_URL = 'http://192.168.4.1';
const SEND_MS = 100; // une commande toutes les 100 ms
const DEADZONE = 0.06;
const HISTO_MAX = 600; // 10 minutes de courbe (1 point / seconde)
const PAS = 14; // pixels par seconde sur la courbe

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const zone = (v) => (Math.abs(v) < DEADZONE ? 0 : v);

// Voyant de connexion : rouge = pas connecté au Wi-Fi du drone, vert = connecté
const Voyant = ({ connecte, demo, style }) => (
  <View style={[styles.voyant, style]} pointerEvents="none">
    <View style={[styles.led, { backgroundColor: connecte ? '#22c55e' : '#ef4444' }]} />
    <Text style={styles.voyantTxt}>{demo ? 'Démo' : connecte ? 'Connecté' : 'Non connecté'}</Text>
  </View>
);

// Liste des mesures en temps réel
const ListeCapteurs = ({ capteurs, colonnes = 1 }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
    {capteurs.length === 0 && <Text style={styles.vide}>Aucune donnée</Text>}
    {capteurs.map(([k, v]) => (
      <View key={k} style={[styles.ligne, { width: `${100 / colonnes}%` }]}>
        <Text style={styles.cle} numberOfLines={1}>
          {k}
        </Text>
        <Text style={styles.val}>
          {v}
          {nombre(v) !== null ? unite(k) : ''}
        </Text>
      </View>
    ))}
  </View>
);

export default function App() {
  const { width, height } = useWindowDimensions();
  const [connecte, setConnecte] = useState(false);
  const [demo, setDemo] = useState(false);
  const [capteurs, setCapteurs] = useState([]);
  const [historique, setHistorique] = useState({}); // { nom: [{t, v}] }
  const [choix, setChoix] = useState(null); // capteur affiché dans la courbe
  const [ouvert, setOuvert] = useState(null); // null | 'capteurs' | 'courbes'

  const cmd = useRef({ gaz: 0, dir: 0, pitch: 0, yaw: 0 });
  const capteursRef = useRef([]);
  const demoRef = useRef(false);
  const demoGen = useRef(creerDemo());
  const t0 = useRef(Date.now());

  useEffect(() => {
    demoRef.current = demo;
    if (demo) {
      setConnecte(true);
    } else {
      setConnecte(false);
      setCapteurs([]);
      capteursRef.current = [];
      setHistorique({});
      t0.current = Date.now();
    }
  }, [demo]);

  // Envoi des commandes + lecture des capteurs (toutes les 100 ms)
  useEffect(() => {
    let enCours = false;
    const id = setInterval(async () => {
      const c = cmd.current;
      if (demoRef.current) {
        capteursRef.current = demoGen.current({ gaz: c.gaz, dir: c.dir, pitch: c.pitch });
        setCapteurs(capteursRef.current);
        return;
      }
      if (enCours) return;
      enCours = true;
      const gaz = Math.round(clamp(c.gaz, 0, 1) * 255);
      const dir = Math.round(128 + clamp(c.dir, -1, 1) * 127);
      const ctrl = new AbortController();
      const stop = setTimeout(() => ctrl.abort(), 400);
      try {
        const r = await fetch(`${BASE_URL}/c?t=${gaz}&s=${dir}&b=0`, { signal: ctrl.signal });
        const txt = await r.text();
        capteursRef.current = lireCapteurs(txt);
        setCapteurs(capteursRef.current);
        setConnecte(true);
      } catch (e) {
        setConnecte(false);
      } finally {
        clearTimeout(stop);
        enCours = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, []);

  // Une mesure par seconde pour les courbes
  useEffect(() => {
    const id = setInterval(() => {
      const liste = capteursRef.current;
      if (!liste.length) return;
      const t = Math.round((Date.now() - t0.current) / 1000);
      setHistorique((h) => {
        const nh = { ...h };
        for (const [k, txt] of liste) {
          const v = nombre(txt);
          if (v === null) continue;
          const serie = nh[k] ? nh[k] : [];
          if (serie.length && serie[serie.length - 1].t === t) continue;
          const suite = serie.concat([{ t, v }]);
          nh[k] = suite.length > HISTO_MAX ? suite.slice(suite.length - HISTO_MAX) : suite;
        }
        return nh;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const nomsCourbes = Object.keys(historique);
  const courbeActive = choix && historique[choix] ? choix : nomsCourbes[0];

  // Inclinaison pour le niveau (roulis / tangage, si la carte les envoie)
  const inclin = useMemo(() => {
    const d = {};
    for (const [k, v] of capteurs) d[k.toLowerCase()] = nombre(v);
    return d.roulis != null && d.tangage != null ? { roll: d.roulis, pitch: d.tangage } : null;
  }, [capteurs]);

  const gazPct = Math.round(cmd.current.gaz * 100);

  // --- dimensions -----------------------------------------------------------
  const stick = clamp(Math.min(height * 0.36, width * 0.24), 100, 180);
  const panL = clamp(width * 0.24, 150, 230);
  const panR = clamp(width * 0.3, 190, 320);
  // les panneaux s'arrêtent au-dessus des joysticks
  const hautPanneau = Math.max(100, height - stick - 40 - 44 - 8);

  // Joysticks (identiques dans les deux modes : ils sont masqués en grand écran)
  const stickGauche = (
    <Joystick
      diametre={stick}
      zoneStyle={{ left: 14, width: stick + 24, height: stick + 40 }}
      formatLabel={(x, y) => `Gaz ${Math.round(clamp(y, 0, 1) * 100)}%`}
      onChange={(x, y) => {
        cmd.current.gaz = clamp(zone(y), 0, 1);
        cmd.current.yaw = zone(x);
      }}
    />
  );
  const stickDroit = (
    <Joystick
      diametre={stick}
      zoneStyle={{ right: 14, width: stick + 24, height: stick + 40 }}
      formatLabel={(x, y) => `Dir ${Math.round(x * 100)}% · Av/Ar ${Math.round(y * 100)}%`}
      onChange={(x, y) => {
        cmd.current.dir = zone(x);
        cmd.current.pitch = zone(y);
      }}
    />
  );

  return (
    <View style={styles.racine}>
      <StatusBar hidden />

      {/* ---------- Écran principal ---------- */}
      <View style={styles.haut}>
        <TouchableOpacity style={styles.demoBtn} onPress={() => setDemo((d) => !d)}>
          <Text style={styles.demoTxt}>{demo ? 'Démo : ON' : 'Démo : OFF'}</Text>
        </TouchableOpacity>
        <Voyant connecte={connecte} demo={demo} />
      </View>

      {/* mini-écran gauche : capteurs en temps réel */}
      <View style={[styles.mini, { left: 14, top: 44, width: panL, height: hautPanneau }]}>
        <View style={styles.miniEntete}>
          <Text style={styles.miniTitre}>Capteurs</Text>
          <TouchableOpacity style={styles.agrandir} onPress={() => setOuvert('capteurs')}>
            <Text style={styles.agrandirTxt}>⤢</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }}>
          <ListeCapteurs capteurs={capteurs} />
        </ScrollView>
      </View>

      {/* mini-écran droit : courbes */}
      <View style={[styles.mini, { right: 14, top: 44, width: panR, height: hautPanneau }]}>
        <View style={styles.miniEntete}>
          <Text style={styles.miniTitre}>Courbe · {courbeActive || '—'}</Text>
          <TouchableOpacity style={styles.agrandir} onPress={() => setOuvert('courbes')}>
            <Text style={styles.agrandirTxt}>⤢</Text>
          </TouchableOpacity>
        </View>
        <Courbe
          points={courbeActive ? historique[courbeActive] : null}
          largeur={panR - 20}
          hauteur={hautPanneau - 42}
          pas={PAS}
        />
      </View>

      {/* centre : niveau d'inclinaison */}
      <View style={[styles.centre, { top: 44, left: panL + 24, right: panR + 24 }]} pointerEvents="none">
        <Niveau inclin={inclin} taille={clamp(Math.min(width - panL - panR - 60, height * 0.45), 90, 190)} />
      </View>

      {stickGauche}
      {stickDroit}

      {/* ---------- Grand écran : tout visible en même temps ---------- */}
      {ouvert && (
        <View style={styles.plein}>
          <Voyant connecte={connecte} demo={demo} style={{ left: 14, top: 10 }} />
          <TouchableOpacity style={styles.fermer} onPress={() => setOuvert(null)}>
            <Text style={styles.fermerTxt}>✕ Réduire</Text>
          </TouchableOpacity>

          <View style={styles.pleinCorps}>
            <View style={[styles.grand, { flex: ouvert === 'capteurs' ? 1.2 : 0.8 }]}>
              <Text style={styles.miniTitre}>Capteurs en temps réel</Text>
              <ScrollView style={{ marginTop: 6, flex: 1 }}>
                <ListeCapteurs capteurs={capteurs} colonnes={ouvert === 'capteurs' ? 2 : 1} />
              </ScrollView>
            </View>

            <View style={[styles.grand, { flex: ouvert === 'courbes' ? 2 : 1.3 }]}>
              <View style={{ height: 30 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {nomsCourbes.map((k) => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.puce, k === courbeActive && styles.puceActive]}
                      onPress={() => setChoix(k)}
                    >
                      <Text style={[styles.puceTxt, k === courbeActive && { color: '#fff' }]}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1, marginTop: 8 }}>
                <CourbePleine points={courbeActive ? historique[courbeActive] : null} />
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Courbe qui prend toute la place disponible
function CourbePleine({ points }) {
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setTaille({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {taille.w > 0 && <Courbe points={points} largeur={taille.w} hauteur={taille.h} pas={PAS * 1.6} />}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: '#0b0f14' },
  haut: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBtn: {
    position: 'absolute',
    right: 14,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoTxt: { color: '#9fb0c6', fontSize: 11, fontWeight: '600' },
  voyant: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: 'absolute',
  },
  led: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
  voyantTxt: { color: '#e5e7eb', fontSize: 12, fontWeight: '600' },
  mini: {
    position: 'absolute',
    backgroundColor: '#111821',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2a37',
    padding: 8,
  },
  miniEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  miniTitre: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  agrandir: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  agrandirTxt: { color: '#e5e7eb', fontSize: 16 },
  centre: { position: 'absolute', alignItems: 'center' },
  ligne: { paddingVertical: 3, paddingRight: 10 },
  cle: { color: '#6b7c93', fontSize: 10 },
  val: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  vide: { color: '#6b7c93', fontSize: 12 },
  plein: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b0f14', paddingTop: 48, paddingHorizontal: 14, paddingBottom: 12 },
  pleinCorps: { flex: 1, flexDirection: 'row', gap: 12 },
  grand: {
    backgroundColor: '#111821',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2a37',
    padding: 10,
  },
  fermer: {
    position: 'absolute',
    right: 14,
    top: 10,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  fermerTxt: { color: '#e5e7eb', fontSize: 12, fontWeight: '700' },
  puce: { backgroundColor: '#1f2937', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginRight: 6, height: 26 },
  puceActive: { backgroundColor: '#2563eb' },
  puceTxt: { color: '#9fb0c6', fontSize: 12, fontWeight: '600' },
});
