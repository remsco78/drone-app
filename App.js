import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Joystick from './src/Joystick';
import Niveau from './src/Niveau';
import Courbe from './src/Courbe';
import { MoteursMini, MoteursPanel, BarreStationnaire } from './src/Moteurs';
import { lireCapteurs, nombre, estNombrePur, unite, creerDemo, parGroupe, groupeDe, nomCourt, ordonner, moteursDe } from './src/telemetrie';
import { exporterCourbes } from './src/exportCourbes';

const BASE_URL = 'http://192.168.4.1';
const SEND_MS = 100; // une commande toutes les 100 ms
const DEADZONE = 0.06;
const HISTO_MAX = 600; // 10 minutes de courbe (1 point / seconde)
const PAS = 14; // pixels par seconde sur la courbe

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const zone = (v) => (Math.abs(v) < DEADZONE ? 0 : v);

// Répartition de la puissance sur les 4 moteurs (en %), comme un quadricoptère :
// [avant gauche, avant droite, arrière gauche, arrière droite]
//   g = gaz 0..1 ; r = gauche/droite -1..1 ; p = avant/arrière -1..1
const K = 0.5;
const melange = (g, r, p) =>
  [g * (1 + K * r - K * p), g * (1 - K * r - K * p), g * (1 + K * r + K * p), g * (1 - K * r + K * p)].map((v) =>
    Math.round(clamp(v, 0, 1) * 100)
  );

// Ce qu'on envoie aux moteurs, selon le mode :
//  - joysticks : gaz du stick gauche + inclinaison du stick droit
//  - verrouillé (stationnaire ou valeurs imposées) : les 4 valeurs restent figées ;
//    tant que le stick droit est touché, les moteurs suivent le stick (autour du gaz verrouillé),
//    et dès qu'il est relâché, ils reviennent aux valeurs verrouillées
//  - arrêt : tout à 0 jusqu'à ce que le stick de gaz soit revenu à 0
function calculerMoteurs(c, mo) {
  if (mo.arret) {
    if (c.gaz <= 0.02) mo.arret = false;
    else return { m: [0, 0, 0, 0], surch: false, eff: { gaz: 0, dir: 0, pitch: 0 } };
  }
  if (mo.type !== 'joysticks' && mo.verrou) {
    const gref = mo.verrou.reduce((a, b) => a + b, 0) / 400;
    if (c.dir === 0 && c.pitch === 0) {
      return { m: mo.verrou, surch: false, eff: { gaz: gref, dir: 0, pitch: 0 } };
    }
    return { m: melange(gref, c.dir, c.pitch), surch: true, eff: { gaz: gref, dir: c.dir, pitch: c.pitch } };
  }
  const g = clamp(c.gaz, 0, 1);
  return { m: melange(g, c.dir, c.pitch), surch: false, eff: { gaz: g, dir: c.dir, pitch: c.pitch } };
}

// Voyant de connexion : rouge = pas connecté au Wi-Fi du drone, vert = connecté
const Voyant = ({ connecte, demo, style }) => (
  <View style={[styles.voyant, style]} pointerEvents="none">
    <View style={[styles.led, { backgroundColor: connecte ? '#22c55e' : '#ef4444' }]} />
    <Text style={styles.voyantTxt}>{demo ? 'Démo' : connecte ? 'Connecté' : 'Non connecté'}</Text>
  </View>
);

