/**
 * LEVEL GEOMETRY & FACILITY DATA
 * Shared source of truth for Dead Air.
 * Used by server (authoritative collision & radio attenuation)
 * and client (Three.js 3D facility & 2D Dispatcher radar).
 */

const LEVEL_DATA = {
  facilityName: "Sub-Level 07: Echo Research Complex",
  bounds: {
    minX: -38,
    maxX: 38,
    minZ: -38,
    maxZ: 38,
    wallHeight: 3.8
  },
  spawnPoint: {
    x: -28,
    y: 1.6,
    z: -28,
    rotationY: 0
  },
  rooms: [
    {
      id: "airlock",
      name: "Airlock Alpha",
      code: "RM-01",
      bounds: { minX: -36, maxX: -20, minZ: -36, maxZ: -20 },
      center: { x: -28, z: -28 },
      deadZoneFactor: 0.05,
      isDeadZone: false,
      color: "#2a4d3a",
      description: "Decontamination airlock. Safe spawn staging zone with repeater antenna."
    },
    {
      id: "security",
      name: "Security Checkpoint",
      code: "RM-02",
      bounds: { minX: -16, maxX: -4, minZ: -36, maxZ: -20 },
      center: { x: -10, z: -28 },
      deadZoneFactor: 0.15,
      isDeadZone: false,
      color: "#2f3e46",
      description: "Automated biometric gate and security monitors."
    },
    {
      id: "storage",
      name: "Storage Bay Bravo",
      code: "RM-03",
      bounds: { minX: 20, maxX: 36, minZ: -36, maxZ: -20 },
      center: { x: 28, z: -28 },
      deadZoneFactor: 0.25,
      isDeadZone: false,
      color: "#3d3a2a",
      description: "Pressurized chemical canisters and logistical cargo."
    },
    {
      id: "hub",
      name: "Central Hub",
      code: "RM-04",
      bounds: { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
      center: { x: 0, z: 0 },
      deadZoneFactor: 0.0,
      isDeadZone: false,
      color: "#203a43",
      description: "Intersecting central hub. Clear line-of-sight to all major wings."
    },
    {
      id: "reactor",
      name: "Sub-Reactor Core",
      code: "RM-05",
      bounds: { minX: -36, maxX: -20, minZ: -14, maxZ: 14 },
      center: { x: -28, z: 0 },
      deadZoneFactor: 0.90,
      isDeadZone: true,
      color: "#4a1c1c",
      description: "CRITICAL DEAD ZONE. Heavy electromagnetic interference and radiation shields."
    },
    {
      id: "cryo",
      name: "Cryo Vault",
      code: "RM-06",
      bounds: { minX: 20, maxX: 36, minZ: -14, maxZ: 14 },
      center: { x: 28, z: 0 },
      deadZoneFactor: 0.85,
      isDeadZone: true,
      color: "#1c2e4a",
      description: "SEVERE DEAD ZONE. Lead-insulated refrigeration walls damp radio waves."
    },
    {
      id: "lab",
      name: "Research Lab Delta",
      code: "RM-07",
      bounds: { minX: -36, maxX: -20, minZ: 20, maxZ: 36 },
      center: { x: -28, z: 28 },
      deadZoneFactor: 0.35,
      isDeadZone: false,
      color: "#312a4a",
      description: "Biosafety quarantine containment and analytical spectrometers."
    },
    {
      id: "command",
      name: "Command Annex",
      code: "RM-08",
      bounds: { minX: -14, maxX: 14, minZ: 20, maxZ: 36 },
      center: { x: 0, z: 28 },
      deadZoneFactor: 0.20,
      isDeadZone: false,
      color: "#2a3d4d",
      description: "Operations supervisor bridge and server interconnect."
    },
    {
      id: "mainframe",
      name: "Mainframe AI Chamber",
      code: "RM-09",
      bounds: { minX: 20, maxX: 36, minZ: 20, maxZ: 36 },
      center: { x: 28, z: 28 },
      deadZoneFactor: 0.30,
      isDeadZone: false,
      color: "#4d382a",
      description: "Core facility mainframe. Primary emergency terminal repository."
    }
  ],
  // Walls specified as solid AABBs with collision & 3D mesh dimensions
  walls: [
    // Outer perimeter boundary
    { minX: -38, maxX: 38, minZ: -38, maxZ: -36, label: "North Outer Wall" },
    { minX: -38, maxX: 38, minZ: 36, maxZ: 38, label: "South Outer Wall" },
    { minX: -38, maxX: -36, minZ: -38, maxZ: 38, label: "West Outer Wall" },
    { minX: 36, maxX: 38, minZ: -38, maxZ: 38, label: "East Outer Wall" },

    // Airlock Alpha (RM-01)
    { minX: -36, maxX: -20, minZ: -20, maxZ: -19, label: "Airlock South" },
    { minX: -20, maxX: -19, minZ: -36, maxZ: -30, label: "Airlock East North" },
    // Doorway gap z in [-30, -26]
    { minX: -20, maxX: -19, minZ: -26, maxZ: -20, label: "Airlock East South" },
    // Corridor Airlock -> Security Checkpoint
    { minX: -20, maxX: -16, minZ: -31, maxZ: -30, label: "Corridor 1-2 North" },
    { minX: -20, maxX: -16, minZ: -26, maxZ: -25, label: "Corridor 1-2 South" },

    // Security Checkpoint (RM-02)
    { minX: -16, maxX: -15, minZ: -36, maxZ: -30, label: "Security West North" },
    { minX: -16, maxX: -15, minZ: -26, maxZ: -20, label: "Security West South" },
    { minX: -4, maxX: -3, minZ: -36, maxZ: -20, label: "Security East" },
    { minX: -16, maxX: -12, minZ: -20, maxZ: -19, label: "Security South West" },
    // Doorway gap x in [-12, -8]
    { minX: -8, maxX: -4, minZ: -20, maxZ: -19, label: "Security South East" },
    // Corridor Security -> Hub
    { minX: -13, maxX: -12, minZ: -20, maxZ: -16, label: "Corridor 2-4 West" },
    { minX: -8, maxX: -7, minZ: -20, maxZ: -16, label: "Corridor 2-4 East" },

    // Storage Bay Bravo (RM-03)
    { minX: 20, maxX: 36, minZ: -20, maxZ: -19, label: "Storage South" },
    { minX: 19, maxX: 20, minZ: -36, maxZ: -30, label: "Storage West North" },
    // Doorway gap z in [-30, -26]
    { minX: 19, maxX: 20, minZ: -26, maxZ: -20, label: "Storage West South" },
    // Corridor Hub -> Storage Bay
    { minX: 8, maxX: 20, minZ: -31, maxZ: -30, label: "Corridor 4-3 North" },
    { minX: 12, maxX: 20, minZ: -26, maxZ: -25, label: "Corridor 4-3 South" },
    { minX: 7, maxX: 8, minZ: -30, maxZ: -16, label: "Corridor 4-3 West" },
    { minX: 12, maxX: 13, minZ: -25, maxZ: -16, label: "Corridor 4-3 East" },

    // Central Hub (RM-04)
    // North wall with two openings
    { minX: -16, maxX: -12, minZ: -16, maxZ: -15, label: "Hub North West" },
    // Doorway x in [-12, -8]
    { minX: -8, maxX: 8, minZ: -16, maxZ: -15, label: "Hub North Center" },
    // Doorway x in [8, 12]
    { minX: 12, maxX: 16, minZ: -16, maxZ: -15, label: "Hub North East" },
    // West wall with opening to Reactor
    { minX: -16, maxX: -15, minZ: -16, maxZ: -3, label: "Hub West North" },
    // Doorway z in [-3, 3]
    { minX: -16, maxX: -15, minZ: 3, maxZ: 16, label: "Hub West South" },
    // East wall with opening to Cryo
    { minX: 15, maxX: 16, minZ: -16, maxZ: -3, label: "Hub East North" },
    // Doorway z in [-3, 3]
    { minX: 15, maxX: 16, minZ: 3, maxZ: 16, label: "Hub East South" },
    // South wall with opening to Command Annex
    { minX: -16, maxX: -3, minZ: 15, maxZ: 16, label: "Hub South West" },
    // Doorway x in [-3, 3]
    { minX: 3, maxX: 16, minZ: 15, maxZ: 16, label: "Hub South East" },
    // 4 Hub Architectural Pillars
    { minX: -7, maxX: -5, minZ: -7, maxZ: -5, label: "Hub Pillar NW" },
    { minX: 5, maxX: 7, minZ: -7, maxZ: -5, label: "Hub Pillar NE" },
    { minX: -7, maxX: -5, minZ: 5, maxZ: 7, label: "Hub Pillar SW" },
    { minX: 5, maxX: 7, minZ: 5, maxZ: 7, label: "Hub Pillar SE" },

    // Sub-Reactor Core (RM-05 - DEAD ZONE)
    { minX: -36, maxX: -20, minZ: -15, maxZ: -14, label: "Reactor North" },
    { minX: -36, maxX: -20, minZ: 14, maxZ: 15, label: "Reactor South" },
    { minX: -21, maxX: -20, minZ: -14, maxZ: -3, label: "Reactor East North" },
    // Doorway z in [-3, 3]
    { minX: -21, maxX: -20, minZ: 3, maxZ: 14, label: "Reactor East South" },
    // Corridor Reactor -> Hub
    { minX: -20, maxX: -16, minZ: -4, maxZ: -3, label: "Corridor Reactor North" },
    { minX: -20, maxX: -16, minZ: 3, maxZ: 4, label: "Corridor Reactor South" },
    // Reactor central core dampener structure
    { minX: -30, maxX: -26, minZ: -2, maxZ: 2, label: "Reactor Core Center" },

    // Cryo Vault (RM-06 - DEAD ZONE)
    { minX: 20, maxX: 36, minZ: -15, maxZ: -14, label: "Cryo North" },
    { minX: 20, maxX: 36, minZ: 14, maxZ: 15, label: "Cryo South" },
    { minX: 20, maxX: 21, minZ: -14, maxZ: -3, label: "Cryo West North" },
    // Doorway z in [-3, 3]
    { minX: 20, maxX: 21, minZ: 3, maxZ: 14, label: "Cryo West South" },
    // Corridor Cryo -> Hub
    { minX: 16, maxX: 20, minZ: -4, maxZ: -3, label: "Corridor Cryo North" },
    { minX: 16, maxX: 20, minZ: 3, maxZ: 4, label: "Corridor Cryo South" },
    // Cryo stasis pod banks
    { minX: 26, maxX: 30, minZ: -3, maxZ: 3, label: "Cryo Pod Cluster" },

    // Command Annex (RM-08)
    // Corridor Hub -> Command
    { minX: -4, maxX: -3, minZ: 16, maxZ: 20, label: "Corridor Hub-Cmd West" },
    { minX: 3, maxX: 4, minZ: 16, maxZ: 20, label: "Corridor Hub-Cmd East" },
    { minX: -14, maxX: -3, minZ: 19, maxZ: 20, label: "Command North West" },
    { minX: 3, maxX: 14, minZ: 19, maxZ: 20, label: "Command North East" },
    { minX: -15, maxX: -14, minZ: 20, maxZ: 26, label: "Command West North" },
    // Doorway z in [26, 30] to Lab
    { minX: -15, maxX: -14, minZ: 30, maxZ: 36, label: "Command West South" },
    { minX: 14, maxX: 15, minZ: 20, maxZ: 26, label: "Command East North" },
    // Doorway z in [26, 30] to Mainframe
    { minX: 14, maxX: 15, minZ: 30, maxZ: 36, label: "Command East South" },

    // Research Lab Delta (RM-07)
    { minX: -36, maxX: -20, minZ: 19, maxZ: 20, label: "Lab North" },
    { minX: -21, maxX: -20, minZ: 20, maxZ: 26, label: "Lab East North" },
    // Doorway z in [26, 30]
    { minX: -21, maxX: -20, minZ: 30, maxZ: 36, label: "Lab East South" },
    // Corridor Lab -> Command
    { minX: -20, maxX: -14, minZ: 25, maxZ: 26, label: "Corridor Lab-Cmd North" },
    { minX: -20, maxX: -14, minZ: 30, maxZ: 31, label: "Corridor Lab-Cmd South" },

    // Mainframe AI Chamber (RM-09)
    { minX: 20, maxX: 36, minZ: 19, maxZ: 20, label: "Mainframe North" },
    { minX: 20, maxX: 21, minZ: 20, maxZ: 26, label: "Mainframe West North" },
    // Doorway z in [26, 30]
    { minX: 20, maxX: 21, minZ: 30, maxZ: 36, label: "Mainframe West South" },
    // Corridor Mainframe -> Command
    { minX: 14, maxX: 20, minZ: 25, maxZ: 26, label: "Corridor Mainframe-Cmd North" },
    { minX: 14, maxX: 20, minZ: 30, maxZ: 31, label: "Corridor Mainframe-Cmd South" }
  ],

  // Possible objectives for each round (server picks one)
  objectivePool: [
    {
      id: "obj_mainframe",
      roomId: "mainframe",
      name: "Mainframe AI Core",
      roomName: "Mainframe AI Chamber (RM-09)",
      x: 28,
      y: 1.0,
      z: 28,
      interactRadius: 3.2,
      description: "PURGE ANOMALOUS AI CORE AT PRIMARY CONSOLE"
    },
    {
      id: "obj_lab",
      roomId: "lab",
      name: "Biosafety Isolation Unit",
      roomName: "Research Lab Delta (RM-07)",
      x: -28,
      y: 1.0,
      z: 28,
      interactRadius: 3.2,
      description: "ENGAGE LEVEL-4 BIO-ISOLATION LOCKDOWN"
    },
    {
      id: "obj_reactor",
      roomId: "reactor",
      name: "Reactor Manual Scram",
      roomName: "Sub-Reactor Core (RM-05) [DEAD ZONE]",
      x: -28,
      y: 1.0,
      z: 7,
      interactRadius: 3.2,
      description: "MANUALLY ENGAGE EMERGENCY REACTOR SCRAM LEVER"
    },
    {
      id: "obj_cryo",
      roomId: "cryo",
      name: "Cryo Stasis Vent Valve",
      roomName: "Cryo Vault (RM-06) [DEAD ZONE]",
      x: 28,
      y: 1.0,
      z: 7,
      interactRadius: 3.2,
      description: "DEPRESSURIZE CONTAMINATED CRYO-CONTAINMENT"
    },
    {
      id: "obj_storage",
      roomId: "storage",
      name: "Chemical Vent Regulator",
      roomName: "Storage Bay Bravo (RM-03)",
      x: 28,
      y: 1.0,
      z: -28,
      interactRadius: 3.2,
      description: "SEAL PRESSURIZED VOLATILE REAGENT VALVES"
    }
  ],

  // Pool of hazard zones (server activates 1-2 per round)
  hazardPool: [
    {
      id: "haz_security_corridor",
      name: "Neurotoxin Gas Leak",
      type: "toxic_gas",
      roomName: "Corridor to Security Checkpoint",
      bounds: { minX: -12.5, maxX: -7.5, minZ: -20.5, maxZ: -15.5 },
      center: { x: -10, z: -18 },
      radius: 2.8,
      color: "#22c55e",
      warningText: "CORROSIVE NEUROTOXIN DETECTED - LETHAL INHALATION"
    },
    {
      id: "haz_hub_east",
      name: "Exposed High-Voltage Cable",
      type: "electricity",
      roomName: "Central Hub - East Corridor",
      bounds: { minX: 13, maxX: 19, minZ: -4, maxZ: 4 },
      center: { x: 16, z: 0 },
      radius: 2.8,
      color: "#38bdf8",
      warningText: "UNINSULATED 10,000V CONDUIT - ELECTROCUTION RISK"
    },
    {
      id: "haz_hub_west",
      name: "Radioactive Coolant Pool",
      type: "radiation",
      roomName: "Central Hub - West Corridor",
      bounds: { minX: -19, maxX: -13, minZ: -4, maxZ: 4 },
      center: { x: -16, z: 0 },
      radius: 2.8,
      color: "#f59e0b",
      warningText: "IONIZING GAMMA HOTSPOT - IMMEDIATE CELLULAR DECAY"
    },
    {
      id: "haz_command_choke",
      name: "Automated Defense Laser Grid",
      type: "laser_grid",
      roomName: "Command Annex Entry Hall",
      bounds: { minX: -3.5, maxX: 3.5, minZ: 16.5, maxZ: 19.5 },
      center: { x: 0, z: 18 },
      radius: 2.5,
      color: "#ef4444",
      damagePerSec: 30,
      warningText: "ACTIVE TURRET DEFENSE GRID - AUTOMATIC ENGAGEMENT"
    },
    {
      id: "haz_lava_trench",
      name: "Molten Magma Slag Trench",
      type: "lava_bed",
      roomName: "Sub-Reactor Geothermal Breach",
      bounds: { minX: -34, maxX: -22, minZ: -10, maxZ: -4 },
      center: { x: -28, z: -7 },
      radius: 4.0,
      color: "#ff3b00",
      damagePerSec: 50,
      warningText: "SUPERHEATED 2,400°F LAVA BED - SEVERE BURNING DAMAGE"
    }
  ],

  // Keycard items scattered in the facility to unlock specific rooms
  keycardPool: [
    {
      id: "key_security",
      name: "Alpha Security Keycard",
      color: "#38bdf8",
      glowColor: 0x38bdf8,
      roomId: "lab",
      roomName: "Research Lab Delta (RM-07)",
      x: -28,
      y: 0.8,
      z: 32,
      interactRadius: 2.5,
      unlocksDoorId: "door_mainframe",
      description: "Encrypted magnetic keycard unlocking Mainframe Quarantine Gate"
    },
    {
      id: "key_command",
      name: "Supervisor Access Key",
      color: "#fbbf24",
      glowColor: 0xfbbf24,
      roomId: "security",
      roomName: "Security Checkpoint (RM-02)",
      x: -10,
      y: 0.8,
      z: -32,
      interactRadius: 2.5,
      unlocksDoorId: "door_mainframe",
      description: "Supervisor master pass unlocking locked containment doors"
    },
    {
      id: "key_storage",
      name: "Cryo Storage Key",
      color: "#a855f7",
      glowColor: 0xa855f7,
      roomId: "storage",
      roomName: "Storage Bay Bravo (RM-03)",
      x: 28,
      y: 0.8,
      z: -32,
      interactRadius: 2.5,
      unlocksDoorId: "door_mainframe",
      description: "Keycard needed to unlock the quarantine door"
    }
  ],

  // Locked doors that block entry until matching keycard is collected
  lockedDoors: [
    {
      id: "door_mainframe",
      name: "Mainframe Security Blast Door",
      roomName: "Mainframe Entry Corridor",
      bounds: { minX: 19, maxX: 21, minZ: 26, maxZ: 30 },
      center: { x: 20, z: 28 },
      requiredKeyId: "key_security",
      color: "#ef4444",
      unlockedColor: "#22c55e",
      label: "LOCKED // REQUIRES SECURITY KEYCARD"
    }
  ],

  // Contaminated Zombie Spawns roaming the complex
  zombiePool: [
    {
      id: "zombie_storage_1",
      roomId: "storage",
      roomName: "Storage Bay Bravo",
      x: 26,
      z: -26,
      speed: 2.2,
      hp: 60,
      attackDamage: 18,
      attackRadius: 1.8,
      detectionRadius: 18
    },
    {
      id: "zombie_storage_2",
      roomId: "storage",
      roomName: "Storage Bay Bravo",
      x: 30,
      z: -22,
      speed: 2.6,
      hp: 50,
      attackDamage: 15,
      attackRadius: 1.8,
      detectionRadius: 18
    },
    {
      id: "zombie_reactor",
      roomId: "reactor",
      roomName: "Sub-Reactor Core",
      x: -26,
      z: 8,
      speed: 2.1,
      hp: 75,
      attackDamage: 22,
      attackRadius: 1.8,
      detectionRadius: 18
    },
    {
      id: "zombie_lab",
      roomId: "lab",
      roomName: "Research Lab Delta",
      x: -25,
      z: 24,
      speed: 2.7,
      hp: 55,
      attackDamage: 16,
      attackRadius: 1.8,
      detectionRadius: 20
    },
    {
      id: "zombie_hub",
      roomId: "hub",
      roomName: "Central Hub",
      x: 4,
      z: 5,
      speed: 2.4,
      hp: 65,
      attackDamage: 18,
      attackRadius: 1.8,
      detectionRadius: 16
    }
  ],

  // Player combat weapons
  weapon: {
    name: "Tactical Combat Sidearm",
    clipSize: 12,
    reserveAmmo: 48,
    damage: 35,
    fireRateMs: 240,
    reloadDurationMs: 1400
  },

  // Field Scavengeable Supply Caches (Ammo & Trauma Medkits)
  supplies: [
    {
      id: "supply_storage",
      type: "ammo",
      name: "High-Caliber 9mm Ammo Crate",
      amount: 24,
      roomId: "storage",
      roomName: "Storage Bay Bravo",
      x: 32,
      y: 0.5,
      z: -24,
      interactRadius: 2.2,
      collected: false
    },
    {
      id: "supply_security",
      type: "ammo",
      name: "Armory Tactical Ammo Cache",
      amount: 24,
      roomId: "security",
      roomName: "Security Checkpoint",
      x: -6,
      y: 0.5,
      z: -26,
      interactRadius: 2.2,
      collected: false
    },
    {
      id: "supply_medkit_lab",
      type: "medkit",
      name: "Emergency Trauma Autoinjector",
      amount: 35,
      roomId: "lab",
      roomName: "Research Lab Delta",
      x: -22,
      y: 0.5,
      z: 32,
      interactRadius: 2.2,
      collected: false
    }
  ]
};

// Export for Node and browser
if (typeof module !== "undefined" && module.exports) {
  module.exports = LEVEL_DATA;
}
if (typeof window !== "undefined") {
  window.LEVEL_DATA = LEVEL_DATA;
}
