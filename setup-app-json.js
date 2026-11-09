// Patch automatique de app.json (marche quelle que soit la version d'Expo).
// Usage : node setup-app-json.js
const fs = require('fs');

const file = 'app.json';
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
const expo = json.expo || json;

expo.name = 'DroneControl';
expo.slug = 'drone-control';
expo.orientation = 'landscape';

expo.ios = expo.ios || {};
expo.ios.bundleIdentifier = 'com.cherifa.dronecontrol';
expo.ios.requireFullScreen = true;
expo.ios.infoPlist = Object.assign({}, expo.ios.infoPlist, {
  // Autorise ws:// (non chiffré) vers l'ESP32 sur le réseau local
  NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
  // Iphone iOS 14+ : message affiché pour la permission "Réseau local"
  NSLocalNetworkUsageDescription:
    "L'application se connecte à la carte ESP32 de ton drone sur le réseau local.",
});

fs.writeFileSync(file, JSON.stringify(json, null, 2));
console.log('app.json mis à jour.');
