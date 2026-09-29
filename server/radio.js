/**
 * RADIO CORRUPTION ENGINE
 * Server-authoritative signal attenuation and text corruption.
 *
 * CRITICAL RULE:
 * This is the ONLY place corruption happens.
 * Clean strings are processed here and Field Agent receives ONLY the corrupted payload.
 */

const LEVEL_DATA = require("./level");

/**
 * Calculates current signal strength (0.0 to 1.0) based on Field Agent's live coordinates.
 * - Designated dead-zone rooms drop signal down to 0.05 - 0.20
 * - Proximity to walls attenuates signal
 * - Open rooms offer high signal strength
 */
function computeSignalStrength(position, level = LEVEL_DATA) {
  if (!position) return 0.5;
  const { x, z } = position;

  // 1. Identify which room the agent is currently in
  let currentRoom = null;
  for (const room of level.rooms) {
    if (
      x >= room.bounds.minX &&
      x <= room.bounds.maxX &&
      z >= room.bounds.minZ &&
      z <= room.bounds.maxZ
    ) {
      currentRoom = room;
      break;
    }
  }

  let baseSignal = 0.85; // default corridor baseline

  if (currentRoom) {
    if (currentRoom.isDeadZone) {
      // Sub-Reactor Core or Cryo Vault: heavily attenuated
      const penalty = currentRoom.deadZoneFactor || 0.9;
      // Distance from center of dead zone - deep in room drops even lower
      const distToCenter = Math.hypot(x - currentRoom.center.x, z - currentRoom.center.z);
      const deepDamping = Math.max(0.05, 0.2 - distToCenter * 0.015);
      baseSignal = Math.min(1.0 - penalty + 0.08, deepDamping);
    } else {
      // Normal rooms (Airlock, Security, Hub, Lab, Command, Storage, Mainframe)
      baseSignal = 1.0 - (currentRoom.deadZoneFactor || 0.05);
    }
  }

  // 2. Wall proximity degradation
  // Electromagnetic reflection & attenuation near solid concrete/lead walls
  let nearestWallDist = 999;
  for (const wall of level.walls) {
    const cx = Math.max(wall.minX, Math.min(x, wall.maxX));
    const cz = Math.max(wall.minZ, Math.min(z, wall.maxZ));
    const d = Math.hypot(x - cx, z - cz);
    if (d < nearestWallDist) {
      nearestWallDist = d;
    }
  }

  // If agent is hugging a wall (dist < 1.8m), attenuate signal
  if (nearestWallDist < 1.8) {
    const wallPenalty = ((1.8 - nearestWallDist) / 1.8) * 0.35;
    baseSignal -= wallPenalty;
  }

  // 3. Subtle micro-jitter to simulate atmospheric carrier wave fluctuations
  const jitter = (Math.random() - 0.5) * 0.04;
  let finalSignal = baseSignal + jitter;

  // Clamp within [0.03, 1.0]
  return Math.max(0.03, Math.min(1.0, finalSignal));
}

/**
 * Static & glitch tokens used during audio-visual text corruption
 */
const STATIC_GLITCHES = [
  "[STATIC]",
  "*kzzt*",
  "*crackle*",
  "...",
  "[INAUDIBLE]",
  "---",
  "*skrrt*",
  "*hiss*",
  "[BREAKING UP]"
];

const GLITCH_CHARS = ["#", "~", "*", "%", "_", "?", "/", "§", "░", "▒"];

/**
 * Corrupts an individual word with character substitutions or static glitz
 */
function garbleWord(word, intensity) {
  if (Math.random() < 0.3) {
    return STATIC_GLITCHES[Math.floor(Math.random() * STATIC_GLITCHES.length)];
  }

  // Character-level degradation
  const chars = word.split("");
  const garbled = chars.map((char) => {
    if (Math.random() < intensity) {
      return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
    return char;
  });

  return garbled.join("");
}

/**
 * Main radio corruption engine.
 * Takes a raw message + agent position, calculates signal strength,
 * applies word deletions, garbling, duplications, and calculates 2-5s artificial delay.
 *
 * @param {string} rawMessage The clean text input
 * @param {object} position { x, z } of Field Agent
 * @param {object} level Level geometry source of truth
 * @returns {object} { corruptedText, signalStrength, delayMs, cleanText }
 */
function processMessage(rawMessage, position, level = LEVEL_DATA) {
  const signal = computeSignalStrength(position, level);

  // Artificial transmission delay: 2000ms (at signal 1.0) up to 5000ms (at signal 0.0)
  const delayMs = Math.round(2000 + (1.0 - signal) * 3000);

  const cleanTrimmed = (rawMessage || "").trim();
  if (!cleanTrimmed) {
    return {
      cleanText: "",
      corruptedText: "*click*",
      signalStrength: signal,
      delayMs: 2000
    };
  }

  // Probabilities inversely tied to signal strength
  const degradation = 1.0 - signal;
  const pDelete = Math.min(0.85, degradation * 0.8);
  const pGarble = Math.min(0.80, degradation * 0.7);
  const pDuplicate = Math.min(0.35, degradation * 0.25);

  // Near-total dead zone (< 0.12 signal)
  if (signal < 0.12) {
    const staticBursts = [
      "*HEAVY STATIC* ... [SIGNAL LOST] ...",
      "... *kzzzzt* ... *crackle* ... inaudible ...",
      "... [CARRIER FREQUENCY UNSTABLE] ... *hiss* ...",
      "*skrrrt* ... repeat ... *KZZT* ...",
      "... *white noise* ..."
    ];
    return {
      cleanText: cleanTrimmed,
      corruptedText: staticBursts[Math.floor(Math.random() * staticBursts.length)],
      signalStrength: Math.round(signal * 100) / 100,
      delayMs
    };
  }

  const rawWords = cleanTrimmed.split(/\s+/);
  const resultWords = [];

  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];

    // Word deletion check
    if (Math.random() < pDelete) {
      // Small chance of leaving a static artifact instead of complete emptiness
      if (Math.random() < 0.4) {
        resultWords.push("...");
      }
      continue;
    }

    // Word duplication (radio echo/stutter)
    if (Math.random() < pDuplicate) {
      resultWords.push(word + "...");
    }

    // Word garbling
    if (Math.random() < pGarble) {
      resultWords.push(garbleWord(word, degradation * 0.75));
    } else {
      resultWords.push(word);
    }
  }

  // Fallback if all words were deleted
  let finalCorruptedText = resultWords.join(" ").trim();
  if (!finalCorruptedText || finalCorruptedText === "...") {
    finalCorruptedText = "... *crackle* ... [CARRIER WEAK] ... *click*";
  }

  return {
    cleanText: cleanTrimmed, // Retained strictly for server/dispatcher log, NEVER sent to Field client
    corruptedText: finalCorruptedText,
    signalStrength: Math.round(signal * 100) / 100,
    delayMs
  };
}

module.exports = {
  computeSignalStrength,
  processMessage
};
