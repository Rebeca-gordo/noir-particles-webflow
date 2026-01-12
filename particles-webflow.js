/* particles-webflow.js — Noir Comet PRO (Three.js + GSAP) for Webflow
   Required in HTML:
     <canvas id="bg"></canvas>

   Load order (Webflow before </body>):
     three.min.js
     gsap.min.js
     particles-webflow.js (this file)

   Behavior:
   - On load: concentrated comet-like mass (nucleus + tail) on one side; rest of screen clean.
   - Idle: subtle breathing / shimmering (no traveling).
   - Pointer down + drag: activates flow; mass follows cursor with direction from drag.
   - Pointer up: no explosion, no zoom; smoothly returns to idle.
*/
(() => {
  const LOG_PREFIX = "[NoirComet]";
  console.log(`${LOG_PREFIX} script loaded`);

  // ---------- CONFIG ----------
  const P = {
    // Visual density
    particleCount: 26000,

    // Particle look
    baseSize: 1.08,
    opacity: 0.62,

    // Camera
    cameraRadius: 380,
    cameraHeight: 210,
    cameraOrbitSpeed: 0.00005, // almost static

    // Overall soft bounds (keeps things compact)
    softWorldRadius: 320,
    softWorldRadiusFactor: 1.35,

    // Initial shape (like your reference image)
    // Bias position is in screen space (0..1). 0.5 = center.
    nucleusBiasX: 0.78,  // more to the right
    nucleusBiasY: 0.56,  // slightly below center
    nucleusTightness: 0.20, // smaller = tighter core

    tailLength: 360,     // longer tail
    tailSpread: 0.18,    // thickness
    tailNoise: 0.08,     // irregularity
    cleanEdgeFalloff: 0.88, // higher = cleaner edges (less stray points)

    // Idle motion (subtle)
    damping: 0.9928,     // high = retains shape
    noise: 0.00008,      // very low
    idleBreath: 0.010,   // subtle global “breathing”
    idleCurl: 0.00045,   // tiny internal curl (not a vortex)
    idleDrift: 0.00008,  // super tiny drift to avoid “dead still”

    // Interaction area
    brushRadius: 170,

    // Interaction forces (tuned for “comet smear”)
    pull: 0.075,         // core attraction during drag
    flow: 0.095,         // directional smear during drag
    swirl: 0.0035,       // minimal (texture only)
    turbulence: 0.010,   // organic

    // GSAP timings
    downIn: 0.16,
    upOut: 0.50,

    // Cursor smoothing
    cursorLerp: 0.16,

    // Quality / performance (auto DPR cap)
    maxDPR: 1.5,
    smallCanvasMaxDPR: 1.0,
    smallCanvasArea: 900 * 300
  };

  // ---------- LIB CHECK ----------
  if (typeof THREE === "undefined") {
    console.error(`${LOG_PREFIX} THREE not loaded. Load three.min.js before this file.`);
    return;
  }
  if (typeof gsap === "undefined") {
    console.error(`${LOG_PREFIX} GSAP not loaded. Load gsap.min.js before this file.`);
    return;
  }

  // ---------- CANVAS ----------
  const canvas = document.getElementById("bg");
  if (!canvas) {
    console.error(`${LOG_PREFIX} canvas #bg not found. Add <canvas id="bg"></canvas>.`);
    return;
  }

  // ---------- THREE GLOBALS ----------
  let scene, camera, renderer, points;
  let positions, velocities;
  let raycaster, plane;

  const mouseNdc = new THREE.Vector2(0, 0);
  const targetCursor = new THREE.Vector3();
  const cursor3D = new THREE.Vector3();

  // One “brush” that only activates while pointer is down
  const brush = {
    pos: new THREE.Vector3(),
    dir: new THREE.Vector3(1, 0, 0),
    strength: 0,
    isDown: false
  };
  const prevBrushPos = new THREE.Vector3();

  // ---------- UTIL ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function randn() {
    // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function setRendererSize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const area = w * h;
    const dpr = window.devicePixelRatio || 1;
    const cap = area < P.smallCanvasArea ? P.smallCanvasMaxDPR : P.maxDPR;
    renderer.setPixelRatio(Math.min(dpr, cap));
  }

  function worldFromScreenBias(bx, by) {
    // bx/by are 0..1 in screen space -> convert to world point on z=0 plane
    const ndc = new THREE.Vector2(bx * 2 - 1, -(by * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const out = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, out);
    return out;
  }

  // ---------- PARTICLES: INITIAL DISTRIBUTION ----------
  function createParticles() {
    const count = P.particleCount;

    const geom = new THREE.BufferGeometry();
    positions = new Float32Array(count * 3);
    velocities = new Float32Array(count * 3);

    // nucleus position like reference image
    const nucleus = worldFromScreenBias(P.nucleusBiasX, P.nucleusBiasY);

    // Tail direction (up-right-ish). This is the “comet” direction in idle.
    const tailDir = new THREE.Vector3(0.94, 0.30, 0.10).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tailDir, up).normalize();
    const bin = new THREE.Vector3().crossVectors(side, tailDir).normalize();

    // Core tightness in world units
    const coreTight = P.nucleusTightness * P.tailLength;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Weighted: mostly core & near-core, some tail far points
      const r = Math.random();

      let px, py, pz;

      if (r < 0.62) {
        // Dense nucleus
        px = nucleus.x + randn() * coreTight;
        py = nucleus.y + randn() * coreTight * 0.70;
        pz = nucleus.z + randn() * coreTight * 0.35;
      } else {
        // Tail
        const t = Math.pow(Math.random(), 0.55);  // bias toward core but allow far tail
        const along = t * P.tailLength;

        // Tail thickness grows with t
        const spread = (P.tailSpread * P.tailLength) * (0.12 + 0.95 * t);
        const ox = randn() * spread;
        const oy = randn() * spread * 0.65;

        // small irregularity (noir texture)
        const wob = (Math.random() - 0.5) * P.tailNoise * P.tailLength * (0.12 + 0.65 * t);

        // haze (very minimal, keeps screen clean)
        const haze = Math.pow(Math.random(), 2.8) * P.tailLength * 0.07;
        const hazeSide = (Math.random() - 0.5) * haze;
        const hazeUp = (Math.random() - 0.5) * haze * 0.55;

        const pos = new THREE.Vector3()
          .copy(nucleus)
          .add(new THREE.Vector3().copy(tailDir).multiplyScalar(along + wob))
          .add(new THREE.Vector3().copy(side).multiplyScalar(ox + hazeSide))
          .add(new THREE.Vector3().copy(bin).multiplyScalar(oy + hazeUp));

        // Clean edges: pull extremes slightly toward nucleus
        const fall = P.cleanEdgeFalloff;
        pos.x = nucleus.x + (pos.x - nucleus.x) * fall;
        pos.y = nucleus.y + (pos.y - nucleus.y) * fall;

        px = pos.x; py = pos.y; pz = pos.z;
      }

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      velocities[i3] = 0;
      velocities[i3 + 1] = 0;
      velocities[i3 + 2] = 0;
    }

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // crisp circular sprite (hard edge)
    const sprite = document.createElement("canvas");
    sprite.width = 48; sprite.height = 48;
    const ctx = sprite.getContext("2d");
    ctx.clearRect(0, 0, 48, 48);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(24, 24, 18, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(sprite);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    const mat = new THREE.PointsMaterial({
      size: P.baseSize,
      sizeAttenuation: true,
      map: tex,
      transparent: true,
      opacity: P.opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    mat.alphaTest = 0.05;

    points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    scene.add(points);

    // set brush initial position near nucleus so dragging feels immediate
    brush.pos.copy(nucleus);
    prevBrushPos.copy(nucleus);
  }

  // ---------- INIT ----------
  function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(0, P.cameraHeight, P.cameraRadius);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearAlpha(0);
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

    raycaster = new THREE.Raycaster();
    plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    setRendererSize();
    createParticles();

    // ResizeObserver (Webflow-friendly)
    try {
      const ro = new ResizeObserver(() => setRendererSize());
      ro.observe(canvas);
    } catch (e) {
      window.addEventListener("resize", setRendererSize);
    }

    // pointer
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });

    // init cursor at center
    mouseNdc.set(0, 0);
    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);
    cursor3D.copy(targetCursor);

    console.log(`${LOG_PREFIX} init ok`, {
      particles: P.particleCount,
      canvas: canvas.getBoundingClientRect()
    });

    animate();
  }

  function updateTargetFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    // if canvas has 0 height, we cannot compute coords reliably
    if (h < 2 || w < 2) return;

    const x = (e.clientX - rect.left) / w;
    const y = (e.clientY - rect.top) / h;

    mouseNdc.x = x * 2 - 1;
    mouseNdc.y = -(y * 2 - 1);

    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);
  }

  function onPointerMove(e) {
    updateTargetFromEvent(e);
  }

  function onPointerDown(e) {
    updateTargetFromEvent(e);
    brush.isDown = true;

    cursor3D.copy(targetCursor);
    brush.pos.copy(cursor3D);
    prevBrushPos.copy(cursor3D);

    gsap.killTweensOf(brush);
    gsap.to(brush, { strength: 1, duration: P.downIn, ease: "power2.out" });
  }

  function onPointerUp() {
    brush.isDown = false;

    gsap.killTweensOf(brush);
    gsap.to(brush, { strength: 0, duration: P.upOut, ease: "power2.out" });
  }

  // ---------- LOOP ----------
  let now = 0;
  const relaxDir = new THREE.Vector3(1, 0, 0);

  function animate() {
    requestAnimationFrame(animate);
    now += 0.016;

    // almost static camera orbit for subtle life
    const ang = now * P.cameraOrbitSpeed;
    camera.position.x = Math.sin(ang) * P.cameraRadius;
    camera.position.z = Math.cos(ang) * P.cameraRadius;
    camera.position.y = P.cameraHeight;
    camera.lookAt(0, 0, 0);

    cursor3D.lerp(targetCursor, P.cursorLerp);

    // update brush during drag
    if (brush.isDown) {
      brush.pos.lerp(cursor3D, 0.40);

      const dx = brush.pos.x - prevBrushPos.x;
      const dy = brush.pos.y - prevBrushPos.y;
      const dz = brush.pos.z - prevBrushPos.z;
      const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dlen > 0.001) {
        brush.dir.set(dx / dlen, dy / dlen, dz / dlen);
      } else {
        brush.dir.lerp(relaxDir, 0.03).normalize();
      }
      prevBrushPos.copy(brush.pos);
    } else {
      // relax direction in idle
      brush.dir.lerp(relaxDir, 0.006).normalize();
    }

    const posAttr = points.geometry.attributes.position;
    const p = posAttr.array;

    const maxR = P.softWorldRadius * P.softWorldRadiusFactor;
    const breath = 1 + Math.sin(now * 0.35) * P.idleBreath;

    for (let i = 0; i < p.length; i += 3) {
      let x = p[i], y = p[i + 1], z = p[i + 2];
      let vx = velocities[i], vy = velocities[i + 1], vz = velocities[i + 2];

      // Idle: subtle shimmer (no traveling)
      vx += (Math.random() - 0.5) * (P.noise * breath);
      vy += (Math.random() - 0.5) * (P.noise * breath);
      vz += (Math.random() - 0.5) * (P.noise * 0.75);

      // Tiny internal curl for “noir living dust”
      const curl = P.idleCurl * breath;
      vx += (-y) * curl * 0.0009;
      vy += ( x) * curl * 0.0009;

      // Tiny drift (barely visible) so it doesn't look frozen
      vx += (Math.sin(now * 0.12 + i * 0.00002) * P.idleDrift) * 0.0006;
      vy += (Math.cos(now * 0.10 + i * 0.00002) * P.idleDrift) * 0.0006;

      // Interaction only while brush strength > 0
      const s = brush.strength;
      if (s > 0.0008) {
        const bx = brush.pos.x, by = brush.pos.y, bz = brush.pos.z;
        const dx = bx - x, dy = by - y, dz = bz - z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;

        if (dist < P.brushRadius) {
          const influence = 1 - (dist / P.brushRadius);
          const inf2 = influence * influence;

          // Pull (creates dense bright core while dragging)
          const pull = P.pull * s * inf2;
          vx += (dx / dist) * pull;
          vy += (dy / dist) * pull;
          vz += (dz / dist) * pull;

          // Flow direction (creates comet smear)
          const flow = P.flow * s * inf2;
          vx += brush.dir.x * flow;
          vy += brush.dir.y * flow;
          vz += brush.dir.z * flow;

          // Minimal swirl (texture, not vortex)
          const sw = P.swirl * s * inf2;
          vx += (-dy / dist) * sw;
          vy += ( dx / dist) * sw;

          // Turbulence (organic)
          const turb = P.turbulence * s * inf2;
          vx += (Math.random() - 0.5) * turb;
          vy += (Math.random() - 0.5) * turb;
          vz += (Math.random() - 0.5) * (turb * 0.7);
        }
      }

      // damping / integrate
      vx *= P.damping;
      vy *= P.damping;
      vz *= P.damping;

      x += vx; y += vy; z += vz;

      // soft world bound
      const len = Math.sqrt(x * x + y * y + z * z);
      if (len > maxR) {
        const sc = maxR / (len + 1e-6);
        x *= sc; y *= sc; z *= sc;
        vx *= 0.35; vy *= 0.35; vz *= 0.35;
      }

      p[i] = x; p[i + 1] = y; p[i + 2] = z;
      velocities[i] = vx; velocities[i + 1] = vy; velocities[i + 2] = vz;
    }

    posAttr.needsUpdate = true;
    renderer.render(scene, camera);
  }

  // ---------- START ----------
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
