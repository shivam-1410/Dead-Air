/**
 * DEAD AIR - FIELD AGENT 3D CLIENT
 * Three.js First-Person Perspective + Authoritative Radio Receiver
 * Features:
 * - FPS gun combat & ammo mechanics against roaming contaminated zombies
 * - Real-time health bar, heartbeat vitals & realistic suffering pain effects
 * - Superheated Molten Lava Bed trench with heat emission
 * - Keycard acquisition & locked blast door security system
 * - Corrupted radio voice & push-to-talk tactical callouts
 */

(function () {
  const socket = io();
  const roomCode = window.getRoomCodeFromURL();

  // DOM Elements
  const blocker = document.getElementById("blocker");
  const btnClickToEngage = document.getElementById("btnClickToEngage");
  const fieldTimer = document.getElementById("fieldTimer");
  const interactPrompt = document.getElementById("interactPrompt");
  const promptText = document.getElementById("promptText");
  const hazardWarningVignette = document.getElementById("hazardWarningVignette");
  const damageOverlay = document.getElementById("damageOverlay");
  const bloodSplatterVignette = document.getElementById("bloodSplatterVignette");
  const hitmarker = document.getElementById("hitmarker");
  const healthNum = document.getElementById("healthNum");
  const healthBarFill = document.getElementById("healthBarFill");
  const heartRateNum = document.getElementById("heartRateNum");
  const hazardWarningBadge = document.getElementById("hazardWarningBadge");
  const keycardStatus = document.getElementById("keycardStatus");
  const clipAmmo = document.getElementById("clipAmmo");
  const reserveAmmo = document.getElementById("reserveAmmo");
  const reloadPrompt = document.getElementById("reloadPrompt");
  const radioStatusLine = document.getElementById("radioStatusLine");
  const radioMessageContent = document.getElementById("radioMessageContent");
  const radioIncomingText = document.getElementById("radioIncomingText");
  const carrierWaveBar = document.getElementById("carrierWaveBar");
  const pttStatusIndicator = document.getElementById("pttStatusIndicator");
  const debriefModal = document.getElementById("debriefModal");
  const debriefStatus = document.getElementById("debriefStatus");
  const debriefReason = document.getElementById("debriefReason");
  const debriefDuration = document.getElementById("debriefDuration");
  const debriefObjective = document.getElementById("debriefObjective");
  const btnRestartMission = document.getElementById("btnRestartMission");

  // New Interactive HUD Elements
  const flashlightBadge = document.getElementById("flashlightBadge");
  const flashlightModeText = document.getElementById("flashlightModeText");
  const sonarCooldownText = document.getElementById("sonarCooldownText");
  const sonarReport = document.getElementById("sonarReport");
  const waypointToast = document.getElementById("waypointToast");
  const waypointToastText = document.getElementById("waypointToastText");
  const fieldCommsConsole = document.getElementById("fieldCommsConsole");
  const fieldCommsForm = document.getElementById("fieldCommsForm");
  const fieldCommsInput = document.getElementById("fieldCommsInput");

  // Three.js Core Variables
  let scene, camera, renderer, controls;
  let flashlight, flashFill;
  let levelData = window.LEVEL_DATA || null;
  let currentMission = null;
  let terminalMesh = null;
  let keycardMesh = null;
  let lockedDoorMeshes = [];
  let lavaBedMesh = null;
  let lavaParticles = null;

  // Tactical Flashlight & UV Modes
  let flashlightMode = 0; // 0: Standard, 1: UV Blacklight, 2: Dim
  const uvElements = [];

  // Acoustic Echolocation Sonar
  let lastSonarTime = 0;
  const sonarCooldownMs = 5000;
  const activePulseRings = [];

  // Scavengeable Supplies & Waypoint Beacons
  const supplyMeshesMap = new Map();
  let nearbySupply = null;
  let activeWaypointBeacon = null;

  // Combat & Gun Variables
  let gunGroup = null;
  let gunSlide = null;
  let gunMuzzleLight = null;
  const weaponState = {
    clip: 12,
    maxClip: 12,
    reserve: 48,
    isReloading: false,
    lastShotTime: 0,
    recoil: 0
  };

  // Zombie Management
  const zombieMap = new Map();

  // Vitals & Suffering
  let currentHealth = 100;
  let cameraShake = 0;
  let lastHeartbeat = 0;
  let isNearbyKeycard = false;
  let isNearbyTerminal = false;

  // Movement & Physics
  const player = {
    radius: 0.45,
    speed: 5.5,
    sprintSpeed: 8.5,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    isSprinting: false,
    bobTimer: 0
  };

  let clock = new THREE.Clock();
  let lastMoveEmit = 0;

  // Preset callouts map for 1-6 keys
  const CALLOUTS = {
    "1": "Copy that, proceeding.",
    "2": "Say again, signal broke up.",
    "3": "At room doorway threshold.",
    "4": "HOSTILE ZOMBIES! Taking heat!",
    "5": "Keycard / Terminal located!",
    "6": "Lost in corridors. Need heading."
  };

  // Socket Handshake
  socket.on("connect", () => {
    console.log("[Field Agent] Connected to server.");
    if (roomCode) {
      socket.emit(
        "join_room",
        { roomCode, preferredRole: "FIELD" },
        (res) => {
          if (!res.success) {
            alert(res.error || "Failed to join room.");
            window.location.href = "/";
          } else {
            console.log("[Field Agent] Joined room:", res);
          }
        }
      );
    } else {
      window.location.href = "/";
    }
  });

  // Mission Start (Handles initial start and live reconnects)
  socket.on("mission_started", (packet) => {
    console.log("[Field Agent] Mission Started:", packet);
    currentMission = packet;
    debriefModal.classList.add("hidden");

    // Teleport to spawn
    if (packet.spawn) {
      controls.getObject().position.set(packet.spawn.x, 1.6, packet.spawn.z);
    }

    // Reset health & weapon
    currentHealth = packet.playerHealth || 100;
    updateHealthHUD(currentHealth, 75);
    weaponState.clip = packet.weapon ? packet.weapon.clipSize : 12;
    weaponState.reserve = packet.weapon ? packet.weapon.reserveAmmo : 48;
    updateAmmoHUD();

    // Spawn 3D keycard if present
    if (packet.activeKeycard && !packet.activeKeycard.collected) {
      spawn3DKeycard(packet.activeKeycard);
    }

    // Spawn 3D scavengeable supply caches (Ammo & Medkits)
    if (packet.supplies) {
      spawn3DSupplies(packet.supplies);
    }

    window.SoundFX.playIncomingTransmissionStatic(1.2);
    setRadioStatus("CARRIER LOCKED // AWAITING DISPATCH TRANSMISSION");
  });

  // Tactical Waypoint Ping Echo from Dispatcher
  socket.on("tactical_ping", ({ x, z }) => {
    spawn3DWaypointBeacon(x, z);
    window.SoundFX.playAcousticPing();
  });

  // Supply Cache Collected Confirmation
  socket.on("supply_collected", (data) => {
    const sMesh = supplyMeshesMap.get(data.supplyId);
    if (sMesh) {
      scene.remove(sMesh);
      supplyMeshesMap.delete(data.supplyId);
    }
    if (currentMission && currentMission.supplies) {
      const s = currentMission.supplies.find((item) => item.id === data.supplyId);
      if (s) s.collected = true;
    }
  });

  // Reconnection and Signal Status
  socket.on("partner_disconnected", ({ graceSeconds }) => {
    setRadioStatus(`⚠ DISPATCH SILENCE: CARRIER UNSTABLE // GRACE ${graceSeconds}s`);
    window.SoundFX.playEmergencyAlarm();
  });

  socket.on("partner_reconnected", () => {
    setRadioStatus("✓ DISPATCH CARRIER RESTORED // READY");
    window.SoundFX.playTerminalSuccess();
  });

  // Authoritative Timer Tick
  socket.on("timer_tick", ({ remainingSeconds }) => {
    fieldTimer.textContent = window.formatTime(remainingSeconds);
    if (remainingSeconds <= 30) {
      fieldTimer.classList.add("timer-critical");
    } else {
      fieldTimer.classList.remove("timer-critical");
    }
  });

  // Authoritative Telemetry & Health Updates
  socket.on("telemetry_update", (data) => {
    updateHealthHUD(data.health, data.heartRateBpm);
    if (data.inHazard) {
      hazardWarningBadge.classList.remove("hidden");
      hazardWarningBadge.textContent = data.hazardName ? data.hazardName.toUpperCase() : "HAZARD EXPOSURE";
    } else {
      hazardWarningBadge.classList.add("hidden");
    }
  });

  // Realistic Suffering Event (Lava Burning, Poison Gas, or Laser Turret)
  socket.on("player_suffering", (data) => {
    triggerSufferingFX(data.type, data.health);
  });

  // Zombie Attack Event
  socket.on("zombie_attack", (data) => {
    triggerSufferingFX("zombie", data.health);
    window.SoundFX.playZombieAttack();
  });

  // Zombie Position and AI Updates
  socket.on("zombies_update", (data) => {
    if (!data.zombies || !scene) return;

    data.zombies.forEach((zData) => {
      let zEntry = zombieMap.get(zData.id);
      if (!zEntry) {
        // Create 3D Zombie Mesh
        const zMesh = create3DZombieMesh();
        zMesh.position.set(zData.x, 0, zData.z);
        scene.add(zMesh);

        zEntry = {
          mesh: zMesh,
          targetX: zData.x,
          targetZ: zData.z,
          hp: zData.hp,
          maxHp: zData.maxHp,
          isDead: zData.isDead,
          walkCycle: Math.random() * Math.PI * 2,
          lastGroan: Date.now() + Math.random() * 5000
        };
        zombieMap.set(zData.id, zEntry);
      } else {
        zEntry.targetX = zData.x;
        zEntry.targetZ = zData.z;
        zEntry.hp = zData.hp;

        if (zData.isDead && !zEntry.isDead) {
          zEntry.isDead = true;
          collapseZombieCorpse(zEntry);
        }
      }
    });
  });

  // Zombie Hit Confirmation
  socket.on("zombie_hit", (data) => {
    const zEntry = zombieMap.get(data.zombieId);
    if (zEntry && zEntry.mesh) {
      flashZombieRed(zEntry.mesh);
    }
  });

  // Zombie Killed Confirmation
  socket.on("zombie_killed", (data) => {
    const zEntry = zombieMap.get(data.zombieId);
    if (zEntry) {
      zEntry.isDead = true;
      collapseZombieCorpse(zEntry);
    }
  });

  // Keycard Acquired Event
  socket.on("keycard_acquired", (data) => {
    window.SoundFX.playKeycardAcquired();
    keycardStatus.className = "keycard-status unlocked";
    keycardStatus.innerHTML = `<span class="key-icon">🔓</span> ACCESS GRANTED (${data.keycardName.toUpperCase()})`;

    // Remove 3D keycard mesh
    if (keycardMesh) {
      scene.remove(keycardMesh);
      keycardMesh = null;
    }

    // Open locked blast doors
    lockedDoorMeshes.forEach((doorObj) => {
      openBlastDoor(doorObj);
    });
  });

  // Incoming Carrier Wave Warning (2-5s before corrupted text lands)
  socket.on("radio_carrier_incoming", ({ delayMs }) => {
    carrierWaveBar.classList.remove("hidden");
    const progressEl = carrierWaveBar.querySelector(".carrier-progress");
    if (progressEl) {
      progressEl.style.transition = "none";
      progressEl.style.width = "0%";
      setTimeout(() => {
        progressEl.style.transition = `width ${delayMs}ms linear`;
        progressEl.style.width = "100%";
      }, 50);
    }

    window.SoundFX.playIncomingTransmissionStatic(delayMs / 1000);
    setRadioStatus("INCOMING CARRIER SIGNAL DETECTED... DECODING RF STREAM");
  });

  // Corrupted Radio Directive Arrived
  socket.on("radio_message", (msg) => {
    carrierWaveBar.classList.add("hidden");
    window.SoundFX.playSquelchBurst(0.2);

    radioMessageContent.classList.remove("hidden");
    displayCorruptedText(msg.corruptedText, msg.signalStrength);

    const sigPct = Math.round(msg.signalStrength * 100);
    setRadioStatus(`TRANSMISSION RECEIVED // CARRIER INTEGRITY: ${sigPct}%`);

    setTimeout(() => {
      radioMessageContent.classList.add("fade-out");
      setTimeout(() => {
        radioMessageContent.classList.add("hidden");
        radioMessageContent.classList.remove("fade-out");
        setRadioStatus("STANDBY // LISTENING FOR DISPATCH DIRECTIVES");
      }, 1000);
    }, 10000);
  });

  // PTT Callout Sent Confirmation
  socket.on("callout_transmitted", (ack) => {
    pttStatusIndicator.textContent = `CALLOUT TRANSMITTED: "${ack.text}"`;
    pttStatusIndicator.style.color = "#4ade80";
    setTimeout(() => {
      pttStatusIndicator.textContent = "TRANSMITTER READY // CHANNEL OPEN";
      pttStatusIndicator.style.color = "#94a3b8";
    }, 3000);
  });

  // Round Ended (Debrief)
  socket.on("round_ended", (result) => {
    console.log("[Field Agent] Round Ended:", result);
    if (controls) controls.unlock();
    debriefModal.classList.remove("hidden");

    if (result.result === "SUCCESS") {
      window.SoundFX.playTerminalSuccess();
      debriefStatus.textContent = "FACILITY LOCKDOWN LIFTED // MISSION SUCCESS";
      debriefStatus.className = "debrief-status status-win";
      debriefReason.textContent = result.reason;
    } else {
      window.SoundFX.playEmergencyAlarm();
      debriefStatus.textContent = "FATAL CASUALTY // OPERATOR TERMINATED";
      debriefStatus.className = "debrief-status status-loss";
      debriefReason.textContent = result.reason;
    }

    debriefDuration.textContent = window.formatTime(result.timeElapsedSec);
    debriefObjective.textContent = result.objective;
  });

  // Restart Mission
  btnRestartMission.onclick = () => {
    socket.emit("start_mission");
  };

  function setRadioStatus(text) {
    radioStatusLine.textContent = text;
  }

  function displayCorruptedText(text, signalStrength) {
    radioIncomingText.textContent = "";
    let i = 0;
    const speed = signalStrength < 0.3 ? 60 : 35;

    function typeChar() {
      if (i < text.length) {
        radioIncomingText.textContent += text.charAt(i);
        i++;
        setTimeout(typeChar, speed);
      }
    }
    typeChar();
  }

  function sendCallout(calloutText) {
    window.getAudioContext();
    window.SoundFX.playMicClick();
    socket.emit("field_callout", { text: calloutText });
    pttStatusIndicator.textContent = `TRANSMITTING CALLOUT: "${calloutText}"...`;
    pttStatusIndicator.style.color = "#fbbf24";
  }

  // PTT Clickable Buttons
  document.querySelectorAll(".btn-ptt").forEach((btn) => {
    btn.onclick = () => {
      const text = btn.getAttribute("data-callout");
      if (text) sendCallout(text);
    };
  });

  // ==========================================
  // REALISTIC SUFFERING, HEALTH & COMBAT HUD
  // ==========================================
  function updateHealthHUD(health, bpm) {
    currentHealth = health;
    healthNum.textContent = `${health}%`;
    healthBarFill.style.width = `${health}%`;
    heartRateNum.textContent = bpm;

    if (health > 60) {
      healthBarFill.className = "vitals-bar-fill fill-healthy";
    } else if (health > 25) {
      healthBarFill.className = "vitals-bar-fill fill-wounded";
    } else {
      healthBarFill.className = "vitals-bar-fill fill-critical";
    }

    // Persistent bloody visor when critically injured
    if (health < 30) {
      bloodSplatterVignette.classList.remove("hidden");
      bloodSplatterVignette.style.opacity = `${0.35 + (30 - health) * 0.02}`;
    } else {
      bloodSplatterVignette.classList.add("hidden");
    }
  }

  function triggerSufferingFX(type, newHealth) {
    currentHealth = newHealth;
    cameraShake = 0.12; // violent camera shudder

    // Flash screen red with blood splatter
    damageOverlay.classList.remove("hidden");
    damageOverlay.style.opacity = "0.75";
    setTimeout(() => {
      damageOverlay.style.opacity = "0";
      setTimeout(() => damageOverlay.classList.add("hidden"), 300);
    }, 120);

    // Audio suffering
    window.SoundFX.playPlayerSuffering(type);
  }

  function updateAmmoHUD() {
    clipAmmo.textContent = weaponState.clip;
    reserveAmmo.textContent = weaponState.reserve;

    if (weaponState.clip === 0) {
      reloadPrompt.classList.remove("hidden");
    } else {
      reloadPrompt.classList.add("hidden");
    }
  }

  function showHitmarker() {
    hitmarker.classList.remove("hidden");
    setTimeout(() => hitmarker.classList.add("hidden"), 100);
  }

  // ==========================================
  // LIGHTWEIGHT STANDALONE POINTER LOCK CONTROLS
  // ==========================================
  class PointerLockControls {
    constructor(camera, domElement = document.body) {
      this.camera = camera;
      this.domElement = domElement;
      this.isLocked = false;
      this.listeners = {};
      this.euler = new THREE.Euler(0, 0, 0, "YXZ");
      this.sensitivity = 0.0022;

      this._onMouseMove = this.onMouseMove.bind(this);
      this._onPointerLockChange = this.onPointerLockChange.bind(this);
      this._onPointerLockError = this.onPointerLockError.bind(this);

      document.addEventListener("pointerlockchange", this._onPointerLockChange);
      document.addEventListener("pointerlockerror", this._onPointerLockError);
    }

    addEventListener(type, listener) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(listener);
    }

    removeEventListener(type, listener) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }

    dispatchEvent(event) {
      if (this.listeners[event.type]) {
        this.listeners[event.type].forEach((l) => l(event));
      }
    }

    onMouseMove(event) {
      if (!this.isLocked) return;
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= movementX * this.sensitivity;
      this.euler.x -= movementY * this.sensitivity;
      this.euler.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    }

    onPointerLockChange() {
      if (
        document.pointerLockElement === this.domElement ||
        document.pointerLockElement === document.body
      ) {
        this.isLocked = true;
        document.addEventListener("mousemove", this._onMouseMove);
        this.dispatchEvent({ type: "lock" });
      } else {
        this.isLocked = false;
        document.removeEventListener("mousemove", this._onMouseMove);
        this.dispatchEvent({ type: "unlock" });
      }
    }

    onPointerLockError() {
      console.warn("[PointerLockControls] Pointer lock request rejected.");
    }

    lock() {
      this.domElement.requestPointerLock();
    }

    unlock() {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    }

    getObject() {
      return this.camera;
    }
  }

  // ==========================================
  // THREE.JS 3D SCENE & ENGINE
  // ==========================================
  async function init3D() {
    levelData = await window.loadLevelData();

    const container = document.getElementById("canvasContainer");

    // 1. Scene & Atmospheric Fog
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050806);
    scene.fog = new THREE.FogExp2(0x050806, 0.045);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(levelData.spawnPoint.x, 1.6, levelData.spawnPoint.z);

    // 3. PointerLock Controls
    controls = new PointerLockControls(camera, document.body);

    btnClickToEngage.addEventListener("click", () => {
      window.getAudioContext();
      blocker.style.display = "none";
      try {
        controls.lock();
      } catch (e) {
        console.warn("Pointer lock request:", e);
      }
    });

    controls.addEventListener("lock", () => {
      blocker.style.display = "none";
    });

    controls.addEventListener("unlock", () => {
      // Allow user to click again to re-lock
    });

    scene.add(controls.getObject());

    // 4. Tactical Flashlight attached to camera
    flashlight = new THREE.SpotLight(0xdcfce7, 3.2, 32, Math.PI / 4.6, 0.5, 1.8);
    flashlight.position.set(0, 0, 0);
    camera.add(flashlight);
    flashlight.target = new THREE.Object3D();
    flashlight.target.position.set(0, 0, -5);
    camera.add(flashlight.target);

    flashFill = new THREE.PointLight(0xa7f3d0, 0.4, 7, 2);
    camera.add(flashFill);

    // 5. Construct 3D First-Person Gun Model
    buildGunModel();

    // 6. Build Facility Environment (Walls, Floor, Lava Bed, Locked Doors)
    buildFacility(levelData);

    // 7. Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0x08120c, 0.5);
    scene.add(ambientLight);

    // 8. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // 9. Input Event Listeners
    setupInputListeners();

    window.addEventListener("resize", onWindowResize);

    // 10. Start Render Loop
    animate();
  }

  /**
   * Builds the First-Person Tactical Gun attached to player camera
   */
  // Persistent Math & Vector Scratchpads (Zero Garbage Collection allocations in render loop)
  const _moveForward = new THREE.Vector3();
  const _moveRight = new THREE.Vector3();
  const _deltaPos = new THREE.Vector3();
  const _screenCenter = new THREE.Vector2(0, 0);
  const _combatRaycaster = new THREE.Raycaster();
  let gunFlashSprite = null;

  /**
   * Builds high-detail Blender-styled First-Person Weapon with modeled Tactical Operative Hands
   */
  function buildGunModel() {
    gunGroup = new THREE.Group();

    // 1. Sleek Modern Tactical Sidearm Receiver (Lower Frame)
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      metalness: 0.35,
      roughness: 0.65
    });
    const frameGeo = new THREE.BoxGeometry(0.052, 0.075, 0.24);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0, -0.01);
    gunGroup.add(frame);

    // Beveled Ergonomic Stippled Grip
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x11161d,
      roughness: 0.85,
      metalness: 0.1
    });
    const gripGeo = new THREE.BoxGeometry(0.048, 0.145, 0.072);
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.09, 0.055);
    grip.rotation.x = Math.PI / 8.5;
    gunGroup.add(grip);

    // Extended Magazine Baseplate
    const baseplateGeo = new THREE.BoxGeometry(0.054, 0.02, 0.08);
    const baseplateMat = new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.7 });
    const baseplate = new THREE.Mesh(baseplateGeo, baseplateMat);
    baseplate.position.set(0, -0.17, 0.085);
    baseplate.rotation.x = Math.PI / 8.5;
    gunGroup.add(baseplate);

    // Trigger Guard & Curved Steel Trigger
    const guardGeo = new THREE.BoxGeometry(0.02, 0.05, 0.065);
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x181c24, metalness: 0.5 });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.set(0, -0.055, -0.015);
    gunGroup.add(guard);

    const triggerGeo = new THREE.BoxGeometry(0.01, 0.028, 0.015);
    const triggerMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 });
    const trigger = new THREE.Mesh(triggerGeo, triggerMat);
    trigger.position.set(0, -0.05, -0.012);
    trigger.rotation.x = Math.PI / 6;
    gunGroup.add(trigger);

    // Picatinny Accessory Rail
    const railGeo = new THREE.BoxGeometry(0.038, 0.012, 0.09);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(0, -0.042, -0.07);
    gunGroup.add(rail);

    // Under-barrel Tactical Module (Light / Laser Unit)
    const tacModGeo = new THREE.BoxGeometry(0.042, 0.032, 0.08);
    const tacModMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const tacMod = new THREE.Mesh(tacModGeo, tacModMat);
    tacMod.position.set(0, -0.06, -0.07);
    gunGroup.add(tacMod);

    // Cyan Laser Diode Lens
    const laserLensGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.01, 10);
    const laserLensMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const laserLens = new THREE.Mesh(laserLensGeo, laserLensMat);
    laserLens.rotation.x = Math.PI / 2;
    laserLens.position.set(0.012, -0.06, -0.112);
    gunGroup.add(laserLens);

    // Tactical Flashlight Reflector
    const lightLensGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12);
    const lightLensMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const lightLens = new THREE.Mesh(lightLensGeo, lightLensMat);
    lightLens.rotation.x = Math.PI / 2;
    lightLens.position.set(-0.01, -0.06, -0.112);
    gunGroup.add(lightLens);

    // 2. High-Detail Chamfered Slide (Cycles back on fire)
    const slideMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      metalness: 0.9,
      roughness: 0.22
    });
    const slideGeo = new THREE.BoxGeometry(0.052, 0.048, 0.25);
    gunSlide = new THREE.Mesh(slideGeo, slideMat);
    gunSlide.position.set(0, 0.048, -0.01);
    gunGroup.add(gunSlide);

    // Ejection Port Cutout on Slide
    const portGeo = new THREE.BoxGeometry(0.015, 0.02, 0.045);
    const portMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    const port = new THREE.Mesh(portGeo, portMat);
    port.position.set(0.024, 0.015, 0.02);
    gunSlide.add(port);

    // Visible Brass Bullet Casing Inside Ejection Chamber
    const brassGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.028, 8);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.95, roughness: 0.2 });
    const brass = new THREE.Mesh(brassGeo, brassMat);
    brass.rotation.x = Math.PI / 2;
    brass.position.set(0.018, 0.012, 0.02);
    gunSlide.add(brass);

    // Rear Cocking Serrations (Stylized Gripping Grooves)
    const serrMat = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.5 });
    for (let s = -0.03; s <= 0.03; s += 0.015) {
      const serrGeo = new THREE.BoxGeometry(0.054, 0.035, 0.005);
      const serr = new THREE.Mesh(serrGeo, serrMat);
      serr.position.set(0, 0.002, 0.07 + s);
      gunSlide.add(serr);
    }

    // Extended Fluted Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 16);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: 0.95, roughness: 0.15 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.042, -0.16);
    gunGroup.add(barrel);

    // Threaded Muzzle Compensator Cap
    const compGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.025, 16);
    const compMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.9 });
    const comp = new THREE.Mesh(compGeo, compMat);
    comp.rotation.x = Math.PI / 2;
    comp.position.set(0, 0.042, -0.225);
    gunGroup.add(comp);

    // Tritium 3-Dot Fiber-Optic Night Sights (Front Bright Green + Rear Dual Dots)
    const frontSightGeo = new THREE.BoxGeometry(0.008, 0.014, 0.01);
    const frontSightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const frontSight = new THREE.Mesh(frontSightGeo, frontSightMat);
    frontSight.position.set(0, 0.03, -0.11);
    gunSlide.add(frontSight);

    [-0.015, 0.015].forEach((rx) => {
      const rearDotGeo = new THREE.BoxGeometry(0.005, 0.008, 0.008);
      const rearDotMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
      const rearDot = new THREE.Mesh(rearDotGeo, rearDotMat);
      rearDot.position.set(rx, 0.03, 0.11);
      gunSlide.add(rearDot);
    });

    // 3. Blender-Styled Tactical Operative Hands (First-Person View Rig)
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0x1c2128,
      roughness: 0.85,
      metalness: 0.15
    });
    const knuckleMat = new THREE.MeshStandardMaterial({
      color: 0x0d1117,
      roughness: 0.4,
      metalness: 0.6
    });

    // Right Hand (Trigger & Main Grip)
    const rightHandGroup = new THREE.Group();
    const rHandGeo = new THREE.BoxGeometry(0.07, 0.065, 0.09);
    const rHand = new THREE.Mesh(rHandGeo, gloveMat);
    rHand.position.set(0.018, -0.09, 0.08);
    rHand.rotation.set(0.2, -0.15, -0.1);
    rightHandGroup.add(rHand);

    const rKnuckleGeo = new THREE.BoxGeometry(0.065, 0.018, 0.05);
    const rKnuckle = new THREE.Mesh(rKnuckleGeo, knuckleMat);
    rKnuckle.position.set(0.024, -0.062, 0.08);
    rKnuckle.rotation.set(0.2, -0.15, -0.1);
    rightHandGroup.add(rKnuckle);

    const rFingerGeo = new THREE.BoxGeometry(0.03, 0.08, 0.04);
    const rFingers = new THREE.Mesh(rFingerGeo, gloveMat);
    rFingers.position.set(-0.022, -0.095, 0.03);
    rFingers.rotation.z = -0.15;
    rightHandGroup.add(rFingers);

    const rThumbGeo = new THREE.BoxGeometry(0.02, 0.02, 0.07);
    const rThumb = new THREE.Mesh(rThumbGeo, gloveMat);
    rThumb.position.set(-0.025, -0.035, 0.06);
    rThumb.rotation.y = 0.2;
    rightHandGroup.add(rThumb);

    gunGroup.add(rightHandGroup);

    // Left Hand (Supporting Tactical Combat Grip Underneath)
    const leftHandGroup = new THREE.Group();
    const lHandGeo = new THREE.BoxGeometry(0.075, 0.055, 0.09);
    const lHand = new THREE.Mesh(lHandGeo, gloveMat);
    lHand.position.set(-0.028, -0.14, 0.07);
    lHand.rotation.set(0.25, 0.2, 0.3);
    leftHandGroup.add(lHand);

    const lKnuckleGeo = new THREE.BoxGeometry(0.07, 0.016, 0.05);
    const lKnuckle = new THREE.Mesh(lKnuckleGeo, knuckleMat);
    lKnuckle.position.set(-0.025, -0.12, 0.07);
    lKnuckle.rotation.set(0.25, 0.2, 0.3);
    leftHandGroup.add(lKnuckle);

    gunGroup.add(leftHandGroup);

    // Muzzle Flash PointLight & Stylized Starburst Flash Mesh
    gunMuzzleLight = new THREE.PointLight(0xf59e0b, 0, 7, 2);
    gunMuzzleLight.position.set(0, 0.042, -0.32);
    gunGroup.add(gunMuzzleLight);

    const flashGeo = new THREE.OctahedronGeometry(0.06, 0);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      transparent: true,
      opacity: 0
    });
    gunFlashSprite = new THREE.Mesh(flashGeo, flashMat);
    gunFlashSprite.position.set(0, 0.042, -0.28);
    gunGroup.add(gunFlashSprite);

    // Position gun in lower-right of viewport with realistic forward offset
    gunGroup.position.set(0.24, -0.22, -0.46);
    camera.add(gunGroup);
  }

  /**
   * Gun Shooting Logic (Left-Click) - Instant Zero-Allocation Raycast
   */
  function shootGun() {
    if (!controls || !controls.isLocked || weaponState.isReloading) return;

    const now = performance.now();
    if (now - weaponState.lastShotTime < 240) return; // fire rate limit

    if (weaponState.clip <= 0) {
      window.SoundFX.playGunEmpty();
      reloadPrompt.classList.remove("hidden");
      return;
    }

    weaponState.lastShotTime = now;
    weaponState.clip--;
    weaponState.recoil = 0.18; // kick back
    updateAmmoHUD();

    // Audio & Muzzle Flash
    window.SoundFX.playGunshot();
    gunMuzzleLight.intensity = 4.5;
    if (gunFlashSprite) {
      gunFlashSprite.material.opacity = 1.0;
      gunFlashSprite.rotation.z = Math.random() * Math.PI;
    }

    setTimeout(() => {
      gunMuzzleLight.intensity = 0;
      if (gunFlashSprite) gunFlashSprite.material.opacity = 0;
    }, 45);

    // Instant Raycast using persistent raycaster
    _combatRaycaster.setFromCamera(_screenCenter, camera);

    const candidateMeshes = [];
    const idToZombie = new Map();

    zombieMap.forEach((zEntry, zId) => {
      if (!zEntry.isDead && zEntry.mesh) {
        candidateMeshes.push(zEntry.mesh);
        idToZombie.set(zEntry.mesh.id, zId);
      }
    });

    const intersects = _combatRaycaster.intersectObjects(candidateMeshes, true);
    let hitZombieId = null;

    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      let cur = hitObj;
      while (cur && !idToZombie.has(cur.id)) {
        cur = cur.parent;
      }
      if (cur && idToZombie.has(cur.id)) {
        hitZombieId = idToZombie.get(cur.id);
        showHitmarker();
      }
    }

    socket.emit("player_shoot", { targetZombieId: hitZombieId });
  }

  function reloadGun() {
    if (
      weaponState.isReloading ||
      weaponState.clip === weaponState.maxClip ||
      weaponState.reserve <= 0
    )
      return;

    weaponState.isReloading = true;
    reloadPrompt.textContent = "RELOADING...";
    reloadPrompt.classList.remove("hidden");
    window.SoundFX.playReload();

    setTimeout(() => {
      const needed = weaponState.maxClip - weaponState.clip;
      const toLoad = Math.min(needed, weaponState.reserve);
      weaponState.clip += toLoad;
      weaponState.reserve -= toLoad;
      weaponState.isReloading = false;
      reloadPrompt.textContent = "[R] RELOAD";
      reloadPrompt.classList.add("hidden");
      updateAmmoHUD();
    }, 1400);
  }

  /**
   * Creates a high-detail Blender-styled infected mutant zombie character
   */
  function create3DZombieMesh() {
    const group = new THREE.Group();

    // 1. Tattered Necrotic Torso (Hunched Biohazard Suit)
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x1f2b23,
      roughness: 0.85,
      metalness: 0.15
    });
    const torsoGeo = new THREE.BoxGeometry(0.56, 0.72, 0.36);
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 1.15, 0.05);
    torso.rotation.x = 0.12; // hunched predator posture
    group.add(torso);

    // Exposed Necrotic Ribcage & Spine
    const spineMat = new THREE.MeshStandardMaterial({ color: 0x0f1712, roughness: 0.95 });
    const spineGeo = new THREE.BoxGeometry(0.12, 0.65, 0.14);
    const spine = new THREE.Mesh(spineGeo, spineMat);
    spine.position.set(0, 1.15, -0.12);
    spine.rotation.x = 0.12;
    group.add(spine);

    // Glowing Toxic Bio-Pustule Cysts on Shoulders & Back
    const cystMat = new THREE.MeshStandardMaterial({
      color: 0x84cc16,
      emissive: 0x65a30d,
      emissiveIntensity: 1.2,
      roughness: 0.3
    });
    const pustules = [];
    [
      { x: -0.22, y: 1.42, z: 0.08, r: 0.08 },
      { x: 0.18, y: 1.38, z: -0.05, r: 0.065 },
      { x: -0.08, y: 1.25, z: -0.16, r: 0.075 }
    ].forEach((p) => {
      const cystGeo = new THREE.SphereGeometry(p.r, 8, 8);
      const cyst = new THREE.Mesh(cystGeo, cystMat);
      cyst.position.set(p.x, p.y, p.z);
      group.add(cyst);
      pustules.push(cyst);
    });

    // 2. Stylized Skull / Head
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.62, 0.12);
    headGroup.rotation.x = 0.15; // aggressive snout tilt

    // Cranium
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x3d4b41,
      roughness: 0.85,
      metalness: 0.2
    });
    const headGeo = new THREE.BoxGeometry(0.32, 0.34, 0.32);
    const head = new THREE.Mesh(headGeo, headMat);
    headGroup.add(head);

    // Tapered Jaw with Open Snarl
    const jawGeo = new THREE.BoxGeometry(0.24, 0.14, 0.22);
    const jaw = new THREE.Mesh(jawGeo, headMat);
    jaw.position.set(0, -0.18, 0.08);
    jaw.rotation.x = 0.22;
    headGroup.add(jaw);

    // Jagged Rotten Teeth
    const teethMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.5 });
    const teethGeo = new THREE.BoxGeometry(0.2, 0.04, 0.03);
    const teeth = new THREE.Mesh(teethGeo, teethMat);
    teeth.position.set(0, -0.12, 0.17);
    headGroup.add(teeth);

    // Hollow Sunken Eye Sockets with Glowing Infected Eyes
    [-0.085, 0.085].forEach((xOff) => {
      // Dark eye socket ring
      const socketGeo = new THREE.BoxGeometry(0.065, 0.065, 0.03);
      const socketMat = new THREE.MeshBasicMaterial({ color: 0x050806 });
      const socketMesh = new THREE.Mesh(socketGeo, socketMat);
      socketMesh.position.set(xOff, 0.04, 0.16);
      headGroup.add(socketMesh);

      // Glowing piercing iris
      const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(xOff, 0.04, 0.18);
      headGroup.add(eye);
    });

    // Corrupted Cranial Infection Horns / Spikes
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x141e17, roughness: 0.7 });
    [-0.09, 0.07].forEach((hx, i) => {
      const hornGeo = new THREE.ConeGeometry(0.035, 0.14, 6);
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(hx, 0.22, -0.04 + i * 0.05);
      horn.rotation.z = hx > 0 ? -0.3 : 0.3;
      horn.rotation.x = -0.2;
      headGroup.add(horn);
    });

    group.add(headGroup);

    // 3. Articulated Arms & Mutated Claw Hands (Asymmetrical Lunging Pose)
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2e3d32, roughness: 0.85 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x090d0b, roughness: 0.5, metalness: 0.3 });

    // Right Arm (Thrusting Forward Lunging)
    const rArmGroup = new THREE.Group();
    rArmGroup.position.set(0.36, 1.42, 0.08);

    const rBicepGeo = new THREE.BoxGeometry(0.13, 0.38, 0.13);
    const rBicep = new THREE.Mesh(rBicepGeo, armMat);
    rBicep.position.set(0, -0.16, 0.12);
    rBicep.rotation.x = Math.PI / 2.8;
    rArmGroup.add(rBicep);

    const rForearmGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11);
    const rForearm = new THREE.Mesh(rForearmGeo, armMat);
    rForearm.position.set(0.02, -0.12, 0.44);
    rForearm.rotation.x = Math.PI / 2.2;
    rArmGroup.add(rForearm);

    // Sharp Claw Fingers
    for (let c = -0.04; c <= 0.04; c += 0.025) {
      const clawGeo = new THREE.ConeGeometry(0.018, 0.09, 5);
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(0.02 + c, -0.12, 0.68);
      claw.rotation.x = Math.PI / 2;
      rArmGroup.add(claw);
    }
    group.add(rArmGroup);

    // Left Arm (Dragging Menacing Limp)
    const lArmGroup = new THREE.Group();
    lArmGroup.position.set(-0.36, 1.4, 0.06);

    const lBicepGeo = new THREE.BoxGeometry(0.13, 0.4, 0.13);
    const lBicep = new THREE.Mesh(lBicepGeo, armMat);
    lBicep.position.set(0, -0.18, 0.04);
    lBicep.rotation.x = Math.PI / 6;
    lArmGroup.add(lBicep);

    const lForearmGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11);
    const lForearm = new THREE.Mesh(lForearmGeo, armMat);
    lForearm.position.set(-0.02, -0.42, 0.22);
    lForearm.rotation.x = Math.PI / 3.4;
    lArmGroup.add(lForearm);

    for (let c = -0.04; c <= 0.04; c += 0.025) {
      const clawGeo = new THREE.ConeGeometry(0.018, 0.09, 5);
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(-0.02 + c, -0.58, 0.36);
      claw.rotation.x = Math.PI / 3;
      lArmGroup.add(claw);
    }
    group.add(lArmGroup);

    // 4. Legs with Armored Combat Pants & Heavy Boots
    const legMat = new THREE.MeshStandardMaterial({ color: 0x161e19, roughness: 0.9 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x090c0a, roughness: 0.7, metalness: 0.3 });
    const kneeMat = new THREE.MeshStandardMaterial({ color: 0x243229, metalness: 0.5, roughness: 0.5 });

    [-0.17, 0.17].forEach((lx) => {
      const legGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.52, 0);
      group.add(leg);

      // Armored Knee Guard Plate
      const kneeGeo = new THREE.BoxGeometry(0.14, 0.12, 0.05);
      const knee = new THREE.Mesh(kneeGeo, kneeMat);
      knee.position.set(lx, 0.48, 0.09);
      group.add(knee);

      // Heavy Combat Boot with Tread Sole
      const bootGeo = new THREE.BoxGeometry(0.17, 0.18, 0.28);
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(lx, 0.09, 0.04);
      group.add(boot);
    });

    // 5. Invisible Simplified Cylindrical Hitbox (Enables Instant O(1) Raycasting)
    const hitboxGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.0, 8);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
    hitbox.position.set(0, 1.0, 0);
    hitbox.userData.isZombieHitbox = true;
    group.add(hitbox);

    // Cache animation node hooks in group userData
    group.userData.headGroup = headGroup;
    group.userData.rArmGroup = rArmGroup;
    group.userData.lArmGroup = lArmGroup;
    group.userData.pustules = pustules;

    return group;
  }

  function flashZombieRed(mesh) {
    mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.color) {
        child.currentOrigColor = child.currentOrigColor || child.material.color.clone();
        child.material.color.setHex(0xff0000);
        setTimeout(() => {
          if (child.currentOrigColor) child.material.color.copy(child.currentOrigColor);
        }, 100);
      }
    });
  }

  function collapseZombieCorpse(zEntry) {
    window.SoundFX.playZombieDeath();
    if (!zEntry.mesh) return;

    // Dramatic death ragdoll collapse
    zEntry.mesh.rotation.x = Math.PI / 2.1;
    zEntry.mesh.rotation.z = (Math.random() - 0.5) * 0.4;
    zEntry.mesh.position.y = 0.15;
  }

  /**
   * Spawns the 3D Keycard item in the world
   */
  function spawn3DKeycard(keycardData) {
    if (keycardMesh) scene.remove(keycardMesh);

    keycardMesh = new THREE.Group();

    // Floating plastic keycard
    const cardGeo = new THREE.BoxGeometry(0.5, 0.3, 0.04);
    const cardMat = new THREE.MeshStandardMaterial({
      color: keycardData.glowColor || 0x38bdf8,
      metalness: 0.9,
      roughness: 0.2
    });
    const card = new THREE.Mesh(cardGeo, cardMat);
    keycardMesh.add(card);

    // Glowing Core Light
    const cardLight = new THREE.PointLight(keycardData.glowColor || 0x38bdf8, 1.8, 6, 2);
    cardLight.position.set(0, 0, 0.1);
    keycardMesh.add(cardLight);

    keycardMesh.position.set(keycardData.x, keycardData.y || 0.8, keycardData.z);
    scene.add(keycardMesh);
  }

  function openBlastDoor(doorObj) {
    if (doorObj && doorObj.mesh) {
      // Slide upwards into ceiling
      doorObj.mesh.position.y += 3.5;
    }
  }

  /**
   * Spawns 3D Scavengeable Supply Caches (Ammo Crates & Trauma Autoinjectors)
   */
  function spawn3DSupplies(supplies) {
    supplyMeshesMap.forEach((mesh) => scene.remove(mesh));
    supplyMeshesMap.clear();

    if (!supplies || !supplies.length) return;

    supplies.forEach((s) => {
      if (s.collected) return;
      const group = new THREE.Group();
      const isAmmo = s.type === "ammo";

      // Tactical Crate Hull
      const crateGeo = new THREE.BoxGeometry(0.75, 0.45, 0.55);
      const crateMat = new THREE.MeshStandardMaterial({
        color: isAmmo ? 0x1e3a5f : 0x14532d,
        metalness: 0.7,
        roughness: 0.35
      });
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(0, 0.225, 0);
      group.add(crate);

      // Chamfered Lid
      const lidGeo = new THREE.BoxGeometry(0.78, 0.08, 0.58);
      const lidMat = new THREE.MeshStandardMaterial({
        color: isAmmo ? 0x0f2744 : 0x0c3c1e,
        metalness: 0.8,
        roughness: 0.3
      });
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.set(0, 0.46, 0);
      group.add(lid);

      // Glowing LED Indicator Strip
      const ledGeo = new THREE.BoxGeometry(0.65, 0.04, 0.04);
      const ledMat = new THREE.MeshBasicMaterial({
        color: isAmmo ? 0x38bdf8 : 0x4ade80
      });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, 0.32, 0.28);
      group.add(led);

      // Local Supply Glow Light
      const pLight = new THREE.PointLight(isAmmo ? 0x38bdf8 : 0x4ade80, 0.9, 4.5, 2);
      pLight.position.set(0, 0.55, 0);
      group.add(pLight);

      group.position.set(s.x, s.y || 0.2, s.z);
      scene.add(group);
      supplyMeshesMap.set(s.id, group);
    });
  }

  /**
   * Spawns a 3D Vertical Laser Beacon Column from Dispatcher Radar Waypoint
   */
  function spawn3DWaypointBeacon(x, z) {
    if (activeWaypointBeacon) {
      scene.remove(activeWaypointBeacon);
      activeWaypointBeacon = null;
    }

    const group = new THREE.Group();

    // 1. Vertical Laser Column reaching to facility ceiling
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.8, 16);
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 2.8,
      transparent: true,
      opacity: 0.75,
      roughness: 0.1
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 1.9, 0);
    group.add(beam);

    // 2. Base Ground Pulse Rings
    const ringGeo = new THREE.RingGeometry(0.3, 0.95, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    // 3. Local Illuminating Beacon Light
    const bLight = new THREE.PointLight(0x38bdf8, 2.5, 12, 2);
    bLight.position.set(0, 1.8, 0);
    group.add(bLight);

    group.position.set(x, 0, z);
    scene.add(group);
    activeWaypointBeacon = group;

    // Toast alert in Field Agent HUD
    const pPos = controls.getObject().position;
    const dist = Math.hypot(pPos.x - x, pPos.z - z);
    if (waypointToast && waypointToastText) {
      waypointToastText.textContent = `WAYPOINT BEACON TRANSMITTED // RANGE: ${dist.toFixed(1)}m`;
      waypointToast.classList.remove("hidden");
      setTimeout(() => waypointToast.classList.add("hidden"), 5000);
    }

    // Auto-remove beacon after 10s
    setTimeout(() => {
      if (activeWaypointBeacon === group) {
        scene.remove(group);
        activeWaypointBeacon = null;
      }
    }, 10000);
  }

  /**
   * Echolocation Acoustic Sonar Pulse ([Q] Key)
   */
  function triggerAcousticSonar() {
    const now = Date.now();
    if (now - lastSonarTime < sonarCooldownMs) return;
    lastSonarTime = now;

    window.SoundFX.playSonarPulse();

    // Update cooldown text in HUD
    if (sonarCooldownText) {
      sonarCooldownText.className = "sonar-recharging";
      let rem = 5;
      sonarCooldownText.textContent = `RECHARGING (${rem}s)`;
      const cdTimer = setInterval(() => {
        rem--;
        if (rem <= 0) {
          clearInterval(cdTimer);
          sonarCooldownText.className = "sonar-ready";
          sonarCooldownText.textContent = "READY";
        } else {
          sonarCooldownText.textContent = `RECHARGING (${rem}s)`;
        }
      }, 1000);
    }

    // Spawn expanding 3D neon sonar ring on the floor
    const pPos = controls.getObject().position;
    const ringGeo = new THREE.RingGeometry(0.4, 0.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.set(pPos.x, 0.05, pPos.z);
    scene.add(ringMesh);

    activePulseRings.push({
      mesh: ringMesh,
      startTime: now,
      startX: pPos.x,
      startZ: pPos.z,
      duration: 1200
    });

    // Scan for nearest zombie
    let closestZombie = null;
    let closestDist = Infinity;
    zombieMap.forEach((z) => {
      if (z.isDead) return;
      const d = Math.hypot(pPos.x - z.targetX, pPos.z - z.targetZ);
      if (d < closestDist) {
        closestDist = d;
        closestZombie = z;
      }
    });

    if (closestZombie && closestDist <= 25) {
      const dx = closestZombie.targetX - pPos.x;
      const dz = closestZombie.targetZ - pPos.z;
      const angleRad = Math.atan2(dx, -dz);
      const deg = ((angleRad * 180 / Math.PI) + 360) % 360;
      const bearings = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      const bIndex = Math.round(deg / 45) % 8;
      const bearing = bearings[bIndex];

      if (sonarReport) {
        sonarReport.className = "sonar-report threat";
        sonarReport.textContent = `BIO-HOSTILE: ${closestDist.toFixed(1)}m [BEARING ${bearing}]`;
        sonarReport.classList.remove("hidden");
        setTimeout(() => sonarReport.classList.add("hidden"), 4500);
      }
    } else {
      if (sonarReport) {
        sonarReport.className = "sonar-report clear";
        sonarReport.textContent = "SECTOR CLEAR // NO HOSTILE SIGNATURES (25m)";
        sonarReport.classList.remove("hidden");
        setTimeout(() => sonarReport.classList.add("hidden"), 4500);
      }
    }
  }

  /**
   * Toggles Tactical Optical Beam & UV 395nm Blacklight ([F] Key)
   */
  function toggleFlashlightMode() {
    flashlightMode = (flashlightMode + 1) % 3;
    window.SoundFX.playFlashlightSwitch();

    if (flashlightMode === 0) {
      // Standard Beam (6500K bright white)
      flashlight.color.setHex(0xdcfce7);
      flashlight.intensity = 3.2;
      flashlight.angle = Math.PI / 4.6;
      flashFill.color.setHex(0xa7f3d0);
      flashFill.intensity = 0.4;
      if (flashlightBadge && flashlightModeText) {
        flashlightBadge.className = "flashlight-badge mode-standard";
        flashlightModeText.textContent = "STANDARD BEAM";
      }
      uvElements.forEach((mat) => { if (mat) mat.emissiveIntensity = 0.15; });
    } else if (flashlightMode === 1) {
      // UV Blacklight Mode (395nm phosphor purple)
      flashlight.color.setHex(0x9333ea);
      flashlight.intensity = 4.2;
      flashlight.angle = Math.PI / 3.8;
      flashFill.color.setHex(0x7e22ce);
      flashFill.intensity = 0.8;
      if (flashlightBadge && flashlightModeText) {
        flashlightBadge.className = "flashlight-badge mode-uv";
        flashlightModeText.textContent = "UV 395nm BIO-FLUOR";
      }
      uvElements.forEach((mat) => { if (mat) mat.emissiveIntensity = 2.4; });
    } else {
      // Low Beam / Stealth
      flashlight.color.setHex(0x94a3b8);
      flashlight.intensity = 0.8;
      flashlight.angle = Math.PI / 5.5;
      flashFill.intensity = 0.1;
      if (flashlightBadge && flashlightModeText) {
        flashlightBadge.className = "flashlight-badge mode-dim";
        flashlightModeText.textContent = "LOW BEAM (STEALTH)";
      }
      uvElements.forEach((mat) => { if (mat) mat.emissiveIntensity = 0.05; });
    }
  }

  /**
   * Interactive Custom Comms Console ([T] Key)
   */
  function openCommsConsole() {
    if (controls) controls.unlock();
    fieldCommsConsole.classList.remove("hidden");
    fieldCommsInput.value = "";
    setTimeout(() => fieldCommsInput.focus(), 50);
  }

  function closeCommsConsole() {
    fieldCommsConsole.classList.add("hidden");
    if (controls) controls.lock();
  }

  /**
   * Builds the 3D facility meshes from LEVEL_DATA (Rooms, Walls, Lava Bed, Blast Doors)
   */
  /**
   * Builds high-detail Blender-styled facility architecture and room elements
   */
  let lavaEmbersMesh = null;
  const emberParticles = [];

  function buildFacility(level) {
    const wallHeight = level.bounds.wallHeight || 3.8;

    // 1. Procedural Concrete & Metal Wall Texture
    const wallCanvas = document.createElement("canvas");
    wallCanvas.width = 256;
    wallCanvas.height = 256;
    const wctx = wallCanvas.getContext("2d");
    wctx.fillStyle = "#1e2621";
    wctx.fillRect(0, 0, 256, 256);
    // Industrial panel seams
    wctx.strokeStyle = "#121815";
    wctx.lineWidth = 3;
    wctx.strokeRect(0, 0, 256, 256);
    wctx.strokeRect(0, 128, 256, 128);
    // Subtle surface noise
    wctx.fillStyle = "#27342d";
    for (let i = 0; i < 150; i++) {
      wctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const wallTexture = new THREE.CanvasTexture(wallCanvas);
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x24322b,
      roughness: 0.82,
      metalness: 0.28,
      map: wallTexture
    });

    // 2. Build Solid Walls
    level.walls.forEach((wall) => {
      const width = wall.maxX - wall.minX;
      const depth = wall.maxZ - wall.minZ;
      const posX = (wall.minX + wall.maxX) / 2;
      const posZ = (wall.minZ + wall.maxZ) / 2;

      const wallGeo = new THREE.BoxGeometry(width, wallHeight, depth);
      const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
      wallMesh.position.set(posX, wallHeight / 2, posZ);
      scene.add(wallMesh);
    });

    // 3. Tiled Industrial Floor Plane with Grid Seams
    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fctx = floorCanvas.getContext("2d");
    fctx.fillStyle = "#131a16";
    fctx.fillRect(0, 0, 256, 256);
    fctx.strokeStyle = "#0b100e";
    fctx.lineWidth = 4;
    fctx.strokeRect(0, 0, 128, 128);
    fctx.strokeRect(128, 0, 128, 128);
    fctx.strokeRect(0, 128, 128, 128);
    fctx.strokeRect(128, 128, 128, 128);
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(20, 20);

    const floorGeo = new THREE.PlaneGeometry(80, 80);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a241e,
      roughness: 0.75,
      metalness: 0.25,
      map: floorTex
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, 0);
    scene.add(floorMesh);

    // 4. Ceiling Plane
    const ceilingGeo = new THREE.PlaneGeometry(80, 80);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x111613,
      roughness: 0.95
    });
    const ceilingMesh = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.set(0, wallHeight, 0);
    scene.add(ceilingMesh);

    // 5. BLENDER-STYLED STRUCTURAL PILLARS WITH HAZARD CHEVRONS
    const pillarPositions = [
      { x: -16, z: -16 },
      { x: 16, z: -16 },
      { x: -16, z: 16 },
      { x: 16, z: 16 },
      { x: -4, z: -4 },
      { x: 4, z: -4 },
      { x: -4, z: 4 },
      { x: 4, z: 4 }
    ];

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1f2923,
      metalness: 0.5,
      roughness: 0.5
    });
    const hazardTapeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    pillarPositions.forEach((pos) => {
      const pGroup = new THREE.Group();
      // Main central chamfered column
      const pGeo = new THREE.BoxGeometry(1.2, wallHeight, 1.2);
      const pMesh = new THREE.Mesh(pGeo, pillarMat);
      pMesh.position.set(0, wallHeight / 2, 0);
      pGroup.add(pMesh);

      // Yellow/Black Caution Stripe Band
      const tapeGeo = new THREE.BoxGeometry(1.24, 0.35, 1.24);
      const tape = new THREE.Mesh(tapeGeo, hazardTapeMat);
      tape.position.set(0, 0.45, 0);
      pGroup.add(tape);

      // Top Structural Header Flange
      const capGeo = new THREE.BoxGeometry(1.5, 0.25, 1.5);
      const cap = new THREE.Mesh(capGeo, pillarMat);
      cap.position.set(0, wallHeight - 0.125, 0);
      pGroup.add(cap);

      pGroup.position.set(pos.x, 0, pos.z);
      scene.add(pGroup);
    });

    // 6. BLENDER-STYLED CEILING TRUSSES & INDUSTRIAL GIRDERS
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x141a16, metalness: 0.8, roughness: 0.4 });
    [-18, 0, 18].forEach((gx) => {
      const girderGeo = new THREE.BoxGeometry(0.3, 0.4, 76);
      const girder = new THREE.Mesh(girderGeo, trussMat);
      girder.position.set(gx, wallHeight - 0.2, 0);
      scene.add(girder);
    });

    // 7. INDUSTRIAL WALL PIPELINES & CONDUITS
    const pipeMat1 = new THREE.MeshStandardMaterial({ color: 0x0e7490, metalness: 0.85, roughness: 0.2 }); // Coolant Teal
    const pipeMat2 = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.3 }); // Hazard Orange

    [-36.5, 36.5].forEach((px) => {
      const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 74, 12);
      const pipe1 = new THREE.Mesh(pipeGeo, pipeMat1);
      pipe1.position.set(px, wallHeight - 0.6, 0);
      scene.add(pipe1);

      const pipe2 = new THREE.Mesh(pipeGeo, pipeMat2);
      pipe2.position.set(px, wallHeight - 0.85, 0);
      scene.add(pipe2);
    });

    // 8. ROOM-SPECIFIC PROPS
    // A. Mainframe AI Chamber (RM-09): Server Racks & Holographic Pedestal
    const serverRackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.25 });
    [-2, 0, 2].forEach((offset) => {
      const rackGeo = new THREE.BoxGeometry(1.0, 2.6, 0.8);
      const rack = new THREE.Mesh(rackGeo, serverRackMat);
      rack.position.set(24 + offset, 1.3, 34);
      scene.add(rack);

      // Blinking status LEDs on server face
      for (let ledY = 0.4; ledY <= 2.2; ledY += 0.35) {
        const ledGeo = new THREE.BoxGeometry(0.06, 0.04, 0.02);
        const ledMat = new THREE.MeshBasicMaterial({
          color: Math.random() > 0.4 ? 0x22c55e : 0x06b6d4
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(24 + offset - 0.3 + Math.random() * 0.6, ledY, 33.58);
        scene.add(led);
      }
    });

    // Holographic Core Pedestal in Mainframe Center
    const pedGeo = new THREE.CylinderGeometry(0.8, 1.0, 0.9, 16);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 });
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.position.set(28, 0.45, 28);
    scene.add(ped);

    const holoRingGeo = new THREE.TorusGeometry(0.55, 0.04, 8, 24);
    const holoRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const holoRing = new THREE.Mesh(holoRingGeo, holoRingMat);
    holoRing.rotation.x = Math.PI / 2;
    holoRing.position.set(28, 1.1, 28);
    scene.add(holoRing);

    // B. Research Lab Delta (RM-07): Bio-Containment Pods & Lab Benches
    const podGlassMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.6
    });
    const podBaseMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });

    [-32, -24].forEach((podX) => {
      const pBase = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 16), podBaseMat);
      pBase.position.set(podX, 0.2, 32);
      scene.add(pBase);

      const pGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16), podGlassMat);
      pGlass.position.set(podX, 1.2, 32);
      scene.add(pGlass);

      // Glowing specimen core inside pod
      const pCore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0x86efac }));
      pCore.position.set(podX, 1.2, 32);
      scene.add(pCore);
    });

    // C. Storage Bay Bravo (RM-03): Heavy Stacked Cargo Crates
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8, metalness: 0.2 });
    const cratePositions = [
      { x: 24, z: -32, w: 1.4, h: 1.2, d: 1.4 },
      { x: 26, z: -32, w: 1.2, h: 1.0, d: 1.2 },
      { x: 24.5, z: -32, w: 1.1, h: 0.9, d: 1.1, y: 1.6 }
    ];
    cratePositions.forEach((cp) => {
      const cMesh = new THREE.Mesh(new THREE.BoxGeometry(cp.w, cp.h, cp.d), crateMat);
      cMesh.position.set(cp.x, (cp.y || cp.h / 2), cp.z);
      scene.add(cMesh);
    });

    // 9. BLENDER-STYLED MULTI-LAYERED MOLTEN LAVA BED TRENCH
    const lavaHazard = level.hazardPool.find((h) => h.type === "lava_bed");
    if (lavaHazard) {
      const lw = lavaHazard.bounds.maxX - lavaHazard.bounds.minX;
      const ld = lavaHazard.bounds.maxZ - lavaHazard.bounds.minZ;

      // Dark Jagged Basalt Rock Embankment Rim
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x111614, roughness: 0.95 });
      const rimGeo = new THREE.BoxGeometry(lw + 1.2, 0.25, ld + 1.2);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(lavaHazard.center.x, 0.12, lavaHazard.center.z);
      scene.add(rim);

      // Glowing Molten Magma Surface
      const lavaGeo = new THREE.PlaneGeometry(lw, ld, 16, 16);
      const lavaMat = new THREE.MeshStandardMaterial({
        color: 0xff4500,
        emissive: 0xff2200,
        emissiveIntensity: 2.0,
        roughness: 0.2
      });
      lavaBedMesh = new THREE.Mesh(lavaGeo, lavaMat);
      lavaBedMesh.rotation.x = -Math.PI / 2;
      lavaBedMesh.position.set(lavaHazard.center.x, 0.15, lavaHazard.center.z);
      scene.add(lavaBedMesh);

      // Cooling Obsidian Rock Crust Rafts floating on lava surface
      const crustMat = new THREE.MeshStandardMaterial({ color: 0x181412, roughness: 0.9 });
      [
        { x: -31, z: -8, sx: 1.8, sz: 1.4 },
        { x: -27, z: -6, sx: 2.2, sz: 1.6 },
        { x: -24, z: -8, sx: 1.5, sz: 1.2 }
      ].forEach((crust) => {
        const cGeo = new THREE.BoxGeometry(crust.sx, 0.08, crust.sz);
        const cMesh = new THREE.Mesh(cGeo, crustMat);
        cMesh.position.set(crust.x, 0.19, crust.z);
        scene.add(cMesh);
      });

      // Emissive Magma Illumination Light
      const lavaLight = new THREE.PointLight(0xff3700, 3.2, 22, 1.6);
      lavaLight.position.set(lavaHazard.center.x, 1.4, lavaHazard.center.z);
      scene.add(lavaLight);

      // Rising Ember Particles
      const emberGeo = new THREE.BufferGeometry();
      const emberCount = 35;
      const emberPos = new Float32Array(emberCount * 3);
      for (let i = 0; i < emberCount; i++) {
        emberPos[i * 3] = lavaHazard.bounds.minX + Math.random() * lw;
        emberPos[i * 3 + 1] = 0.2 + Math.random() * 2.8;
        emberPos[i * 3 + 2] = lavaHazard.bounds.minZ + Math.random() * ld;
        emberParticles.push({
          startY: 0.2,
          speed: 0.6 + Math.random() * 1.2,
          drift: (Math.random() - 0.5) * 0.4
        });
      }
      emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
      const emberMat = new THREE.PointsMaterial({
        color: 0xffaa00,
        size: 0.08,
        transparent: true,
        opacity: 0.8
      });
      lavaEmbersMesh = new THREE.Points(emberGeo, emberMat);
      scene.add(lavaEmbersMesh);
    }

    // 10. LOCKED SECURITY BLAST DOORS WITH HYDRAULIC FRAME
    if (level.lockedDoors) {
      level.lockedDoors.forEach((door) => {
        const dw = door.bounds.maxX - door.bounds.minX;
        const dd = door.bounds.maxZ - door.bounds.minZ;

        // Reinforced blast door slab with hazard chevrons
        const doorGeo = new THREE.BoxGeometry(dw, wallHeight, dd);
        const doorMat = new THREE.MeshStandardMaterial({
          color: 0xdc2626,
          metalness: 0.85,
          roughness: 0.25
        });
        const dMesh = new THREE.Mesh(doorGeo, doorMat);
        dMesh.position.set(door.center.x, wallHeight / 2, door.center.z);
        scene.add(dMesh);

        // Illuminated Lock Status Diode
        const lockLight = new THREE.PointLight(0xef4444, 1.8, 5, 2);
        lockLight.position.set(door.center.x, 1.8, door.center.z);
        scene.add(lockLight);

        lockedDoorMeshes.push({ id: door.id, mesh: dMesh, light: lockLight });
      });
    }

    // 11. OBJECTIVE EMERGENCY CONSOLE TERMINALS
    level.objectivePool.forEach((obj) => {
      const termGroup = new THREE.Group();

      // Console Pedestal
      const baseGeo = new THREE.BoxGeometry(1.2, 1.1, 0.8);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.3 });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.set(0, 0.55, 0);
      termGroup.add(baseMesh);

      // Angled Terminal Screen with glowing amber text
      const screenGeo = new THREE.BoxGeometry(0.9, 0.6, 0.1);
      const screenMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
      const screenMesh = new THREE.Mesh(screenGeo, screenMat);
      screenMesh.position.set(0, 1.25, 0.2);
      screenMesh.rotation.x = -Math.PI / 6;
      termGroup.add(screenMesh);

      // Screen glow light
      const screenLight = new THREE.PointLight(0xf59e0b, 1.4, 6, 2);
      screenLight.position.set(0, 1.4, 0.5);
      termGroup.add(screenLight);

      termGroup.position.set(obj.x, 0, obj.z);
      scene.add(termGroup);
    });

    // 12. HIGH-EFFICIENCY CORRIDOR BULKHEAD FIXTURES (Emissive lamps, Zero PointLight Shader Bloat)
    level.rooms.forEach((room) => {
      const lampGeo = new THREE.BoxGeometry(1.8, 0.18, 0.45);
      const lampMat = new THREE.MeshBasicMaterial({
        color: room.isDeadZone ? 0xff4444 : 0x4ade80
      });
      const lampMesh = new THREE.Mesh(lampGeo, lampMat);
      lampMesh.position.set(room.center.x, wallHeight - 0.1, room.center.z);
      scene.add(lampMesh);
    });

    // 13. UV BIO-FLUORESCENT MARKINGS (Fluoresce under UV 395nm Blacklight)
    const uvMarkingMat1 = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      emissive: 0x10b981,
      emissiveIntensity: 0.15,
      roughness: 0.3,
      transparent: true,
      opacity: 0.85
    });
    const uvMarkingMat2 = new THREE.MeshStandardMaterial({
      color: 0x581c87,
      emissive: 0xa855f7,
      emissiveIntensity: 0.15,
      roughness: 0.3,
      transparent: true,
      opacity: 0.85
    });
    uvElements.push(uvMarkingMat1, uvMarkingMat2);

    const puddleLocations = [
      { x: -26, z: 26, r: 1.4, mat: uvMarkingMat1 },
      { x: -28, z: 22, r: 1.1, mat: uvMarkingMat1 },
      { x: 2, z: 6, r: 1.6, mat: uvMarkingMat2 },
      { x: -8, z: -24, r: 1.2, mat: uvMarkingMat1 },
      { x: 26, z: -24, r: 1.5, mat: uvMarkingMat2 }
    ];
    puddleLocations.forEach((p) => {
      const pGeo = new THREE.CircleGeometry(p.r, 16);
      const pMesh = new THREE.Mesh(pGeo, p.mat);
      pMesh.rotation.x = -Math.PI / 2;
      pMesh.position.set(p.x, 0.02, p.z);
      scene.add(pMesh);
    });
  }

  /**
   * Keyboard & Mouse Controls (WASD, Mouse Look, Shoot, Reload, Callouts)
   */
  function setupInputListeners() {
    const onKeyDown = (event) => {
      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          player.moveForward = true;
          break;
        case "KeyS":
        case "ArrowDown":
          player.moveBackward = true;
          break;
        case "KeyA":
        case "ArrowLeft":
          player.moveLeft = true;
          break;
        case "KeyD":
        case "ArrowRight":
          player.moveRight = true;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          player.isSprinting = true;
          break;
        case "KeyE":
          attemptInteraction();
          break;
        case "KeyR":
          reloadGun();
          break;
        case "KeyF":
          toggleFlashlightMode();
          break;
        case "KeyQ":
          triggerAcousticSonar();
          break;
        case "KeyT":
          if (controls && controls.isLocked) {
            event.preventDefault();
            openCommsConsole();
          }
          break;
        case "Escape":
          if (!fieldCommsConsole.classList.contains("hidden")) {
            event.preventDefault();
            closeCommsConsole();
          }
          break;
        // PTT Keys 1 - 6
        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4":
        case "Digit5":
        case "Digit6":
          const keyNum = event.code.replace("Digit", "");
          if (CALLOUTS[keyNum]) {
            sendCallout(CALLOUTS[keyNum]);
          }
          break;
      }
    };

    const onKeyUp = (event) => {
      switch (event.code) {
        case "KeyW":
        case "ArrowUp":
          player.moveForward = false;
          break;
        case "KeyS":
        case "ArrowDown":
          player.moveBackward = false;
          break;
        case "KeyA":
        case "ArrowLeft":
          player.moveLeft = false;
          break;
        case "KeyD":
        case "ArrowRight":
          player.moveRight = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          player.isSprinting = false;
          break;
      }
    };

    // Left-Click to Shoot Gun
    document.addEventListener("mousedown", (e) => {
      if (e.button === 0 && controls.isLocked) {
        shootGun();
      }
    });

    // Custom Radio Transmitter Form Submit
    if (fieldCommsForm) {
      fieldCommsForm.onsubmit = (e) => {
        e.preventDefault();
        const text = fieldCommsInput.value.trim();
        if (text) {
          socket.emit("field_callout", { text });
          pttStatusIndicator.textContent = `CALLOUT TRANSMITTED: "${text}"`;
          pttStatusIndicator.style.color = "#4ade80";
          setTimeout(() => {
            pttStatusIndicator.textContent = "TRANSMITTER READY // PRESS [T] TO TYPE CUSTOM RADIO CALLOUT";
            pttStatusIndicator.style.color = "#94a3b8";
          }, 3000);
        }
        closeCommsConsole();
      };
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }

  function attemptInteraction() {
    if (!controls.isLocked) return;

    if (nearbySupply) {
      window.SoundFX.playAmmoPickup();
      socket.emit("scavenge_supply", { supplyId: nearbySupply.id });
      if (nearbySupply.type === "ammo") {
        weaponState.reserve += nearbySupply.amount;
        updateAmmoHUD();
      }
      const sMesh = supplyMeshesMap.get(nearbySupply.id);
      if (sMesh) {
        scene.remove(sMesh);
        supplyMeshesMap.delete(nearbySupply.id);
      }
      nearbySupply = null;
      interactPrompt.classList.add("hidden");
    } else if (isNearbyKeycard) {
      window.SoundFX.playMicClick();
      socket.emit("interact_keycard");
    } else if (isNearbyTerminal) {
      window.SoundFX.playMicClick();
      socket.emit("interact_terminal");
    }
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Main Simulation & Animation Loop
   */
  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);

    if (controls && controls.isLocked) {
      updateMovement(delta);
      checkNearbyInteractions();
      updateGunAnimation(delta);
      updateZombiesAnimation(delta);
      updateLavaAnimation(delta);
    }

    // Animate Echolocation Sonar pulse rings
    const now = Date.now();
    for (let i = activePulseRings.length - 1; i >= 0; i--) {
      const ring = activePulseRings[i];
      const progress = (now - ring.startTime) / ring.duration;
      if (progress >= 1.0) {
        scene.remove(ring.mesh);
        activePulseRings.splice(i, 1);
      } else {
        const currentScale = 0.5 + progress * 28.0;
        ring.mesh.scale.set(currentScale, currentScale, 1);
        ring.mesh.material.opacity = (1.0 - progress) * 0.9;
      }
    }

    // Animate Waypoint Beacon subtle rotation
    if (activeWaypointBeacon) {
      activeWaypointBeacon.rotation.y += delta * 1.5;
    }

    // Camera shake recovery
    if (cameraShake > 0) {
      camera.rotation.z = (Math.random() - 0.5) * cameraShake;
      camera.position.x += (Math.random() - 0.5) * cameraShake * 0.4;
      cameraShake = Math.max(0, cameraShake - delta * 0.8);
    } else {
      camera.rotation.z = 0;
    }

    // Heartbeat audio when critically low health
    if (currentHealth <= 30 && performance.now() - lastHeartbeat > 850) {
      lastHeartbeat = performance.now();
      window.SoundFX.playHeartbeat();
    }

    renderer.render(scene, camera);
  }

  /**
   * Gun recoil and slide recovery
   */
  function updateGunAnimation(delta) {
    if (!gunGroup || !gunSlide) return;

    // Recoil recovery
    if (weaponState.recoil > 0) {
      gunSlide.position.z = -0.02 + weaponState.recoil * 0.15;
      gunGroup.rotation.x = weaponState.recoil * 0.8;
      weaponState.recoil = Math.max(0, weaponState.recoil - delta * 1.5);
    } else {
      gunSlide.position.z = -0.02;
      gunGroup.rotation.x = 0;
    }
  }

  /**
   * Zombie 3D animation (shambling, breathing, crawling)
   */
  /**
   * Zombie 3D animation (shambling, claw lunging, pulsating pustules)
   */
  function updateZombiesAnimation(delta) {
    const camPos = controls.getObject().position;
    const time = clock.getElapsedTime();

    zombieMap.forEach((zEntry) => {
      if (!zEntry.mesh) return;

      if (!zEntry.isDead) {
        // Interpolate toward target position
        zEntry.mesh.position.x += (zEntry.targetX - zEntry.mesh.position.x) * 0.1;
        zEntry.mesh.position.z += (zEntry.targetZ - zEntry.mesh.position.z) * 0.1;

        // Face player
        const dx = camPos.x - zEntry.mesh.position.x;
        const dz = camPos.z - zEntry.mesh.position.z;
        zEntry.mesh.rotation.y = Math.atan2(dx, dz);

        // Walking shambling bob & arm lunges
        zEntry.walkCycle += delta * 4.2;
        zEntry.mesh.position.y = Math.sin(zEntry.walkCycle) * 0.05;

        if (zEntry.mesh.userData) {
          if (zEntry.mesh.userData.rArmGroup) {
            zEntry.mesh.userData.rArmGroup.rotation.x = Math.PI / 3.0 + Math.sin(zEntry.walkCycle) * 0.25;
          }
          if (zEntry.mesh.userData.lArmGroup) {
            zEntry.mesh.userData.lArmGroup.rotation.x = -Math.sin(zEntry.walkCycle) * 0.2;
          }
          if (zEntry.mesh.userData.pustules) {
            zEntry.mesh.userData.pustules.forEach((p, i) => {
              const sc = 1.0 + Math.sin(time * 5.0 + i * 2.0) * 0.18;
              p.scale.set(sc, sc, sc);
            });
          }
        }

        // Zombie groan if close to player
        const dist = Math.hypot(dx, dz);
        if (dist < 14 && Date.now() > zEntry.lastGroan) {
          zEntry.lastGroan = Date.now() + 6000 + Math.random() * 6000;
          window.SoundFX.playZombieGroan();
        }
      }
    });
  }

  /**
   * Animated pulsating lava surface & rising thermal ember sparks
   */
  function updateLavaAnimation(delta) {
    const time = clock.getElapsedTime();

    if (lavaBedMesh) {
      lavaBedMesh.material.emissiveIntensity = 1.5 + Math.sin(time * 3.5) * 0.6;
    }

    // Rising Lava Embers
    if (lavaEmbersMesh && emberParticles.length > 0) {
      const posAttr = lavaEmbersMesh.geometry.attributes.position;
      for (let i = 0; i < emberParticles.length; i++) {
        const ep = emberParticles[i];
        let y = posAttr.getY(i) + ep.speed * delta;
        if (y > 3.0) y = ep.startY;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // Spin floating 3D keycard
    if (keycardMesh) {
      keycardMesh.rotation.y += delta * 2.2;
      keycardMesh.position.y = 0.8 + Math.sin(time * 3) * 0.08;
    }
  }

  /**
   * Movement and sliding AABB collision against level walls (Zero Allocations)
   */
  function updateMovement(delta) {
    const damping = Math.exp(-delta * 10);
    player.velocity.x *= damping;
    player.velocity.z *= damping;

    player.direction.z = Number(player.moveForward) - Number(player.moveBackward);
    player.direction.x = Number(player.moveRight) - Number(player.moveLeft);
    player.direction.normalize();

    const currentSpeed = player.isSprinting ? player.sprintSpeed : player.speed;

    if (player.moveForward || player.moveBackward) {
      player.velocity.z -= player.direction.z * currentSpeed * delta * 12;
    }
    if (player.moveLeft || player.moveRight) {
      player.velocity.x -= player.direction.x * currentSpeed * delta * 12;
    }

    _moveForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _moveForward.y = 0;
    _moveForward.normalize();

    _moveRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _moveRight.y = 0;
    _moveRight.normalize();

    _deltaPos.set(0, 0, 0)
      .addScaledVector(_moveForward, -player.velocity.z * delta)
      .addScaledVector(_moveRight, -player.velocity.x * delta);

    const camPos = controls.getObject().position;
    const targetX = camPos.x + _deltaPos.x;
    const targetZ = camPos.z + _deltaPos.z;

    // Resolve wall collisions
    if (levelData && levelData.walls) {
      const resolved = window.resolveWallCollisions(
        targetX,
        targetZ,
        player.radius,
        levelData.walls
      );
      camPos.x = resolved.x;
      camPos.z = resolved.z;
    } else {
      camPos.x = targetX;
      camPos.z = targetZ;
    }

    // Head bobbing effect
    if (player.velocity.lengthSq() > 0.05) {
      player.bobTimer += delta * (player.isSprinting ? 14 : 9);
      camera.position.y = 1.6 + Math.sin(player.bobTimer) * 0.04;
    } else {
      camera.position.y = 1.6;
    }

    // Stream position to server (throttled to ~25Hz)
    const now = performance.now();
    if (now - lastMoveEmit > 40) {
      lastMoveEmit = now;
      socket.emit("player_move", {
        x: camPos.x,
        y: camPos.y,
        z: camPos.z,
        rotationY: camera.rotation.y
      });
    }
  }

  /**
   * Checks proximity to objective terminal or keycard
   */
  function checkNearbyInteractions() {
    if (!levelData) return;

    const camPos = controls.getObject().position;
    isNearbyTerminal = false;
    isNearbyKeycard = false;
    nearbySupply = null;

    // 1. Check Supply Crate Proximity (Ammo / Trauma Medkits)
    if (currentMission && currentMission.supplies) {
      for (const s of currentMission.supplies) {
        if (s.collected) continue;
        const dist = Math.hypot(camPos.x - s.x, camPos.z - s.z);
        if (dist <= (s.interactRadius || 2.2)) {
          nearbySupply = s;
          interactPrompt.classList.remove("hidden");
          promptText.textContent = `SCAVENGE ${s.name.toUpperCase()} (${s.type === "ammo" ? "+24 ROUNDS" : "+35% INTEGRITY"})`;
          return;
        }
      }
    }

    // 2. Check Keycard Proximity
    if (keycardMesh) {
      const distToKey = Math.hypot(camPos.x - keycardMesh.position.x, camPos.z - keycardMesh.position.z);
      if (distToKey < 2.5) {
        isNearbyKeycard = true;
        interactPrompt.classList.remove("hidden");
        promptText.textContent = "ACQUIRE SECURITY KEYCARD";
        return;
      }
    }

    // 3. Check Terminal Proximity
    for (const obj of levelData.objectivePool) {
      const dist = Math.hypot(camPos.x - obj.x, camPos.z - obj.z);
      if (dist <= (obj.interactRadius || 3.0)) {
        isNearbyTerminal = true;
        interactPrompt.classList.remove("hidden");
        promptText.textContent = "OVERRIDE EMERGENCY CONSOLE";
        return;
      }
    }

    interactPrompt.classList.add("hidden");

    // Geiger crackle if near hazard
    for (const hazard of levelData.hazardPool) {
      const dist = Math.hypot(camPos.x - hazard.center.x, camPos.z - hazard.center.z);
      if (dist < 4.5 && Math.random() < 0.15) {
        window.SoundFX.playGeigerClick();
        hazardWarningVignette.classList.remove("hidden");
        setTimeout(() => hazardWarningVignette.classList.add("hidden"), 100);
      }
    }
  }

  // Initialize on load
  window.addEventListener("DOMContentLoaded", init3D);
})();
