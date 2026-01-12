/* =========================================================
   NOIR ENERGY BALL — v3.1 (Organic Universe)
   Idle: expands organically (not too concentrated)
   Hold click: gathers into energy ball
   Release: slowly expands back (subtle, cosmic)
========================================================= */

(() => {
  console.log("[NoirEnergyBall v3.1] loaded");

  if (typeof THREE === "undefined") { console.error("Three.js not loaded"); return; }
  if (typeof gsap === "undefined") { console.error("GSAP not loaded"); return; }

  const CFG = {
    particleCount: 22000,

    // Camera
    cameraZ: 560,

    // Visual
    baseSize: 1.08,
    opacity: 0.70,

    // Start shape (comet-ish, clean canvas)
    nucleusX: 220,
    nucleusY: 10,
    nucleusZ: 0,
    coreRadius: 62,
    tailLength: 520,
    tailSpread: 165,
    tailUpBias: 0.60,
    tailNoise: 0.16,
    cleanFalloff: 0.90,

    // IDLE = EXPAND (cosmic, subtle)
    idleNoise: 0.00020,
    idleDamping: 0.989,
    idleExpandStrength: 0.010,     // outward force from nucleus (slow)
    idleExpandFalloff: 0.0000026,  // reduces expansion when far (keeps canvas clean)
    idleSwirl: 0.00035,            // tiny internal swirl

    // GATHER (hold click)
    gatherRadius: 140,       // big energy ball radius
    gatherStrength: 0.090,   // suction strength
    gatherSwirl: 0.020,      // “energy” swirl
    gatherJitter: 0.010,     // prevents stacking
    gatherDamping: 0.986,

    // RELEASE (after pointer up) -> expand back slowly
    releaseExpandStrength: 0.018,  // stronger than idle for a moment
    releaseDuration: 1600,         // ms
    releaseDamping: 0.992,

    // Soft bounds (avoid infinite drift)
    softBound: 1200,
    boundForce: 0.0010,

    // Smooth transitions
    downIn: 0.18,
    upOut: 0.50
  };

  const canvas = document.getElementById("bg");
  if (!canvas) { console.error("Canvas #bg not found"); return; }

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3000);
  camera.position.z = CFG.cameraZ;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  // Buffers
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CFG.particleCount * 3);
  const velocities = new Float32Array(CFG.particleCount * 3);

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Initial distribution: nucleus + tail (as before)
  for (let i = 0; i < CFG.particleCount; i++) {
    const i3 = i * 3;

    const r = Math.random();
    let x, y, z;

    if (r < 0.56) {
      x = CFG.nucleusX + randn() * CFG.coreRadius;
      y = CFG.nucleusY + randn() * (CFG.coreRadius * 0.65);
      z = CFG.nucleusZ + randn() * (CFG.coreRadius * 0.35);
    } else {
      const t = Math.pow(Math.random(), 0.58);
      const along = t * CFG.tailLength;
      const width = (0.15 + t) * CFG.tailSpread;

      const offY = randn() * width;
      const offZ = randn() * (width * 0.55);
      const wobble = (Math.random() - 0.5) * CFG.tailNoise * CFG.tailLength * (0.08 + 0.6 * t);

      const dirX = 1.0;
      const dirY = CFG.tailUpBias;

      x = CFG.nucleusX + (along + wobble) * dirX;
      y = CFG.nucleusY + (along + wobble) * dirY * 0.22 + offY;
      z = CFG.nucleusZ + offZ;

      const fall = CFG.cleanFalloff;
      y = CFG.nucleusY + (y - CFG.nucleusY) * fall;
      z = CFG.nucleusZ + (z - CFG.nucleusZ) * fall;
    }

    positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;
    velocities[i3] = velocities[i3 + 1] = velocities[i3 + 2] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // Sprite
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(sprite);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const material = new THREE.PointsMaterial({
    size: CFG.baseSize,
    map: texture,
    transparent: true,
    opacity: CFG.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // Interaction state
  let isDown = false;

  // Animated controls
  const u = { gather: 0, release: 0 };
  let releaseStart = 0;

  const mouseNdc = new THREE.Vector2(0, 0);
  const target = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  function updateMouse(e) {
    mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  window.addEventListener("pointermove", updateMouse, { passive: true });

  window.addEventListener("pointerdown", (e) => {
    isDown = true;
    updateMouse(e);
    gsap.killTweensOf(u);
    gsap.to(u, { gather: 1, duration: CFG.downIn, ease: "power2.out" });
    gsap.to(u, { release: 0, duration: 0.12, ease: "power2.out" });
  }, { passive: true });

  function onUp() {
    isDown = false;
    releaseStart = performance.now();
    u.release = 1;
    gsap.killTweensOf(u);
    gsap.to(u, { gather: 0, duration: CFG.upOut, ease: "power2.out" });
    gsap.to(u, { release: 0, duration: CFG.releaseDuration / 1000, ease: "power3.out" });
  }

  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });

  // Loop
  function animate() {
    requestAnimationFrame(animate);

    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, target);

    const gatherOn = u.gather;
    const releaseOn = u.release;

    // Center of “universe mass” (for idle expansion)
    const cx = CFG.nucleusX, cy = CFG.nucleusY, cz = CFG.nucleusZ;

    for (let i = 0; i < CFG.particleCount; i++) {
      const i3 = i * 3;

      let x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
      let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];

      // IDLE organic motion
      vx += (Math.random() - 0.5) * CFG.idleNoise;
      vy += (Math.random() - 0.5) * CFG.idleNoise;
      vz += (Math.random() - 0.5) * CFG.idleNoise;

      // IDLE expansion: gently push outward from nucleus (keeps from being too concentrated)
      // falloff so far points don't drift forever
      const ox = x - cx, oy = y - cy, oz = z - cz;
      const olen2 = ox*ox + oy*oy + oz*oz + 1e-6;
      const inv = 1 / Math.sqrt(olen2);

      // stronger near center, fades with distance
      const expand = CFG.idleExpandStrength / (1 + olen2 * CFG.idleExpandFalloff);
      vx += (ox * inv) * expand;
      vy += (oy * inv) * expand;
      vz += (oz * inv) * expand * 0.75;

      // tiny idle swirl around nucleus for “universe”
      const sw = CFG.idleSwirl / (1 + olen2 * 0.00001);
      vx += (-oy * inv) * sw;
      vy += ( ox * inv) * sw;

      // GATHER on click: everything joins into a big energy ball at cursor
      if (gatherOn > 0.0005) {
        const dx = target.x - x, dy = target.y - y, dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;

        const force = CFG.gatherStrength * gatherOn;
        vx += (dx / dist) * force;
        vy += (dy / dist) * force;
        vz += (dz / dist) * force;

        // Keep “ball size” (avoid single point stacking)
        if (dist < CFG.gatherRadius) {
          const push = (1 - dist / CFG.gatherRadius) * 0.012 * gatherOn;
          vx -= (dx / dist) * push;
          vy -= (dy / dist) * push;
          vz -= (dz / dist) * push;

          const s = CFG.gatherSwirl * gatherOn;
          vx += (-dy / dist) * s;
          vy += ( dx / dist) * s;

          const jit = CFG.gatherJitter * gatherOn * (0.6 + Math.random() * 0.4);
          vx += (Math.random() - 0.5) * jit;
          vy += (Math.random() - 0.5) * jit;
          vz += (Math.random() - 0.5) * jit * 0.8;
        }
      }

      // RELEASE: after letting go, expand a bit stronger for a while, then relax to idle
      if (releaseOn > 0.0005) {
        const rx = x - target.x, ry = y - target.y, rz = z - target.z;
        const rdist = Math.sqrt(rx*rx + ry*ry + rz*rz) + 1e-6;

        const out = CFG.releaseExpandStrength * releaseOn * (0.45 + 0.55 * Math.min(1, rdist / 240));
        vx += (rx / rdist) * out;
        vy += (ry / rdist) * out;
        vz += (rz / rdist) * out * 0.75;
      }

      // Damping
      const damp = (gatherOn > 0.0005)
        ? CFG.gatherDamping
        : (releaseOn > 0.0005 ? CFG.releaseDamping : CFG.idleDamping);

      vx *= damp; vy *= damp; vz *= damp;

      x += vx; y += vy; z += vz;

      // Soft bounds
      const len = Math.sqrt(x*x + y*y + z*z);
      if (len > CFG.softBound) {
        const k = (len - CFG.softBound) / CFG.softBound;
        vx -= (x / len) * (k * CFG.boundForce);
        vy -= (y / len) * (k * CFG.boundForce);
        vz -= (z / len) * (k * CFG.boundForce);
      }

      positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;
      velocities[i3] = vx; velocities[i3 + 1] = vy; velocities[i3 + 2] = vz;
    }

    geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  });
})();
