/* Seal Dive: swim a seal between the ice and the rocks.
 * Everything on screen is drawn with the Canvas 2D API; no image assets. */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Tuning
  // ---------------------------------------------------------------------------

  const VIEW_H = 768;          // virtual height, everything is laid out in these units
  const MAX_W = 432;           // widest the playfield gets (desktop)
  const MIN_W = 340;           // narrowest before we letterbox (phones)
  const SEABED = 96;           // sand height at the bottom
  const SURFACE = 22;          // the seal can't swim above this line
  const SEAL_SCALE = 1.1;

  const GRAVITY = 1250;        // px/s², water feels a touch floatier than air
  const STROKE = -390;         // vertical speed after a stroke
  const MAX_SINK = 560;

  const OBSTACLE_W = 84;
  const SPACING = 250;         // distance between consecutive obstacles
  const SPEED_START = 165;
  const SPEED_MAX = 215;
  const GAP_START = 200;
  const GAP_MIN = 172;

  const STORAGE_BEST = "sealdive.best";
  const STORAGE_MUTED = "sealdive.muted";
  const STORAGE_SKIN = "sealdive.seal";

  const SKINS = {
    harbor: { name: "Harbor", fur: ["#6f8599", "#97a9b8", "#e3e9ee"], back: "#5b6f82", front: "#7f93a5", spots: "rgba(60, 80, 100, 0.35)", outline: "#34475a", muzzle: "#eef2f5", whiskers: "rgba(255, 255, 255, 0.85)" },
    harp: { name: "Harp", fur: ["#dce6ee", "#f3f8fb", "#ffffff"], back: "#c5d4df", front: "#d4dfe8", spots: "rgba(0, 0, 0, 0)", outline: "#5f7489", muzzle: "#ffffff", whiskers: "#3d5266", whiskerWidth: 1.2, sx: 0.84, sy: 1.06, eye: 1.1, tuft: true },
    monk: { name: "Monk", fur: ["#5e5955", "#8b847d", "#eadfce"], back: "#4f4a46", front: "#736c66", spots: "rgba(0, 0, 0, 0)", outline: "#2f2b28", muzzle: "#f0e6d8", whiskers: "rgba(255, 250, 240, 0.85)", sx: 1.1, sy: 0.88 },
  };

  const COLORS = {
    waterTop: "#86d8df",
    waterMid: "#2b8fae",
    waterDeep: "#0d4a6b",
    waterFloor: "#0a3552",
    farRock: "#155a78",
    kelp: "#0f5560",
    sand: "#d9c08a",
    sandDark: "#b89a62",
    iceLight: "#f4fbff",
    iceMid: "#c8ecf8",
    iceShade: "#8ecbe3",
    iceLine: "#5a9fc0",
    rock: "#4a5d73",
    rockDark: "#2e3d52",
    rockLine: "#223044",
  };

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Deterministic random so the scenery looks the same on every visit.
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  };

  function offscreen(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    return { canvas: c, ctx: g, w, h };
  }

  function circleHitsRect(cx, cy, r, x, y, w, h) {
    const nx = clamp(cx, x, x + w);
    const ny = clamp(cy, y, y + h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }

  // ---------------------------------------------------------------------------
  // Sound: tiny synthesized effects, nothing to download
  // ---------------------------------------------------------------------------

  const sound = (() => {
    let ac = null;
    let out = null;
    let muted = storage.get(STORAGE_MUTED) === "1";

    function ready() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        // iPhones mute web audio on silent mode unless the page plays like media.
        if (navigator.audioSession) navigator.audioSession.type = "playback";
        ac = new AC();
        out = ac.createGain();
        out.gain.value = muted ? 0 : 0.45;
        out.connect(ac.destination);
        // A silent blip inside the first tap unlocks audio on older iOS.
        const blip = ac.createBufferSource();
        blip.buffer = ac.createBuffer(1, 1, ac.sampleRate);
        blip.connect(ac.destination);
        blip.start();
      }
      if (ac.state === "suspended") ac.resume().catch(() => {});
      return ac;
    }

    function tone(freq, to, dur, { type = "sine", vol = 0.3, delay = 0 } = {}) {
      if (muted || !ready()) return;
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, vol, cutoff) {
      if (muted || !ready()) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = ac.createBufferSource();
      const filter = ac.createBiquadFilter();
      const gain = ac.createGain();
      src.buffer = buf;
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(out);
      src.start();
    }

    // Background music: a little C, Am, F, G loop scheduled just ahead of time.
    const BEAT = 60 / 112 / 2; // eighth notes at 112 bpm
    const MELODY = [
      76, 79, 84, 79, 76, 0, 74, 76,
      72, 76, 81, 76, 72, 0, 71, 72,
      69, 72, 77, 72, 69, 0, 67, 69,
      71, 74, 79, 74, 71, 74, 79, 0,
    ];
    const BASS = [48, 45, 41, 43];
    const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
    let musicTimer = null;
    let step = 0;
    let nextAt = 0;

    function note(midi, at, dur, type, vol) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = hz(midi);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }

    function scheduleMusic() {
      while (nextAt < ac.currentTime + 0.3) {
        if (!muted) {
          const midi = MELODY[step % MELODY.length];
          if (midi) note(midi, nextAt, BEAT * 0.9, "triangle", 0.07);
          if (step % 4 === 0) note(BASS[Math.floor(step / 8) % BASS.length], nextAt, BEAT * 3.5, "sine", 0.12);
        }
        step++;
        nextAt += BEAT;
      }
    }

    return {
      get muted() { return muted; },
      unlock: ready,
      startMusic() {
        if (musicTimer || !ready()) return;
        nextAt = ac.currentTime + 0.05;
        scheduleMusic();
        musicTimer = setInterval(scheduleMusic, 100);
      },
      stopMusic() {
        clearInterval(musicTimer);
        musicTimer = null;
      },
      toggle() {
        muted = !muted;
        storage.set(STORAGE_MUTED, muted ? "1" : "0");
        if (ready()) out.gain.value = muted ? 0 : 0.45;
        return muted;
      },
      swim() {
        const f = rand(300, 360);
        tone(f, f * 2.3, 0.09, { vol: 0.22 });
        tone(f * 1.6, f * 3, 0.07, { vol: 0.1, delay: 0.05 });
      },
      score() {
        tone(880, 900, 0.12, { type: "triangle", vol: 0.18 });
        tone(1320, 1340, 0.18, { type: "triangle", vol: 0.16, delay: 0.08 });
      },
      hit() {
        noise(0.25, 0.5, 700);
        tone(170, 55, 0.35, { vol: 0.35 });
      },
    };
  })();

  // ---------------------------------------------------------------------------
  // Canvas & layout
  // ---------------------------------------------------------------------------

  const stage = document.getElementById("stage");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  let W = MAX_W;
  let H = VIEW_H;
  let scale = 1;
  let dpr = 1;
  let layers = null;

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    scale = vh / VIEW_H;
    W = clamp(vw / scale, MIN_W, MAX_W);
    if (W * scale > vw) scale = vw / W;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    const cssW = Math.round(W * scale);
    const cssH = Math.round(H * scale);
    stage.style.width = cssW + "px";
    stage.style.height = cssH + "px";
    stage.style.setProperty("--u", scale + "px");
    stage.classList.toggle("is-framed", cssW < vw - 8 || cssH < vh - 8);

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    layers = buildLayers();
  }

  // ---------------------------------------------------------------------------
  // Scenery (pre-rendered once per resize)
  // ---------------------------------------------------------------------------

  const FAR_PERIOD = 864;
  const GROUND_PERIOD = 432;

  function buildLayers() {
    // Water
    const water = offscreen(W, H);
    let g = water.ctx;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, COLORS.waterTop);
    grad.addColorStop(0.18, COLORS.waterMid);
    grad.addColorStop(0.62, COLORS.waterDeep);
    grad.addColorStop(1, COLORS.waterFloor);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Distant rocky ridge, tiles seamlessly every FAR_PERIOD px
    const far = offscreen(FAR_PERIOD, 260);
    g = far.ctx;
    const ridge = (x) => {
      const p = (x / FAR_PERIOD) * Math.PI * 2;
      return 120 + Math.sin(p * 2) * 38 + Math.sin(p * 5 + 1.3) * 22 + Math.sin(p * 11 + 0.4) * 8;
    };
    const ridgeGrad = g.createLinearGradient(0, 40, 0, 260);
    ridgeGrad.addColorStop(0, "rgba(21, 90, 120, 0.0)");
    ridgeGrad.addColorStop(0.35, "rgba(21, 90, 120, 0.55)");
    ridgeGrad.addColorStop(1, "rgba(14, 66, 94, 0.9)");
    g.fillStyle = ridgeGrad;
    g.beginPath();
    g.moveTo(0, 260);
    for (let x = 0; x <= FAR_PERIOD; x += 6) g.lineTo(x, ridge(x));
    g.lineTo(FAR_PERIOD, 260);
    g.closePath();
    g.fill();

    // Sandy seabed, also seamless
    const ground = offscreen(GROUND_PERIOD, SEABED + 12);
    g = ground.ctx;
    const r = seeded(7);
    const top = (x) => 12 + Math.sin((x / GROUND_PERIOD) * Math.PI * 6) * 3 + Math.sin((x / GROUND_PERIOD) * Math.PI * 14) * 1.5;
    const sandGrad = g.createLinearGradient(0, 0, 0, SEABED + 12);
    sandGrad.addColorStop(0, COLORS.sand);
    sandGrad.addColorStop(1, COLORS.sandDark);
    g.fillStyle = sandGrad;
    g.beginPath();
    g.moveTo(0, SEABED + 12);
    for (let x = 0; x <= GROUND_PERIOD; x += 4) g.lineTo(x, top(x));
    g.lineTo(GROUND_PERIOD, SEABED + 12);
    g.closePath();
    g.fill();
    // Lit rim along the top of the sand
    g.strokeStyle = "rgba(255, 244, 214, 0.7)";
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= GROUND_PERIOD; x += 4) g.lineTo(x, top(x) + 1);
    g.stroke();
    // Ripples
    g.strokeStyle = "rgba(150, 118, 70, 0.35)";
    g.lineWidth = 1.5;
    g.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      const x = r() * GROUND_PERIOD;
      const y = 30 + r() * (SEABED - 40);
      const w = 18 + r() * 26;
      for (const dx of [0, -GROUND_PERIOD, GROUND_PERIOD]) {
        g.beginPath();
        g.moveTo(x + dx, y);
        g.quadraticCurveTo(x + dx + w / 2, y - 4, x + dx + w, y);
        g.stroke();
      }
    }
    // Pebbles & shells
    for (let i = 0; i < 22; i++) {
      const x = r() * GROUND_PERIOD;
      const y = 26 + r() * (SEABED - 30);
      const s = 1.5 + r() * 3.5;
      const shade = r();
      g.fillStyle = shade < 0.5 ? "#a58a5a" : shade < 0.85 ? "#8f7a55" : "#f1dcc0";
      for (const dx of [0, -GROUND_PERIOD, GROUND_PERIOD]) {
        g.beginPath();
        g.ellipse(x + dx, y, s * 1.3, s, 0, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Soft vignette on top of everything
    const vignette = offscreen(W, H);
    g = vignette.ctx;
    const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.75);
    v.addColorStop(0, "rgba(3, 20, 36, 0)");
    v.addColorStop(1, "rgba(3, 20, 36, 0.45)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);

    return { water, far, ground, vignette };
  }

  // Kelp strands in the mid-ground; positions repeat every KELP_PERIOD px.
  const KELP_PERIOD = 640;
  const kelp = (() => {
    const r = seeded(21);
    const list = [];
    for (let i = 0; i < 9; i++) {
      list.push({
        x: r() * KELP_PERIOD,
        h: 120 + r() * 170,
        w: 5 + r() * 4,
        phase: r() * Math.PI * 2,
      });
    }
    return list;
  })();

  // Drifting specks ("marine snow") for depth.
  const specks = Array.from({ length: 36 }, () => ({
    x: Math.random() * MAX_W,
    y: Math.random() * VIEW_H,
    r: 0.6 + Math.random() * 1.4,
    depth: 0.2 + Math.random() * 0.5,
    drift: Math.random() * Math.PI * 2,
  }));

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  const seal = {
    x: 0, y: 0, vy: 0, angle: 0,
    stroke: 0,      // 1 right after a stroke, decays to 0
    flipper: 0,     // animation phase
    flip: 1,        // 1 = upright, -1 = belly up (knocked out)
  };

  const game = {
    state: "ready", // ready | playing | dying | over | paused
    score: 0,
    best: Number(storage.get(STORAGE_BEST)) || 0,
    skin: SKINS[storage.get(STORAGE_SKIN)] ? storage.get(STORAGE_SKIN) : "harbor",
    speed: SPEED_START,
    scroll: 0,      // total distance travelled, drives parallax
    time: 0,
    obstacles: [],
    bubbles: [],
    shake: 0,
    flash: 0,
    deadFor: 0,
    overAt: 0,
  };

  function resetRun() {
    seal.x = Math.round(W * 0.28);
    seal.y = H * 0.44;
    seal.vy = 0;
    seal.angle = 0;
    seal.stroke = 0;
    seal.flip = 1;
    game.score = 0;
    game.speed = SPEED_START;
    game.obstacles = [];
    game.bubbles = [];
    game.deadFor = 0;
    game.shake = 0;
    game.flash = 0;
  }

  function currentGap() {
    return lerp(GAP_START, GAP_MIN, clamp(game.score / 30, 0, 1));
  }

  function spawnObstacle(x) {
    const gap = currentGap();
    const minCenter = SURFACE + 90 + gap / 2;
    const maxCenter = H - SEABED - 70 - gap / 2;
    // Keep consecutive gaps within reach of each other.
    const prev = game.obstacles[game.obstacles.length - 1];
    let center = rand(minCenter, maxCenter);
    if (prev) center = clamp(center, prev.center - 170, prev.center + 170);

    const r = seeded((Math.random() * 1e9) | 0);
    const iceBottom = center - gap / 2;
    const rockTop = center + gap / 2;
    const icicleCount = r() < 0.5 ? 2 : 3;

    game.obstacles.push({
      x, center, gap, iceBottom, rockTop,
      floe: 10 + r() * 8,
      // Ice: a gently uneven underside with a couple of icicles
      jag: Array.from({ length: 7 }, () => -3 + r() * 6),
      icicles: Array.from({ length: icicleCount }, (_, i) => ({
        t: (i + 0.3 + r() * 0.4) / icicleCount,
        len: 9 + r() * 10,
        w: 9 + r() * 6,
      })),
      cracks: Array.from({ length: 2 }, () => ({ x: 16 + r() * (OBSTACLE_W - 32), len: 30 + r() * 60 })),
      // Rock: lumpy outline, moss cap, a few details
      bumps: Array.from({ length: 32 }, () => -5 + r() * 10),
      moss: Array.from({ length: 8 }, () => 6 + r() * 10),
      rockCracks: Array.from({ length: 3 }, () => ({ x: 12 + r() * (OBSTACLE_W - 24), y: 40 + r() * 200, len: 16 + r() * 26 })),
      blotches: Array.from({ length: 5 }, () => ({ x: r() * OBSTACLE_W, y: 20 + r() * 260, r: 6 + r() * 12 })),
      barnacles: Array.from({ length: 5 }, () => ({ x: 12 + r() * (OBSTACLE_W - 24), y: 30 + r() * 150, s: 2 + r() * 2.5 })),
      starfish: r() < 0.55 ? { y: 40 + r() * 80, side: r() < 0.5 ? 0.3 : 0.7, turn: r() * 6 } : null,
      passed: false,
    });
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  function swim() {
    seal.vy = STROKE;
    seal.stroke = 1;
    sound.swim();
    for (let i = 0; i < 4; i++) {
      const a = seal.angle;
      game.bubbles.push({
        x: seal.x + Math.cos(a) * 36 * SEAL_SCALE + rand(-3, 3),
        y: seal.y + Math.sin(a) * 36 * SEAL_SCALE + rand(-3, 6),
        r: rand(1.5, 4),
        vy: rand(-70, -40),
        wob: rand(0, Math.PI * 2),
        life: 1,
      });
    }
  }

  function update(dt) {
    game.time += dt;
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 3);
    if (game.flash > 0) game.flash = Math.max(0, game.flash - dt * 4);

    const moving = game.state === "ready" || game.state === "playing";
    if (moving) game.scroll += game.speed * dt;

    seal.stroke = Math.max(0, seal.stroke - dt * 2.5);
    seal.flipper += dt * (game.state === "dying" || game.state === "over" ? 0 : 5 + seal.stroke * 16);

    if (game.state === "ready") {
      seal.y = H * 0.44 + Math.sin(game.time * 2.2) * 9;
      seal.angle = Math.sin(game.time * 2.2 + 1.2) * 0.08;
    } else if (game.state === "playing") {
      seal.vy = Math.min(seal.vy + GRAVITY * dt, MAX_SINK);
      seal.y += seal.vy * dt;
      if (seal.y < SURFACE + 14) {
        seal.y = SURFACE + 14;
        seal.vy = Math.max(seal.vy, 0);
      }
      const target = seal.vy < 0 ? -0.32 : clamp((seal.vy / MAX_SINK) * 1.05, -0.32, 0.95);
      seal.angle = lerp(seal.angle, target, clamp(dt * 9, 0, 1));

      updateObstacles(dt);
      if (collides()) die();
    } else if (game.state === "dying" || game.state === "over") {
      game.deadFor += dt;
      // Knocked out: roll belly up and drift down to the sand.
      const floor = H - SEABED - 4;
      seal.flip = lerp(seal.flip, -1, clamp(dt * 6, 0, 1));
      seal.angle = lerp(seal.angle, -0.12, clamp(dt * 3, 0, 1));
      if (seal.y < floor) {
        seal.vy = Math.min(seal.vy + GRAVITY * 0.5 * dt, 300);
        seal.y = Math.min(seal.y + seal.vy * dt, floor);
      }
      if (game.state === "dying" && game.deadFor > 0.75) showGameOver();
    }

    // Bubbles rise and fade
    for (const b of game.bubbles) {
      b.y += b.vy * dt;
      b.x += Math.sin(game.time * 6 + b.wob) * 12 * dt - (moving ? game.speed * dt * 0.6 : 0);
      b.life -= dt * 0.8;
    }
    game.bubbles = game.bubbles.filter((b) => b.life > 0 && b.y > SURFACE);
  }

  function updateObstacles(dt) {
    const obs = game.obstacles;
    for (const o of obs) o.x -= game.speed * dt;
    while (obs.length && obs[0].x < -OBSTACLE_W - 40) obs.shift();

    const last = obs[obs.length - 1];
    if (!last) spawnObstacle(W + 120);
    else if (last.x < W + 40 - SPACING) spawnObstacle(last.x + SPACING);

    for (const o of obs) {
      if (!o.passed && o.x + OBSTACLE_W / 2 < seal.x) {
        o.passed = true;
        game.score++;
        game.speed = Math.min(SPEED_MAX, SPEED_START + game.score * 2);
        sound.score();
        ui.setScore(game.score, true);
      }
    }
  }

  // Two circles roughly covering the body; nose and tail flippers are forgiven.
  function sealHitCircles() {
    const c = Math.cos(seal.angle);
    const s = Math.sin(seal.angle);
    const k = SEAL_SCALE;
    const at = (lx, ly) => [seal.x + (lx * c - ly * s) * k, seal.y + (lx * s + ly * c) * k];
    const [ax, ay] = at(13, 1);
    const [bx, by] = at(-12, 0);
    return [[ax, ay, 14 * k], [bx, by, 11 * k]];
  }

  function collides() {
    const floor = H - SEABED + 6;
    for (const [cx, cy, r] of sealHitCircles()) {
      if (cy + r > floor) return true;
      for (const o of game.obstacles) {
        if (o.x > cx + r + 20 || o.x + OBSTACLE_W < cx - r - 20) continue;
        if (circleHitsRect(cx, cy, r, o.x, -100, OBSTACLE_W, o.iceBottom + 102)) return true;
        if (circleHitsRect(cx, cy, r, o.x - o.floe, -100, OBSTACLE_W + o.floe * 2, SURFACE + 100)) return true;
        if (circleHitsRect(cx, cy, r, o.x, o.rockTop + 2, OBSTACLE_W, H)) return true;
      }
    }
    return false;
  }

  function die() {
    game.state = "dying";
    game.deadFor = 0;
    seal.vy = Math.min(seal.vy, 60);
    game.shake = reducedMotion ? 0 : 1;
    game.flash = 1;
    sound.hit();
    if (navigator.vibrate) navigator.vibrate(40);
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  function drawTiled(layer, offset, y) {
    const p = layer.w;
    let x = -(((offset % p) + p) % p);
    for (; x < W; x += p) ctx.drawImage(layer.canvas, x, y, layer.w, layer.h);
  }

  function drawLightRays() {
    const t = reducedMotion ? 0 : game.time;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const base = ((i + 0.5) / 5) * W + Math.sin(t * 0.25 + i * 1.7) * 30 - ((game.scroll * 0.05) % (W / 5));
      const width = 26 + (i % 3) * 14;
      const len = 380 + (i % 2) * 160;
      const lean = 70;
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, "rgba(220, 250, 255, 0.16)");
      grad.addColorStop(1, "rgba(220, 250, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(base, 0);
      ctx.lineTo(base + width, 0);
      ctx.lineTo(base + width * 2.4 + lean, len);
      ctx.lineTo(base + lean, len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSurface() {
    const t = game.time;
    ctx.fillStyle = "rgba(210, 248, 250, 0.55)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= W + 8; x += 8) {
      ctx.lineTo(x, 12 + Math.sin(x * 0.035 + t * 1.8 + game.scroll * 0.02) * 3 + Math.sin(x * 0.09 - t * 1.1) * 1.5);
    }
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W + 8; x += 8) {
      ctx.lineTo(x, 12 + Math.sin(x * 0.035 + t * 1.8 + game.scroll * 0.02) * 3 + Math.sin(x * 0.09 - t * 1.1) * 1.5);
    }
    ctx.stroke();
  }

  function drawKelp() {
    const off = game.scroll * 0.45;
    const floor = H - SEABED + 14;
    ctx.strokeStyle = COLORS.kelp;
    ctx.lineCap = "round";
    for (const k of kelp) {
      let x = (((k.x - off) % KELP_PERIOD) + KELP_PERIOD) % KELP_PERIOD - 40;
      for (; x < W + 40; x += KELP_PERIOD) {
        const sway = Math.sin(game.time * 1.3 + k.phase) * 16;
        ctx.lineWidth = k.w;
        ctx.beginPath();
        ctx.moveTo(x, floor);
        ctx.bezierCurveTo(x + sway * 0.3, floor - k.h * 0.4, x - sway * 0.6, floor - k.h * 0.7, x + sway, floor - k.h);
        ctx.stroke();
        // Leaves
        ctx.fillStyle = COLORS.kelp;
        for (let j = 1; j <= 3; j++) {
          const f = j / 4;
          const lx = x + sway * f * f;
          const ly = floor - k.h * f;
          const dir = j % 2 ? 1 : -1;
          ctx.beginPath();
          ctx.ellipse(lx + dir * 8, ly, 11, 4, dir * -0.5 + sway * 0.01, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawSpecks() {
    ctx.fillStyle = "rgba(220, 245, 255, 0.35)";
    for (const s of specks) {
      const x = ((((s.x - game.scroll * s.depth) % W) + W) % W);
      const y = (s.y + game.time * 6 * s.depth) % H;
      ctx.beginPath();
      ctx.arc(x + Math.sin(game.time + s.drift) * 4, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Closed path through points with rounded corners (quadratic midpoints).
  function smoothPath(points) {
    const n = points.length;
    const mid = (i) => {
      const [x1, y1] = points[i % n];
      const [x2, y2] = points[(i + 1) % n];
      return [(x1 + x2) / 2, (y1 + y2) / 2];
    };
    ctx.beginPath();
    ctx.moveTo(...mid(0));
    for (let i = 1; i <= n; i++) {
      const [px, py] = points[i % n];
      ctx.quadraticCurveTo(px, py, ...mid(i));
    }
    ctx.closePath();
  }

  function drawIce(o) {
    const x = o.x;
    const w = OBSTACLE_W;
    const bottom = o.iceBottom;
    const f = o.floe;

    // Underside: uneven edge with icicles spliced in
    const edge = o.jag.map((j, i) => [x + (w * i) / (o.jag.length - 1), bottom + j]);
    for (const ic of o.icicles) {
      const cx = x + w * ic.t;
      const half = ic.w / 2;
      const base = bottom + 3;
      for (let i = edge.length - 1; i >= 0; i--) {
        if (Math.abs(edge[i][0] - cx) < half + 2) edge.splice(i, 1);
      }
      edge.push([cx - half, base], [cx, base + ic.len], [cx + half, base]);
    }
    edge.sort((p, q) => p[0] - q[0]);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - f, -2);
    ctx.lineTo(x - f, SURFACE - 4);
    ctx.quadraticCurveTo(x - f + 2, SURFACE + 4, x, SURFACE + 6);
    for (const [px, py] of edge) ctx.lineTo(px, py);
    ctx.lineTo(x + w, SURFACE + 6);
    ctx.quadraticCurveTo(x + w + f - 2, SURFACE + 4, x + w + f, SURFACE - 4);
    ctx.lineTo(x + w + f, -2);
    ctx.closePath();

    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, COLORS.iceLight);
    grad.addColorStop(0.55, COLORS.iceMid);
    grad.addColorStop(1, COLORS.iceShade);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLORS.iceLine;
    ctx.stroke();

    ctx.clip();
    // Deeper ice is bluer
    const depth = ctx.createLinearGradient(0, SURFACE, 0, bottom + 20);
    depth.addColorStop(0, "rgba(120, 190, 225, 0)");
    depth.addColorStop(1, "rgba(120, 190, 225, 0.35)");
    ctx.fillStyle = depth;
    ctx.fillRect(x - f, 0, w + f * 2, bottom + 30);
    // Glint along the left face
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.beginPath();
    ctx.moveTo(x + 8, SURFACE + 10);
    ctx.lineTo(x + 20, SURFACE + 10);
    ctx.lineTo(x + 14, bottom - 20);
    ctx.lineTo(x + 8, bottom - 30);
    ctx.closePath();
    ctx.fill();
    // Shaded right face
    ctx.fillStyle = "rgba(90, 159, 192, 0.18)";
    ctx.fillRect(x + w * 0.72, -2, w * 0.3 + f, bottom + 30);
    // Cracks
    ctx.strokeStyle = "rgba(90, 159, 192, 0.5)";
    ctx.lineWidth = 1.2;
    for (const c of o.cracks) {
      const y0 = bottom - c.len - 10;
      ctx.beginPath();
      ctx.moveTo(x + c.x, y0);
      ctx.lineTo(x + c.x + 5, y0 + c.len * 0.4);
      ctx.lineTo(x + c.x - 2, y0 + c.len * 0.7);
      ctx.lineTo(x + c.x + 3, y0 + c.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRock(o) {
    const x = o.x;
    const w = OBSTACLE_W;
    const top = o.rockTop;
    const floor = H - SEABED + 24;
    const b = o.bumps;

    // Outline: up the left side, over a lumpy dome, down the right side
    const rows = Math.max(2, Math.ceil((floor - top - 20) / 34));
    const pts = [];
    for (let i = 0; i <= rows; i++) pts.push([x + b[i % 32] * 0.8 + (i === 0 ? -6 : 0), lerp(floor, top + 20, i / rows)]);
    const cap = [
      [x + 2, top + 4],
      [x + w * 0.3, top - 3 + b[20] * 0.3],
      [x + w * 0.65, top - 1 + b[21] * 0.3],
      [x + w - 2, top + 5],
    ];
    pts.push(...cap);
    for (let i = rows; i >= 0; i--) pts.push([x + w + b[(i + 12) % 32] * 0.8 + (i === 0 ? 6 : 0), lerp(floor, top + 20, i / rows)]);
    pts.push([x + w / 2, floor + 10]);

    ctx.save();
    smoothPath(pts);
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#63788f");
    grad.addColorStop(0.45, COLORS.rock);
    grad.addColorStop(1, COLORS.rockDark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.rockLine;
    ctx.stroke();

    ctx.clip();
    // Soft blotches break up the surface
    for (const bl of o.blotches) {
      if (top + bl.y > floor) continue;
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.ellipse(x + bl.x, top + bl.y, bl.r * 1.4, bl.r, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cracks
    ctx.strokeStyle = "rgba(20, 30, 45, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    for (const c of o.rockCracks) {
      const cy = top + c.y;
      if (cy > floor - 20) continue;
      ctx.beginPath();
      ctx.moveTo(x + c.x, cy);
      ctx.lineTo(x + c.x + 4, cy + c.len * 0.35);
      ctx.lineTo(x + c.x - 1, cy + c.len * 0.65);
      ctx.lineTo(x + c.x + 3, cy + c.len);
      ctx.stroke();
    }
    // Moss cap
    ctx.fillStyle = "#3e8c78";
    ctx.beginPath();
    ctx.moveTo(x - 10, top - 10);
    ctx.lineTo(x + w + 10, top - 10);
    for (let i = o.moss.length - 1; i >= 0; i--) {
      const mx = x - 4 + ((w + 8) * i) / (o.moss.length - 1);
      ctx.lineTo(mx, top + 6 + o.moss[i]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(160, 230, 190, 0.45)";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.4, top + 3, w * 0.3, 4, -0.05, 0, Math.PI * 2);
    ctx.fill();
    // Barnacles
    for (const n of o.barnacles) {
      const by = top + n.y;
      if (by > floor - 30) continue;
      ctx.fillStyle = "#c9d2d9";
      ctx.beginPath();
      ctx.arc(x + n.x, by, n.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6b7c8e";
      ctx.beginPath();
      ctx.arc(x + n.x, by, n.s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (o.starfish && top + o.starfish.y < floor - 40) {
      drawStarfish(x + w * o.starfish.side, top + o.starfish.y, 9, o.starfish.turn);
    }
  }

  function drawStarfish(cx, cy, r, turn) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(turn);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = "#ff8a5c";
    ctx.strokeStyle = "#c2512c";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd0a8";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBubbles() {
    for (const b of game.bubbles) {
      ctx.globalAlpha = clamp(b.life, 0, 1);
      ctx.strokeStyle = "rgba(235, 252, 255, 0.9)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The seal, facing right, drawn around its centre. Roughly 76 × 32 px.
  function drawSeal(c, s, skin, dead) {
    const flap = Math.sin(s.flipper);

    c.save();
    c.translate(s.x, s.y);
    c.rotate(s.angle);
    c.scale(SEAL_SCALE, SEAL_SCALE * s.flip);
    // Each seal keeps the same face but gets its own build: chubby, regular or sleek.
    const sx = skin.sx || 1;
    const sy = skin.sy || 1;
    const eye = skin.eye || 1;
    c.scale(sx, sy);
    c.lineJoin = "round";
    c.lineCap = "round";

    const outline = skin.outline;

    // Rear flippers
    const tailFlipper = (spread) => {
      c.save();
      c.translate(-35, 0);
      c.rotate(spread);
      c.beginPath();
      c.moveTo(0, -2);
      c.quadraticCurveTo(-8, -10, -19, -9);
      c.lineTo(-16, -5);
      c.lineTo(-20, -2);
      c.lineTo(-15, 0);
      c.quadraticCurveTo(-7, 3, 0, 2);
      c.closePath();
      c.fillStyle = skin.back;
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = outline;
      c.stroke();
      c.restore();
    };
    tailFlipper(-0.28 + flap * 0.22);
    tailFlipper(0.28 + flap * 0.22);

    // Body
    c.beginPath();
    c.moveTo(38, 3);
    c.bezierCurveTo(38, -6, 32, -14, 22, -15);
    c.bezierCurveTo(8, -17, -12, -14, -26, -7);
    c.bezierCurveTo(-32, -4, -36, -2, -38, 0);
    c.bezierCurveTo(-32, 6, -20, 15, 0, 15);
    c.bezierCurveTo(16, 15, 26, 12, 32, 9);
    c.bezierCurveTo(36, 8, 38, 6, 38, 3);
    c.closePath();
    const fur = c.createLinearGradient(0, -16, 0, 16);
    fur.addColorStop(0, skin.fur[0]);
    fur.addColorStop(0.45, skin.fur[1]);
    fur.addColorStop(1, skin.fur[2]);
    c.fillStyle = fur;
    c.fill();

    // Spots, clipped to the body
    c.save();
    c.clip();
    c.fillStyle = skin.spots;
    for (const [sx, sy, sr] of [[-18, -8, 2.6], [-8, -11, 2], [4, -12, 2.8], [-26, -2, 1.8], [12, -9, 1.6], [-12, -4, 1.6], [16, -13, 1.4]]) {
      c.beginPath();
      c.ellipse(sx, sy, sr * 1.3, sr, 0.3, 0, Math.PI * 2);
      c.fill();
    }
    // Back highlight
    c.strokeStyle = "rgba(255, 255, 255, 0.35)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-14, -12);
    c.quadraticCurveTo(4, -16, 20, -13);
    c.stroke();
    c.restore();

    c.lineWidth = 1.8;
    c.strokeStyle = outline;
    c.stroke();

    // A little tuft of pup fur on top of the head
    if (skin.tuft) {
      c.strokeStyle = outline;
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(16, -15.5);
      c.quadraticCurveTo(15, -20, 11.5, -21);
      c.moveTo(20, -15);
      c.quadraticCurveTo(21, -19.5, 18, -21.5);
      c.stroke();
    }

    // Front flipper paddles with each stroke
    c.save();
    c.translate(8, 11);
    c.rotate(0.55 - s.stroke * 0.9 + flap * 0.12);
    c.beginPath();
    c.moveTo(-3, -1);
    c.quadraticCurveTo(-10, 6, -14, 12);
    c.quadraticCurveTo(-9, 12, -5, 9);
    c.quadraticCurveTo(0, 5, 3, 0);
    c.closePath();
    c.fillStyle = skin.front;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = outline;
    c.stroke();
    c.restore();

    // Muzzle
    c.fillStyle = skin.muzzle;
    c.beginPath();
    c.ellipse(33, 5, 5.5, 4.2, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(52, 71, 90, 0.5)";
    for (const [dx, dy] of [[31, 4], [33.5, 3.4], [32.5, 6.4], [35, 5.6]]) {
      c.beginPath();
      c.arc(dx, dy, 0.6, 0, Math.PI * 2);
      c.fill();
    }

    // Cheek
    c.fillStyle = "rgba(255, 150, 150, 0.28)";
    c.beginPath();
    c.ellipse(24, 4, 4, 2.6, 0, 0, Math.PI * 2);
    c.fill();

    // Nose
    c.fillStyle = "#2b3440";
    c.beginPath();
    c.ellipse(37, 1, 2.4, 1.8, 0.3, 0, Math.PI * 2);
    c.fill();

    // Mouth
    c.strokeStyle = outline;
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(35.5, 7.4);
    c.quadraticCurveTo(33, 9.4, 30.5, 8);
    c.stroke();

    // Eye
    if (dead) {
      c.strokeStyle = "#1c232c";
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(23.5, -8); c.lineTo(28.5, -3);
      c.moveTo(28.5, -8); c.lineTo(23.5, -3);
      c.stroke();
    } else {
      c.fillStyle = "#1c232c";
      c.beginPath();
      c.ellipse(26, -5.5, (3.8 * eye) / sx, (4.4 * eye) / sy, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(26 + (1.3 * eye) / sx, -5.5 - (1.7 * eye) / sy, (1.5 * eye) / sx, (1.5 * eye) / sy, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(26 - 1 / sx, -5.5 + (1.7 * eye) / sy, 0.6 / sx, 0.6 / sy, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Whiskers
    c.strokeStyle = skin.whiskers;
    c.lineWidth = skin.whiskerWidth || 0.8;
    for (const [dy, ey] of [[3.6, -1], [5, 5], [6.4, 10]]) {
      c.beginPath();
      c.moveTo(35, dy);
      c.quadraticCurveTo(41, (dy + ey) / 2, 46, ey);
      c.stroke();
    }

    c.restore();
  }

  function render() {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

    ctx.save();
    if (game.shake > 0) {
      const m = game.shake * game.shake * 7;
      ctx.translate(rand(-m, m), rand(-m, m));
    }

    ctx.drawImage(layers.water.canvas, 0, 0, W, H);
    drawLightRays();
    drawTiled(layers.far, game.scroll * 0.15, H - SEABED - 230);
    drawKelp();
    drawSpecks();

    for (const o of game.obstacles) {
      drawRock(o);
      drawIce(o);
    }

    drawTiled(layers.ground, game.scroll, H - SEABED - 12);
    drawBubbles();
    drawSeal(ctx, seal, SKINS[game.skin], game.state === "dying" || game.state === "over");
    drawSurface();
    ctx.restore();

    ctx.drawImage(layers.vignette.canvas, 0, 0, W, H);

    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${game.flash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------------------
  // UI (HTML overlays)
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  const ui = {
    setScore(value, bump) {
      const el = $("score");
      el.textContent = value;
      if (bump && !reducedMotion) {
        el.classList.remove("bump");
        void el.offsetWidth; // restart the animation
        el.classList.add("bump");
      }
    },
    show(name) {
      stage.dataset.state = name;
      $("startScreen").hidden = name !== "ready";
      $("overScreen").hidden = name !== "over";
      $("pauseScreen").hidden = name !== "paused";
      $("score").hidden = !(name === "playing" || name === "dying" || name === "paused");
      $("pauseBtn").hidden = name !== "playing";
    },
    syncMute() {
      const btn = $("muteBtn");
      btn.setAttribute("aria-pressed", String(sound.muted));
      btn.setAttribute("aria-label", sound.muted ? "Unmute" : "Mute");
    },
  };

  function toReady() {
    game.state = "ready";
    resetRun();
    $("startBest").textContent = game.best;
    ui.setScore(0);
    ui.show("ready");
  }

  function start() {
    resetRun();
    game.state = "playing";
    ui.setScore(0);
    ui.show("playing");
    swim();
  }

  function showGameOver() {
    game.state = "over";
    game.overAt = performance.now();
    const isBest = game.score > game.best;
    if (isBest) {
      game.best = game.score;
      storage.set(STORAGE_BEST, String(game.best));
    }
    $("finalScore").textContent = game.score;
    $("finalBest").textContent = game.best;
    $("newBest").hidden = !isBest;
    ui.show("over");
    $("restartBtn").focus({ preventScroll: true });
  }

  function pause() {
    if (game.state !== "playing") return;
    game.state = "paused";
    sound.stopMusic();
    ui.show("paused");
    $("resumeBtn").focus({ preventScroll: true });
  }

  function resume() {
    if (game.state !== "paused") return;
    game.state = "playing";
    sound.startMusic();
    ui.show("playing");
    lastFrame = performance.now();
    document.activeElement?.blur();
  }

  // One action for tap, click and Space.
  function primaryAction() {
    sound.unlock();
    sound.startMusic();
    switch (game.state) {
      case "ready": start(); break;
      case "playing": swim(); break;
      case "over":
        // A short grace period so a panicked tap doesn't skip the results.
        if (performance.now() - game.overAt > 450) start();
        break;
      case "paused": resume(); break;
    }
  }

  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    primaryAction();
  });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const key = e.code;
    if (key === "Space" || key === "ArrowUp" || key === "KeyW") {
      // Space always means "swim", even if a button still has focus.
      e.preventDefault();
      primaryAction();
    } else if (key === "Escape" || key === "KeyP") {
      if (game.state === "playing") pause();
      else if (game.state === "paused") resume();
    } else if ((key === "ArrowLeft" || key === "ArrowRight") && game.state === "ready") {
      const i = skinIds.indexOf(game.skin) + (key === "ArrowLeft" ? -1 : 1);
      pickSkin(skinIds[(i + skinIds.length) % skinIds.length]);
    } else if (key === "KeyM") {
      sound.toggle();
      ui.syncMute();
    } else if (key === "Enter" && !e.target.closest?.("button") && (game.state === "ready" || game.state === "over")) {
      primaryAction();
    }
  });

  // Seal picker on the start screen
  const skinIds = Object.keys(SKINS);
  const thumbPose = { x: 62, y: 38, angle: -0.08, flip: 1, flipper: 0.8, stroke: 0 };

  function pickSkin(id) {
    game.skin = id;
    storage.set(STORAGE_SKIN, id);
    for (const btn of $("picker").children) btn.setAttribute("aria-checked", String(btn.dataset.skin === id));
  }

  for (const id of skinIds) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick";
    btn.dataset.skin = id;
    btn.setAttribute("role", "radio");
    const thumb = document.createElement("canvas");
    thumb.width = 240;
    thumb.height = 144;
    const c = thumb.getContext("2d");
    c.scale(2, 2);
    drawSeal(c, thumbPose, SKINS[id], false);
    const label = document.createElement("span");
    label.textContent = SKINS[id].name;
    btn.append(thumb, label);
    btn.addEventListener("click", () => pickSkin(id));
    $("picker").append(btn);
  }
  pickSkin(game.skin);

  // iPhones only allow audio after a finished tap, not at touch-down.
  for (const type of ["touchend", "click"]) {
    window.addEventListener(type, () => { if (game.state !== "paused") sound.startMusic(); }, { capture: true, passive: true });
  }

  $("restartBtn").addEventListener("click", () => { if (game.state === "over") start(); });
  $("resumeBtn").addEventListener("click", resume);
  for (const id of ["menuBtn", "pauseMenuBtn"]) {
    $(id).addEventListener("click", () => { if (game.state === "over" || game.state === "paused") toReady(); });
  }
  $("pauseBtn").addEventListener("click", (e) => { e.currentTarget.blur(); pause(); });
  $("muteBtn").addEventListener("click", (e) => { e.currentTarget.blur(); sound.toggle(); ui.syncMute(); });

  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("blur", pause);
  window.addEventListener("resize", resize);

  // ---------------------------------------------------------------------------
  // Main loop: fixed-size substeps keep physics identical at 60, 120 or 144 Hz
  // ---------------------------------------------------------------------------

  const STEP = 1 / 120;
  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (game.state !== "paused") {
      const steps = Math.max(1, Math.ceil(dt / STEP));
      for (let i = 0; i < steps; i++) update(dt / steps);
    }
    render();
    requestAnimationFrame(frame);
  }

  resize();
  toReady();
  ui.syncMute();
  requestAnimationFrame(frame);

  // Hook for automated screenshots: open the page with ?debug
  if (new URLSearchParams(location.search).has("debug")) {
    window.sealDive = { game, seal, start, swim, pause };
  }
})();
