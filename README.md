# DEAD AIR 📡

> **Asymmetrical 2-Player Tactical Survival Horror Web Game**  
> Built with **Node.js + Socket.io** (authoritative backend), **Three.js** (3D first-person field client), and **HTML5 Canvas** (2D top-down surveillance radar).

---

## 🎯 Core Concept & Gameplay Loop

Sub-Level 07 (Echo Complex) has suffered an emergency containment breach. Two players must cooperate to locate and override the active quarantine terminal before the 3-minute life support countdown expires or biological hostiles terminate the operative:

1. **The Tactical Dispatcher (`/client/dispatch.html`)**:
   - Views the full top-down schematic map on a retro military CRT radar.
   - Monitors the Field Agent's live blip, vital biometrics (Health Integrity %, dynamic ECG Heart Rate in BPM), and carrier wave signal strength.
   - Tracks hostile bio-threats (**infected zombie pack**) and superheated hazard zones (**Molten Lava Bed trench**).
   - Locates scattered **Security Keycards** and guides the operative to locked blast doors.
   - Must guide the Field Agent entirely via text radio transmissions and tactical macro directives.

2. **The Field Agent (`/client/field.html`)**:
   - Navigates the dark, contaminated bunker in Three.js 3D first-person with a flashlight and a **Tactical Combat Sidearm**.
   - Has **NO map, NO objective markers, and NO coordinates**.
   - Hears only incoming **corrupted radio transmissions** from Dispatch.
   - Features **authoritative health bar & realistic suffering effects** (screen blood splatter, camera trauma shake, choking/groaning/heartbeat audio) when exposed to hazards like the molten lava trench.
   - Must shoot and eliminate roaming **zombies** using the gun (<kbd>Left-Click</kbd> to fire, <kbd>R</kbd> to reload).
   - Scavenges for **Keycards** (<kbd>E</kbd> to collect) to breach locked blast doors blocking target terminals.
   - Must reach the quarantine terminal and press <kbd>E</kbd> to purge and survive.

---

## 📻 Authoritative Radio Corruption Engine (`server/radio.js`)

**This server engine is the ONLY place where corruption occurs. The Field client NEVER receives the clean text string.**

- **Signal Attenuation (0.0 to 1.0)**:
  - Calculated dynamically from the Field Agent's live `(x, z)` position.
  - Designated **Dead Zones** (e.g., *Sub-Reactor Core* and *Cryo Vault*) drop signal strength to `0.03 – 0.15`.
  - Proximity to dense concrete/lead walls induces electromagnetic damping.
  - Open areas (like *Airlock Alpha* and *Central Hub*) maintain nominal signal `0.85 – 1.0`.
- **Degradation Mechanics**:
  - **Random Word Deletion**: Probability inversely tied to signal strength.
  - **Word Garbling / Glitch Characters**: Replaces characters with noise (`#`, `~`, `*`, `[STATIC]`, `*kzzt*`).
  - **Artificial Delivery Latency**: Server buffers messages using `setTimeout` with a **2–5 second delay** `(2000ms + (1.0 - signal) * 3000ms)`.
  - **Push-to-Talk Callouts**: Field Agent callouts back to Dispatcher pass through the exact same corruption pipeline.

---

## 📂 Project Structure

```text
Dead Air/
├── package.json              # Express + Socket.io dependencies
├── test-sim.js               # Automated end-to-end integration test
├── server/
│   ├── index.js              # Authoritative server, room session manager, hazard checks
│   ├── radio.js              # Signal corruption engine (deletions, delay, garbling)
│   └── level.js              # Facility geometry source of truth (rooms, walls, hazards, objectives)
└── client/
    ├── index.html            # Landing page: Create room code, join channel, staging lobby
    ├── dispatch.html         # Dispatcher 2D canvas radar & telemetry terminal
    ├── dispatch.js           # Radar rendering, directive transmitter, macro buttons
    ├── field.html            # Field Agent Three.js 3D first-person client
    ├── field.js              # PointerLock controls, wall sliding collision, audio-visual HUD
    ├── shared.js             # Procedural Web Audio synthesizer & collision helpers
    └── style.css             # Tactical CRT scanlines, visor HUD, and glassmorphism styling
```

---

## 🚀 Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Launch Server**:
   ```bash
   npm start
   ```

3. **Play**:
   - Open [http://localhost:3000](http://localhost:3000) in your browser.
   - Click **CREATE ROOM CHANNEL** to generate a 4-letter code (e.g. `NX8K`).
   - Open a second browser window/tab (or send the invite link to a friend on your local network).
   - Enter the room code to join as the **Field Agent**.
   - Click **ENTER MISSION FACILITY** to launch!

4. **Run Automated Simulation & Survival Tests**:
   ```bash
   # Basic communication and objective test
   node test-sim.js

   # Full combat, zombie AI, lava bed, and health suffering test
   node test-survival.js
   ```

---

## 🌐 Hosting & Deployment Configuration

When deploying to platforms such as **Render**, **Railway**, **Fly.io**, or a cloud VPS, configure the following environment variables:

| Environment Variable | Default | Purpose / Recommended Setting |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the HTTP & WebSocket server. Most cloud platforms automatically assign this (e.g. `process.env.PORT`). |
| `CORS_ORIGIN` | `*` | Allowed CORS origins for Socket.io. For production lockdown, set to your custom domain (e.g. `https://dead-air.yourdomain.com`). |

### Render / Railway Quick Start
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: `.`
- **Health Check Endpoint**: `/api/level`
