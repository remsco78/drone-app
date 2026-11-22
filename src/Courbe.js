import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { echelle, fmtEchelle } from './telemetrie';

// ---------------------------------------------------------------------------
// Courbe d'un capteur : une mesure par seconde, axe vertical de 0 au maximum
// (ou du minimum si la valeur peut être négative). La courbe défile : les
// anciennes mesures partent à gauche et on peut les relire en faisant glisser
// le doigt. "Revenir au direct" ramène à la mesure la plus récente.
// Dessinée avec de simples <View> : aucune bibliothèque supplémentaire.
// ---------------------------------------------------------------------------
const AXE = 42; // largeur de la colonne des valeurs (fixe, à gauche)
const BAS = 18; // hauteur réservée aux repères de temps
const PAD = 8;

const temps = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

const Seg = React.memo(function Seg({ x1, y1, x2, y2, color }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dy, dx);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2 - 1.25,
        width: len,
        height: 2.5,
        borderRadius: 1,
        backgroundColor: color,
        transform: [{ rotate: `${ang}rad` }],
      }}
    />
  );
});

function CourbeBase({ points, largeur, hauteur, pas, couleur = '#38bdf8' }) {
  const scroll = useRef(null);
  const suivre = useRef(true);
  const [enDirect, setEnDirect] = useState(true);

  const n = points ? points.length : 0;
  if (n === 0) {
    return (
      <View style={{ width: largeur, height: hauteur, justifyContent: 'center' }}>
        <Text style={styles.vide}>En attente de données…</Text>
      </View>
    );
  }

  const zone = Math.max(largeur - AXE, 40);
  const hInt = hauteur - BAS;
  const t0 = points[0].t;
  const tN = points[n - 1].t;
  const contenuW = Math.max(zone, 8 + (tN - t0) * pas + 28);

  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const { ymin, ymax, plage } = echelle(min, max);
  const X = (t) => 8 + (t - t0) * pas;
  const Y = (v) => PAD + (1 - (v - ymin) / plage) * (hInt - 2 * PAD);
  const yGrille = (f) => PAD + f * (hInt - 2 * PAD);

  const onScroll = (e) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const fin = contentOffset.x + layoutMeasurement.width >= contentSize.width - 20;
    if (fin !== suivre.current) {
      suivre.current = fin;
      setEnDirect(fin);
    }
  };

  const segments = [];
  for (let i = 1; i < n; i++) {
    const a = points[i - 1];
    const b = points[i];
    segments.push(<Seg key={b.t} x1={X(a.t)} y1={Y(a.v)} x2={X(b.t)} y2={Y(b.v)} color={couleur} />);
  }
  const dernier = points[n - 1];

  return (
    <View style={{ width: largeur, height: hauteur }}>
      {/* valeurs de l'axe vertical (fixes) */}
      {[0, 0.5, 1].map((f) => (
        <Text key={f} style={[styles.axe, { top: yGrille(f) - 7 }]}>
          {fmtEchelle(ymax - f * plage, plage)}
        </Text>
      ))}

      <ScrollView
        ref={scroll}
        horizontal
        style={{ marginLeft: AXE, width: zone, height: hauteur }}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={onScroll}
        onContentSizeChange={() => {
          if (suivre.current && scroll.current) scroll.current.scrollToEnd({ animated: false });
        }}
      >
        <View style={{ width: contenuW, height: hauteur }}>
          {[0, 0.5, 1].map((f) => (
            <View key={f} style={[styles.grille, { top: yGrille(f), width: contenuW }]} />
          ))}
          {ymin < 0 && <View style={[styles.zero, { top: Y(0), width: contenuW }]} />}

          {/* repères de temps toutes les 10 secondes */}
          {points
            .filter((p) => p.t % 10 === 0)
            .map((p) => (
              <View key={`r${p.t}`} pointerEvents="none">
                <View style={[styles.repereV, { left: X(p.t), height: hInt }]} />
                <Text style={[styles.tempsTxt, { left: X(p.t) - 14, top: hInt + 2 }]}>{temps(p.t)}</Text>
              </View>
            ))}

          {segments}

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: X(dernier.t) - 4,
              top: Y(dernier.v) - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#fff',
              borderWidth: 2,
              borderColor: couleur,
            }}
          />
        </View>
      </ScrollView>

      {!enDirect && (
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.direct}
          onPress={() => {
            suivre.current = true;
            setEnDirect(true);
            if (scroll.current) scroll.current.scrollToEnd({ animated: true });
          }}
        >
          <Text style={styles.directTxt}>Revenir au direct</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Ne se redessine que si la série a changé (1 fois par seconde) ou si la taille change
export default React.memo(CourbeBase);

const styles = StyleSheet.create({
  vide: { color: '#6b7c93', fontSize: 13 },
  axe: { position: 'absolute', left: 0, width: AXE - 6, textAlign: 'right', color: '#8fa3bd', fontSize: 10 },
  grille: { position: 'absolute', left: 0, height: 1, backgroundColor: '#26313f' },
  zero: { position: 'absolute', left: 0, height: 1.5, backgroundColor: '#4b5b70' },
  repereV: { position: 'absolute', top: 0, width: 1, backgroundColor: '#1f2937' },
  tempsTxt: { position: 'absolute', width: 28, textAlign: 'center', color: '#6b7c93', fontSize: 9 },
  direct: {
    position: 'absolute',
    right: 6,
    top: 4,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  directTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
