import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  TouchableOpacity,
} from 'react-native';

// ---------------------------------------------------------------------------
// Manette Drone pour Arduino UNO R4 WiFi (sketch drone_wifi.ino)
// Envoie 10 fois par seconde : GET http://192.168.4.1/c?t=GAZ&s=DIRECTION&b=FEUX
//   gaz 0-255, direction 0-255 (128 = centre), feux 0/1
// Joystick gauche (haut) = gaz, joystick droit (gauche/droite) = direction.
// ---------------------------------------------------------------------------
const BASE_URL = 'http://192.168.4.1';
const SEND_MS = 100;
const RADIUS = 70;
const DEADZONE = 0.06;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function App() {
  const { width } = useWindowDimensions();

  const [connected, setConnected] = useState(false);
  const [lights, setLights] = useState(false);
  const [sticks, setSticks] = useState({ left: null, right: null });

  const values = useRef({ lx: 0, ly: 0, rx: 0, ry: 0 });
  const sticksRef = useRef({ left: null, right: null });
  const lightsRef = useRef(false);
  const stopLock = useRef(false);
  const busy = useRef(false);

  // Envoi périodique des commandes à la carte
  useEffect(() => {
    const id = setInterval(async () => {
      if (busy.current) return;
      busy.current = true;
      const v = values.current;

      let gaz = v.ly > DEADZONE ? Math.round(clamp(v.ly, 0, 1) * 255) : 0;
      if (stopLock.current) gaz = 0;
      const dir = Math.abs(v.rx) > DEADZONE ? Math.round(128 + clamp(v.rx, -1, 1) * 127) : 128;
      const feux = lightsRef.current ? 1 : 0;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 400);
      try {
        const res = await fetch(`${BASE_URL}/c?t=${gaz}&s=${dir}&b=${feux}`, {
          signal: controller.signal,
        });
        setConnected(res.ok);
      } catch (e) {
        setConnected(false);
      } finally {
        clearTimeout(timeout);
        busy.current = false;
      }
    }, SEND_MS);
    return () => clearInterval(id);
  }, []);

  const toggleLights = () => {
    lightsRef.current = !lightsRef.current;
    setLights(lightsRef.current);
  };

  const stopNow = () => {
    stopLock.current = true;
    values.current.ly = 0;
  };

  // -------------------------------------------------------------------------
  // Joysticks multi-touch (gestion des touches à la main)
  // -------------------------------------------------------------------------
  const sync = () => setSticks({ ...sticksRef.current });

  const updateValues = () => {
    const s = sticksRef.current;
    values.current = {
      lx: s.left ? s.left.dx / RADIUS : 0,
      ly: s.left ? -s.left.dy / RADIUS : 0,
      rx: s.right ? s.right.dx / RADIUS : 0,
      ry: s.right ? -s.right.dy / RADIUS : 0,
    };
  };

  const limit = (dx, dy) => {
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) return { dx: (dx / d) * RADIUS, dy: (dy / d) * RADIUS };
    return { dx, dy };
  };

  const onTouchStart = (e) => {
    for (const t of e.nativeEvent.changedTouches) {
      const side = t.locationX < width / 2 ? 'left' : 'right';
      if (!sticksRef.current[side]) {
        sticksRef.current[side] = {
          id: t.identifier,
          px: t.pageX,
          py: t.pageY,
          ox: t.locationX,
          oy: t.locationY,
          dx: 0,
          dy: 0,
        };
      }
    }
    updateValues();
    sync();
  };

  const onTouchMove = (e) => {
    for (const t of e.nativeEvent.touches) {
      for (const side of ['left', 'right']) {
        const s = sticksRef.current[side];
        if (s && s.id === t.identifier) {
          const { dx, dy } = limit(t.pageX - s.px, t.pageY - s.py);
          s.dx = dx;
          s.dy = dy;
        }
      }
    }
    updateValues();
    sync();
  };

  const onTouchEnd = (e) => {
    for (const t of e.nativeEvent.changedTouches) {
      for (const side of ['left', 'right']) {
        const s = sticksRef.current[side];
        if (s && s.id === t.identifier) {
          sticksRef.current[side] = null;
          if (side === 'left') stopLock.current = false; // gaz relâché : STOP levé
        }
      }
    }
    updateValues();
    sync();
  };

  const gazPct = Math.round(clamp(values.current.ly, 0, 1) * 100);
  const dirPct = Math.round(clamp(values.current.rx, -1, 1) * 100);

  const renderStick = (s) =>
    s && (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.base,
            { left: s.ox - RADIUS, top: s.oy - RADIUS, width: RADIUS * 2, height: RADIUS * 2 },
          ]}
        />
        <View style={[styles.knob, { left: s.ox + s.dx - 30, top: s.oy + s.dy - 30 }]} />
      </View>
    );

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: connected ? '#2ecc71' : '#e74c3c' }]} />
        <Text style={styles.status}>{connected ? 'Connecté' : 'Hors ligne'}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: lights ? '#f1c40f' : '#3b4a5f' }]}
          onPress={toggleLights}
        >
          <Text style={[styles.btnText, lights && { color: '#000' }]}>Feux</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#e74c3c' }]} onPress={stopNow}>
          <Text style={styles.btnText}>STOP</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.pad}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <View pointerEvents="none" style={styles.hint}>
          <Text style={styles.hintText}>
            Gauche : gaz {gazPct} %      Droite : direction {dirPct} %
          </Text>
        </View>
        {renderStick(sticks.left)}
        {renderStick(sticks.right)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#10141a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: '#161c25',
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  status: { color: '#fff' },
  btn: { borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  pad: { flex: 1 },
  hint: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  hintText: { color: '#4b5b70' },
  base: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#3b4a5f',
    backgroundColor: 'rgba(59,74,95,0.25)',
  },
  knob: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    opacity: 0.9,
  },
});
