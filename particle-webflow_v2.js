/* =========================================================
   NOIR PARTICLES — Webflow (Comet + Auto-Regroup PRO)
   - Load: nucleus + tail (clean canvas elsewhere)
   - Idle: subtle motion + returns to base shape (keeps canvas clean)
   - Drag: active flow + swirl
   - Release: no zoom / no explosion, slowly regroups
========================================================= */

(() => {
  console.log("[NoirComet] loaded — regroup");

  if (typeof THREE === "undefined") {
    console.error("[NoirComet] Three.js not loaded");
    return;
  }

  /* ================= CONFIG ================= */

  const CFG = {
    // density
    particleCount: 24000,

    // camera
    cameraZ: 560,

    // look
    baseSize: 1.12,
    opacity: 0.72,

    // initial shape (match your photo)
    nucleusX: 220,        // move mass to the right (clean canvas)
    nucleusY: 10,
    nucleusZ: 0,
    coreRadius: 55,       // bright nucleus size
    tailLength: 520,      // long tail
    tailSpread: 150,      // how wide the tail becomes
    tailUpBias: 0.65,     // tail going slightly upward-right
    tailNoise: 0.18,      // irregularity
    cleanFalloff: 0.88,   // higher = cleaner edges (less stray points)

    // idle motion
    idleNoise: 0.00035,
    idleDamping: 0.987,

    // auto regroup (THIS makes canvas clean again)
    regroupStrength: 0.012,   // how strongly it returns to base
    regroupDamping: 0.990,    // extra damping while regrouping
    regroupDelayMs: 180,      // wait after pointer up before regroup starts

    // interaction
    brushRadius: 210,
    dragForce: 0.060,
    swirlStrength: 0.28,
    dragDamping: 0.986,

    // bounds
    softBound: 900,
    boundForce: 0.0009
  };

  /* ================= DOM / THREE ================= */

  const canvas = document.getElementById("bg");
  if (!canvas) {
    console.error("[NoirComet] Canvas #bg not found");
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

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  /* ================= PARTICLES ================= */

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CFG.particleCount * 3);
  const basePositions = new Float32Array(CFG.particleCount * 3);
  const velocities = new Float32Array(CFG.particleCount * 3);

  function randn() {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Build initial comet: dense nucleus + tapered tail
  for (let i = 0; i < CFG.particleCount; i++) {
    const i3 = i * 3;

    const r = Math.random();
    let x, y, z;

    if (r < 0.55) {
      // nucleus (dense)
      x = CFG.nucleusX + randn() * CFG.coreRadius;
      y = CFG.nucleusY + randn() * (CFG.coreRadius * 0.65);
      z = CFG.nucleusZ + randn() * (CFG.coreRadius * 0.35);
    } else {
      // tail
      // t: 0 near nucleus, 1 far tail
      const t = Math.pow(Math.random(), 0.58);

      // along tail direction (mostly to the right + slightly up)
      const along = t * CFG.tailLength;

      // tail width grows with t
      const width = (0.15 + t) * CFG.tailSpread;

      // gaussian spread perpendicular
      const offY = randn() * width;
      const offZ = randn() * (width * 0.55);

      // slight irregularity / clumping
      const wobble = (Math.random() - 0.5) * CFG.tailNoise * CFG.tailLength * (0.08 + 0.6 * t);

      // Tail direction vector (right + up bias)
      const dirX = 1.0;
      const dirY = CFG.tailUpBias;

      x = CFG.nucleusX + (along + wobble) * dirX;
      y = CFG.nucleusY + (along + wobble) * dirY * 0.22 + offY;
      z = CFG.nucleusZ + offZ;

      // Clean edges: pull far offsets a bit toward center so canvas stays clean
      const fall = CFG.cleanFalloff;
      y = CFG.nucleusY + (y - CFG.nucleusY) * fall;
      z = CFG.nucleusZ + (z - CFG.nucleusZ) * fall;
    }

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;

    basePositions[i3] = x;
    basePositions[i3 + 1] = y;
    basePositions[i3 + 2] = z;

    velocities[i3] = velocities[i3 + 1] = velocities[i3 + 2] = 0;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  // Crisp white dot sprite
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

  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  scene.add(particles);

  /* ================= INTERACTION ================= */

  let isDragging = false;
  let lastPointerUp = performance.now();

  const mouse = new THREE.Vector2();
  const target = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  function updateMouse(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  window.addEventListener("pointerdown", (e) => {
    isDragging = true;
    updateMouse(e);
  });

  window.addEventListener("pointerup", () => {
    isDragging = false;
    lastPointerUp = performance.now();
  });

  window.addEventListener("pointercancel", () => {
    isDragging = false;
    lastPointerUp = performance.now();
  });

  window.addEventListener("mousemove", updateMouse);

  /* ================= LOOP ================= */

  function animate() {
    requestAnimationFrame(animate);

    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, target);

    const now = performance.now();
    const regroupActive = !isDragging && (now - lastPointerUp) > CFG.regroupDelayMs;

    for (let i = 0; i < CFG.particleCount; i++) {
      const i3 = i * 3;

      let x = positions[i3];
      let y = positions[i3 + 1];
      let z = positions[i3 + 2];

      let vx = velocities[i3];
      let vy = velocities[i3 + 1];
      let vz = velocities[i3 + 2];

      // --- idle micro motion (always) ---
      vx += (Math.random() - 0.5) * CFG.idleNoise;
      vy += (Math.random() - 0.5) * CFG.idleNoise;
      vz += (Math.random() - 0.5) * CFG.idleNoise;

      if (isDragging) {
        // --- drag interaction: pull + swirl around cursor ---
        const dx = target.x - x;
        const dy = target.y - y;
        const dz = target.z - z;

        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;

        // influence only within radius -> keeps canvas clean
        if (dist < CFG.brushRadius) {
          const influence = 1 - dist / CFG.brushRadius;
          const force = CFG.dragForce * influence;

          vx += (dx / dist) * force;
          vy += (dy / dist) * force;
          vz += (dz / dist) * force;

          // swirl (minimal, noir)
          const swirl = CFG.swirlStrength * influence * 0.0022;
          vx += (-dy / dist) * swirl;
          vy += ( dx / dist) * swirl*
