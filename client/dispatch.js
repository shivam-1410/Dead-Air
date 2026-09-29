/**
 * DEAD AIR - DISPATCHER CLIENT
 * Top-Down 2D Radar Canvas + Authoritative Comms Terminal
 * Enhanced with:
 * - Live Operator Health & ECG Heart Rate Biometrics
 * - Molten Lava Bed rendering with temperature warnings
 * - Zombie threat radar tracking with animated proximity threat lines
 * - Keycard location beacon & locked blast door security status
 */

(function () {
  const socket = io();
  const roomCode = window.getRoomCodeFromURL();

  // DOM Elements
  const roomCodeDisplay = document.getElementById("roomCodeDisplay");
  const connectionBadge = document.getElementById("connectionBadge");
  const missionTimer = document.getElementById("missionTimer");
  const sectorReadout = document.getElementById("sectorReadout");
  const radarCanvas = document.getElementById("radarCanvas");
  const radarOverlayStatus = document.getElementById("radarOverlayStatus");
  const agentHeartRateBadge = document.getElementById("agentHeartRateBadge");
  const agentHealthNum = document.getElementById("agentHealthNum");
  const agentHealthBarFill = document.getElementById("agentHealthBarFill");
  const keycardReadout = document.getElementById("keycardReadout");
  const zombieTrackerReadout = document.getElementById("zombieTrackerReadout");
  const signalValueText = document.getElementById("signalValueText");
  const signalBarFill = document.getElementById("signalBarFill");
  const signalWarningNotice = document.getElementById("signalWarningNotice");
  const estLatencyText = document.getElementById("estLatencyText");
  const corruptionRiskText = document.getElementById("corruptionRiskText");
  const txForm = document.getElementById("txForm");
  const txInput = document.getElementById("txInput");
  const txButton = document.getElementById("txButton");
  const commsLog = document.getElementById("commsLog");
  const debriefModal = document.getElementById("debriefModal");
  const debriefStatus = document.getElementById("debriefStatus");
  const debriefReason = document.getElementById("debriefReason");
  const debriefDuration = document.getElementById("debriefDuration");
  const debriefObjective = document.getElementById("debriefObjective");
  const btnRestartMission = document.getElementById("btnRestartMission");

  const ctx = radarCanvas.getContext("2d");

  // State
  let levelData = window.LEVEL_DATA || null;
  let currentMission = null;
  let agentPosition = null;
  let agentTrail = [];
  let currentSignal = 1.0;
  let currentHealth = 100;
  let currentHeartRate = 75;
  let activeZombies = [];
  let activeKeycard = null;
  let activeLockedDoors = [];
  let activeSupplies = [];
  let activePings = [];
  let radarSweepAngle = 0;
  let animFrameId = null;

  roomCodeDisplay.textContent = roomCode || "----";

  // Load level geometry if not already loaded
  window.loadLevelData().then((data) => {
    levelData = data;
    resizeCanvas();
    renderRadar();
  });

  // Socket Connection and Room Handshake
  socket.on("connect", () => {
    console.log("[Dispatcher] Connected to server.");
    connectionBadge.textContent = "LINKED";
    connectionBadge.className = "badge badge-success";

    if (roomCode) {
      socket.emit(
        "join_room",
        { roomCode, preferredRole: "DISPATCHER" },
        (res) => {
          if (!res.success) {
            alert(res.error || "Failed to join room.");
            window.location.href = "/";
          } else {
            console.log("[Dispatcher] Joined room successfully:", res);
          }
        }
      );
    } else {
      window.location.href = "/";
    }
  });

  socket.on("disconnect", () => {
    connectionBadge.textContent = "OFFLINE";
    connectionBadge.className = "badge badge-danger";
  });

  // Room State Updates
  socket.on("room_state", (state) => {
    if (!state.hasField) {
      radarOverlayStatus.textContent = "WAITING FOR FIELD AGENT TO CONNECT...";
      radarOverlayStatus.style.display = "flex";
    } else if (state.gameState === "LOBBY") {
      radarOverlayStatus.innerHTML = `
        <span>FIELD AGENT READY ON STAGING LINK.</span>
        <button id="btnLaunchFromRadar" class="btn-terminal-lg" style="margin-top:12px;">LAUNCH MISSION PROTOCOL</button>
      `;
      radarOverlayStatus.style.display = "flex";
      const launchBtn = document.getElementById("btnLaunchFromRadar");
      if (launchBtn) {
        launchBtn.onclick = () => socket.emit("start_mission");
      }
    } else if (state.gameState === "PLAYING") {
      radarOverlayStatus.style.display = "none";
    }
  });

  // Mission Started
  socket.on("mission_started", (packet) => {
    console.log("[Dispatcher] Mission Started:", packet);
    currentMission = packet;
    agentPosition = { ...packet.fieldSpawn };
    agentTrail = [{ x: agentPosition.x, z: agentPosition.z }];
    activeKeycard = packet.keycard ? { ...packet.keycard } : null;
    activeLockedDoors = packet.lockedDoors ? [...packet.lockedDoors] : [];
    activeZombies = packet.zombies ? [...packet.zombies] : [];
    activeSupplies = packet.supplies ? [...packet.supplies] : [];
    radarOverlayStatus.style.display = "none";
    debriefModal.classList.add("hidden");

    window.SoundFX.playTerminalSuccess();
    appendLog("SYSTEM", `MISSION ACTIVE. TARGET: ${packet.objective.name}. SECURE AND OVERRIDE.`);

    if (packet.keycard) {
      keycardReadout.textContent = `${packet.keycard.roomName.toUpperCase()}`;
      appendLog("SYSTEM", `SECURITY ALERT: ${packet.keycard.name.toUpperCase()} REQUIRED TO ENTER TERMINAL WING.`);
    }

    if (packet.hazards && packet.hazards.length > 0) {
      appendLog(
        "SYSTEM",
        `WARNING: ${packet.hazards.length} HAZARD ZONES DETECTED (INCLUDING VOLCANIC LAVA BED). WARN AGENT.`
      );
    }
  });

  // Tactical Waypoint Ping Echo
  socket.on("tactical_ping", ({ x, z }) => {
    activePings.push({ x, z, startTime: Date.now() });
    window.SoundFX.playAcousticPing();
  });

  // Supply Cache Retreived Event
  socket.on("supply_collected", (data) => {
    const supply = activeSupplies.find((s) => s.id === data.supplyId);
    if (supply) supply.collected = true;
    window.SoundFX.playTerminalSuccess();
    appendLog(
      "SYSTEM",
      `RESOURCE SECURED: AGENT RETRIEVED ${data.name.toUpperCase()}! ${data.type === "ammo" ? "+24 ROUNDS" : "+35% HEALTH"}`
    );
  });

  // Reconnection & Partner Status Alerts
  socket.on("partner_disconnected", ({ disconnectedRole, graceSeconds }) => {
    appendLog("SYSTEM", `⚠ CRITICAL ALERT: ${disconnectedRole} COMM LINK UNSTABLE. RECONNECT GRACE: ${graceSeconds}s`);
    window.SoundFX.playEmergencyAlarm();
  });

  socket.on("partner_reconnected", () => {
    appendLog("SYSTEM", `✓ COMM LINK RE-ESTABLISHED: PARTNER RECONNECTED. ALL SYSTEMS ONLINE.`);
    window.SoundFX.playTerminalSuccess();
  });

  // Timer Tick
  socket.on("timer_tick", ({ remainingSeconds, signalStrength }) => {
    missionTimer.textContent = window.formatTime(remainingSeconds);
    if (remainingSeconds <= 30) {
      missionTimer.classList.add("timer-critical");
    } else {
      missionTimer.classList.remove("timer-critical");
    }

    if (typeof signalStrength === "number") {
      updateSignalGauge(signalStrength);
    }
  });

  // Telemetry & Biometrics Stream (Health & Heart Rate)
  socket.on("telemetry_update", (data) => {
    currentHealth = data.health;
    currentHeartRate = data.heartRateBpm;

    agentHealthNum.textContent = `${currentHealth}%`;
    agentHealthBarFill.style.width = `${currentHealth}%`;
    agentHeartRateBadge.textContent = `♥ ${currentHeartRate} BPM`;

    if (currentHealth > 60) {
      agentHealthBarFill.className = "signal-bar-fill fill-nominal";
      agentHeartRateBadge.style.color = "#4ade80";
    } else if (currentHealth > 25) {
      agentHealthBarFill.className = "signal-bar-fill fill-degraded";
      agentHeartRateBadge.style.color = "#f59e0b";
    } else {
      agentHealthBarFill.className = "signal-bar-fill fill-critical";
      agentHeartRateBadge.style.color = "#ef4444";
    }

    if (data.inHazard) {
      appendLog("SYSTEM", `CRITICAL: AGENT IS SUFFERING SEVERE BURNING IN ${data.hazardName.toUpperCase()}!`);
    }
  });

  // Zombie Contacts Stream
  socket.on("zombies_update", (data) => {
    if (data.zombies) {
      activeZombies = data.zombies;
      const aliveCount = activeZombies.filter((z) => !z.isDead).length;
      zombieTrackerReadout.textContent = `${aliveCount} HOSTILES ACTIVE`;
      zombieTrackerReadout.style.color = aliveCount > 0 ? "#ef4444" : "#22c55e";
    }
  });

  socket.on("zombie_killed", (data) => {
    appendLog("SYSTEM", `BIO-SCAN CONFIRMED: Hostile mutation terminated by agent.`);
  });

  // Keycard Acquired
  socket.on("keycard_acquired", (data) => {
    window.SoundFX.playKeycardAcquired();
    keycardReadout.textContent = "ACCESS GRANTED (UNLOCKED)";
    keycardReadout.style.color = "#4ade80";

    if (activeKeycard) activeKeycard.collected = true;
    activeLockedDoors.forEach((door) => {
      door.unlocked = true;
    });

    appendLog("SYSTEM", `KEYCARD ACQUIRED: Blast doors unlocked. Guide agent to primary terminal.`);
  });

  // Field Agent Live Position Stream
  socket.on("field_position_update", (data) => {
    agentPosition = data;

    if (
      agentTrail.length === 0 ||
      Math.hypot(
        agentTrail[agentTrail.length - 1].x - data.x,
        agentTrail[agentTrail.length - 1].z - data.z
      ) > 0.8
    ) {
      agentTrail.push({ x: data.x, z: data.z });
      if (agentTrail.length > 40) agentTrail.shift();
    }

    updateSignalGauge(data.signalStrength);

    // Identify Sector
    if (levelData) {
      const room = window.getRoomAtPosition(data.x, data.z, levelData);
      if (room) {
        sectorReadout.textContent = `AGENT SECTOR: ${room.name.toUpperCase()}`;
        if (room.isDeadZone) {
          sectorReadout.textContent += " ⚠ [DEAD ZONE]";
        }
      } else {
        sectorReadout.textContent = "AGENT SECTOR: TRANSIT CORRIDOR";
      }
    }
  });

  // Dispatcher TX Acknowledgment
  socket.on("transmission_queued", (ack) => {
    window.SoundFX.playMicClick();
    const estSec = (ack.delayMs / 1000).toFixed(1);
    appendLog(
      "DISPATCH_TX",
      `"${ack.cleanText}"`,
      `[Est Delay: ${estSec}s | Signal: ${Math.round(ack.signalStrength * 100)}%]`
    );
  });

  // Corrupted Callout Received from Field Agent
  socket.on("field_radio_received", (msg) => {
    window.SoundFX.playSquelchBurst(0.2);
    window.SoundFX.playIncomingTransmissionStatic(0.8);
    const sigPct = Math.round(msg.signalStrength * 100);
    appendLog("AGENT_RX", `"${msg.corruptedText}"`, `[Signal: ${sigPct}%]`);
  });

  // Round Ended (Debrief)
  socket.on("round_ended", (result) => {
    console.log("[Dispatcher] Round Ended:", result);
    debriefModal.classList.remove("hidden");

    if (result.result === "SUCCESS") {
      window.SoundFX.playTerminalSuccess();
      debriefStatus.textContent = "OPERATION ACCOMPLISHED // FACILITY PURGED";
      debriefStatus.className = "debrief-status status-win";
      debriefReason.textContent = result.reason;
    } else {
      window.SoundFX.playEmergencyAlarm();
      debriefStatus.textContent = "OPERATION FAILED // AGENT LOST";
      debriefStatus.className = "debrief-status status-loss";
      debriefReason.textContent = result.reason;
    }

    debriefDuration.textContent = window.formatTime(result.timeElapsedSec);
    debriefObjective.textContent = result.objective;
  });

  // Restart Mission Handler
  btnRestartMission.onclick = () => {
    socket.emit("start_mission");
  };

  function updateSignalGauge(signal) {
    currentSignal = signal;
    const pct = Math.round(signal * 100);
    signalValueText.textContent = `${pct}%`;
    signalBarFill.style.width = `${pct}%`;

    const estMs = Math.round(2000 + (1.0 - signal) * 3000);
    estLatencyText.textContent = `~${(estMs / 1000).toFixed(1)}s`;

    if (signal > 0.75) {
      signalBarFill.className = "signal-bar-fill fill-nominal";
      corruptionRiskText.textContent = "LOW";
      corruptionRiskText.style.color = "#22c55e";
      signalWarningNotice.textContent = "CARRIER STABLE: High fidelity reception.";
      signalWarningNotice.style.color = "#86efac";
    } else if (signal > 0.35) {
      signalBarFill.className = "signal-bar-fill fill-degraded";
      corruptionRiskText.textContent = "MODERATE";
      corruptionRiskText.style.color = "#eab308";
      signalWarningNotice.textContent = "CARRIER DEGRADED: Partial word garbling expected.";
      signalWarningNotice.style.color = "#fef08a";
    } else {
      signalBarFill.className = "signal-bar-fill fill-critical";
      corruptionRiskText.textContent = "SEVERE";
      corruptionRiskText.style.color = "#ef4444";
      signalWarningNotice.textContent =
        "CRITICAL INTERFERENCE: Heavy static, word loss & delay.";
      signalWarningNotice.style.color = "#fca5a5";
    }
  }

  // Transmit Form Handling
  txForm.onsubmit = (e) => {
    e.preventDefault();
    const text = txInput.value.trim();
    if (!text) return;

    window.getAudioContext();
    socket.emit("dispatcher_transmit", { text });
    txInput.value = "";
    txInput.focus();
  };

  // Macro Buttons
  document.querySelectorAll(".btn-macro").forEach((btn) => {
    btn.onclick = () => {
      const macro = btn.getAttribute("data-macro");
      if (macro) {
        window.getAudioContext();
        socket.emit("dispatcher_transmit", { text: macro });
      }
    };
  });

  // Comms Log Utility
  function appendLog(type, text, meta = "") {
    const entry = document.createElement("div");
    const now = new Date();
    const timeStr = `[${now.toTimeString().slice(0, 8)}]`;

    if (type === "SYSTEM") {
      entry.className = "log-entry system-entry";
      entry.innerHTML = `<span class="log-time">${timeStr}</span> [SYSTEM] ${text}`;
    } else if (type === "DISPATCH_TX") {
      entry.className = "log-entry tx-entry";
      entry.innerHTML = `<span class="log-time">${timeStr}</span> <strong class="tx-tag">TX ➔ AGENT:</strong> ${text} <span class="log-meta">${meta}</span>`;
    } else if (type === "AGENT_RX") {
      entry.className = "log-entry rx-entry";
      entry.innerHTML = `<span class="log-time">${timeStr}</span> <strong class="rx-tag">RX 🠔 AGENT:</strong> ${text} <span class="log-meta">${meta}</span>`;
    }

    commsLog.appendChild(entry);
    commsLog.scrollTop = commsLog.scrollHeight;
  }

  // ==========================================
  // TOP-DOWN RADAR CANVAS RENDERING
  // ==========================================
  // ==========================================
  // TOP-DOWN RADAR CANVAS RENDERING
  // ==========================================
  let staticCanvas = null;
  let staticCtx = null;
  let lastStaticSize = 0;

  function resizeCanvas() {
    const rect = radarCanvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height || 600);
    const dpr = window.devicePixelRatio || 1;

    radarCanvas.width = size * dpr;
    radarCanvas.height = size * dpr;
    radarCanvas.style.width = `${size}px`;
    radarCanvas.style.height = `${size}px`;

    buildStaticRadar(size, dpr);
  }

  window.addEventListener("resize", resizeCanvas);

  function worldToCanvas(wx, wz, size) {
    const padding = size * 0.06;
    const drawSize = size - padding * 2;
    const minCoord = -40;
    const maxCoord = 40;
    const range = maxCoord - minCoord;

    const cx = padding + ((wx - minCoord) / range) * drawSize;
    const cy = padding + ((wz - minCoord) / range) * drawSize;
    return { cx, cy };
  }

  function canvasToWorld(cx, cy, size) {
    const padding = size * 0.06;
    const drawSize = size - padding * 2;
    const minCoord = -40;
    const maxCoord = 40;
    const range = maxCoord - minCoord;

    const wx = minCoord + ((cx - padding) / drawSize) * range;
    const wz = minCoord + ((cy - padding) / drawSize) * range;
    return { wx, wz };
  }

  // Click Radar to Deploy Tactical Waypoint Beacon for Field Agent in 3D
  radarCanvas.addEventListener("click", (e) => {
    if (!currentMission) return;
    const rect = radarCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = radarCanvas.width / dpr;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { wx, wz } = canvasToWorld(clickX, clickY, size);
    if (wx < -37 || wx > 37 || wz < -37 || wz > 37) return;

    socket.emit("dispatcher_ping", { x: wx, z: wz });
    activePings.push({ x: wx, z: wz, startTime: Date.now() });
    window.SoundFX.playAcousticPing();
    appendLog("SYSTEM", `TACTICAL BEACON TRANSMITTED: [X:${wx.toFixed(1)}, Z:${wz.toFixed(1)}]`);
  });

  function buildStaticRadar(size, dpr) {
    if (!levelData || size <= 0) return;

    if (!staticCanvas) {
      staticCanvas = document.createElement("canvas");
      staticCtx = staticCanvas.getContext("2d");
    }

    staticCanvas.width = size * dpr;
    staticCanvas.height = size * dpr;
    lastStaticSize = size;

    staticCtx.save();
    staticCtx.scale(dpr, dpr);

    // Dark tactical radar background
    staticCtx.fillStyle = "#070c09";
    staticCtx.fillRect(0, 0, size, size);

    // Range rings
    const center = size / 2;
    staticCtx.strokeStyle = "rgba(34, 197, 94, 0.08)";
    staticCtx.lineWidth = 1;

    for (let r = 40; r < center; r += 50) {
      staticCtx.beginPath();
      staticCtx.arc(center, center, r, 0, Math.PI * 2);
      staticCtx.stroke();
    }

    // 1. Render Rooms
    levelData.rooms.forEach((room) => {
      const p1 = worldToCanvas(room.bounds.minX, room.bounds.minZ, size);
      const p2 = worldToCanvas(room.bounds.maxX, room.bounds.maxZ, size);
      const rw = p2.cx - p1.cx;
      const rh = p2.cy - p1.cy;

      if (room.isDeadZone) {
        staticCtx.fillStyle = "rgba(220, 38, 38, 0.12)";
        staticCtx.fillRect(p1.cx, p1.cy, rw, rh);

        staticCtx.strokeStyle = "rgba(239, 68, 68, 0.35)";
        staticCtx.lineWidth = 1.5;
        staticCtx.strokeRect(p1.cx, p1.cy, rw, rh);
      } else {
        staticCtx.fillStyle = "rgba(16, 44, 30, 0.35)";
        staticCtx.fillRect(p1.cx, p1.cy, rw, rh);

        staticCtx.strokeStyle = "rgba(34, 197, 94, 0.22)";
        staticCtx.lineWidth = 1;
        staticCtx.strokeRect(p1.cx, p1.cy, rw, rh);
      }

      const pCenter = worldToCanvas(room.center.x, room.center.z, size);
      staticCtx.fillStyle = room.isDeadZone ? "#fca5a5" : "#86efac";
      staticCtx.font = "9px 'Share Tech Mono', monospace";
      staticCtx.textAlign = "center";
      staticCtx.fillText(room.code, pCenter.cx, pCenter.cy - 6);

      staticCtx.fillStyle = room.isDeadZone ? "rgba(248, 113, 113, 0.8)" : "rgba(187, 247, 208, 0.7)";
      staticCtx.font = "8px 'Share Tech Mono', monospace";
      staticCtx.fillText(room.name, pCenter.cx, pCenter.cy + 6);
    });

    // 2. Render Walls
    staticCtx.fillStyle = "#1e3a2f";
    staticCtx.strokeStyle = "#4ade80";
    staticCtx.lineWidth = 1.5;

    levelData.walls.forEach((wall) => {
      const p1 = worldToCanvas(wall.minX, wall.minZ, size);
      const p2 = worldToCanvas(wall.maxX, wall.maxZ, size);
      const w = p2.cx - p1.cx;
      const h = p2.cy - p1.cy;

      staticCtx.fillRect(p1.cx, p1.cy, w, h);
      staticCtx.strokeRect(p1.cx, p1.cy, w, h);
    });

    staticCtx.restore();
  }

  function renderRadar() {
    animFrameId = requestAnimationFrame(renderRadar);

    const dpr = window.devicePixelRatio || 1;
    const size = radarCanvas.width / dpr;
    if (size <= 0) return;

    if (!staticCanvas || lastStaticSize !== size) {
      buildStaticRadar(size, dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Blit cached static radar (rooms, walls, rings)
    if (staticCanvas) {
      ctx.drawImage(staticCanvas, 0, 0, size, size);
    } else {
      ctx.fillStyle = "#070c09";
      ctx.fillRect(0, 0, size, size);
    }

    // Rotating sweep
    const center = size / 2;
    radarSweepAngle += 0.02;
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(radarSweepAngle);
    const sweepGrad = ctx.createLinearGradient(0, 0, center, 0);
    sweepGrad.addColorStop(0, "rgba(34, 197, 94, 0)");
    sweepGrad.addColorStop(1, "rgba(34, 197, 94, 0.15)");
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, center * 0.95, -0.2, 0);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.restore();

    if (!levelData) {
      ctx.restore();
      return;
    }

    // 3. Render Hazards & Molten Lava Bed
    if (currentMission && currentMission.hazards) {
      const timeSec = Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 6);

      currentMission.hazards.forEach((hazard) => {
        const p1 = worldToCanvas(hazard.bounds.minX, hazard.bounds.minZ, size);
        const p2 = worldToCanvas(hazard.bounds.maxX, hazard.bounds.maxZ, size);
        const hw = p2.cx - p1.cx;
        const hh = p2.cy - p1.cy;

        if (hazard.type === "lava_bed") {
          // Animated molten lava pattern
          ctx.fillStyle = `rgba(255, 69, 0, ${0.45 + pulse * 0.25})`;
          ctx.fillRect(p1.cx, p1.cy, hw, hh);

          ctx.strokeStyle = `rgba(255, 120, 0, ${0.8 + pulse * 0.2})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(p1.cx, p1.cy, hw, hh);

          const pCenter = worldToCanvas(hazard.center.x, hazard.center.z, size);
          ctx.fillStyle = "#ffedd5";
          ctx.font = "bold 9px 'Share Tech Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText("🌋 LAVA TRENCH", pCenter.cx, pCenter.cy - 4);
          ctx.font = "8px 'Share Tech Mono', monospace";
          ctx.fillText("2,400°F LETHAL", pCenter.cx, pCenter.cy + 7);
        } else {
          ctx.fillStyle = `rgba(239, 68, 68, ${0.25 + pulse * 0.25})`;
          ctx.fillRect(p1.cx, p1.cy, hw, hh);

          ctx.strokeStyle = `rgba(255, 68, 68, ${0.7 + pulse * 0.3})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(p1.cx, p1.cy, hw, hh);

          const pCenter = worldToCanvas(hazard.center.x, hazard.center.z, size);
          ctx.fillStyle = "#fca5a5";
          ctx.font = "bold 9px 'Share Tech Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText("⚠ HAZARD", pCenter.cx, pCenter.cy - 4);
          ctx.font = "8px 'Share Tech Mono', monospace";
          ctx.fillText(hazard.name.toUpperCase(), pCenter.cx, pCenter.cy + 7);
        }
      });
    }

    // 4. Render Locked Blast Doors
    activeLockedDoors.forEach((door) => {
      const p1 = worldToCanvas(door.bounds.minX, door.bounds.minZ, size);
      const p2 = worldToCanvas(door.bounds.maxX, door.bounds.maxZ, size);
      const dw = p2.cx - p1.cx;
      const dh = p2.cy - p1.cy;

      if (door.unlocked) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
        ctx.fillRect(p1.cx, p1.cy, dw, dh);
        ctx.strokeStyle = "#4ade80";
        ctx.strokeRect(p1.cx, p1.cy, dw, dh);
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, 0.6)";
        ctx.fillRect(p1.cx, p1.cy, dw, dh);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(p1.cx, p1.cy, dw, dh);

        const pCenter = worldToCanvas(door.center.x, door.center.z, size);
        ctx.fillStyle = "#fca5a5";
        ctx.font = "bold 8px 'Share Tech Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("🔒 LOCKED GATE", pCenter.cx, pCenter.cy - 8);
      }
    });

    // 5. Render Keycard Beacon
    if (activeKeycard && !activeKeycard.collected) {
      const pKey = worldToCanvas(activeKeycard.x, activeKeycard.z, size);
      const timeSec = Date.now() / 1000;
      const pulseRing = 6 + (timeSec * 8) % 12;

      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pKey.cx, pKey.cy, pulseRing, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(pKey.cx, pKey.cy, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "bold 9px 'Share Tech Mono', monospace";
      ctx.fillText("🔑 KEYCARD", pKey.cx, pKey.cy - 8);
    }

    // 6. Render Active Objective Terminal
    if (currentMission && currentMission.objective) {
      const obj = currentMission.objective;
      const pObj = worldToCanvas(obj.x, obj.z, size);
      const timeSec = Date.now() / 1000;
      const ringRadius = 8 + (timeSec * 12) % 16;
      const alpha = 1.0 - (ringRadius - 8) / 16;

      ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pObj.cx, pObj.cy, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(pObj.cx, pObj.cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pObj.cx - 9, pObj.cy);
      ctx.lineTo(pObj.cx + 9, pObj.cy);
      ctx.moveTo(pObj.cx, pObj.cy - 9);
      ctx.lineTo(pObj.cx, pObj.cy + 9);
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 10px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("★ OBJECTIVE", pObj.cx, pObj.cy - 12);
    }

    // 7. Render Hostile Zombie Threat Contacts
    activeZombies.forEach((z) => {
      if (z.isDead) return;

      const pZ = worldToCanvas(z.x, z.z, size);

      // Threat ring
      ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pZ.cx, pZ.cy, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Red Threat Diamond
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(pZ.cx, pZ.cy - 5);
      ctx.lineTo(pZ.cx + 5, pZ.cy);
      ctx.lineTo(pZ.cx, pZ.cy + 5);
      ctx.lineTo(pZ.cx - 5, pZ.cy);
      ctx.closePath();
      ctx.fill();

      ctx.font = "bold 8px 'Share Tech Mono', monospace";
      ctx.fillText("⚠ HOSTILE", pZ.cx, pZ.cy + 13);

      // If close to agent, draw animated threat line
      if (agentPosition) {
        const dist = Math.hypot(z.x - agentPosition.x, z.z - agentPosition.z);
        if (dist < 16) {
          const pAgent = worldToCanvas(agentPosition.x, agentPosition.z, size);
          ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pZ.cx, pZ.cy);
          ctx.lineTo(pAgent.cx, pAgent.cy);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    });

    // 8. Render Scavengeable Supply Caches
    activeSupplies.forEach((supply) => {
      if (supply.collected) return;
      const pS = worldToCanvas(supply.x, supply.z, size);
      const isAmmo = supply.type === "ammo";

      ctx.fillStyle = isAmmo ? "#38bdf8" : "#4ade80";
      ctx.fillRect(pS.cx - 3, pS.cy - 3, 6, 6);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(pS.cx - 3, pS.cy - 3, 6, 6);

      ctx.fillStyle = isAmmo ? "#bae6fd" : "#bbf7d0";
      ctx.font = "bold 8px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(isAmmo ? "📦 AMMO" : "✚ MEDKIT", pS.cx, pS.cy - 6);
    });

    // 9. Render Tactical Waypoint Pings
    const now = Date.now();
    activePings = activePings.filter((p) => now - p.startTime < 10000);
    activePings.forEach((p) => {
      const pPing = worldToCanvas(p.x, p.z, size);
      const elapsed = (now - p.startTime) / 1000;
      const ring = 6 + (elapsed * 22) % 24;
      const alpha = Math.max(0, 1.0 - elapsed / 10);

      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pPing.cx, pPing.cy, ring, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(pPing.cx, pPing.cy, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(186, 230, 253, ${alpha})`;
      ctx.font = "bold 8px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("📍 WAYPOINT", pPing.cx, pPing.cy + 13);
    });

    // 10. Render Agent Movement Trail
    if (agentTrail.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < agentTrail.length; i++) {
        const pt = worldToCanvas(agentTrail[i].x, agentTrail[i].z, size);
        if (i === 0) ctx.moveTo(pt.cx, pt.cy);
        else ctx.lineTo(pt.cx, pt.cy);
      }
      ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 11. Render Field Agent Live Blip
    if (agentPosition) {
      const pAgent = worldToCanvas(agentPosition.x, agentPosition.z, size);

      if (typeof agentPosition.rotationY === "number") {
        const angle = -agentPosition.rotationY - Math.PI / 2;
        const coneDist = 20;

        ctx.fillStyle = "rgba(74, 222, 128, 0.25)";
        ctx.beginPath();
        ctx.moveTo(pAgent.cx, pAgent.cy);
        ctx.arc(pAgent.cx, pAgent.cy, coneDist, angle - 0.45, angle + 0.45);
        ctx.lineTo(pAgent.cx, pAgent.cy);
        ctx.fill();
      }

      ctx.shadowColor = currentHealth > 30 ? "#4ade80" : "#ef4444";
      ctx.shadowBlur = 10;
      ctx.fillStyle = currentHealth > 30 ? "#22c55e" : "#ef4444";
      ctx.beginPath();
      ctx.arc(pAgent.cx, pAgent.cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(pAgent.cx, pAgent.cy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = currentHealth > 30 ? "#4ade80" : "#fca5a5";
      ctx.font = "bold 9px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("AGENT", pAgent.cx, pAgent.cy + 16);
    }

    ctx.restore();
  }
})();
