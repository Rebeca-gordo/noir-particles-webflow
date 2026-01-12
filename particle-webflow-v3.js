/* =========================================================
   NOIR ENERGY BALL — Webflow (Three.js + GSAP)
   - Idle: masa concentrada (no ensucia toda la pantalla)
   - Pointer DOWN: todas se juntan -> bola de energía grande
   - Pointer UP: se esparcen lentamente (sin zoom / sin kick brusco)
========================================================= */

(() => {
  console.log("[NoirEnergyBall] loaded");

  if (typeof THREE === "undefined") {
    console.error("[NoirEnergyBall] Three.js not loaded");
    return;
  }
  if (typeof gsap === "undefined") {
    console.error("[NoirEnergyBall] GSAP not loaded");
    return;
  }

  // ---------- CONFIG ----------
  const CFG = {
    particleCount: 22000,

    // Look
    baseSize: 1.12,
    opacity: 0.72,

    // Camera
    cameraZ: 560,

    // Start shape (concentrado a la derecha como tu foto)
    nucleusX: 220,
    nucleusY: 10,
    nucleusZ: 0,
    coreRadius: 62,
    tailLength: 520,
    tailSpread: 160,
    tailUpBias: 0.62,
    tailNoise: 0.16,
    cleanFalloff: 0.90,

    // Idle
    idleNoise: 0.00022,
    idleDamping: 0.988,

    // ENERGY BALL (pointer down)
    gatherRadius: 120,       // radio de la bola (evita apilado total)
    gatherStrength: 0.085,   // fuerza de succión
    gatherSwirl: 0.016,      // micro swirl para “energía”
    gatherJitter: 0.010,     // jitter dentro de la bola (evita stack)
    gatherDamping: 0.986,

    // RELEASE (pointer up) — dispersión lenta
    releaseStrength: 0.032,  // empuje hacia afuera (suave)
    releaseDamping: 0.992,   // frena lentamente
    releaseDuration: 1400,   // ms decae el empuje

    // Soft bounds (para que no se vaya infinito)
    softBound: 1100,
    boundForce: 0.0010,

    // GSAP transitions
    downIn: 0.18,
    upOut: 0.45
  };

  // ---------- DOM / THREE ----------
  const canvas = document.getElementById("bg");
  if (!canvas) {
    console.error("[NoirEnergyBall] Canvas #bg not found");
    return;
  }

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    3000
  );
  camera.position.z = CFG.cameraZ;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  // ---------- PARTICLES BUFFERS ----------
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CFG.particleCount * 3);
  const basePositions = new Float32Array(CFG.particleCount * 3);
  const velocities = new Float32Array(CFG.particleCount * 3);

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Initial shape: nucleus + tail (limpio en el resto del lienzo)
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
    basePositions[i3] = x; basePositions[i3 + 1] = y; basePositions[i3 + 2] = z;
    velocities[i3] = velocities[i3 + 1] = velocities[i3 + 2] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // Sprite (punto duro)
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

  // ---------- INTERACTION STATE ----------
  let isDown = false;

  // Control “animable” con GSAP
  const u = {
    gather: 0,          // 0..1 succión
    release: 0          // 0..1 empuje outward
  };

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

  window.addEventListener("pointerup", () => {
    isDown = false;

    // activa dispersión lenta
    releaseStart = performance.now();
    u.release = 1;

    gsap.killTweensOf(u);
    gsap.to(u, { gather: 0, duration: CFG.upOut, ease: "power2.out" });
    gsap.to(u, { release: 0, duration: CFG.releaseDuration / 1000, ease: "power3.out" });
  }, { passive: true });

  window.addEventListener("pointercancel", () => {
    isDown = false;
    releaseStart = performance.now();
    u.release = 1;

    gsap.killTweensOf(u);
    gsap.to(u, { gather: 0, duration: CFG.upOut, ease: "power2.out" });
    gsap.to(u, { release: 0, duration: CFG.releaseDuration / 1000, ease: "power3.out" });
  }, { passive: true });

  // ---------- LOOP ----------
  function animate() {
    requestAnimationFrame(animate);

    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, target);

    const gatherOn = u.gather;
    const releaseOn = u.release;

    for (let i = 0; i < CFG.particleCount; i++) {
      const i3 = i * 3;

      let x = positions[i3], y = positions[i3 + 1], z = positions[i3 + 2];
      let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];

      // base idle movement
      vx += (Math.random() - 0.5) * CFG.idleNoise;
      vy += (Math.random() - 0.5) * CFG.idleNoise;
      vz += (Math.random() - 0.5) * CFG.idleNoise;

      // ====== GATHER (ENERGY BALL) ======
      if (gatherOn > 0.0005) {
        const dx = target.x - x;
        const dy = target.y - y;
        const dz = target.z - z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;

        // Succión: fuerte pero estable
        const force = (CFG.gatherStrength * gatherOn);
        vx += (dx / dist) * force;
        vy += (dy / dist) * force;
        vz += (dz / dist) * force;

        // Mantener un radio mínimo para que sea “bola grande”, no punto
        // si está demasiado cerca, empuja ligeramente hacia afuera
        if (dist < CFG.gatherRadius) {
          const push = (1 - dist / CFG.gatherRadius) * 0.010 * gatherOn;
          vx -= (dx / dist) * push;
          vy -= (dy / dist) * push;
          vz -= (dz / dist) * push;

          // micro swirl “energía”
          const sw = CFG.gatherSwirl * gatherOn;
          vx += (-dy / dist) * sw;
          vy += ( dx / dist) * sw;

          // jitter interno para evitar stacking
          const jit = CFG.gatherJitter * gatherOn * (0.6 + Math.random() * 0.4);
          vx += (Math.random() - 0.5) * jit;
          vy += (Math.random() - 0.5) * jit;
          vz += (Math.random() - 0.5) * jit * 0.8;
        }
      }

      // ====== RELEASE (SLOW SPREAD) ======
      if (releaseOn > 0.0005) {
        const rx = x - target.x;
        const ry = y - target.y;
        const rz = z - target.z;
        const rdist = Math.sqrt(rx*rx + ry*ry + rz*rz) + 1e-6;

        // Empuje suave hacia afuera (se esparce lentamente)
        const out = CFG.releaseStrength * releaseOn * (0.55 + 0.45 * Math.min(1, rdist / 200));
        vx += (rx / rdist) * out;
        vy += (ry / rdist) * out;
        vz += (rz / rdist) * out;
      }

      // Damping
      const damp = (gatherOn > 0.0005) ? CFG.gatherDamping : (releaseOn > 0.0005 ? CFG.releaseDamping : CFG.idleDamping);
      vx *= damp; vy *= damp; vz *= damp;

      // Integrate
      x += vx; y += vy; z += vz;

      // Soft bounds (evita que se pierdan)
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

  // ---------- RESIZE ----------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  });
})();
