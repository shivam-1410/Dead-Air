/**
 * DEAD AIR - AUTHORITATIVE SERVER
 * Express + Socket.io Server managing room sessions,
 * authoritative movement/hazard checks, objective interactions,
 * and the core server-side radio corruption engine.
 *
 * HOSTING CONFIGURATION NOTE:
 * Configure PORT and CORS_ORIGIN via environment variables when deploying to
 * Railway, Render, Fly.io, or VPS targets.
 */

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const LEVEL_DATA = require("./level");
const radio = require("./radio");

// ==========================================
// HOSTING CONFIGURATION (Change via env vars)
// ==========================================
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"]
  }
});

// Serve static client assets (no-cache for live dev updates)
const clientPath = path.join(__dirname, "..", "client");
app.use(
  express.static(clientPath, {
    setHeaders: (res) => {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  })
);

// Handle favicon.ico to prevent 404 noise
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Also serve level data as an API endpoint for flexibility
app.get("/api/level", (req, res) => {
  res.json(LEVEL_DATA);
});

// Serve server/level.js directly if requested by script tag
app.get("/server/level.js", (req, res) => {
  res.sendFile(path.resolve(__dirname, "level.js"));
});

// Route for default index
app.get("/", (req, res) => {
  res.sendFile(path.resolve(clientPath, "index.html"));
});

// In-memory room state storage
// Key: 4-letter room code -> Value: Room state object
const rooms = new Map();

/**
 * Generates a clean 4-letter alphanumeric room code
 */
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

/**
 * Creates a freshly initialized game round within a room
 */
function initializeRound(room) {
  // Pick 1 objective randomly from pool
  const objIndex = Math.floor(Math.random() * LEVEL_DATA.objectivePool.length);
  const activeObjective = LEVEL_DATA.objectivePool[objIndex];

  // Ensure the superheated Molten Lava Bed trench is always active, plus randomized hazards
  const lavaHazard = LEVEL_DATA.hazardPool.find((h) => h.id === "haz_lava_trench");
  const otherHazards = LEVEL_DATA.hazardPool
    .filter((h) => h.id !== "haz_lava_trench")
    .sort(() => 0.5 - Math.random());
  const activeHazards = [lavaHazard, ...otherHazards.slice(0, 2)].filter(Boolean);

  // Pick 1 active keycard that must be acquired to unlock the sealed wing
  const keyIndex = Math.floor(Math.random() * LEVEL_DATA.keycardPool.length);
  const activeKeycard = { ...LEVEL_DATA.keycardPool[keyIndex], collected: false };

  // Initialize locked doors
  const lockedDoors = LEVEL_DATA.lockedDoors.map((door) => ({
    ...door,
    unlocked: false
  }));

  // Spawn contaminated zombies from pool
  const activeZombies = LEVEL_DATA.zombiePool.map((z, idx) => ({
    id: `zombie_${idx + 1}`,
    name: `Infected Mutation #${idx + 1}`,
    x: z.x,
    z: z.z,
    speed: z.speed,
    hp: z.hp,
    maxHp: z.hp,
    attackDamage: z.attackDamage,
    attackRadius: z.attackRadius,
    detectionRadius: z.detectionRadius,
    isDead: false,
    lastAttackTime: 0
  }));

  // Initialize scavengeable supply caches (Ammo crates & Trauma Medkits)
  const supplies = (LEVEL_DATA.supplies || []).map((s) => ({
    ...s,
    collected: false
  }));

  room.gameState = "PLAYING";
  room.roundDurationSec = 180; // 3 minute countdown
  room.remainingSeconds = 180;
  room.startedAt = Date.now();
  room.endedAt = null;
  room.playerHealth = 100;
  room.maxHealth = 100;
  room.activeObjective = activeObjective;
  room.activeHazards = activeHazards;
  room.activeKeycard = activeKeycard;
  room.hasKeycard = false;
  room.lockedDoors = lockedDoors;
  room.supplies = supplies;
  room.zombies = activeZombies;
  room.fieldPosition = {
    x: LEVEL_DATA.spawnPoint.x,
    y: LEVEL_DATA.spawnPoint.y,
    z: LEVEL_DATA.spawnPoint.z,
    rotationY: LEVEL_DATA.spawnPoint.rotationY
  };
  room.result = null;

  // Clear existing timers if any
  if (room.timerInterval) clearInterval(room.timerInterval);
  if (room.simulationInterval) clearInterval(room.simulationInterval);
  if (room.disconnectGraceTimer) {
    clearTimeout(room.disconnectGraceTimer);
    room.disconnectGraceTimer = null;
  }

  // Authoritative 1-second server tick for countdown & telemetry
  room.timerInterval = setInterval(() => {
    if (room.gameState !== "PLAYING") {
      clearInterval(room.timerInterval);
      return;
    }

    room.remainingSeconds -= 1;

    // Check time expiration
    if (room.remainingSeconds <= 0) {
      endRound(room, "FAILURE", "OXYGEN DEPLETION / CRITICAL TIME EXPIRED");
      return;
    }

    // Stream timer & current telemetry
    const signal = radio.computeSignalStrength(room.fieldPosition, LEVEL_DATA);
    io.to(room.code).emit("timer_tick", {
      remainingSeconds: room.remainingSeconds,
      signalStrength: Math.round(signal * 100) / 100
    });
  }, 1000);

  // Authoritative 10Hz (100ms) Simulation Loop for Hazard Suffering & Zombie AI
  room.simulationInterval = setInterval(() => {
    if (room.gameState !== "PLAYING") {
      clearInterval(room.simulationInterval);
      return;
    }

    const dt = 0.1; // 100ms
    const now = Date.now();
    let healthChanged = false;
    let hazardName = null;

    // 1. Authoritative Hazard Continuous Damage (Suffering in Lava / Toxic Gas / Electricity)
    for (const hazard of room.activeHazards) {
      if (isPositionInHazard(room.fieldPosition.x, room.fieldPosition.z, hazard)) {
        const dps = hazard.damagePerSec || 35;
        const dmg = dps * dt;
        room.playerHealth = Math.max(0, room.playerHealth - dmg);
        healthChanged = true;
        hazardName = hazard.name;

        // Emit realistic suffering pain event
        io.to(room.code).emit("player_suffering", {
          health: Math.round(room.playerHealth),
          source: hazard.name,
          type: hazard.type,
          damage: Math.round(dmg * 10) / 10
        });

        if (room.playerHealth <= 0) {
          endRound(
            room,
            "FAILURE",
            `FATAL CASUALTY: ${hazard.name.toUpperCase()} (HEALTH DEPLETED)`
          );
          return;
        }
        break; // take damage from one primary hazard at a time
      }
    }

    // 2. Authoritative Zombie AI Simulation
    let zombieStateUpdated = false;
    for (const zombie of room.zombies) {
      if (zombie.isDead) continue;

      const dist = Math.hypot(
        zombie.x - room.fieldPosition.x,
        zombie.z - room.fieldPosition.z
      );

      // Detection & Pursuit
      if (dist <= zombie.detectionRadius) {
        zombieStateUpdated = true;
        const dx = (room.fieldPosition.x - zombie.x) / (dist || 1);
        const dz = (room.fieldPosition.z - zombie.z) / (dist || 1);

        // Move toward player
        zombie.x += dx * zombie.speed * dt;
        zombie.z += dz * zombie.speed * dt;

        // Attack if in range
        if (dist <= zombie.attackRadius) {
          if (now - zombie.lastAttackTime > 1200) {
            zombie.lastAttackTime = now;
            room.playerHealth = Math.max(0, room.playerHealth - zombie.attackDamage);
            healthChanged = true;

            io.to(room.code).emit("zombie_attack", {
              zombieId: zombie.id,
              damage: zombie.attackDamage,
              health: Math.round(room.playerHealth)
            });

            if (room.playerHealth <= 0) {
              endRound(
                room,
                "FAILURE",
                "TERMINATED BY CONTAMINATED BIOLOGICAL HOSTILE (ZOMBIE PACK)"
              );
              return;
            }
          }
        }
      }
    }

    // Stream regular zombie positions to clients
    io.to(room.code).emit("zombies_update", {
      zombies: room.zombies.map((z) => ({
        id: z.id,
        x: Math.round(z.x * 100) / 100,
        z: Math.round(z.z * 100) / 100,
        hp: z.hp,
        maxHp: z.maxHp,
        isDead: z.isDead
      }))
    });

    // Stream Health & Heart Rate update if changed or periodically
    const stress = Math.min(1.0, (100 - room.playerHealth) / 100 + (hazardName ? 0.3 : 0));
    const calculatedBpm = Math.round(75 + stress * 105);

    io.to(room.code).emit("telemetry_update", {
      health: Math.round(room.playerHealth),
      heartRateBpm: calculatedBpm,
      inHazard: !!hazardName,
      hazardName: hazardName
    });
  }, 100);
}

/**
 * Ends a round authoritatively, clears timers, and notifies both clients
 */
function endRound(room, result, reason) {
  if (room.gameState === "SUCCESS" || room.gameState === "FAILED") return;

  room.gameState = result === "SUCCESS" ? "SUCCESS" : "FAILED";
  room.endedAt = Date.now();
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
  if (room.simulationInterval) {
    clearInterval(room.simulationInterval);
    room.simulationInterval = null;
  }

  const timeElapsedSec = room.startedAt
    ? Math.round((room.endedAt - room.startedAt) / 1000)
    : 0;

  room.result = {
    result,
    reason,
    timeElapsedSec,
    timeRemainingSec: Math.max(0, room.remainingSeconds),
    objective: room.activeObjective ? room.activeObjective.name : "Unknown",
    timestamp: Date.now()
  };

  io.to(room.code).emit("round_ended", room.result);
  console.log(`[Room ${room.code}] Round finished: ${result} - ${reason}`);
}

/**
 * Checks if a 2D point (x, z) falls within a hazard AABB
 */
function isPositionInHazard(x, z, hazard) {
  const b = hazard.bounds;
  const padding = 0.3; // agent collision margin
  return (
    x >= b.minX - padding &&
    x <= b.maxX + padding &&
    z >= b.minZ - padding &&
    z <= b.maxZ + padding
  );
}

/**
 * Sends authoritative mission state to a given socket based on its assigned role
 */
function sendMissionPacket(socket, role, room) {
  if (role === "DISPATCHER") {
    socket.emit("mission_started", {
      role: "DISPATCHER",
      objective: room.activeObjective,
      hazards: room.activeHazards,
      keycard: room.activeKeycard,
      lockedDoors: room.lockedDoors,
      supplies: room.supplies,
      zombies: room.zombies.map((z) => ({
        id: z.id,
        x: z.x,
        z: z.z,
        hp: z.hp,
        maxHp: z.maxHp,
        isDead: z.isDead
      })),
      roundDurationSec: room.roundDurationSec,
      remainingSeconds: room.remainingSeconds,
      fieldSpawn: room.fieldPosition,
      playerHealth: room.playerHealth
    });
  } else {
    socket.emit("mission_started", {
      role: "FIELD",
      roundDurationSec: room.roundDurationSec,
      remainingSeconds: room.remainingSeconds,
      spawn: room.fieldPosition,
      playerHealth: room.playerHealth,
      weapon: LEVEL_DATA.weapon,
      supplies: room.supplies,
      activeKeycard: room.activeKeycard
        ? {
            id: room.activeKeycard.id,
            name: room.activeKeycard.name,
            color: room.activeKeycard.color,
            glowColor: room.activeKeycard.glowColor,
            x: room.activeKeycard.x,
            y: room.activeKeycard.y,
            z: room.activeKeycard.z,
            interactRadius: room.activeKeycard.interactRadius,
            collected: room.activeKeycard.collected
          }
        : null,
      lockedDoors: room.lockedDoors
    });
  }
}

/**
 * Initializes and starts the mission, transmitting operational packets to both linked terminals
 */
function startMissionForRoom(room) {
  initializeRound(room);

  if (room.dispatcherSocketId) {
    const dispSocket = io.sockets.sockets.get(room.dispatcherSocketId);
    if (dispSocket) sendMissionPacket(dispSocket, "DISPATCHER", room);
  }

  if (room.fieldSocketId) {
    const fieldSocket = io.sockets.sockets.get(room.fieldSocketId);
    if (fieldSocket) sendMissionPacket(fieldSocket, "FIELD", room);
  }

  console.log(
    `[Mission Started] Room: ${room.code} | Obj: ${room.activeObjective.name} | Hazards: ${room.activeHazards.length} | Zombies: ${room.zombies.length}`
  );
}

// ==========================================
// SOCKET.IO EVENT ROUTING
// ==========================================
io.on("connection", (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);
  let currentRoomCode = null;

  // 1. Create Room
  socket.on("create_room", (callback) => {
    const code = generateRoomCode();
    const newRoom = {
      code,
      dispatcherSocketId: socket.id,
      fieldSocketId: null,
      gameState: "LOBBY",
      timerInterval: null,
      disconnectGraceTimer: null,
      pendingAutoStart: false,
      fieldPosition: { ...LEVEL_DATA.spawnPoint },
      activeObjective: null,
      activeHazards: [],
      createdAt: Date.now()
    };

    rooms.set(code, newRoom);
    socket.join(code);
    currentRoomCode = code;

    console.log(`[Room Created] Code: ${code} by Dispatcher: ${socket.id}`);

    if (typeof callback === "function") {
      callback({
        success: true,
        roomCode: code,
        role: "DISPATCHER"
      });
    }

    emitRoomState(newRoom);
  });

  // 2. Join Room (Handles Lobby entry, direct role links, and live reconnects)
  socket.on("join_room", ({ roomCode, preferredRole }, callback) => {
    const code = (roomCode || "").toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      if (typeof callback === "function") {
        callback({ success: false, error: "Room not found. Check your 4-letter code." });
      }
      return;
    }

    // Check if existing socket bindings are still alive
    const existingDisp = room.dispatcherSocketId ? io.sockets.sockets.get(room.dispatcherSocketId) : null;
    const existingField = room.fieldSocketId ? io.sockets.sockets.get(room.fieldSocketId) : null;
    const isDispAlive = existingDisp && existingDisp.connected;
    const isFieldAlive = existingField && existingField.connected;

    let assignedRole = null;

    if (preferredRole === "DISPATCHER") {
      if (!isDispAlive || room.dispatcherSocketId === socket.id) {
        room.dispatcherSocketId = socket.id;
        assignedRole = "DISPATCHER";
      } else if (!isFieldAlive) {
        room.fieldSocketId = socket.id;
        assignedRole = "FIELD";
      }
    } else if (preferredRole === "FIELD") {
      if (!isFieldAlive || room.fieldSocketId === socket.id) {
        room.fieldSocketId = socket.id;
        assignedRole = "FIELD";
      } else if (!isDispAlive) {
        room.dispatcherSocketId = socket.id;
        assignedRole = "DISPATCHER";
      }
    } else {
      if (!isDispAlive) {
        room.dispatcherSocketId = socket.id;
        assignedRole = "DISPATCHER";
      } else if (!isFieldAlive) {
        room.fieldSocketId = socket.id;
        assignedRole = "FIELD";
      }
    }

    if (!assignedRole) {
      if (typeof callback === "function") {
        callback({ success: false, error: "Room is currently full (2/2 players)." });
      }
      return;
    }

    socket.join(code);
    currentRoomCode = code;

    // Clear any disconnect grace timer if partner has returned
    if (room.disconnectGraceTimer) {
      clearTimeout(room.disconnectGraceTimer);
      room.disconnectGraceTimer = null;
      io.to(room.code).emit("partner_reconnected");
      console.log(`[Room ${code}] Partner reconnected. Disconnect grace timer cancelled.`);
    }

    console.log(
      `[Player Joined] Socket ${socket.id} joined Room ${code} as ${assignedRole} (State: ${room.gameState})`
    );

    if (typeof callback === "function") {
      callback({
        success: true,
        roomCode: code,
        role: assignedRole,
        gameState: room.gameState
      });
    }

    emitRoomState(room);

    // If game is already PLAYING, immediately stream authoritative mission packet to this socket
    if (room.gameState === "PLAYING") {
      sendMissionPacket(socket, assignedRole, room);
      socket.emit("telemetry_update", {
        health: Math.round(room.playerHealth),
        heartRateBpm: Math.round(75 + (100 - room.playerHealth)),
        inHazard: false
      });
      socket.emit("timer_tick", {
        remainingSeconds: room.remainingSeconds,
        signalStrength: radio.computeSignalStrength(room.fieldPosition, LEVEL_DATA)
      });
      socket.emit("zombies_update", {
        zombies: room.zombies.map((z) => ({
          id: z.id,
          x: z.x,
          z: z.z,
          hp: z.hp,
          maxHp: z.maxHp,
          isDead: z.isDead
        }))
      });
    } else if (room.pendingAutoStart && room.dispatcherSocketId && room.fieldSocketId) {
      // Both operators have connected to their operational terminals after lobby redirect
      console.log(`[Room ${code}] Both operators arrived at operational posts. Launching mission!`);
      room.pendingAutoStart = false;
      startMissionForRoom(room);
    }
  });

  // 3. Swap Roles (Lobby only)
  socket.on("swap_roles", () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "LOBBY") return;

    const temp = room.dispatcherSocketId;
    room.dispatcherSocketId = room.fieldSocketId;
    room.fieldSocketId = temp;

    if (room.dispatcherSocketId) {
      io.to(room.dispatcherSocketId).emit("role_assigned", { role: "DISPATCHER" });
    }
    if (room.fieldSocketId) {
      io.to(room.fieldSocketId).emit("role_assigned", { role: "FIELD" });
    }

    emitRoomState(room);
  });

  // 4. Lobby Launch Protocol (Transitions both players from lobby to their operational pages)
  socket.on("request_launch", () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    if (!room.dispatcherSocketId || !room.fieldSocketId) {
      socket.emit("error_msg", "Both Dispatcher and Field Agent are required to start.");
      return;
    }

    room.pendingAutoStart = true;
    io.to(room.code).emit("navigate_to_game", {
      dispatcherUrl: `/dispatch.html?room=${room.code}`,
      fieldUrl: `/field.html?room=${room.code}`
    });
    console.log(`[Room ${room.code}] Lobby launch requested. Redirecting both operators.`);
  });

  // 5. Start Mission (From radar console button, direct launch, or restart)
  socket.on("start_mission", () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    if (!room.dispatcherSocketId || !room.fieldSocketId) {
      socket.emit("error_msg", "Both Dispatcher and Field Agent are required to start.");
      return;
    }

    startMissionForRoom(room);
  });

  // 5. Field Agent Movement Stream
  socket.on("player_move", (pos) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;

    // Verify socket is the Field Agent
    if (socket.id !== room.fieldSocketId) return;

    // Update authoritative player position
    room.fieldPosition.x = pos.x;
    room.fieldPosition.y = pos.y || 1.6;
    room.fieldPosition.z = pos.z;
    if (typeof pos.rotationY === "number") {
      room.fieldPosition.rotationY = pos.rotationY;
    }

    const currentSignal = radio.computeSignalStrength(room.fieldPosition, LEVEL_DATA);

    // Stream live blip to Dispatcher only
    if (room.dispatcherSocketId) {
      io.to(room.dispatcherSocketId).emit("field_position_update", {
        x: room.fieldPosition.x,
        z: room.fieldPosition.z,
        rotationY: room.fieldPosition.rotationY,
        signalStrength: Math.round(currentSignal * 100) / 100
      });
    }
  });

  // 6. Field Agent Gun Combat: Shoot Hostile Zombies
  socket.on("player_shoot", ({ targetZombieId }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.fieldSocketId) return;

    // Broadcast gunshot sound/muzzle flash effect to both players
    io.to(room.code).emit("gunshot_fired", {
      shooterPosition: room.fieldPosition
    });

    if (targetZombieId) {
      const zombie = room.zombies.find((z) => z.id === targetZombieId && !z.isDead);
      if (zombie) {
        const damage = LEVEL_DATA.weapon.damage || 35;
        zombie.hp = Math.max(0, zombie.hp - damage);

        if (zombie.hp <= 0) {
          zombie.isDead = true;
          io.to(room.code).emit("zombie_killed", {
            zombieId: zombie.id,
            x: zombie.x,
            z: zombie.z
          });
          console.log(`[Zombie Terminated] ${zombie.id} in room ${room.code}`);
        } else {
          io.to(room.code).emit("zombie_hit", {
            zombieId: zombie.id,
            hp: zombie.hp,
            maxHp: zombie.maxHp
          });
        }
      }
    }
  });

  // 7. Field Agent Keycard Pickup
  socket.on("interact_keycard", () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.fieldSocketId) return;

    const key = room.activeKeycard;
    if (!key || key.collected) return;

    const dist = Math.hypot(room.fieldPosition.x - key.x, room.fieldPosition.z - key.z);
    if (dist <= (key.interactRadius || 2.5)) {
      key.collected = true;
      room.hasKeycard = true;

      // Unlock blast door
      for (const door of room.lockedDoors) {
        if (door.id === key.unlocksDoorId || door.requiredKeyId === key.id) {
          door.unlocked = true;
        }
      }

      io.to(room.code).emit("keycard_acquired", {
        keycardName: key.name,
        doorUnlocked: key.unlocksDoorId
      });

      console.log(`[Keycard Collected] ${key.name} in room ${room.code}`);
    }
  });

  // 8. Field Agent Interaction (Press 'E' on Objective)
  socket.on("interact_terminal", () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.fieldSocketId) return;

    const obj = room.activeObjective;
    if (!obj) return;

    // Check interaction distance
    const dist = Math.hypot(room.fieldPosition.x - obj.x, room.fieldPosition.z - obj.z);
    if (dist <= obj.interactRadius) {
      endRound(
        room,
        "SUCCESS",
        `FACILITY OVERRIDE COMPLETE: ${obj.name.toUpperCase()} SECURED AND PURGED`
      );
    } else {
      socket.emit("interaction_failed", { reason: "Out of terminal interaction range." });
    }
  });

  // 7. Dispatcher Radio Transmission -> Field Agent (Corrupted Server-Side)
  socket.on("dispatcher_transmit", ({ text }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.dispatcherSocketId) return;

    const rawText = (text || "").slice(0, 200); // limit length
    if (!rawText.trim()) return;

    // Authoritative Corruption
    const corruptionResult = radio.processMessage(rawText, room.fieldPosition, LEVEL_DATA);

    // Immediate confirmation to Dispatcher (shows sent text + latency + signal, but NOT what arrived)
    socket.emit("transmission_queued", {
      id: Date.now(),
      cleanText: rawText,
      delayMs: corruptionResult.delayMs,
      signalStrength: corruptionResult.signalStrength,
      timestamp: Date.now()
    });

    // Notify Field Agent of incoming carrier wave start
    if (room.fieldSocketId) {
      io.to(room.fieldSocketId).emit("radio_carrier_incoming", {
        delayMs: corruptionResult.delayMs
      });

      // Artificial Delay (2-5s) before delivering corrupted text
      setTimeout(() => {
        if (room.gameState === "PLAYING" && room.fieldSocketId) {
          io.to(room.fieldSocketId).emit("radio_message", {
            from: "DISPATCH",
            corruptedText: corruptionResult.corruptedText,
            signalStrength: corruptionResult.signalStrength,
            timestamp: Date.now()
          });
        }
      }, corruptionResult.delayMs);
    }
  });

  // 8. Field Agent Push-To-Talk Callout -> Dispatcher (Also Corrupted Server-Side!)
  socket.on("field_callout", ({ text }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.fieldSocketId) return;

    const rawText = (text || "").slice(0, 100);
    if (!rawText.trim()) return;

    // Process through identical corruption engine
    const corruptionResult = radio.processMessage(rawText, room.fieldPosition, LEVEL_DATA);

    // Immediate feedback to Field Agent
    socket.emit("callout_transmitted", {
      text: rawText,
      delayMs: corruptionResult.delayMs,
      timestamp: Date.now()
    });

    // Artificial transmission delay to Dispatcher
    setTimeout(() => {
      if (room.gameState === "PLAYING" && room.dispatcherSocketId) {
        io.to(room.dispatcherSocketId).emit("field_radio_received", {
          from: "AGENT",
          corruptedText: corruptionResult.corruptedText,
          signalStrength: corruptionResult.signalStrength,
          timestamp: Date.now()
        });
      }
    }, corruptionResult.delayMs);
  });

  // 9. Dispatcher Tactical Sector Ping -> Field Agent 3D Light Beacon
  socket.on("dispatcher_ping", ({ x, z }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.dispatcherSocketId) return;

    console.log(`[Dispatcher Ping] Room ${room.code} waypoint at X:${x.toFixed(1)}, Z:${z.toFixed(1)}`);
    io.to(room.code).emit("tactical_ping", {
      x,
      z,
      timestamp: Date.now()
    });
  });

  // 10. Field Agent Scavenge Supplies (Ammo & Trauma Medkits)
  socket.on("scavenge_supply", ({ supplyId }) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room || room.gameState !== "PLAYING") return;
    if (socket.id !== room.fieldSocketId) return;

    if (!room.supplies) return;
    const supply = room.supplies.find((s) => s.id === supplyId && !s.collected);
    if (!supply) return;

    const dist = Math.hypot(room.fieldPosition.x - supply.x, room.fieldPosition.z - supply.z);
    if (dist <= (supply.interactRadius || 2.5)) {
      supply.collected = true;

      if (supply.type === "medkit") {
        room.playerHealth = Math.min(100, room.playerHealth + supply.amount);
        io.to(room.code).emit("telemetry_update", {
          health: Math.round(room.playerHealth),
          heartRateBpm: Math.round(75 + (100 - room.playerHealth)),
          inHazard: false
        });
      }

      io.to(room.code).emit("supply_collected", {
        supplyId: supply.id,
        type: supply.type,
        amount: supply.amount,
        name: supply.name,
        health: Math.round(room.playerHealth)
      });

      console.log(`[Supply Scavenged] ${supply.name} in room ${room.code}`);
    }
  });

  // 11. Disconnect Handling with 25-Second Grace Reconnection Period
  socket.on("disconnect", () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    if (!currentRoomCode) return;

    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const isDisp = room.dispatcherSocketId === socket.id;
    const isField = room.fieldSocketId === socket.id;

    if (isDisp) room.dispatcherSocketId = null;
    if (isField) room.fieldSocketId = null;

    // If game was playing, do NOT instantly terminate! Use a 25-second grace period!
    if (room.gameState === "PLAYING") {
      io.to(room.code).emit("partner_disconnected", {
        disconnectedRole: isDisp ? "DISPATCHER" : "FIELD",
        graceSeconds: 25
      });
      console.log(
        `[Room ${room.code}] Player (${isDisp ? "DISPATCHER" : "FIELD"}) disconnected during PLAYING. Starting 25s grace period.`
      );

      if (room.disconnectGraceTimer) clearTimeout(room.disconnectGraceTimer);
      room.disconnectGraceTimer = setTimeout(() => {
        if (room.gameState === "PLAYING" && (!room.dispatcherSocketId || !room.fieldSocketId)) {
          endRound(room, "FAILURE", "RADIO SILENCE: PARTNER SIGNAL PERMANENTLY LOST");
        }
      }, 25000);
    }

    emitRoomState(room);

    // Clean up empty rooms after 5 minutes
    if (!room.dispatcherSocketId && !room.fieldSocketId && room.gameState !== "PLAYING") {
      setTimeout(() => {
        const check = rooms.get(currentRoomCode);
        if (check && !check.dispatcherSocketId && !check.fieldSocketId) {
          if (check.timerInterval) clearInterval(check.timerInterval);
          if (check.simulationInterval) clearInterval(check.simulationInterval);
          rooms.delete(currentRoomCode);
          console.log(`[Room Deleted] Empty Room: ${currentRoomCode}`);
        }
      }, 300000);
    }
  });

  function emitRoomState(room) {
    io.to(room.code).emit("room_state", {
      code: room.code,
      hasDispatcher: !!room.dispatcherSocketId,
      hasField: !!room.fieldSocketId,
      gameState: room.gameState
    });
  }
});

// Start listening
server.listen(PORT, () => {
  console.log("==================================================");
  console.log(` DEAD AIR - Authoritative Server listening on :${PORT}`);
  console.log(` Level Geometry: ${LEVEL_DATA.rooms.length} Rooms, ${LEVEL_DATA.walls.length} Walls`);
  console.log(` Radio Engine: ACTIVE (Authoritative Server-side)`);
  console.log(` Access Game: http://localhost:${PORT}`);
  console.log("==================================================");
});