// Mesures en temps réel, rangées par capteur (un bloc par capteur)
const ListeCapteurs = ({ capteurs, colonnes = 1 }) => {
  const valeurs = {};
  for (const [k, v] of capteurs) valeurs[k] = v;
  const blocs = parGroupe(capteurs.map(([k]) => k));
  if (!blocs.length) return <Text style={styles.vide}>Aucune donnée</Text>;
  return (
    <View>
      {blocs.map(({ groupe, cles }) => (
        <View key={groupe.id} style={[styles.bloc, { borderLeftColor: groupe.couleur }]}>
          <View style={styles.blocTete}>
            <Text style={[styles.blocTitre, { color: groupe.couleur }]}>{groupe.titre}</Text>
            <Text style={styles.blocDetail} numberOfLines={1}>
              {groupe.detail}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cles.map((k) => (
              <View key={k} style={[styles.ligne, { width: `${100 / colonnes}%` }]}>
                <Text style={styles.cle} numberOfLines={1}>
                  {nomCourt(k)}
                </Text>
                <Text style={styles.val}>
                  {valeurs[k]}
                  {estNombrePur(valeurs[k]) ? unite(k) : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

export default function App() {
  const { width, height } = useWindowDimensions();
  const [connecte, setConnecte] = useState(false);
  const [demo, setDemo] = useState(false);
  const [capteurs, setCapteurs] = useState([]);
  const [historique, setHistorique] = useState({}); // { nom: [{t, v}] }
  const [choix, setChoix] = useState(null); // capteur affiché dans la courbe
  const [ouvert, setOuvert] = useState(null); // null | 'capteurs' | 'courbes' | 'moteurs' (un seul à la fois)
  const [modeM, setModeM] = useState({ type: 'joysticks', verrou: null }); // joysticks | stationnaire | manuel
  const [surcharge, setSurcharge] = useState(false); // stick droit utilisé pendant un verrouillage
  const [sortie, setSortie] = useState([0, 0, 0, 0]); // dernières puissances envoyées (%)
  const [msgM, setMsgM] = useState('');
  const modeRef = useRef({ type: 'joysticks', verrou: null, arret: false });
  const sortieRef = useRef([0, 0, 0, 0]);
  const [msgExport, setMsgExport] = useState('');
  const historiqueRef = useRef({});

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
      const { m, surch, eff } = calculerMoteurs(c, modeRef.current);
      sortieRef.current = m;
      setSortie((o) => (o.join() === m.join() ? o : m));
      setSurcharge((o) => (o === surch ? o : surch));
      if (demoRef.current) {
        capteursRef.current = demoGen.current({ gaz: eff.gaz, dir: eff.dir, pitch: eff.pitch, moteurs: m });
        setCapteurs(capteursRef.current);
        return;
      }
      if (enCours) return;
      enCours = true;
      const ctrl = new AbortController();
      const stop = setTimeout(() => ctrl.abort(), 400);
      try {
        const r = await fetch(`${BASE_URL}/c?m1=${m[0]}&m2=${m[1]}&m3=${m[2]}&m4=${m[3]}&b=0`, { signal: ctrl.signal });
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

  historiqueRef.current = historique;
  const nomsCourbes = ordonner(Object.keys(historique)); // rangées par capteur, "sans capteur" à la fin
  const courbeActive =
    choix && historique[choix] ? choix : nomsCourbes.find((k) => /alt/i.test(k)) || nomsCourbes[0];
  const groupeActif = courbeActive ? groupeDe(courbeActive) : null;

  // Inclinaison pour le niveau (roulis / tangage, si la carte les envoie)
  const inclin = useMemo(() => {
    const d = {};
    for (const [k, v] of capteurs) d[k.toLowerCase()] = nombre(v);
    return d.roulis != null && d.tangage != null ? { roll: d.roulis, pitch: d.tangage } : null;
  }, [capteurs]);


  // --- dimensions -----------------------------------------------------------
  const stick = clamp(Math.min(height * 0.27, width * 0.17), 80, 130);
  const zoneW = stick + 40; // largeur réservée à chaque joystick
  const zoneH = stick + 30; // hauteur réservée (joystick + son texte)
  const panL = clamp(width * 0.24, 150, 230);
  const panR = clamp(width * 0.3, 190, 320);
  // les panneaux s'arrêtent au-dessus des joysticks : ils ne les cachent jamais
  const hautMini = Math.max(90, height - zoneH - 44 - 8);
  const gaucheBande = 14 + zoneW + 10;
  const droiteBande = 14 + Math.max(panR, zoneW) + 10;

  const lancerExport = async () => {
    setMsgExport('Création de l’image…');
    const m = await exporterCourbes(historiqueRef.current);
    setMsgExport(m);
    setTimeout(() => setMsgExport(''), 3000);
  };

  const basculer = (nom) => setOuvert((o) => (o === nom ? null : nom));

  // --- moteurs : verrouillage, valeurs imposées, arrêt ---------------------
  const prevenir = (txt) => {
    setMsgM(txt);
    setTimeout(() => setMsgM(''), 2500);
  };
  const verrouiller = (type, vals) => {
    modeRef.current = { type, verrou: vals, arret: false };
    setModeM({ type, verrou: vals });
  };
  const rendre = () => {
    modeRef.current = { type: 'joysticks', verrou: null, arret: false };
    setModeM({ type: 'joysticks', verrou: null });
  };
  const stationnaire = () => {
    if (modeRef.current.type === 'stationnaire') return rendre();
    const v = sortieRef.current;
    if (v.every((x) => x === 0)) return prevenir('Moteurs à 0 % : rien à figer.');
    verrouiller('stationnaire', [...v]);
  };
  const arreter = () => {
    modeRef.current = { type: 'joysticks', verrou: null, arret: true };
    setModeM({ type: 'joysticks', verrou: null });
  };
  const valeursM = connecte || demo ? moteursDe(capteurs) || sortie : null;

  return (
    <View style={styles.racine}>
      <StatusBar hidden />

      {/* voyant de connexion : toujours en haut à gauche, il ne bouge jamais */}
      <Voyant connecte={connecte} demo={demo} style={{ left: 14, top: 8 }} />

      <TouchableOpacity style={styles.demoBtn} onPress={() => setDemo((d) => !d)}>
        <Text style={styles.demoTxt}>{demo ? 'Démo : ON' : 'Démo : OFF'}</Text>
      </TouchableOpacity>

      {/* ---------- Écran normal : capteurs à gauche, courbe à droite, niveau au centre ---------- */}
      {(ouvert === null || ouvert === 'moteurs') && (
        <View style={[styles.mini, { left: 14, top: 44, width: panL, height: hautMini }]}>
          <View style={styles.miniEntete}>
            <Text style={styles.miniTitre}>Capteurs</Text>
            <TouchableOpacity style={styles.agrandir} onPress={() => basculer('capteurs')}>
              <Text style={styles.agrandirTxt}>⤢</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <ListeCapteurs capteurs={capteurs} />
          </ScrollView>
        </View>
      )}

      {/* centre : niveau en haut, bandeau Stationnaire juste en dessous */}
      {ouvert === null && (
        <View
          style={[styles.centre, { top: 44, left: panL + 24, right: panR + 24, height: hautMini, justifyContent: 'space-between' }]}
          pointerEvents="box-none"
        >
          <Niveau inclin={inclin} taille={clamp(Math.min(width - panL - panR - 60, hautMini - 90), 60, 150)} />
          <BarreStationnaire
            mode={modeM.type}
            surcharge={surcharge}
            style={{ alignSelf: 'stretch' }}
            onStationnaire={() => (modeM.type === 'joysticks' ? stationnaire() : rendre())}
          />
        </View>
      )}

      {/* régulateur de vitesse des moteurs : en bas, entre les deux joysticks */}
      {ouvert === null && (
        <View style={[styles.mini, { left: zoneW + 18, right: zoneW + 18, bottom: 10, height: zoneH - 10 }]}>
          <MoteursMini valeurs={valeursM} mode={modeM.type} surcharge={surcharge} onAgrandir={() => basculer('moteurs')} />
        </View>
      )}

      {/* régulateur en grand : colonne au centre, les mini-écrans restent de chaque côté */}
      {ouvert === 'moteurs' && (
        <View style={[styles.mini, { left: 14 + panL + 10, right: 14 + panR + 10, top: 44, bottom: 10, padding: 10 }]}>
          <MoteursPanel
            valeurs={valeursM}
            mode={modeM.type}
            verrou={modeM.verrou}
            surcharge={surcharge}
            onValider={(v) => verrouiller('manuel', v)}
            onStationnaire={stationnaire}
            onRendre={rendre}
            onStop={arreter}
            onFermer={() => setOuvert(null)}
          />
        </View>
      )}

      {msgM !== '' && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastTxt}>{msgM}</Text>
        </View>
      )}

      {/* mini-écran des courbes : visible sauf quand il est ouvert en grand */}
      {ouvert !== 'courbes' && (
        <View style={[styles.mini, { right: 14, top: 44, width: panR, height: hautMini }]}>
          <View style={styles.miniEntete}>
            <View style={{ flex: 1 }}>
              <Text style={styles.miniTitre} numberOfLines={1}>
                {courbeActive || 'Courbe'}
              </Text>
              {groupeActif && (
                <Text style={[styles.blocDetail, { color: groupeActif.couleur, marginLeft: 0 }]} numberOfLines={1}>
                  Capteur : {groupeActif.titre}
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.agrandir} onPress={() => basculer('courbes')}>
              <Text style={styles.agrandirTxt}>⤢</Text>
            </TouchableOpacity>
          </View>
          <Courbe
            points={courbeActive ? historique[courbeActive] : null}
            largeur={panR - 20}
            hauteur={hautMini - 56}
            pas={PAS}
            couleur={groupeActif ? groupeActif.couleur : undefined}
          />
        </View>
      )}

      {/* ---------- Capteurs en grand : grande bande entre les deux joysticks ---------- */}
      {ouvert === 'capteurs' && (
        <View style={[styles.mini, { left: gaucheBande, right: droiteBande, top: 44, bottom: 10, padding: 10 }]}>
          <View style={styles.miniEntete}>
            <Text style={styles.miniTitre}>Capteurs en temps réel</Text>
            <TouchableOpacity style={styles.agrandir} onPress={() => setOuvert(null)}>
              <Text style={styles.agrandirTxt}>⤡</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <ListeCapteurs capteurs={capteurs} colonnes={width - gaucheBande - droiteBande > 380 ? 3 : 2} />
          </ScrollView>
        </View>
      )}

      {/* ---------- Courbes en grand : on cache les capteurs, joysticks toujours en bas ---------- */}
      {ouvert === 'courbes' && (
        <View style={[styles.mini, { left: 14, right: 14, top: 44, bottom: zoneH + 6, padding: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 30 }}>
            <View style={{ flex: 1, height: 30 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {parGroupe(nomsCourbes).map(({ groupe, cles }) => (
                  <View key={groupe.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.groupeEtiq, { color: groupe.couleur }]}>{groupe.titre}</Text>
                    {cles.map((k) => (
                      <TouchableOpacity
                        key={k}
                        style={[styles.puce, k === courbeActive && { backgroundColor: groupe.couleur }]}
                        onPress={() => setChoix(k)}
                      >
                        <Text style={[styles.puceTxt, k === courbeActive && { color: '#0b0f14' }]}>{nomCourt(k)}</Text>
                      </TouchableOpacity>
                    ))}
                    <View style={styles.separateur} />
                  </View>
                ))}
              </ScrollView>
            </View>
            {msgExport !== '' && <Text style={styles.msgExport}>{msgExport}</Text>}
            <TouchableOpacity style={styles.exporter} onPress={lancerExport}>
              <Text style={styles.exporterTxt}>⤓ Image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.agrandir, { marginLeft: 8 }]} onPress={() => setOuvert(null)}>
              <Text style={styles.agrandirTxt}>⤡</Text>
            </TouchableOpacity>
          </View>
          {groupeActif && (
            <Text style={[styles.infoCapteur, { color: groupeActif.couleur }]} numberOfLines={1}>
              {courbeActive} · vient du capteur : {groupeActif.titre} ({groupeActif.detail})
            </Text>
          )}
          <View style={{ flex: 1, marginTop: 4 }}>
            <CourbePleine
              points={courbeActive ? historique[courbeActive] : null}
              couleur={groupeActif ? groupeActif.couleur : undefined}
            />
          </View>
        </View>
      )}

      {/* joysticks : en dernier = toujours au-dessus, toujours utilisables */}
      <Joystick
        diametre={stick}
        zoneStyle={{ left: 10, width: zoneW, height: zoneH }}
        formatLabel={(x, y) => `Gaz ${Math.round(clamp(y, 0, 1) * 100)}%`}
        onChange={(x, y) => {
          cmd.current.gaz = clamp(zone(y), 0, 1);
          cmd.current.yaw = zone(x);
        }}
      />
      <Joystick
        diametre={stick}
        zoneStyle={{ right: 10, width: zoneW, height: zoneH }}
        formatLabel={(x, y) => `Dir ${Math.round(x * 100)}% · Av ${Math.round(y * 100)}%`}
        onChange={(x, y) => {
          cmd.current.dir = zone(x);
          cmd.current.pitch = zone(y);
        }}
      />
    </View>
  );
}

// Courbe qui prend toute la place disponible
function CourbePleine({ points, couleur }) {
  const [taille, setTaille] = useState({ w: 0, h: 0 });
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setTaille({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {taille.w > 0 && <Courbe points={points} largeur={taille.w} hauteur={taille.h} pas={PAS * 1.6} couleur={couleur} />}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: '#0b0f14' },
  demoBtn: {
    position: 'absolute',
    top: 10,
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
  toast: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  toastTxt: { backgroundColor: '#78350f', color: '#fde68a', fontSize: 12, fontWeight: '600', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, overflow: 'hidden' },
  bloc: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 8 },
  blocTete: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 },
  blocTitre: { fontSize: 12, fontWeight: '800' },
  blocDetail: { color: '#6b7c93', fontSize: 10, marginLeft: 6, flexShrink: 1 },
  groupeEtiq: { fontSize: 10, fontWeight: '800', marginRight: 6, marginLeft: 2 },
  separateur: { width: 1, height: 18, backgroundColor: '#26313f', marginHorizontal: 6 },
  infoCapteur: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  ligne: { paddingVertical: 3, paddingRight: 10 },
  cle: { color: '#6b7c93', fontSize: 10 },
  val: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  vide: { color: '#6b7c93', fontSize: 12 },
  puce: { backgroundColor: '#1f2937', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginRight: 6, height: 26 },
  puceActive: { backgroundColor: '#2563eb' },
  exporter: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, marginLeft: 8 },
  exporterTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  msgExport: { color: '#9fb0c6', fontSize: 11, marginLeft: 8 },
  puceTxt: { color: '#9fb0c6', fontSize: 12, fontWeight: '600' },
});
