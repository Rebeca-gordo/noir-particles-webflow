/* =========================================================
   Noir Particles — Webflow v4 (based on your big reference script)
   - Uses <canvas id="bg">
   - Click/drag = attraction ON
   - Release = gentle release (configurable)
   - Starts as "noir comet" mass biased to one side (like your image)
   - Webflow-safe sizing (uses canvas rect)
========================================================= */

(() => {
  // ---------- Guards ----------
  if (typeof THREE === "undefined") {
    console.error("[NoirV4] THREE not loaded. Load three.min.js before this file.");
    return;
  }
  const canvas = document.getElementById("bg");
  if (!canvas) {
    console.error("[NoirV4] canvas #bg not found. Add <canvas id='bg'></canvas>.");
    return;
  }

  console.log("[NoirV4] loaded");

  // ---------- Globals ----------
  let scene, camera, renderer;
  let particleSystem, coreSystem;
  let corePositionsArr, coreVelArr;
  let coreCount = 0;

  // ---------- Params (tuned to match your reference + your image) ----------
  const params = {
    // counts
    particleCount: 32000,
    coreCount: 9200, // a bit less than your snippet for stability (still very dense)

    // overall space
    radius: 230,              // slightly larger so the "comet" has room
    minRadiusFactor: 0.18,    // keep inner region alive

    // visuals
    baseSize: 1.15,
    sizeAttenuation: true,
    opacityBg: 0.46,
    opacityCore: 0.78,

    // camera
    cameraRadius: 300,
    cameraHeight: 190,
    cameraOrbitSpeed: 0.00006, // calm orbit

    // click attraction behavior
    cursorAttractionBase: 0.30,
    cursorLerp: 0.06,
    cursorScreenRadius: 0.20,
    swirlStrength: 0.20,
    noiseStrength: 0.00042,
    velocityDamping: 0.985,

    // ring offset (avoid stacking)
    activeAttractOffset: 0.30,
    coreActiveAttractOffset: 0.20,

    // falloff
    attractRadiusFactor: 0.30,
    distantAttractScale: 0.055,
    distantAttractFalloff: 1.8,

    // release after pointer up — IMPORTANT:
    // you said: "no zooms" / sometimes you want spread.
    // Set releaseStrength to 0.00 if you want ZERO push on release.
    releaseStrength: 0.020,    // gentle (NOT explosive)
    releaseDuration: 1400,
    releaseMax: 0.10,

    // bounds (soft)
    boundaryForce: 0.016,
    boundaryMargin: 0.10,

    // performance/adaptive
    quality: "auto",
    maxParticleCount: 36000,
    minParticleScale: 0.20,
    idleHeavySkipFrames: 6,

    // idle fps
    activeFrameInterval: 16,
    idleFrameInterval: 18,
    hiddenFrameInterval: 220,
    postReleaseActiveMs: 1600,

    // header mode
    headerMode: false,
    headerModeAutoEnableArea: (800 * 220),
    headerModeParticleCount: 1200,
    headerModeMaxParticleCount: 1300,
    headerModePixelRatio: 1,
    headerModeFrameInterval: 60,

    // start behavior
    startupGraceMs: 700,
    settleDuration: 1200,
    startupDamping: 0.94,

    // IMPORTANT to match your image:
    // "mass on one side, rest clean"
    // We bias positions toward +X and slightly +Y; tail goes to left.
    massBiasX: 140,
    massBiasY: 0,
    tailDirX: -1.0,   // tail flows to the left
    tailDirY: -0.05,  // slight downward
    tailSpread: 0.22, // thickness of tail
    cleanStrays: 0.92 // pull strays inward to keep canvas clean
  };

  // ---------- State ----------
  let velocitiesVec;
  let orbitPhases, coreOrbitPhases;
  let attractStrengths, orbitScales, coreAttractStrengths, coreOrbitScales;

  let mouseNdc = new THREE.Vector2(0, 0);
  let attractionActive = false;

  let cursor3D = new THREE.Vector3();
  let targetCursor = new THREE.Vector3();

  let raycaster, plane;

  let isInViewport = true;
  let lastRenderTime = 0;
  let cameraAngle = 0;
  let frameCount = 0;

  let releaseStartTime = 0;
  let releaseOrigin = new THREE.Vector3();
  let appStartTime = 0;

  let particleSystemEffectiveCount = 0;

  // ---------- Helpers ----------
  const tmpV = new THREE.Vector3();
  const tmpNdc = new THREE.Vector3();
  const tmpTargetWorld = new THREE.Vector3();
  const tmpCamDir = new THREE.Vector3();
  const tmpTangent = new THREE.Vector3();
  const tmpBin = new THREE.Vector3();

  function detectQuality() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const area = w * h;
    const dpr = window.devicePixelRatio || 1;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.max(w, h) < 900;

    if (params.quality === "auto") {
      if (isMobile || dpr > 2 || area < (800 * 600)) params.quality = "low";
      else if (dpr > 1.4 || area < (1280 * 720)) params.quality = "medium";
      else params.quality = "high";
    }
    // console.log("[NoirV4] Quality:", params.quality, "dpr:", dpr, "area:", area);
  }

  function setRendererSize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const area = w * h;
    const small = area < params.headerModeAutoEnableArea;

    const dpr = window.devicePixelRatio || 1;
    const cap = small ? 1 : 1.5;
    renderer.setPixelRatio(Math.min(dpr, cap));
    renderer.setSize(w, h, false);
  }

  function makeSprite(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, Math.floor(size * 0.44), 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  // ---------- Init ----------
  function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    camera.position.set(0, params.cameraHeight, params.cameraRadius);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    if (typeof THREE.SRGBColorSpace !== "undefined") renderer.outputColorSpace = THREE.SRGBColorSpace;

    raycaster = new THREE.Raycaster();
    plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    setRendererSize();

    // Visibility pause
    try {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { isInViewport = e.isIntersecting && e.intersectionRatio > 0; });
      }, { threshold: 0.01 });
      io.observe(canvas);
    } catch (e) {}

    window.addEventListener("resize", () => setRendererSize());
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.addEventListener("visibilitychange", () => {});

    // initial cursor target at center
    mouseNdc.set(0, 0);
    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);
    cursor3D.copy(targetCursor);
  }

  // ---------- Create particles (biased comet) ----------
  function createParticles() {
    // scale counts
    const rect = canvas.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);

    const screenScale = Math.min(1, Math.max(params.minParticleScale, area / (1280 * 360)));
    let q = 1.0;
    if (params.quality === "low") q = 0.34;
    if (params.quality === "medium") q = 0.60;
    if (params.quality === "high") q = 1.0;

    let count = Math.max(512, Math.round(params.particleCount * screenScale * q));
    count = Math.min(count, params.maxParticleCount);

    let coreCountLocal = Math.max(64, Math.round(params.coreCount * screenScale * q));
    particleSystemEffectiveCount = count;
    coreCount = coreCountLocal;

    // main arrays
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    velocitiesVec = new Float32Array(count * 3);
    orbitPhases = new Float32Array(count);
    attractStrengths = new Float32Array(count);
    orbitScales = new Float32Array(count);

    for (let i = 0; i < count; i++) orbitPhases[i] = Math.random() * Math.PI * 2;

    // Build comet: dense head at +X, tail to left
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // t biases distance along tail
      const t = Math.pow(Math.random(), 0.55);
      const head = (Math.random() < 0.55);

      let x, y, z;

      if (head) {
        // nucleus: tight cluster on one side
        const r = Math.pow(Math.random(), 0.55) * (params.radius * 0.26);
        const ang = Math.random() * Math.PI * 2;
        x = params.massBiasX + Math.cos(ang) * r;
        y = params.massBiasY + Math.sin(ang) * r * 0.65;
        z = (Math.random() - 0.5) * r * 0.25;
      } else {
        // tail: stretched to the left
        const along = t * (params.radius * 2.2);
        const spread = (0.18 + t) * (params.radius * params.tailSpread);

        x = params.massBiasX + params.tailDirX * along + (Math.random() - 0.5) * spread * 0.35;
        y = params.massBiasY + params.tailDirY * along + (Math.random() - 0.5) * spread;
        z = (Math.random() - 0.5) * spread * 0.45;

        // keep canvas clean: pull outliers inward
        x = params.massBiasX + (x - params.massBiasX) * params.cleanStrays;
        y = params.massBiasY + (y - params.massBiasY) * params.cleanStrays;
      }

      positions[i3] = x; positions[i3 + 1] = y; positions[i3 + 2] = z;

      // per-particle variety
      attractStrengths[i] = 0.75 + Math.random() * 0.70;
      orbitScales[i] = 0.60 + Math.random() * 0.90;

      velocitiesVec[i3] = 0;
      velocitiesVec[i3 + 1] = 0;
      velocitiesVec[i3 + 2] = 0;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const sprite = makeSprite(params.quality === "low" ? 24 : 48);

    const material = new THREE.PointsMaterial({
      size: params.baseSize,
      sizeAttenuation: params.sizeAttenuation,
      map: sprite,
      transparent: true,
      opacity: params.opacityBg,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    material.alphaTest = 0.05;

    particleSystem = new THREE.Points(geometry, material);
    particleSystem.frustumCulled = false;
    scene.add(particleSystem);

    // core system (brighter clumps)
    const coreGeom = new THREE.BufferGeometry();
    const corePositions = new Float32Array(coreCountLocal * 3);
    const coreColors = new Float32Array(coreCountLocal * 3);
    coreVelArr = new Float32Array(coreCountLocal * 3);

    coreOrbitPhases = new Float32Array(coreCountLocal);
    coreAttractStrengths = new Float32Array(coreCountLocal);
    coreOrbitScales = new Float32Array(coreCountLocal);

    for (let i = 0; i < coreCountLocal; i++) {
      const i3 = i * 3;

      // place cores in head + near tail start
      const head = Math.random() < 0.75;
      if (head) {
        const r = Math.pow(Math.random(), 0.55) * (params.radius * 0.20);
        const ang = Math.random() * Math.PI * 2;
        corePositions[i3] = params.massBiasX + Math.cos(ang) * r;
        corePositions[i3 + 1] = params.massBiasY + Math.sin(ang) * r * 0.62;
        corePositions[i3 + 2] = (Math.random() - 0.5) * r * 0.22;
      } else {
        const t = Math.pow(Math.random(), 0.65) * 0.6;
        const along = t * (params.radius * 1.4);
        const spread = (0.10 + t) * (params.radius * params.tailSpread * 0.65);
        corePositions[i3] = params.massBiasX + params.tailDirX * along + (Math.random() - 0.5) * spread * 0.25;
        corePositions[i3 + 1] = params.massBiasY + params.tailDirY * along + (Math.random() - 0.5) * spread;
        corePositions[i3 + 2] = (Math.random() - 0.5) * spread * 0.35;
      }

      coreColors[i3] = 1; coreColors[i3 + 1] = 1; coreColors[i3 + 2] = 1;

      coreVelArr[i3] = 0;
      coreVelArr[i3 + 1] = 0;
      coreVelArr[i3 + 2] = 0;

      coreOrbitPhases[i] = Math.random() * Math.PI * 2;
      coreAttractStrengths[i] = 0.90 + Math.random() * 0.70;
      coreOrbitScales[i] = 0.70 + Math.random() * 0.90;
    }

    coreGeom.setAttribute("position", new THREE.BufferAttribute(corePositions, 3));
    coreGeom.setAttribute("color", new THREE.BufferAttribute(coreColors, 3));

    const coreMat = new THREE.PointsMaterial({
      size: params.baseSize * 1.22,
      sizeAttenuation: params.sizeAttenuation,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: params.opacityCore,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    coreMat.alphaTest = 0.05;

    coreSystem = new THREE.Points(coreGeom, coreMat);
    coreSystem.frustumCulled = false;
    scene.add(coreSystem);

    corePositionsArr = corePositions;
  }

  // ---------- Events ----------
  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    const x = (e.clientX - rect.left) / w;
    const y = (e.clientY - rect.top) / h;

    mouseNdc.x = x * 2 - 1;
    mouseNdc.y = -(y * 2 - 1);

    if (attractionActive) {
      raycaster.setFromCamera(mouseNdc, camera);
      raycaster.ray.intersectPlane(plane, targetCursor);
    }
  }

  function onPointerDown(e) {
    attractionActive = true;
    onPointerMove(e);
    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);
    cursor3D.copy(targetCursor);
  }

  function onPointerUp() {
    attractionActive = false;
    releaseStartTime = performance.now();
    releaseOrigin.copy(cursor3D);
  }

  // ---------- Animate ----------
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    let interval = params.idleFrameInterval;

    const sinceRelease = (releaseStartTime > 0) ? (now - releaseStartTime) : Infinity;
    const keepActive = attractionActive || (sinceRelease < params.postReleaseActiveMs);

    if (document.hidden || !isInViewport) interval = params.hiddenFrameInterval;
    else interval = keepActive ? params.activeFrameInterval : params.idleFrameInterval;

    if (now - lastRenderTime < interval) return;
    lastRenderTime = now;

    // camera calm orbit
    cameraAngle += params.cameraOrbitSpeed;
    camera.position.x = Math.sin(cameraAngle) * params.cameraRadius;
    camera.position.z = Math.cos(cameraAngle) * params.cameraRadius;
    camera.position.y = params.cameraHeight;
    camera.lookAt(scene.position);

    // cursor projection + wobble
    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);

    targetCursor.x += Math.sin(now * 0.0004) * (params.radius * 0.006);
    targetCursor.y += Math.cos(now * 0.0006) * (params.radius * 0.006);

    cursor3D.lerp(targetCursor, params.cursorLerp);
    camera.getWorldDirection(tmpCamDir);

    // update main particles
    const posAttr = particleSystem.geometry.attributes.position;
    const positions = posAttr.array;
    const count = particleSystemEffectiveCount;
    const radius = params.radius;

    const active = attractionActive;
    const baseStrength = active ? params.cursorAttractionBase : 0;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      let x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];
      let vx = velocitiesVec[idx], vy = velocitiesVec[idx + 1], vz = velocitiesVec[idx + 2];

      // expensive projection less often in idle
      const heavySkip = active ? 1 : params.idleHeavySkipFrames;
      const heavyTick = (frameCount % heavySkip) === 0;

      let sInfluence = 0, dx = 0, dy = 0, dz = 0, dist = 1e6;

      if (heavyTick) {
        tmpV.set(x, y, z);
        tmpNdc.copy(tmpV).project(camera);
        const screenDist = Math.hypot(tmpNdc.x - mouseNdc.x, tmpNdc.y - mouseNdc.y);
        sInfluence = Math.max(0, 1 - Math.min(screenDist / params.cursorScreenRadius, 1));

        // target world at cursor (active) or at depth (idle)
        if (active) tmpTargetWorld.copy(targetCursor);
        else tmpTargetWorld.set(mouseNdc.x, mouseNdc.y, tmpNdc.z).unproject(camera);

        // ring offset to avoid stacking
        const phase = orbitPhases[i];
        tmpV.set(tmpTargetWorld.x - x, tmpTargetWorld.y - y, tmpTargetWorld.z - z);

        tmpTangent.crossVectors(tmpCamDir, tmpV);
        const tMag = tmpTangent.length() + 1e-6;
        tmpTangent.divideScalar(tMag);

        tmpBin.crossVectors(tmpTangent, tmpV);
        const bMag = tmpBin.length() + 1e-6;
        tmpBin.divideScalar(bMag);

        let orbitRadius = params.radius * 0.008 * (0.6 + 0.8 * sInfluence * sInfluence);
        orbitRadius *= orbitScales[i];

        const offX = tmpTangent.x * Math.cos(phase) * orbitRadius + tmpBin.x * Math.sin(phase) * orbitRadius;
        const offY = tmpTangent.y * Math.cos(phase) * orbitRadius + tmpBin.y * Math.sin(phase) * orbitRadius;
        const offZ = tmpTangent.z * Math.cos(phase) * orbitRadius + tmpBin.z * Math.sin(phase) * orbitRadius;

        let tx = tmpTargetWorld.x + offX;
        let ty = tmpTargetWorld.y + offY;
        let tz = tmpTargetWorld.z + offZ;

        if (active) {
          const a = params.activeAttractOffset;
          tx = tmpTargetWorld.x + offX * a;
          ty = tmpTargetWorld.y + offY * a;
          tz = tmpTargetWorld.z + offZ * a;
        }

        dx = tx - x; dy = ty - y; dz = tz - z;
        dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;

        orbitPhases[i] = phase + 0.014 * (0.8 + sInfluence * 1.2);

        if (active) sInfluence = 1.0; // global influence while down
      } else {
        // cheap idle wander
        vx += (Math.random() - 0.5) * params.noiseStrength;
        vy += (Math.random() - 0.5) * params.noiseStrength;
        vz += (Math.random() - 0.5) * params.noiseStrength;
      }

      // pull + swirl
      if (sInfluence > 0.0005 && active) {
        const influencePow = sInfluence * sInfluence;
        const tlenSq = dist * dist;

        // tangent
        tmpV.set(dx, dy, dz);
        tmpTangent.crossVectors(tmpCamDir, tmpV);
        tmpTangent.normalize();

        const swirl = params.swirlStrength * influencePow * 0.0020;
        vx += tmpTangent.x * swirl;
        vy += tmpTangent.y * swirl;
        vz += tmpTangent.z * swirl;

        // distance falloff
        const attractRadius = params.radius * params.attractRadiusFactor;
        let distanceScale = 1.0;
        if (dist > attractRadius) {
          const excess = (dist - attractRadius) / params.radius;
          distanceScale = params.distantAttractScale / Math.pow(1 + excess * 6.0, params.distantAttractFalloff);
          distanceScale = Math.max(distanceScale, 0.0005);
        }

        const pullBase = 0.038;
        const pull = pullBase * (0.6 + 1.2 * influencePow) * (1 / (1 + tlenSq * 0.0005)) * attractStrengths[i] * distanceScale;
        vx += (dx / dist) * pull;
        vy += (dy / dist) * pull;
        vz += (dz / dist) * pull;
      } else {
        // idle tiny noise
        vx += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
        vy += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
        vz += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
      }

      // release gentle spread
      if (releaseStartTime > 0 && params.releaseStrength > 0) {
        const since = now - releaseStartTime;
        if (since < params.releaseDuration) {
          const f = 1 - (since / params.releaseDuration);
          const rx = x - releaseOrigin.x, ry = y - releaseOrigin.y, rz = z - releaseOrigin.z;
          const rdist = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-6;

          let amount = params.releaseStrength * f;
          // clamp
          amount = Math.min(amount, params.releaseMax);

          vx += (rx / rdist) * amount;
          vy += (ry / rdist) * amount;
          vz += (rz / rdist) * amount;
        } else {
          releaseStartTime = 0;
        }
      }

      // startup settle
      if ((now - appStartTime) < params.settleDuration) {
        vx *= params.startupDamping;
        vy *= params.startupDamping;
        vz *= params.startupDamping;
      }

      // damping
      vx *= params.velocityDamping;
      vy *= params.velocityDamping;
      vz *= params.velocityDamping;

      // integrate
      x += vx; y += vy; z += vz;

      // soft bound to keep tight
      const rlen = Math.sqrt(x * x + y * y + z * z) + 1e-6;
      const minR = params.radius * params.minRadiusFactor;
      const over = Math.max(0, rlen - radius);
      if (over > 0) {
        const restore = (over / radius) * params.boundaryForce;
        x -= (x / rlen) * restore;
        y -= (y / rlen) * restore;
        z -= (z / rlen) * restore;
      }
      // no forced outward from minR -> keeps mass compact

      // store back
      positions[idx] = x; positions[idx + 1] = y; positions[idx + 2] = z;
      velocitiesVec[idx] = vx; velocitiesVec[idx + 1] = vy; velocitiesVec[idx + 2] = vz;
    }

    posAttr.needsUpdate = true;

    // update core (similar but stronger)
    if (coreSystem && coreCount > 0) {
      const corePosAttr = coreSystem.geometry.attributes.position;
      const cpos = corePosAttr.array;

      for (let i = 0; i < coreCount; i++) {
        const idx = i * 3;
        let x = cpos[idx], y = cpos[idx + 1], z = cpos[idx + 2];
        let vx = coreVelArr[idx], vy = coreVelArr[idx + 1], vz = coreVelArr[idx + 2];

        tmpV.set(x, y, z);
        tmpNdc.copy(tmpV).project(camera);
        const screenDist = Math.hypot(tmpNdc.x - mouseNdc.x, tmpNdc.y - mouseNdc.y);
        let influence = Math.max(0, 1 - Math.min(screenDist / (params.cursorScreenRadius * 1.1), 1));
        if (attractionActive) influence = 1.0;

        if (attractionActive && influence > 0.0005) {
          tmpTargetWorld.copy(targetCursor);

          const dx = tmpTargetWorld.x - x, dy = tmpTargetWorld.y - y, dz = tmpTargetWorld.z - z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;

          // keep small ring so they don't stack
          const phase = coreOrbitPhases[i];
          tmpV.set(dx, dy, dz);
          tmpTangent.crossVectors(tmpCamDir, tmpV).normalize();
          tmpBin.crossVectors(tmpTangent, tmpV).normalize();

          let orbitRadius = params.radius * 0.010 * (0.5 + 0.7 * influence);
          orbitRadius *= coreOrbitScales[i];

          const offX = tmpTangent.x * Math.cos(phase) * orbitRadius + tmpBin.x * Math.sin(phase) * orbitRadius;
          const offY = tmpTangent.y * Math.cos(phase) * orbitRadius + tmpBin.y * Math.sin(phase) * orbitRadius;
          const offZ = tmpTangent.z * Math.cos(phase) * orbitRadius + tmpBin.z * Math.sin(phase) * orbitRadius;

          const a = params.coreActiveAttractOffset;
          const tx = tmpTargetWorld.x + offX * a;
          const ty = tmpTargetWorld.y + offY * a;
          const tz = tmpTargetWorld.z + offZ * a;

          const ddx = tx - x, ddy = ty - y, ddz = tz - z;
          const ddist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) + 1e-6;

          const cpull = 0.055 * influence * influence * coreAttractStrengths[i];
          vx += (ddx / ddist) * cpull;
          vy += (ddy / ddist) * cpull;
          vz += (ddz / ddist) * cpull;

          const sw = params.swirlStrength * influence * 0.0008;
          vx += tmpTangent.x * sw;
          vy += tmpTangent.y * sw;
          vz += tmpTangent.z * sw;

          coreOrbitPhases[i] = phase + 0.012 * (0.8 + influence * 1.1);
        } else {
          vx += (Math.random() - 0.5) * (params.noiseStrength * 1.8);
          vy += (Math.random() - 0.5) * (params.noiseStrength * 1.8);
          vz += (Math.random() - 0.5) * (params.noiseStrength * 1.8);
        }

        // gentle release for cores too
        if (releaseStartTime > 0 && params.releaseStrength > 0) {
          const since = now - releaseStartTime;
          if (since < params.releaseDuration) {
            const f = 1 - (since / params.releaseDuration);
            const rx = x - releaseOrigin.x, ry = y - releaseOrigin.y, rz = z - releaseOrigin.z;
            const rdist = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-6;
            let amount = params.releaseStrength * 1.2 * f;
            amount = Math.min(amount, params.releaseMax);
            vx += (rx / rdist) * amount;
            vy += (ry / rdist) * amount;
            vz += (rz / rdist) * amount;
          }
        }

        vx *= Math.max(0.9, params.velocityDamping - 0.01);
        vy *= Math.max(0.9, params.velocityDamping - 0.01);
        vz *= Math.max(0.9, params.velocityDamping - 0.01);

        x += vx; y += vy; z += vz;

        // soft bound
        const rlen = Math.sqrt(x * x + y * y + z * z) + 1e-6;
        const over = Math.max(0, rlen - params.radius);
        if (over > 0) {
          const restore = (over / params.radius) * (params.boundaryForce * 1.1);
          x -= (x / rlen) * restore;
          y -= (y / rlen) * restore;
          z -= (z / rlen) * restore;
        }

        cpos[idx] = x; cpos[idx + 1] = y; cpos[idx + 2] = z;
        coreVelArr[idx] = vx; coreVelArr[idx + 1] = vy; coreVelArr[idx + 2] = vz;
      }

      corePosAttr.needsUpdate = true;
    }

    renderer.render(scene, camera);
    frameCount++;
  }

  // ---------- Start ----------
  function start() {
    appStartTime = performance.now();
    detectQuality();
    init();
    createParticles();
    animate();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
