/* =========================================================
   NOIR PARTICLES — Webflow v4.1 (based on your reference)
   - Canvas: <canvas id="bg"></canvas>
   - Start: noir comet (mass on one side + tail), clean canvas
   - Background stars OFF
   - Click/drag: strong attraction + swirl
   - Release: gentle spread, NO zoom vibes
   - Particles slightly bigger
========================================================= */

(() => {
  // ---------- Guards ----------
  if (typeof THREE === "undefined") {
    console.error("[NoirV4.1] THREE not loaded. Load three.min.js first.");
    return;
  }
  const canvas = document.getElementById("bg");
  if (!canvas) {
    console.error("[NoirV4.1] canvas #bg not found. Add <canvas id='bg'></canvas>.");
    return;
  }

  console.log("[NoirV4.1] loaded");

  // ---------- Globals ----------
  let scene, camera, renderer;
  let particleSystem, coreSystem;
  let corePositionsArr, coreVelArr;
  let coreCount = 0;

  // ---------- Params (tuned for your look) ----------
  const params = {
    // counts
    particleCount: 32000,
    coreCount: 10500,

    // scene
    radius: 230,
    baseSize: 1.75,          // ✅ bigger dots (was ~1.2)
    sizeAttenuation: true,

    // camera
    cameraRadius: 320,
    cameraHeight: 190,
    cameraZoom: 1.0,

    // click attraction
    cursorAttractionBase: 0.30,
    cursorScreenRadius: 0.20,
    cursorLerp: 0.06,

    // motion
    swirlStrength: 0.20,
    noiseStrength: 0.00038,
    velocityDamping: 0.987,

    // per-particle variability
    attractStrengthMin: 0.80,
    attractStrengthMax: 1.45,
    orbitScaleMin: 0.65,
    orbitScaleMax: 1.35,

    // falloff
    attractRadiusFactor: 0.30,
    distantAttractScale: 0.055,
    distantAttractFalloff: 1.8,

    // release (pointer up)
    // ✅ suave, sin explosión / sin “zoom vibes”
    releaseStrength: 0.018,
    releaseDuration: 1300,
    releaseMax: 0.09,

    // boundaries
    boundaryForce: 0.016,
    boundaryMargin: 0.10,
    minCameraDistanceFactor: 0.95,

    // performance/quality
    quality: "auto",
    minParticleScale: 0.20,
    maxParticleCount: 36000,
    idleHeavySkipFrames: 6,

    // fps
    activeFrameInterval: 16,
    idleFrameInterval: 18,
    hiddenFrameInterval: 220,
    postReleaseActiveMs: 1600,

    // startup
    startupGraceMs: 700,
    settleDuration: 1200,
    startupDamping: 0.94,

    // ✅ IMPORTANT: clean canvas
    showBackgroundParticles: false, // NO background dots
    starFraction: 0.0,              // force off
    clusterCount: 18,
    clusterFraction: 0.16,
    clusterRadiusFactor: 0.14,

    // comet bias (match your image)
    cometHeadX: 175,       // mass sits on +X side
    cometTailLen: 520,     // tail length
    cometTailY: -0.06,     // slight downward tail
    cometTailThickness: 0.22,

    // idle cohesion (keeps mass together when not clicking)
    idleCohesion: 0.0011,  // gentle pull to comet head
    idleCohesionFalloff: 0.0000024
  };

  // ---------- State ----------
  let velocities;          // per-particle scalar (kept for compatibility)
  let velocitiesVec;       // per-particle xyz
  let orbitPhases;
  let coreOrbitPhases;
  let attractStrengths;
  let orbitScales;
  let coreAttractStrengths;
  let coreOrbitScales;

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
  function detectQuality() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const area = w * h;
    const dpr = window.devicePixelRatio || 1;
    const isMobile =
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.max(w, h) < 900;

    if (params.quality === "auto") {
      if (isMobile || dpr > 2 || area < 800 * 600) params.quality = "low";
      else if (dpr > 1.4 || area < 1280 * 720) params.quality = "medium";
      else params.quality = "high";
    }
  }

  function setRendererSize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const area = w * h;
    const smallCanvas = area < 800 * 220;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallCanvas ? 1 : 1.5));
    renderer.setSize(w, h, false);
  }

  function makeSpriteTexture() {
    const sprite = document.createElement("canvas");
    const spriteSize = params.quality === "low" ? 24 : 48;
    sprite.width = spriteSize;
    sprite.height = spriteSize;
    const ctx = sprite.getContext("2d");
    ctx.clearRect(0, 0, spriteSize, spriteSize);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(spriteSize / 2, spriteSize / 2, Math.floor(spriteSize * 0.44), 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(sprite);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  // reusable temps (avoid GC)
  const tmpV = new THREE.Vector3();
  const tmpNdc = new THREE.Vector3();
  const tmpTargetWorld = new THREE.Vector3();
  const tmpCamDir = new THREE.Vector3();
  const tmpTangent = new THREE.Vector3();
  const tmpBin = new THREE.Vector3();

  // ---------- Init ----------
  function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);

    params.cameraRadius = Math.max(params.cameraRadius, params.radius * 1.2);
    camera.position.set(0, params.cameraHeight, params.cameraRadius * (params.cameraZoom || 1));

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    if (typeof THREE.SRGBColorSpace !== "undefined") renderer.outputColorSpace = THREE.SRGBColorSpace;

    setRendererSize();

    raycaster = new THREE.Raycaster();
    plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

    // Pause when out of view
    try {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isInViewport = entry.isIntersecting && entry.intersectionRatio > 0;
          });
        },
        { threshold: 0.01 }
      );
      io.observe(canvas);
    } catch (e) {
      isInViewport = true;
    }

    window.addEventListener("resize", onWindowResize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
  }

  // ---------- Create particles (COMET, no background) ----------
  function createParticles() {
    const rect = renderer.domElement.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);

    const screenScale = Math.min(1, Math.max(params.minParticleScale, area / (1280 * 360)));
    let q = 1.0;
    if (params.quality === "low") q = 0.34;
    if (params.quality === "medium") q = 0.60;
    if (params.quality === "high") q = 1.0;

    // background particles OFF
    let count = 0;
    if (params.showBackgroundParticles) {
      count = Math.max(256, Math.round(params.particleCount * screenScale * q));
      count = Math.min(count, params.maxParticleCount);
    }
    particleSystemEffectiveCount = count;

    // core count always on
    const coreCountLocalUse = Math.max(48, Math.round(params.coreCount * screenScale * q));
    coreCount = coreCountLocalUse;

    // clusters biased into a comet (head at +X, tail to -X)
    const clusters = [];
    for (let i = 0; i < params.clusterCount; i++) {
      const t = Math.pow(Math.random(), 0.6);
      const headX = params.cometHeadX;
      const tail = t * (params.radius * 1.35);

      const cx = headX - tail;
      const cy = (Math.random() - 0.5) * params.radius * params.cometTailThickness * (0.6 + t);
      const cz = (Math.random() - 0.5) * params.radius * (params.cometTailThickness * 0.8) * (0.6 + t);

      clusters.push(new THREE.Vector3(cx, cy, cz));
    }

    // ---- Background system (disabled by default) ----
    if (count > 0) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);

      velocities = new Float32Array(count);
      velocitiesVec = new Float32Array(count * 3);

      orbitPhases = new Float32Array(count);
      attractStrengths = new Float32Array(count);
      orbitScales = new Float32Array(count);

      for (let i = 0; i < count; i++) orbitPhases[i] = Math.random() * Math.PI * 2;

      const radius = params.radius;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Put “background” particles near the comet too (not across whole screen)
        const c = clusters[Math.floor(Math.random() * clusters.length)];
        const t = Math.pow(Math.random(), 0.65);
        const along = t * params.cometTailLen;

        const spread = (0.15 + t) * radius * params.cometTailThickness;
        const x = params.cometHeadX - along + (Math.random() - 0.5) * spread * 0.35;
        const y = c.y + (Math.random() - 0.5) * spread + along * params.cometTailY;
        const z = c.z + (Math.random() - 0.5) * spread * 0.45;

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;

        colors[i3] = 1; colors[i3 + 1] = 1; colors[i3 + 2] = 1;

        velocities[i] = 0.02;
        velocitiesVec[i3] = 0;
        velocitiesVec[i3 + 1] = 0;
        velocitiesVec[i3 + 2] = 0;

        attractStrengths[i] =
          params.attractStrengthMin + Math.random() * (params.attractStrengthMax - params.attractStrengthMin);
        orbitScales[i] =
          params.orbitScaleMin + Math.random() * (params.orbitScaleMax - params.orbitScaleMin);
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const spriteTex = makeSpriteTexture();

      const mat = new THREE.PointsMaterial({
        size: params.baseSize,
        sizeAttenuation: params.sizeAttenuation,
        map: spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      mat.alphaTest = 0.05;

      particleSystem = new THREE.Points(geometry, mat);
      particleSystem.frustumCulled = false;
      scene.add(particleSystem);
    } else {
      // still need arrays to exist for animate safety
      velocitiesVec = new Float32Array(0);
      orbitPhases = new Float32Array(0);
      attractStrengths = new Float32Array(0);
      orbitScales = new Float32Array(0);
    }

    // ---- Core system (main look) ----
    const corePositions = new Float32Array(coreCountLocalUse * 3);
    const coreColors = new Float32Array(coreCountLocalUse * 3);
    const coreVel = new Float32Array(coreCountLocalUse * 3);

    coreOrbitPhases = new Float32Array(coreCountLocalUse);
    coreAttractStrengths = new Float32Array(coreCountLocalUse);
    coreOrbitScales = new Float32Array(coreCountLocalUse);

    for (let i = 0; i < coreCountLocalUse; i++) {
      const i3 = i * 3;

      // strongly bias toward head + early tail (this is your image)
      const t = Math.pow(Math.random(), 0.55);
      const along = t * params.cometTailLen;

      const spread = (0.10 + t) * params.radius * params.cometTailThickness;

      corePositions[i3] = params.cometHeadX - along + (Math.random() - 0.5) * spread * 0.30;
      corePositions[i3 + 1] = (Math.random() - 0.5) * spread + along * params.cometTailY;
      corePositions[i3 + 2] = (Math.random() - 0.5) * spread * 0.42;

      coreColors[i3] = 1; coreColors[i3 + 1] = 1; coreColors[i3 + 2] = 1;

      coreVel[i3] = 0; coreVel[i3 + 1] = 0; coreVel[i3 + 2] = 0;

      coreOrbitPhases[i] = Math.random() * Math.PI * 2;
      coreAttractStrengths[i] =
        params.attractStrengthMin + Math.random() * (params.attractStrengthMax - params.attractStrengthMin);
      coreOrbitScales[i] =
        params.orbitScaleMin + Math.random() * (params.orbitScaleMax - params.orbitScaleMin);
    }

    const spriteTex = makeSpriteTexture();

    const coreGeom = new THREE.BufferGeometry();
    coreGeom.setAttribute("position", new THREE.BufferAttribute(corePositions, 3));
    coreGeom.setAttribute("color", new THREE.BufferAttribute(coreColors, 3));

    const coreMat = new THREE.PointsMaterial({
      size: params.baseSize * 1.20,
      sizeAttenuation: params.sizeAttenuation,
      map: spriteTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    coreMat.alphaTest = 0.05;

    coreSystem = new THREE.Points(coreGeom, coreMat);
    coreSystem.frustumCulled = false;
    scene.add(coreSystem);

    corePositionsArr = corePositions;
    coreVelArr = coreVel;
  }

  // ---------- Animation ----------
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();

    // adaptive frame interval
    let interval = params.idleFrameInterval;
    if (document.hidden || !isInViewport) interval = params.hiddenFrameInterval;
    else {
      const sinceRelease = releaseStartTime > 0 ? now - releaseStartTime : Infinity;
      const keepActive = attractionActive || sinceRelease < params.postReleaseActiveMs;
      interval = keepActive ? params.activeFrameInterval : params.idleFrameInterval;
    }
    if (now - lastRenderTime < interval) return;
    lastRenderTime = now;

    // camera orbit (subtle)
    cameraAngle += 0.00006;
    const cr = params.cameraRadius * (params.cameraZoom || 1);
    camera.position.x = Math.sin(cameraAngle) * cr;
    camera.position.z = Math.cos(cameraAngle) * cr;
    camera.position.y = params.cameraHeight * (params.cameraZoom || 1);
    camera.lookAt(scene.position);

    // project cursor
    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);

    // subtle wobble
    targetCursor.x += Math.sin(now * 0.0004) * (params.radius * 0.010);
    targetCursor.y += Math.cos(now * 0.0006) * (params.radius * 0.010);

    cursor3D.lerp(targetCursor, params.cursorLerp);
    camera.getWorldDirection(tmpCamDir);

    const active = attractionActive;

    // ---------- Background system (usually off) ----------
    if (particleSystem && particleSystemEffectiveCount > 0) {
      const posAttr = particleSystem.geometry.attributes.position;
      const positions = posAttr.array;
      const count = particleSystemEffectiveCount;
      const radius = params.radius;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        let x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];
        let vx = velocitiesVec[idx], vy = velocitiesVec[idx + 1], vz = velocitiesVec[idx + 2];

        const heavySkip = active ? 1 : (params.idleHeavySkipFrames || 3);
        const heavyTick = (frameCount % heavySkip) === 0;

        let sInfluence = 0.0;
        let dx = 0, dy = 0, dz = 0;
        let dist = 1e6;

        if (heavyTick) {
          tmpV.set(x, y, z);
          tmpNdc.copy(tmpV).project(camera);

          const screenDist = Math.hypot(tmpNdc.x - mouseNdc.x, tmpNdc.y - mouseNdc.y);
          sInfluence = Math.max(0, 1 - Math.min(screenDist / params.cursorScreenRadius, 1));

          if (active) tmpTargetWorld.copy(targetCursor);
          else tmpTargetWorld.set(mouseNdc.x, mouseNdc.y, tmpNdc.z).unproject(camera);

          const phase = orbitPhases[i] || 0;
          tmpV.set(tmpTargetWorld.x - x, tmpTargetWorld.y - y, tmpTargetWorld.z - z);

          tmpTangent.crossVectors(tmpCamDir, tmpV);
          const tMag = tmpTangent.length() + 1e-6;
          tmpTangent.divideScalar(tMag);

          tmpBin.crossVectors(tmpTangent, tmpV);
          const bMag = tmpBin.length() + 1e-6;
          tmpBin.divideScalar(bMag);

          let orbitRadius = params.radius * 0.008 * (0.6 + 0.8 * sInfluence * sInfluence);
          orbitRadius *= orbitScales[i] || 1;

          const cosP = Math.cos(phase), sinP = Math.sin(phase);
          const offX = tmpTangent.x * cosP * orbitRadius + tmpBin.x * sinP * orbitRadius;
          const offY = tmpTangent.y * cosP * orbitRadius + tmpBin.y * sinP * orbitRadius;
          const offZ = tmpTangent.z * cosP * orbitRadius + tmpBin.z * sinP * orbitRadius;

          let tx = tmpTargetWorld.x + offX;
          let ty = tmpTargetWorld.y + offY;
          let tz = tmpTargetWorld.z + offZ;

          if (active) {
            const a = 0.30;
            tx = tmpTargetWorld.x + offX * a;
            ty = tmpTargetWorld.y + offY * a;
            tz = tmpTargetWorld.z + offZ * a;
            sInfluence = 1.0;
          }

          dx = tx - x; dy = ty - y; dz = tz - z;
          dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;

          orbitPhases[i] = phase + 0.014 * (0.8 + sInfluence * 1.2);
        }

        // idle cohesion (keeps it “comet”, not scattered)
        if (!active) {
          const cx = params.cometHeadX, cy = 0, cz = 0;
          const cdx = cx - x, cdy = cy - y, cdz = cz - z;
          const clen2 = (cdx * cdx + cdy * cdy + cdz * cdz) + 1e-6;
          const clen = Math.sqrt(clen2);
          const fall = 1 / (1 + clen2 * params.idleCohesionFalloff);
          const coh = params.idleCohesion * fall;
          vx += (cdx / clen) * coh;
          vy += (cdy / clen) * coh;
          vz += (cdz / clen) * coh;
        }

        // click attraction
        if (active) {
          const influencePow = 1.0;
          const tlenSq = dist * dist;

          tmpV.set(dx, dy, dz);
          tmpTangent.crossVectors(tmpCamDir, tmpV);
          tmpTangent.normalize();

          const swirl = params.swirlStrength * influencePow * 0.0022;
          vx += tmpTangent.x * swirl;
          vy += tmpTangent.y * swirl;
          vz += tmpTangent.z * swirl;

          const attractRadius = params.radius * (params.attractRadiusFactor || 0.28);
          let distanceScale = 1.0;
          if (dist > attractRadius) {
            const excess = (dist - attractRadius) / params.radius;
            distanceScale =
              params.distantAttractScale / Math.pow(1 + excess * 6.0, params.distantAttractFalloff);
            distanceScale = Math.max(distanceScale, 0.0005);
          }

          const pullBase = 0.038;
          const pull =
            pullBase * (1 / (1 + tlenSq * 0.0005)) * (attractStrengths[i] || 1) * distanceScale;

          vx += (dx / dist) * pull;
          vy += (dy / dist) * pull;
          vz += (dz / dist) * pull;
        } else {
          // idle noise (breathing)
          vx += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
          vy += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
          vz += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
        }

        // release
        if (releaseStartTime > 0 && params.releaseStrength > 0) {
          if ((releaseStartTime - appStartTime) <= params.startupGraceMs) {
            releaseStartTime = 0;
          } else {
            const since = now - releaseStartTime;
            if (since < params.releaseDuration) {
              const f = 1 - since / params.releaseDuration;
              const rx = x - releaseOrigin.x, ry = y - releaseOrigin.y, rz = z - releaseOrigin.z;
              const rdist = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-6;

              let amount = params.releaseStrength * f;
              if (amount > params.releaseMax) amount = params.releaseMax;

              vx += (rx / rdist) * amount;
              vy += (ry / rdist) * amount;
              vz += (rz / rdist) * amount;
            } else {
              releaseStartTime = 0;
            }
          }
        }

        // startup damping
        if (now - appStartTime < params.settleDuration) {
          vx *= params.startupDamping;
          vy *= params.startupDamping;
          vz *= params.startupDamping;
        }

        // global damping
        vx *= params.velocityDamping;
        vy *= params.velocityDamping;
        vz *= params.velocityDamping;

        x += vx; y += vy; z += vz;

        // soft bounds
        const rlen = Math.sqrt(x * x + y * y + z * z) + 1e-6;
        const over = Math.max(0, rlen - radius);
        if (over > 0) {
          const restore = (over / radius) * params.boundaryForce;
          x -= (x / rlen) * restore;
          y -= (y / rlen) * restore;
          z -= (z / rlen) * restore;
        }

        positions[idx] = x; positions[idx + 1] = y; positions[idx + 2] = z;
        velocitiesVec[idx] = vx; velocitiesVec[idx + 1] = vy; velocitiesVec[idx + 2] = vz;
      }

      posAttr.needsUpdate = true;
    }

    // ---------- Core system (main look) ----------
    if (coreSystem && coreCount > 0) {
      const corePosAttr = coreSystem.geometry.attributes.position;
      const cpos = corePosAttr.array;

      for (let i = 0; i < coreCount; i++) {
        const idx = i * 3;
        let x = cpos[idx], y = cpos[idx + 1], z = cpos[idx + 2];
        let vx = coreVelArr[idx], vy = coreVelArr[idx + 1], vz = coreVelArr[idx + 2];

        // on click: strong attraction for cores
        if (active) {
          tmpV.set(x, y, z);
          tmpNdc.copy(tmpV).project(camera);

          tmpTargetWorld.copy(targetCursor);

          const phase = coreOrbitPhases[i] || 0;
          const dx = tmpTargetWorld.x - x, dy = tmpTargetWorld.y - y, dz = tmpTargetWorld.z - z;

          tmpV.set(dx, dy, dz);
          tmpTangent.crossVectors(tmpCamDir, tmpV);
          tmpTangent.normalize();
          tmpBin.crossVectors(tmpTangent, tmpV);
          tmpBin.normalize();

          let orbitRadius = params.radius * 0.010 * 0.9;
          orbitRadius *= coreOrbitScales[i] || 1;

          const cosP = Math.cos(phase), sinP = Math.sin(phase);
          const offX = tmpTangent.x * cosP * orbitRadius + tmpBin.x * sinP * orbitRadius;
          const offY = tmpTangent.y * cosP * orbitRadius + tmpBin.y * sinP * orbitRadius;
          const offZ = tmpTangent.z * cosP * orbitRadius + tmpBin.z * sinP * orbitRadius;

          const a = 0.22; // tighter for core
          const tx = tmpTargetWorld.x + offX * a;
          const ty = tmpTargetWorld.y + offY * a;
          const tz = tmpTargetWorld.z + offZ * a;

          const ddx = tx - x, ddy = ty - y, ddz = tz - z;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) + 1e-6;

          const pull = 0.055 * (coreAttractStrengths[i] || 1);
          vx += (ddx / dist) * pull;
          vy += (ddy / dist) * pull;
          vz += (ddz / dist) * pull;

          const sw = params.swirlStrength * 0.0009;
          vx += tmpTangent.x * sw;
          vy += tmpTangent.y * sw;
          vz += tmpTangent.z * sw;

          coreOrbitPhases[i] = phase + 0.012;
        } else {
          // idle cohesion back to comet head
          const cx = params.cometHeadX, cy = 0, cz = 0;
          const cdx = cx - x, cdy = cy - y, cdz = cz - z;
          const clen2 = (cdx * cdx + cdy * cdy + cdz * cdz) + 1e-6;
          const clen = Math.sqrt(clen2);
          const fall = 1 / (1 + clen2 * params.idleCohesionFalloff);
          const coh = (params.idleCohesion * 1.15) * fall;

          vx += (cdx / clen) * coh;
          vy += (cdy / clen) * coh;
          vz += (cdz / clen) * coh;

          vx += (Math.random() - 0.5) * (params.noiseStrength * 1.6);
          vy += (Math.random() - 0.5) * (params.noiseStrength * 1.6);
          vz += (Math.random() - 0.5) * (params.noiseStrength * 1.6);
        }

        // release (core)
        if (releaseStartTime > 0 && params.releaseStrength > 0) {
          const since = now - releaseStartTime;
          if (since < params.releaseDuration) {
            const f = 1 - since / params.releaseDuration;
            const rx = x - releaseOrigin.x, ry = y - releaseOrigin.y, rz = z - releaseOrigin.z;
            const rdist = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-6;

            let amount = params.releaseStrength * 1.2 * f;
            if (amount > params.releaseMax) amount = params.releaseMax;

            vx += (rx / rdist) * amount;
            vy += (ry / rdist) * amount;
            vz += (rz / rdist) * amount;
          }
        }

        // damping
        const damp = Math.max(0.9, params.velocityDamping - 0.01);
        vx *= damp; vy *= damp; vz *= damp;

        x += vx; y += vy; z += vz;

        // bounds
        const rlen = Math.sqrt(x * x + y * y + z * z) + 1e-6;
        const over = Math.max(0, rlen - params.radius);
        if (over > 0) {
          const restore = (over / params.radius) * (params.boundaryForce * 1.15);
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

  // ---------- Handlers ----------
  function onWindowResize() {
    setRendererSize();
  }

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
    onPointerMove(e);
    attractionActive = true;

    raycaster.setFromCamera(mouseNdc, camera);
    raycaster.ray.intersectPlane(plane, targetCursor);
    cursor3D.copy(targetCursor);
  }

  function onPointerUp() {
    attractionActive = false;

    releaseStartTime = performance.now();
    releaseOrigin.copy(cursor3D);
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
