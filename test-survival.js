/**
 * DEAD AIR - SURVIVAL & COMBAT AUTOMATED INTEGRATION TEST
 * Tests:
 * 1. 2-Player Room Join & Mission Initialization
 * 2. Continuous Lava Bed Hazard Suffering & Authoritative Health Depletion
 * 3. Biometric Telemetry & Heart Rate Spikes to Dispatcher
 * 4. Keycard Pickup & Blast Door Access
 * 5. Zombie AI Spawning, Tracking & Gun Combat Shooting/Kill
 * 6. Mission Accomplishment
 */

const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:3000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSurvivalTest() {
  console.log("=== RUNNING SURVIVAL, COMBAT & LAVA BED INTEGRATION TEST ===");

  const socketA = io(SERVER_URL);
  const socketB = io(SERVER_URL);

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    socketA.on("connect", check);
    socketB.on("connect", check);
  });

  // Step 1: Create & Join
  const createRes = await new Promise((r) => socketA.emit("create_room", r));
  const roomCode = createRes.roomCode;
  await new Promise((r) => socketB.emit("join_room", { roomCode }, r));

  console.log(`✓ Sockets paired in Room ${roomCode}`);

  // Step 2: Start Mission
  const startPromiseA = new Promise((r) => socketA.on("mission_started", r));
  const startPromiseB = new Promise((r) => socketB.on("mission_started", r));
  socketA.emit("start_mission");

  const packetA = await startPromiseA;
  const packetB = await startPromiseB;

  console.log("✓ Dispatcher Mission Packet:", {
    objective: packetA.objective.name,
    hazardsCount: packetA.hazards.length,
    keycard: packetA.keycard.name,
    zombiesCount: packetA.zombies.length
  });

  console.log("✓ Field Agent Mission Packet:", {
    weapon: packetB.weapon.name,
    playerHealth: packetB.playerHealth,
    activeKeycard: packetB.activeKeycard.name
  });

  // Step 3: Test Molten Lava Bed Continuous Damage & Suffering
  console.log("--> Moving Field Agent into Superheated Molten Lava Bed...");
  const sufferingPromise = new Promise((resolve) => {
    socketB.once("player_suffering", resolve);
  });
  const telemetryPromise = new Promise((resolve) => {
    socketA.on("telemetry_update", (data) => {
      if (data.health < 100) resolve(data);
    });
  });

  // Position inside Lava Bed (-28, -7)
  socketB.emit("player_move", { x: -28, y: 1.6, z: -7, rotationY: 0 });

  const sufferingData = await sufferingPromise;
  console.log("✓ Field Agent received realistic suffering event:", sufferingData);

  const telemetryData = await telemetryPromise;
  console.log("✓ Dispatcher received vital distress telemetry:", telemetryData);

  if (telemetryData.health >= 100 || telemetryData.heartRateBpm <= 75) {
    throw new Error("Lava bed did not deplete health or elevate heart rate");
  }

  // Move player safely out of lava bed
  socketB.emit("player_move", { x: -28, y: 1.6, z: -28, rotationY: 0 });

  // Step 4: Test Keycard Pickup
  console.log(`--> Moving Field Agent to Keycard (${packetA.keycard.x}, ${packetA.keycard.z})...`);
  socketB.emit("player_move", {
    x: packetA.keycard.x,
    y: 1.6,
    z: packetA.keycard.z,
    rotationY: 0
  });

  await sleep(150);

  const keycardPromise = new Promise((resolve) => {
    socketA.once("keycard_acquired", resolve);
  });

  socketB.emit("interact_keycard");
  const keycardResult = await keycardPromise;
  console.log("✓ Keycard Acquired by Field Agent:", keycardResult);

  // Step 5: Test Zombie AI & Gun Combat
  console.log("--> Testing Zombie AI & Gun Combat...");
  const targetZombie = packetA.zombies[0];
  console.log(`Targeting zombie ${targetZombie.id} with Tactical Sidearm...`);

  const zombieHitPromise = new Promise((resolve) => {
    socketA.once("zombie_hit", resolve);
  });

  socketB.emit("player_shoot", { targetZombieId: targetZombie.id });
  const hitResult = await zombieHitPromise;
  console.log("✓ Zombie hit registered:", hitResult);

  // Shoot again until zombie is killed
  const zombieKilledPromise = new Promise((resolve) => {
    socketA.once("zombie_killed", resolve);
  });

  socketB.emit("player_shoot", { targetZombieId: targetZombie.id });
  socketB.emit("player_shoot", { targetZombieId: targetZombie.id });

  const killResult = await zombieKilledPromise;
  console.log("✓ Zombie terminated by gunfire:", killResult);

  // Step 6: Complete Mission Objective
  console.log(`--> Field Agent overriding terminal at (${packetA.objective.x}, ${packetA.objective.z})...`);
  socketB.emit("player_move", {
    x: packetA.objective.x,
    y: 1.6,
    z: packetA.objective.z,
    rotationY: 0
  });

  await sleep(150);

  const endPromise = new Promise((resolve) => {
    socketA.once("round_ended", resolve);
  });

  socketB.emit("interact_terminal");
  const endResult = await endPromise;
  console.log("✓ Mission Result:", endResult);

  if (endResult.result !== "SUCCESS") {
    throw new Error("Expected mission to end with SUCCESS");
  }

  console.log("\n=== ALL SURVIVAL, COMBAT & REALISTIC HAZARD TESTS PASSED! ===");

  socketA.disconnect();
  socketB.disconnect();
  process.exit(0);
}

runSurvivalTest().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
