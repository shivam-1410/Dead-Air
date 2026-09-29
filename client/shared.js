/**
 * DEAD AIR - SHARED CLIENT UTILITIES
 * Used by both Field Agent (3D Three.js) and Dispatcher (2D Canvas).
 * - Socket initialization & Room Code URL management
 * - Web Audio API procedural sound synthesizer (radio static, squelch, clicks, Geiger, alarms)
 * - Level collision and geometry calculation helpers
 */

// Global Audio Context initialized on user gesture
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Procedural Audio Synthesizer
 * Generates all tactical audio effects natively via Web Audio API.
 * No external MP3/WAV assets needed.
 */
const SoundFX = {
  // Radio mic press / release mechanical click
  playMicClick(isRelease = false) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(isRelease ? 440 : 880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  },

  // Radio carrier wave squelch burst (opening or closing transmission)
  playSquelchBurst(duration = 0.15) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, ctx.currentTime);
    filter.Q.setValueAtTime(3.5, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  },

  // Ambient radio noise burst for incoming transmission
  playIncomingTransmissionStatic(durationSec = 1.5) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(1800, ctx.currentTime + durationSec);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + durationSec);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  },

  // Geiger counter single radiation click
  playGeigerClick() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.015);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.02);
  },

  // Terminal interaction override chime (Success)
  playTerminalSuccess() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.55);
    });
  },

  // Emergency Alarm / Failure Klaxon
  playEmergencyAlarm() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(280, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  },

  // Tactical Radar Ping
  playRadarPing() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  },

  // 1. Tactical Gunshot Audio (Boom + Transient Crack + Low Frequency Thump)
  playGunshot() {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Transient crack (noise burst)
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(800, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();

    // Body punch (low frequency sine drop)
    const punch = ctx.createOscillator();
    const punchGain = ctx.createGain();

    punch.type = "triangle";
    punch.frequency.setValueAtTime(220, ctx.currentTime);
    punch.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.18);

    punchGain.gain.setValueAtTime(0.5, ctx.currentTime);
    punchGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    punch.connect(punchGain);
    punchGain.connect(ctx.destination);

    punch.start();
    punch.stop(ctx.currentTime + 0.25);
  },

  // Gun Dry-Fire Click
  playGunEmpty() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  },

  // Gun Reload Mechanical Action
  playReload() {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Mag drop click + Bolt rack
    [0, 0.25, 0.55].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === 2 ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(idx === 2 ? 650 : 380 + idx * 200, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + delay + 0.06);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.08);
    });
  },

  // Zombie eerie groan (Distorted FM vocaloid pitch drop)
  playZombieGroan() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(75, ctx.currentTime + 0.6);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, ctx.currentTime);
    filter.Q.setValueAtTime(6, ctx.currentTime);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.85);
  },

  // Zombie bite / flesh attack impact
  playZombieAttack() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  },

  // Zombie Death Screech
  playZombieDeath() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  },

  // Realistic Player Suffering (Pain Grunt, Choking Cough, or Lava Burn)
  playPlayerSuffering(type = "burn") {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (type === "lava_bed" || type === "burn") {
      // Lava sizzle & flesh burn hiss
      const bufferSize = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.35;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2200, ctx.currentTime);
      filter.Q.setValueAtTime(2.0, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    }

    // Heavy painful vocal gasp/cough
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  },

  // Deep Sub-Bass Heartbeat Thump (lub-dub)
  playHeartbeat() {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.14].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(65, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + delay + 0.09);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.12);
    });
  },

  // Keycard Access Granted Electronic Chime
  playKeycardAcquired() {
    const ctx = getAudioContext();
    if (!ctx) return;
    [880, 1174.66, 1760].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.3);
    });
  },

  // Echolocation / Acoustic Sonar Pulse (High-resonance submarine chirp + reverberant decay)
  playSonarPulse() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(2100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(950, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  },

  // Tactical Flashlight Mode Toggle (Crisp mechanical click + electrical switch)
  playFlashlightSwitch() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.035);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  },

  // Tactical Ammo Scavenge / Supply Pickup (Metallic ratcheting cassette sound)
  playAmmoPickup() {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.06, 0.14].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(750 + i * 180, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + delay + 0.05);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.07);
    });
  },

  // Directional Acoustic Beacon Ping (Waypoint from Dispatcher)
  playAcousticPing() {
    const ctx = getAudioContext();
    if (!ctx) return;
    [1046.5, 1318.51, 1567.98].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
      gain.gain.setValueAtTime(0.16, ctx.currentTime + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.06);
      osc.stop(ctx.currentTime + idx * 0.06 + 0.45);
    });
  }
};

/**
 * URL and Room helpers
 */
function getRoomCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("room") || "";
  return code.toUpperCase().trim();
}

function setRoomCodeInURL(code) {
  const url = new URL(window.location);
  url.searchParams.set("room", code);
  window.history.replaceState({}, "", url);
}

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Fetches level data from server or window fallback
 */
async function loadLevelData() {
  if (window.LEVEL_DATA) {
    return window.LEVEL_DATA;
  }
  try {
    const res = await fetch("/api/level");
    const data = await res.json();
    window.LEVEL_DATA = data;
    return data;
  } catch (err) {
    console.error("Failed to load level data:", err);
    return null;
  }
}

/**
 * Slide-based circle-to-AABB collision resolution.
 * Allows smooth wall sliding in FPS controls without catching corners.
 *
 * @param {number} x Current X
 * @param {number} z Current Z
 * @param {number} radius Player collision radius (~0.45m)
 * @param {Array} walls Array of wall AABB objects { minX, maxX, minZ, maxZ }
 * @returns {object} { x, z, collided }
 */
function resolveWallCollisions(x, z, radius, walls) {
  let posX = x;
  let posZ = z;
  let collided = false;
  const rSq = radius * radius;

  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];

    // Fast broadphase bounding check: skip walls far from player
    if (
      posX < wall.minX - radius ||
      posX > wall.maxX + radius ||
      posZ < wall.minZ - radius ||
      posZ > wall.maxZ + radius
    ) {
      continue;
    }

    // Find closest point on wall AABB
    const closestX = Math.max(wall.minX, Math.min(posX, wall.maxX));
    const closestZ = Math.max(wall.minZ, Math.min(posZ, wall.maxZ));

    const dx = posX - closestX;
    const dz = posZ - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < rSq && distSq > 0.000001) {
      collided = true;
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;

      // Push out along normal
      posX += (dx / dist) * overlap;
      posZ += (dz / dist) * overlap;
    } else if (distSq <= 0.000001) {
      // Degenerate case: inside wall center, push towards nearest face
      collided = true;
      posX += radius;
    }
  }

  return { x: posX, z: posZ, collided };
}

/**
 * Finds which room a given coordinate is inside
 */
function getRoomAtPosition(x, z, levelData) {
  if (!levelData || !levelData.rooms) return null;
  for (const room of levelData.rooms) {
    if (
      x >= room.bounds.minX &&
      x <= room.bounds.maxX &&
      z >= room.bounds.minZ &&
      z <= room.bounds.maxZ
    ) {
      return room;
    }
  }
  return null;
}

// Make helpers globally available
window.SoundFX = SoundFX;
window.getAudioContext = getAudioContext;
window.getRoomCodeFromURL = getRoomCodeFromURL;
window.setRoomCodeInURL = setRoomCodeInURL;
window.formatTime = formatTime;
window.loadLevelData = loadLevelData;
window.resolveWallCollisions = resolveWallCollisions;
window.getRoomAtPosition = getRoomAtPosition;
