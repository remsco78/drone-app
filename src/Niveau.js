import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const NB_BARRES = 7;
const SENS_ROULIS = 1; // mettre -1 si les barres s'inclinent à l'envers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Niveau d'inclinaison : les barres tournent (roulis) et montent/descendent
// (tangage) par rapport à la ligne pointillée fixe. Vert < 5°, orange < 15°.
// ---------------------------------------------------------------------------
export default function Niveau({ inclin, taille }) {
  const roll = inclin ? clamp(inclin.roll, -45, 45) : 0;
  const pitch = inclin ? clamp(inclin.pitch, -45, 45) : 0;
  const ecart = Math.max(Math.abs(roll), Math.abs(pitch));
  const couleur = !inclin ? '#2a3441' : ecart < 5 ? '#2ecc71' : ecart < 15 ? '#f59e0b' : '#ef4444';
  const decal = (pitch / 45) * taille * 0.3;
  return (
    <View pointerEvents="none" style={{ width: Math.max(taille, 170), alignItems: 'center' }}>
      <View style={{ width: taille, height: taille * 0.8, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            alignItems: 'center',
            gap: 4,
            transform: [{ translateY: decal }, { rotate: `${-roll * SENS_ROULIS}deg` }],
          }}
        >
          {Array.from({ length: NB_BARRES }).map((_, i) => (
            <View
              key={i}
              style={{ width: taille * 0.8, height: Math.max(6, taille * 0.06), borderRadius: 4, backgroundColor: couleur }}
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

const styles = StyleSheet.create({
  repere: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tiret: { width: 8, height: 2, backgroundColor: '#8fa3bd', borderRadius: 1 },
  niveauTxt: { color: '#6b7c93', fontSize: 11, marginTop: 2, textAlign: 'center' },
});
