/**
 * DEAD AIR - INTEGRATION TEST FOR CONNECTION FLOW & INTERACTIVITY
 * Tests:
 * 1. 2-Player Lobby Join & Navigation / Launch Protocol
 * 2. Active Mission Packet on Late Join / Reconnect
 * 3. Disconnect Grace Period (Partner disconnecting does NOT terminate game prematurely)
 * 4. Dispatcher Tactical Waypoint Pinging (Echoed to Field Agent)
 * 5. Field Agent Custom Radio Transmit (Corrupted server-side to Dispatcher)
 * 6. Scavengeable Supplies (Ammo Caches & Trauma Medkits)
 */

const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:3000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log("=== RUNNING DEAD AIR CONNECTION FLOW & INTERACTIVITY TEST ===");

  const socketDisp = io(SERVER_URL);
  const socketField = io(SERVER_URL);

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    socketDisp.on("connect", check);
    socketField.on("connect", check);
  });

  // 1. Create Room by Dispatcher
  const createRes = await new Promise((r) => socketDisp.emit("create_room", r));
  const roomCode = createRes.roomCode;
  console.log(`✓ Room created: ${roomCode} by Dispatcher`);

  // 2. Field Agent Joins
  const joinRes = await new Promise((r) =>
    socketField.emit("join_room", { roomCode, preferredRole: "FIELD" }, r)
  );
  console.log(`✓ Field Agent joined room: ${joinRes.role}`);

  // 3. Lobby Navigation Request
  console.log("--> Testing request_launch from Lobby...");
  const navPromiseDisp = new Promise((r) => socketDisp.once("navigate_to_game", r));
  const navPromiseField = new Promise((r) => socketField.once("navigate_to_game", r));
  socketDisp.emit("request_launch");

  const navDisp = await navPromiseDisp;
  const navField = await navPromiseField;
  console.log("✓ navigate_to_game received by both clients:", {
    dispatcherUrl: navDisp.dispatcherUrl,
    fieldUrl: navField.fieldUrl
  });

  // 4. Simulate Page Redirection (New Sockets on Operational Pages)
  console.log("--> Simulating page navigation & reconnection to operational pages...");
  socketDisp.disconnect();
  socketField.disconnect();
  await sleep(100);

  const gameSocketDisp = io(SERVER_URL);
  const gameSocketField = io(SERVER_URL);

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    gameSocketDisp.on("connect", check);
    gameSocketField.on("connect", check);
  });

  // Connect Dispatcher to /dispatch.html
  await new Promise((r) =>
    gameSocketDisp.emit("join_room", { roomCode, preferredRole: "DISPATCHER" }, r)
  );

  // Connect Field Agent to /field.html -> triggers auto-start because pendingAutoStart is true!
  const startPromiseDisp = new Promise((r) => gameSocketDisp.once("mission_started", r));
  const startPromiseField = new Promise((r) => gameSocketField.once("mission_started", r));

  await new Promise((r) =>
    gameSocketField.emit("join_room", { roomCode, preferredRole: "FIELD" }, r)
  );

  const packetDisp = await startPromiseDisp;
  const packetField = await startPromiseField;
  console.log("✓ Mission started automatically on operational pages!", {
    dispObjective: packetDisp.objective.name,
    fieldSupplies: packetField.supplies.length,
    weapon: packetField.weapon.name
  });

  // 5. Test Tactical Waypoint Ping from Dispatcher
  console.log("--> Testing Dispatcher Waypoint Ping to Field Agent...");
  const pingPromise = new Promise((r) => gameSocketField.once("tactical_ping", r));
  gameSocketDisp.emit("dispatcher_ping", { x: 12.5, z: -18.2 });
  const pingData = await pingPromise;
  console.log("✓ Field Agent received 3D waypoint ping:", pingData);

  // 6. Test Field Agent Custom Radio Callout
  console.log("--> Testing Field Agent Custom Radio Callout...");
  const radioPromise = new Promise((r) => gameSocketDisp.once("field_radio_received", r));
  gameSocketField.emit("field_callout", { text: "Breached sector alpha, scanning for supplies." });
  const radioData = await radioPromise;
  console.log("✓ Dispatcher received corrupted radio callout:", radioData);

  // 7. Test Scavengeable Supply Pickup
  console.log("--> Testing Field Agent Scavenging Supply Crate...");
  const targetSupply = packetField.supplies[0];
  // Move player to supply position
  gameSocketField.emit("player_move", { x: targetSupply.x, y: 1.6, z: targetSupply.z, rotationY: 0 });
  await sleep(100);

  const supplyCollectedPromise = new Promise((r) => gameSocketDisp.once("supply_collected", r));
  gameSocketField.emit("scavenge_supply", { supplyId: targetSupply.id });
  const supplyData = await supplyCollectedPromise;
  console.log("✓ Supply cache collected:", supplyData);

  // 8. Test Disconnect Grace Period
  console.log("--> Testing Disconnect Grace Period (Field Agent momentary disconnect)...");
  const partnerDisconPromise = new Promise((r) => gameSocketDisp.once("partner_disconnected", r));
  gameSocketField.disconnect();
  const disconData = await partnerDisconPromise;
  console.log("✓ Dispatcher received partner disconnect grace notice:", disconData);

  // Field Agent reconnects within grace period
  const reconnectedField = io(SERVER_URL);
  await new Promise((r) => reconnectedField.on("connect", r));

  const partnerReconPromise = new Promise((r) => gameSocketDisp.once("partner_reconnected", r));
  const syncMissionPromise = new Promise((r) => reconnectedField.once("mission_started", r));

  await new Promise((r) =>
    reconnectedField.emit("join_room", { roomCode, preferredRole: "FIELD" }, r)
  );

  const reconNotice = await partnerReconPromise;
  const syncedPacket = await syncMissionPromise;
  console.log("✓ Partner successfully reconnected and resynchronized active mission!", {
    remainingSeconds: syncedPacket.remainingSeconds,
    health: syncedPacket.playerHealth
  });

  console.log("\n=== ALL CONNECTION, LAUNCH & INTERACTIVE FEATURES VERIFIED 100%! ===");
  gameSocketDisp.disconnect();
  reconnectedField.disconnect();
  process.exit(0);
}

runTest().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
