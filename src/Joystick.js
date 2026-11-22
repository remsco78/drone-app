import React, { useRef, useState } from 'react';
import { View, Text } from 'react-native';

// ---------------------------------------------------------------------------
// Joystick libre (360°) inspiré de la manette DJI : anneau gris, cavité sombre
// avec un repère en croix, capuchon strié avec un centre clair.
// Le doigt peut aller dans tous les sens (pas de ligne qui bloque). Quand on
// relâche, le capuchon revient au centre.
//
// onChange(x, y) : x de -1 (gauche) à +1 (droite), y de -1 (bas) à +1 (haut),
// avec une amplitude totale limitée à 1 (cercle).
// Chaque joystick suit son propre doigt : les deux marchent en même temps.
// ---------------------------------------------------------------------------
const NB_STRIES = 18;

const Capuchon = ({ K, dx, dy, actif }) => {
  const interieur = K - 5; // largeur utile (bordure retirée)
  const stries = [];
  for (let i = 0; i < NB_STRIES; i++) {
    stries.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: interieur / 2 - 1.25,
          top: interieur / 2 - K * 0.09,
          width: 2.5,
          height: K * 0.18,
          borderRadius: 1,
          backgroundColor: '#9b8f80',
          transform: [{ rotate: `${i * (360 / NB_STRIES)}deg` }, { translateY: -K * 0.36 }],
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: K,
        height: K,
        borderRadius: K / 2,
        backgroundColor: actif ? '#3a342f' : '#2a2521',
        borderWidth: 2.5,
        borderColor: '#5c534a',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateX: dx }, { translateY: dy }],
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      {stries}
      <View
        style={{
          width: K * 0.46,
          height: K * 0.46,
          borderRadius: K * 0.23,
          backgroundColor: '#e4ded2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: K * 0.2, height: K * 0.2, borderRadius: K * 0.1, backgroundColor: '#2a2521' }} />
      </View>
    </View>
  );
};

export default function Joystick({ diametre, zoneStyle, formatLabel, onChange }) {
  const R = diametre / 2;
  const K = diametre * 0.34; // diamètre du capuchon
  const portee = R * 0.9; // glissement du doigt pour la pleine course
  const course = R * 0.42; // déplacement visible du capuchon
  const cavite = diametre * 0.8;
  const interieurCavite = cavite - 4;
  const longueurCroix = diametre * 0.7;

  const [pos, setPos] = useState({ x: 0, y: 0 });
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
    for (const t of Array.from(e.nativeEvent.touches)) {
      if (t.identifier !== touchId.current) continue;
      let dx = t.pageX - origine.current.x;
      let dy = t.pageY - origine.current.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > portee) {
        dx = (dx * portee) / d;
        dy = (dy * portee) / d;
      }
      const x = dx / portee;
      const y = -dy / portee; // vers le haut = positif
      setPos({ x, y });
      onChange(x, y);
    }
  };

  const onEnd = (e) => {
    if (touchId.current === null) return;
    for (const t of Array.from(e.nativeEvent.changedTouches)) {
      if (t.identifier === touchId.current) {
        touchId.current = null;
        setPos({ x: 0, y: 0 });
        setActif(false);
        onChange(0, 0);
      }
    }
  };

  return (
    <View
      style={[
        { position: 'absolute', bottom: 0, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
        zoneStyle,
      ]}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      <View
        pointerEvents="none"
        style={{
          width: diametre,
          height: diametre,
          borderRadius: R,
          backgroundColor: '#9a9ea4',
          borderWidth: 3,
          borderColor: actif ? '#e3e7ec' : '#c3c7cc',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: cavite,
            height: cavite,
            borderRadius: cavite / 2,
            backgroundColor: '#1b1d20',
            borderWidth: 2,
            borderColor: '#30343a',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* repère en croix */}
          <View
            style={{
              position: 'absolute',
              left: (interieurCavite - longueurCroix) / 2,
              top: interieurCavite / 2 - 0.75,
              width: longueurCroix,
              height: 1.5,
              backgroundColor: '#454950',
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: (interieurCavite - longueurCroix) / 2,
              left: interieurCavite / 2 - 0.75,
              height: longueurCroix,
              width: 1.5,
              backgroundColor: '#454950',
            }}
          />
          <Capuchon K={K} dx={pos.x * course} dy={-pos.y * course} actif={actif} />
        </View>
      </View>
      <Text pointerEvents="none" style={{ color: '#6b7c93', fontSize: 12, marginTop: 4, height: 16 }}>
        {formatLabel(pos.x, pos.y)}
      </Text>
    </View>
  );
}
