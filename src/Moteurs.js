import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { NOMS_MOTEURS } from './telemetrie';

const COULEUR = '#fb7185';
const VERT = '#22c55e';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Une case par moteur : nom, pourcentage, barre de remplissage
function Cellule({ i, valeur, petit }) {
  const v = valeur == null ? null : clamp(Math.round(valeur), 0, 100);
  return (
    <View style={styles.cellule}>
      <Text style={styles.celluleNom} numberOfLines={1}>
        {i + 1} · {NOMS_MOTEURS[i]}
      </Text>
      <Text style={[styles.celluleVal, petit && { fontSize: 16 }]}>{v == null ? '--' : `${v} %`}</Text>
      <View style={styles.piste}>
        <View style={[styles.rempli, { width: `${v == null ? 0 : v}%` }]} />
      </View>
    </View>
  );
}

// Les 4 moteurs côte à côte
export function MoteursRangee({ valeurs, petit }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[0, 1, 2, 3].map((i) => (
        <Cellule key={i} i={i} valeur={valeurs ? valeurs[i] : null} petit={petit} />
      ))}
    </View>
  );
}

// Petit texte qui dit dans quel mode sont les moteurs
export const texteMode = (mode, surcharge) => {
  if (mode === 'joysticks') return 'Pilotage : joysticks';
  const nom = mode === 'stationnaire' ? 'Stationnaire' : 'Valeurs imposées';
  return surcharge ? `${nom} : stick droit en cours` : `${nom} : moteurs figés`;
};

// Bandeau du centre : l'état + le bouton Stationnaire à droite
export function BarreStationnaire({ mode, surcharge, onStationnaire, style }) {
  const actif = mode !== 'joysticks';
  return (
    <View style={[styles.barre, style]}>
      <Text style={[styles.barreTxt, actif && { color: VERT }]} numberOfLines={1}>
        {texteMode(mode, surcharge)}
      </Text>
      <TouchableOpacity style={[styles.btnStat, actif && { backgroundColor: VERT }]} onPress={onStationnaire}>
        <Text style={[styles.btnStatTxt, actif && { color: '#0b0f14' }]}>{actif ? 'Désactiver' : 'Stationnaire'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Grand écran : valeurs actuelles, valeurs voulues, bouton Valider (les 4 d'un coup)
export function MoteursPanel({ valeurs, mode, verrou, surcharge, onValider, onStationnaire, onRendre, onStop, onFermer }) {
  const [saisie, setSaisie] = useState(() => [0, 1, 2, 3].map((i) => String(valeurs ? Math.round(valeurs[i]) : 0)));
  const [erreur, setErreur] = useState('');

  const changer = (i, txt) => {
    const propre = txt.replace(/[^0-9]/g, '').slice(0, 3);
    setSaisie((s) => s.map((x, k) => (k === i ? propre : x)));
    setErreur('');
  };

  const valider = () => {
    const nombres = saisie.map((s) => (s.trim() === '' ? NaN : parseInt(s, 10)));
    if (nombres.some((n) => Number.isNaN(n) || n < 0 || n > 100)) {
      setErreur('Entre 4 nombres de 0 à 100.');
      return;
    }
    setErreur('');
    onValider(nombres); // les 4 moteurs changent en même temps
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.entete}>
        <Text style={styles.titre}>Régulateur des moteurs</Text>
        <TouchableOpacity style={styles.agrandir} onPress={onFermer}>
          <Text style={styles.agrandirTxt}>⤡</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.section}>Valeurs actuelles (puissance envoyée aux moteurs)</Text>
        <MoteursRangee valeurs={valeurs} />

        <Text style={[styles.section, { marginTop: 10 }]}>Valeurs voulues</Text>
        <View style={{ flexDirection: 'row' }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.cellule}>
              <Text style={styles.celluleNom} numberOfLines={1}>
                {i + 1} · {NOMS_MOTEURS[i]}
              </Text>
              <View style={styles.champ}>
                <TextInput
                  style={styles.saisie}
                  value={saisie[i]}
                  onChangeText={(t) => changer(i, t)}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                  placeholderTextColor="#6b7c93"
                />
                <Text style={styles.pct}>%</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.boutons}>
          <TouchableOpacity style={styles.btnStop} onPress={onStop}>
            <Text style={styles.btnTxt}>STOP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnGris, mode !== 'joysticks' && { backgroundColor: VERT }]}
            onPress={onStationnaire}
          >
            <Text style={[styles.btnTxt, mode !== 'joysticks' && { color: '#0b0f14' }]}>
              {mode === 'stationnaire' ? 'Stationnaire : ON' : 'Stationnaire'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnValider} onPress={valider}>
            <Text style={styles.btnTxt}>Valider</Text>
          </TouchableOpacity>
        </View>

        {erreur !== '' && <Text style={styles.erreur}>{erreur}</Text>}
        <Text style={styles.info}>
          {texteMode(mode, surcharge)}
          {verrou ? ` · ${verrou.join(' / ')} %` : ''}
        </Text>
        {mode !== 'joysticks' && (
          <TouchableOpacity style={styles.rendre} onPress={onRendre}>
            <Text style={styles.rendreTxt}>Rendre la main aux joysticks (le gaz repasse au stick gauche)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// Écran fermé : les 4 pourcentages + l'état, sur toute la largeur entre les joysticks
export function MoteursMini({ valeurs, mode, surcharge, onAgrandir }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.entete}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titre} numberOfLines={1}>
            Moteurs · puissance envoyée
          </Text>
          <Text style={[styles.detail, mode !== 'joysticks' && { color: VERT }]} numberOfLines={1}>
            {texteMode(mode, surcharge)}
          </Text>
        </View>
        <TouchableOpacity style={styles.agrandir} onPress={onAgrandir}>
          <Text style={styles.agrandirTxt}>⤢</Text>
        </TouchableOpacity>
      </View>
      <MoteursRangee valeurs={valeurs} />
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  titre: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  detail: { color: '#6b7c93', fontSize: 10, marginTop: 1 },
  agrandir: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  agrandirTxt: { color: '#e5e7eb', fontSize: 16 },
  section: { color: '#9fb0c6', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  cellule: { flex: 1, paddingRight: 6 },
  celluleNom: { color: '#6b7c93', fontSize: 9 },
  celluleVal: { color: '#f1f5f9', fontSize: 20, fontWeight: '800', marginVertical: 2 },
  piste: { height: 6, borderRadius: 3, backgroundColor: '#1f2937', overflow: 'hidden' },
  rempli: { height: 6, backgroundColor: COULEUR },
  champ: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 8, marginTop: 2 },
  saisie: { flex: 1, color: '#f1f5f9', fontSize: 18, fontWeight: '700', paddingVertical: 4, minWidth: 30 },
  pct: { color: '#9fb0c6', fontSize: 13 },
  boutons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10 },
  btnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  btnStop: { backgroundColor: '#dc2626', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  btnGris: { backgroundColor: '#374151', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  btnValider: { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8 },
  erreur: { color: '#fca5a5', fontSize: 11, marginTop: 6, textAlign: 'right' },
  info: { color: '#6b7c93', fontSize: 10, marginTop: 8 },
  rendre: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6, marginBottom: 10 },
  rendreTxt: { color: '#e5e7eb', fontSize: 11, fontWeight: '600' },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111821',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2a37',
    paddingLeft: 10,
    paddingRight: 4,
    height: 34,
  },
  barreTxt: { color: '#9fb0c6', fontSize: 11, fontWeight: '600', flex: 1, marginRight: 6 },
  btnStat: { backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  btnStatTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
