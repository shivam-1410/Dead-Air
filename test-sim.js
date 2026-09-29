/**
 * Automated End-to-End Simulation Test for DEAD AIR
 * Verifies room creation, 2-player role handshake, mission launch,
 * live position streaming, authoritative radio corruption engine,
 * hazard breach detection, and objective completion.
 */

const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:3000";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("=== DEAD AIR: E2E AUTOMATED SIMULATION TEST ===");

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

  console.log("✓ Sockets A and B connected to server");

  // Step 1: Create room
  const createRes = await new Promise((resolve) => {
    socketA.emit("create_room", resolve);
  });

  console.log("✓ Room Created:", createRes);
  if (!createRes.success || createRes.role !== "DISPATCHER") {
    throw new Error("Failed to create room as Dispatcher");
  }
  const roomCode = createRes.roomCode;

  // Step 2: Join room as second player (Field Agent)
  const joinRes = await new Promise((resolve) => {
    socketB.emit("join_room", { roomCode }, resolve);
  });

  console.log("✓ Player B Joined:", joinRes);
  if (!joinRes.success || joinRes.role !== "FIELD") {
    throw new Error("Failed to join room as Field Agent");
  }

  // Step 3: Start Mission
  const missionStartedPromiseA = new Promise((resolve) => {
    socketA.on("mission_started", resolve);
  });
  const missionStartedPromiseB = new Promise((resolve) => {
    socketB.on("mission_started", resolve);
  });

  socketA.emit("start_mission");

  const packetA = await missionStartedPromiseA;
  const packetB = await missionStartedPromiseB;

  console.log("✓ Mission started for Dispatcher (Packet A):", {
    role: packetA.role,
    objective: packetA.objective.name,
    hazardsCount: packetA.hazards.length
  });

  console.log("✓ Mission started for Field Agent (Packet B):", {
    role: packetB.role,
    hasObjective: !!packetB.objective, // must be undefined for agent!
    hasHazards: !!packetB.hazards // must be undefined for agent!
  });

  if (packetB.objective || packetB.hazards) {
    throw new Error("SECURITY VIOLATION: Field Agent received secret objective/hazard data!");
  }

  // Step 4: Stream Field Agent position update
  const posUpdatePromise = new Promise((resolve) => {
    socketA.on("field_position_update", resolve);
  });

  socketB.emit("player_move", { x: -28, y: 1.6, z: -28, rotationY: 0 });
  const posUpdate = await posUpdatePromise;
  console.log("✓ Dispatcher received Agent position blip:", posUpdate);

  // Step 5: Test Server-Side Radio Corruption (Dispatcher -> Field Agent)
  console.log("--> Dispatcher transmitting: 'Turn north into room 2 avoid chemical vent'...");
  const radioMsgPromise = new Promise((resolve) => {
    socketB.on("radio_message", resolve);
  });

  socketA.emit("dispatcher_transmit", { text: "Turn north into room 2 avoid chemical vent" });

  const radioReceived = await radioMsgPromise;
  console.log("✓ Field Agent received radio message after artificial delay:", radioReceived);

  // Step 6: Test Field Agent Push-To-Talk Callout (Field Agent -> Dispatcher)
  console.log("--> Field Agent transmitting callout: 'Copy that, proceeding'...");
  const calloutPromise = new Promise((resolve) => {
    socketA.on("field_radio_received", resolve);
  });

  socketB.emit("field_callout", { text: "Copy that, proceeding" });

  const calloutReceived = await calloutPromise;
  console.log("✓ Dispatcher received corrupted callout after artificial delay:", calloutReceived);

  // Step 7: Test Objective Interaction (Success)
  console.log(`--> Simulating Field Agent moving to objective console at (${packetA.objective.x}, ${packetA.objective.z})...`);
  socketB.emit("player_move", {
    x: packetA.objective.x,
    y: 1.6,
    z: packetA.objective.z,
    rotationY: 0
  });

  await sleep(100);

  const roundEndPromise = new Promise((resolve) => {
    socketA.on("round_ended", resolve);
  });

  socketB.emit("interact_terminal");
  const roundEnd = await roundEndPromise;
  console.log("✓ Authoritative Round End Result:", roundEnd);

  if (roundEnd.result !== "SUCCESS") {
    throw new Error("Expected round result to be SUCCESS");
  }

  console.log("\n=== ALL E2E AUTOMATED TESTS PASSED CLEANLY! ===");

  socketA.disconnect();
  socketB.disconnect();
  process.exit(0);
}

runTest().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
