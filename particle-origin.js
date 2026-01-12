
  // Run after DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    // Globals
    let scene, camera, renderer;
    let particleSystem;
    let coreSystem;
    let corePositionsArr, coreVelArr;
    let coreCount = 0;
    let params = {
      particleCount: 32000,   // increased: many more dots for denser scenes
      radius: 200,            // smaller sphere radius for a more compact scene (zoomed in)
      baseSize: 1.2,          // smaller visual point size overall
      sizeAttenuation: true,  // keep perspective sizing
      cameraRadius: 240,      // distance of camera orbit (closer to zoom in)
      cameraZoom: 1.2,        // zoom multiplier applied to camera radius & height (values >1 = zoom out)
      // Cursor attraction tuning
      cursorAttractionBase: 0.28, // base attraction multiplier (reduced for slower movement)
      cursorDecayTime: 2400,     // ms for attraction to decay to min (slower decay)
      cursorMinStrength: 0.12,   // minimum relative strength when idle
      cursorLerp: 0.06,          // how fast cursor3D follows targetCursor (slower follow)
      // Fluid motion tuning
      cursorInfluenceFactor: 0.42, // fraction of radius where cursor strongly influences particles
      cursorScreenRadius: 0.18,    // screen-space radius (NDC) for cursor influence (0..~1)
      swirlStrength: 0.22,         // how strongly particles swirl around the cursor (reduced)
      noiseStrength: 0.00045,      // tiny random jitter per frame for smoother, slower motion
      velocityDamping: 0.985,      // stronger damping (lower value -> slower retained velocity)
      // Per-particle variability: control ranges for pull strength and orbit radius
      attractStrengthMin: 0.75,
      attractStrengthMax: 1.45,
      orbitScaleMin: 0.6,
      orbitScaleMax: 1.4,
      // Attraction falloff: control the radius and how slowly distant particles respond
      attractRadiusFactor: 0.28,   // fraction of scene radius within which full attraction applies
      distantAttractScale: 0.06,   // base multiplier for distant particles (very small)
      distantAttractFalloff: 1.8,  // exponent controlling falloff steepness
      // Release (after mouse up) behavior
      releaseStrength: 0.04,     // outward impulse strength applied after release (increased for stronger explosion)
      releaseDuration: 1000,       // ms duration for the release impulse to decay
      releaseMax: 0.12,            // maximum release impulse magnitude per particle (larger to allow bigger spread)
      boundaryForce: 0.018,        // restoring force multiplier when near edge
      boundaryMargin: 0.08,        // fraction of radius used as soft margin
      // Camera and view tuning
      cameraHeight: 180,           // camera Y position so it looks from above
      minCameraDistanceFactor: 0.95, // keep particles further from the camera to avoid edge sticking (increased)
      // Clustering (initial distribution)
      clusterCount: 18,            // increase cluster seed count for more variety
      clusterFraction: 0.12,       // larger fraction of particles seeded into clusters
      coreCount: 10200,              // more visible core particles so clusters remain prominent
      clusterRadiusFactor: 0.16,   // core cluster radius relative to scene radius
      // Performance / quality
      quality: 'auto',             // 'auto'|'high'|'medium'|'low' (auto will pick based on device and screen)
      minParticleScale: 0.28,      // minimum scale factor to apply on small screens or low quality
      idleHeavySkipFrames: 6,      // how many frames to skip for expensive projection when idle (larger -> lower cpu)
      maxParticleCount: 36000,     // increased cap for denser scenes (careful on very small devices)
      minParticleScale: 0.18,      // smaller minimum scale for small screens or low quality
      // Startup safety: small grace period where release impulses are ignored
      startupGraceMs: 800,         // ignore release impulses fired within this many ms after start
      settleDuration: 1200,        // ms during which motion is more heavily damped for gentle start
      initialVelocityScale: 0.36,  // scale applied to initial random velocities for subtle start
      startupDamping: 0.94,        // extra damping multiplier applied while settling
      // Initial spawn/configuration tweaks to keep particles closer to center
      initialSpawnRadiusFraction: 1.30, // fraction of radius used as max initial spawn distance (reduced for tighter core)
      velocityScalarScale: 0.18,  // scale for per-particle radial velocity scalar (reduces outward drift)
      radialDriftScale: 0.00006,  // per-frame outward drift multiplier (reduced to nearly static start)
      coreRadialStabScale: 0.0, // radial stabilization for cores (disabled to avoid collapsing toward center)
      // When actively attracting (pointer down) keep a small per-particle offset so particles don't stack
      activeAttractOffset: 0.36,   // fraction of ring offset to retain during active attraction (0 = single point)
      coreActiveAttractOffset: 0.22, // same for core particles (smaller to keep cores tighter)
      // Visual spin applied to the scene on release: small rotational impulse with decay
      releaseSpinImpulse: 0.004,   // angular velocity applied on pointer up (radians/frame)
      releaseSpinDecay: 0.94,      // per-frame decay factor applied to the spin velocity
      // Toggle scene rotation (automatic spin and release-induced spin)
      enableSceneRotation: false,  // set to true to allow subtle rotation on release
      // Header (low-power) mode — can be enabled explicitly via `data-header-mode="true"` on the canvas
      headerMode: false,                   // manual toggle for header mode
      headerModeAutoEnableArea: (800 * 200), // auto-enable header mode when canvas area is below this
      headerModeParticleCount: 1100,       // desired particle count in header mode
      headerModeMaxParticleCount: 1200,    // cap in header mode
      headerModePixelRatio: 1,             // force pixel ratio down in header mode
      headerModeFrameInterval: 60,         // ms between frames (~16fps) in header mode to conserve CPU
      headerModeInitialVelocityScale: 0.22,// gentler start in header mode
      headerModeStartupDamping: 0.90,      // stronger damping on startup in header mode
      headerModeSettleDuration: 2500,      // longer settle for very subtle start in header mode
      // Visibility toggles
      showBackgroundParticles: false,      // disable small background particles when false (only cores remain)
      // How long to keep the renderer in 'active' (high-fps) mode after releasing the mouse
      postReleaseActiveMs: 2200,  // ms to keep active FPS after pointerup (increase to keep FPS high longer)
      // Adaptive frame intervals (ms). Smaller = smoother, larger = cheaper CPU.
      activeFrameInterval: 16,     // ~60fps when interacting
      idleFrameInterval: 16,       // ~42fps when idle (increased for snappier feel)
      hiddenFrameInterval: 200,    // ~5fps when not visible
      // Isolated stars and arm weighting
      starFraction: 0.20,          // fraction of particles that are isolated stars (randomly scattered)
      armWeight: 0.35,             // chance a non-cluster/background particle follows an arm (lower -> less rows)
      // Galaxy shape parameters
      armCount: 3,                 // number of spiral arms
      armTwist: 2.4,               // how tightly arms wind (higher = more twists)
      armSpread: 0.6,              // angular spread of particles around an arm
      diskThickness: 0.12,         // relative thickness of the galactic disk
      radialFalloff: 0.7           // lower -> more concentrated core
    };
    let velocities;           // per-particle radial speed scalar
    let velocitiesVec;        // per-particle 3D velocity array (x,y,z for each particle)
    let baseVelocitiesVec;    // stored base velocities used to ramp up on startup
    let orbitPhases;          // per-particle orbit phase for attraction ring
    let coreOrbitPhases;      // per-core orbit phase
    let baseCoreVel;          // stored base core velocities for ramp-up
    let prevStartupFactor = 0; // used to ramp in base velocities incrementally
    let mouse = { x: 0, y: 0 }; // normalized -0.5..0.5 for parallax
    // Per-particle variability arrays (set in createParticles)
    let attractStrengths;     // per-particle attraction multipliers
    let orbitScales;          // per-particle orbit radius scales
    let coreAttractStrengths; // per-core attraction multipliers
    let coreOrbitScales;      // per-core orbit radius scales
    let mouseNdc = new THREE.Vector2(0, 0); // normalized device coords (-1..1) for raycasting
    let lastClickTime = 0;    // timestamp (ms) of last pointer down/up
    let attractionActive = false; // whether pointer is currently down (attraction enabled)
    let cursor3D = new THREE.Vector3(); // world-space mouse target on z=0 plane
    let targetCursor = new THREE.Vector3(); // smoothed / wobbled target
    let raycaster, plane;     // used to project mouse into world
    // Visibility and adaptive render timing (shared globals so animate() can access)
    let isInViewport = true;
    let lastRenderTime = 0;
    let cameraAngle = 0;      // for slow camera orbit
    let prevAttractionActive = false; // for debug/logging state transitions
    // Performance helpers
    let particleSystemEffectiveCount = 0; // actual count used after scaling
    let frameCount = 0; // frame counter used for frame-skipping

    // Release tracking (for outward impulse after mouse up)
    let releaseStartTime = 0;
    let releaseOrigin = new THREE.Vector3();
    // App start timestamp used for startup safety / settling
    let appStartTime = 0;
    // Scene rotation velocity (used to apply a small spin on release)
    let sceneSpinVel = 0;



    function startApp(){
      // record start time for startup safety
      appStartTime = performance.now();
      init();
      // detect device & choose quality
      detectQuality();
      createParticles();
      animate();
    }

    // Detect device capabilities and set params.quality accordingly
    function detectQuality() {
      const w = window.innerWidth, h = window.innerHeight;
      const area = w * h;
      const dpr = window.devicePixelRatio || 1;
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || Math.max(w,h) < 900;
      if (params.quality === 'auto') {
        if (isMobile || dpr > 2 || area < (800*600)) params.quality = 'low';
        else if (dpr > 1.4 || area < (1280*720)) params.quality = 'medium';
        else params.quality = 'high';
      }
      console.log('Quality:', params.quality, 'dpr:', dpr, 'area:', area);
    }

    // Wait for THREE to be available (in case it loaded asynchronously or fell back)
    if (typeof THREE === 'undefined') {
      console.log('Waiting for Three.js to load...');
      let attempts = 0;
      const waiter = setInterval(() => {
        attempts++;
        if (typeof THREE !== 'undefined') {
          clearInterval(waiter);
          console.log('Three.js is available, starting app.');
          startApp();
        } else if (attempts > 40) { // ~4 seconds
          clearInterval(waiter);
          console.error('Three.js did not load; cannot start the app. Check network or CDN.');
        }
      }, 100);
    } else {
      startApp();
    }

    // Initialize scene, camera, renderer, events
    function init() {
      // Scene
      scene = new THREE.Scene();

      // Camera (PerspectiveCamera)
      camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3000);
      // Ensure camera distance is outside particle radius for reliable visibility
      params.cameraRadius = Math.max(params.cameraRadius, params.radius * 1.2);
      // Apply zoom multiplier so the scene starts more zoomed-out if desired
      if (params.cameraZoom && params.cameraZoom > 1) {
        params.cameraRadius *= params.cameraZoom;
      }
      // Place camera above the scene so it looks from above (respect zoom on height as well)
      camera.position.set(0, params.cameraHeight * (params.cameraZoom || 1), params.cameraRadius);

      // Renderer using existing <canvas> as the target
      const canvas = document.getElementById('bg');
      renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      // Choose pixel ratio based on canvas size to reduce GPU work on small embeds
      const canvasRectInit = canvas.getBoundingClientRect();
      const canvasAreaInit = Math.max(1, canvasRectInit.width * canvasRectInit.height);
      const smallCanvasInit = canvasAreaInit < (800 * 200);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallCanvasInit ? 1 : 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);

      // Pause when the canvas is out of view to save CPU using IntersectionObserver
      try {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => { isInViewport = entry.isIntersecting && entry.intersectionRatio > 0; });
        }, {threshold: 0.01});
        io.observe(canvas);
      } catch (err) {
        // IntersectionObserver not available in some environments — fallback to always visible
        isInViewport = true;
      }

      // Header mode detection: small canvas or explicit data attribute can enable a low-power mode
      const headerRequested = (canvas && canvas.dataset && canvas.dataset.headerMode === 'true');
      const headerSmallCanvas = canvasAreaInit < params.headerModeAutoEnableArea;
      params.headerModeActive = !!(params.headerMode || headerRequested || headerSmallCanvas);
      if (params.headerModeActive) {
        // Conservative overrides for header embeds
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.headerModePixelRatio));
        params.maxParticleCount = Math.min(params.maxParticleCount, params.headerModeMaxParticleCount);
        params.initialVelocityScale = Math.min(params.initialVelocityScale, params.headerModeInitialVelocityScale);
        params.startupDamping = Math.min(params.startupDamping, params.headerModeStartupDamping);
        params.settleDuration = Math.max(params.settleDuration, params.headerModeSettleDuration);
        params.activeFrameInterval = Math.max(params.activeFrameInterval, params.headerModeFrameInterval);
        params.idleFrameInterval = Math.max(params.idleFrameInterval, params.headerModeFrameInterval);
        params.coreCount = Math.min(params.coreCount, Math.max(16, Math.round(params.headerModeParticleCount * 0.06)));
        params.baseSize *= 0.86; // slightly smaller dots in header mode
        // single informative log is ok for debugging
        console.log('Header mode active — conserving CPU and particle count.');
      }
      // Use new property for color space (r152+): replace deprecated outputEncoding
      if (typeof THREE.SRGBColorSpace !== 'undefined') {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else {
        // fallback for older three.js versions
        renderer.outputEncoding = THREE.sRGBEncoding;
      }

      // Raycaster and plane at z=0 for projecting mouse to world coordinates
      raycaster = new THREE.Raycaster();
      plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

      // Performance: viewport visibility and adaptive render timing (globals are declared outside init)

      // Debug logging: verify Three and WebGL context
      try {
        const gl = renderer.getContext();
        console.log('Three.js', THREE.REVISION ? 'r'+THREE.REVISION : '(revision unknown)', 'WebGL context:', !!gl);
        if (!gl) console.warn('WebGL context not available. The scene may not render.');
      } catch (err) {
        console.warn('Unable to access WebGL context:', err);
      }

      // Events
      window.addEventListener('resize', onWindowResize);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length) {
          onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        }
      }, { passive: true });

      // Pause or slow down when the page is not visible to save CPU
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          console.log('Document hidden: throttling animation');
        } else {
          console.log('Document visible: resuming animation');
        }
      });
    }

    // Create particle geometry, colors, clusters, and materials
    function createParticles() {
      // adapt particle counts based on quality selection and screen size
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const area = Math.max(1, canvasRect.width * canvasRect.height);
      const screenScale = Math.min(1, Math.max(params.minParticleScale, area / (1280 * 360)));
      let qualityFactor = 1.0;
      if (params.quality === 'low') qualityFactor = 0.34;
      if (params.quality === 'medium') qualityFactor = 0.60;
      if (params.quality === 'high') qualityFactor = 1.0;
      let count = Math.max(256, Math.round(params.particleCount * screenScale * qualityFactor));
      // cap count so small embeds don't get overwhelmed
      count = Math.min(count, params.maxParticleCount);
      // Allow disabling background particles entirely (useful for minimal header embeds)
      if (!params.showBackgroundParticles) {
        count = 0;
      }
      const radius = params.radius; // scene radius unchanged
      // reduce core count likewise
      const coreCountLocalUse = Math.max(32, Math.round(params.coreCount * screenScale * qualityFactor));

      // Prepare clusters to seed dense regions
      const clusters = [];
      for (let i = 0; i < params.clusterCount; i++) {
        // place cluster center somewhere inside 60% of the radius
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2 * Math.PI;
        const phi = Math.acos(2 * v - 1);
        const r = (Math.random() * 0.6) * radius * params.initialSpawnRadiusFraction;
        const cx = r * Math.sin(phi) * Math.cos(theta);
        const cy = r * Math.sin(phi) * Math.sin(theta);
        const cz = r * Math.cos(phi);
        clusters.push(new THREE.Vector3(cx, cy, cz));
      }

      // Main (background) geometry
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      velocities = new Float32Array(count);
      velocitiesVec = new Float32Array(count * 3); // per-particle velocity xyz
      // per-particle orbit phases used to offset attraction targets so particles circle the cursor
      orbitPhases = new Float32Array(count);
      for (let ph=0; ph<count; ph++) orbitPhases[ph] = Math.random() * Math.PI * 2.0;
      // per-particle variability arrays
      attractStrengths = new Float32Array(count);
      orbitScales = new Float32Array(count);
      // remember the effective counts for later (used by the animation loop and UI)
      particleSystemEffectiveCount = count;
      coreCount = coreCountLocalUse;

      // Fill attributes with a mix of random and cluster-seeded particles
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Decide distribution type: cluster, isolated star, or random background
        const roll = Math.random();
        const starCutoff = params.clusterFraction;
        const isolatedCutoff = starCutoff + params.starFraction;

        if (roll < starCutoff) {
          // Clustered particle near an existing cluster center (keep clusters for interest)
          const c = clusters[Math.floor(Math.random() * clusters.length)];
          const cr = (Math.random() * params.clusterRadiusFactor) * radius;
          const ang = Math.random() * Math.PI * 2;
          const pr = Math.pow(Math.random(), 0.5) * cr; // bias toward cluster center
          const rx = Math.cos(ang) * pr;
          const rz = Math.sin(ang) * pr;
          const ry = (Math.random() - 0.5) * (params.diskThickness * cr);
          positions[i3] = c.x + rx;
          positions[i3 + 1] = c.y + ry;
          positions[i3 + 2] = c.z + rz;

          velocities[i] = 0.05 + Math.random() * 0.10;
          velocities[i] *= params.velocityScalarScale;
          velocitiesVec[i3] = (positions[i3] - c.x) * 0.002 + (Math.random() - 0.5) * 0.02;
          velocitiesVec[i3 + 1] = (positions[i3 + 1] - c.y) * 0.002 + (Math.random() - 0.5) * 0.02;
          velocitiesVec[i3 + 2] = (positions[i3 + 2] - c.z) * 0.002 + (Math.random() - 0.5) * 0.02;
          // per-particle attract strength and orbit scale (clustered particles tend to be slightly stronger and tighter)
          attractStrengths[i] = params.attractStrengthMin + Math.random() * (params.attractStrengthMax - params.attractStrengthMin) * (0.95 + Math.random() * 0.15);
          orbitScales[i] = params.orbitScaleMin + Math.random() * (params.orbitScaleMax - params.orbitScaleMin) * (0.85 + Math.random() * 0.3);

        } else if (roll < isolatedCutoff) {
          // Isolated star: random location inside the scene radius (3D scattered)
          const r = Math.pow(Math.random(), params.radialFalloff) * radius * params.initialSpawnRadiusFraction;
          const theta = Math.random() * 2 * Math.PI;
          const phi = Math.acos(2 * Math.random() - 1);
          positions[i3] = r * Math.sin(phi) * Math.cos(theta);
          positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          positions[i3 + 2] = r * Math.cos(phi);

          velocities[i] = 0.01 + Math.random() * 0.06;
          velocities[i] *= params.velocityScalarScale;
          velocitiesVec[i3] = (Math.random() - 0.5) * 0.04;
          velocitiesVec[i3 + 1] = (Math.random() - 0.5) * 0.03;
          velocitiesVec[i3 + 2] = (Math.random() - 0.5) * 0.04;

        } else {
          // Fully random background particle (scattered across the sphere)
          const r = Math.pow(Math.random(), params.radialFalloff) * radius * params.initialSpawnRadiusFraction;
          const theta = Math.random() * 2 * Math.PI;
          const phi = Math.acos(2 * Math.random() - 1);
          positions[i3] = r * Math.sin(phi) * Math.cos(theta) + (Math.random() - 0.5) * r * 0.02;
          positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) + (Math.random() - 0.5) * r * 0.02;
          positions[i3 + 2] = r * Math.cos(phi) + (Math.random() - 0.5) * r * 0.02;

          velocities[i] = 0.015 + Math.random() * 0.08;
          velocities[i] *= params.velocityScalarScale;
          velocitiesVec[i3] = (Math.random() - 0.5) * 0.04;
          velocitiesVec[i3 + 1] = (Math.random() - 0.5) * 0.03;
          velocitiesVec[i3 + 2] = (Math.random() - 0.5) * 0.04;
        }

        // Use white particles (uniform color)
        colors[i3] = 1.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 1.0;

        // Prevent initial placement too close to the camera to avoid edge-sticking at click
        if (typeof camera !== 'undefined') {
          const camMin = params.cameraRadius * params.minCameraDistanceFactor;
          const cdx = positions[i3] - camera.position.x;
          const cdy = positions[i3 + 1] - camera.position.y;
          const cdz = positions[i3 + 2] - camera.position.z;
          const camDist = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz) + 1e-6;
          if (camDist < camMin) {
            // push particle slightly away from the camera along the camera->particle vector
            const k = (camMin + (Math.random() * params.radius * 0.04)) / camDist;
            positions[i3] = camera.position.x + cdx * k;
            positions[i3 + 1] = camera.position.y + cdy * k;
            positions[i3 + 2] = camera.position.z + cdz * k;
            // reduce any initial velocity so the reposition doesn't create a pop
            velocitiesVec[i3] *= 0.28; velocitiesVec[i3 + 1] *= 0.28; velocitiesVec[i3 + 2] *= 0.28;
          }
        }
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Core (bright clump) geometry: fewer, larger, denser points that define visible clusters
      const coreCountLocal = coreCountLocalUse; // use scaled core count for performance
      const corePositions = new Float32Array(coreCountLocal * 3);
      const coreColors = new Float32Array(coreCountLocal * 3);
      const coreVel = new Float32Array(coreCountLocal * 3);
      // phases for core orbit offsets
      coreOrbitPhases = new Float32Array(coreCountLocal);
      for (let ph=0; ph<coreCountLocal; ph++) coreOrbitPhases[ph] = Math.random() * Math.PI * 2.0;
      // per-core variability
      coreAttractStrengths = new Float32Array(coreCountLocal);
      coreOrbitScales = new Float32Array(coreCountLocal);

      for (let i = 0; i < coreCountLocal; i++) {
        const i3 = i * 3;
        // Place some cores near existing clusters and some randomly scattered to create visible clumps
        if (Math.random() < 0.55 && clusters.length > 0) {
          const c = clusters[Math.floor(Math.random() * clusters.length)];
          const cr = (Math.random() * params.clusterRadiusFactor * 1.2) * radius;
          corePositions[i3] = c.x + (Math.random() - 0.5) * cr;
          corePositions[i3 + 1] = c.y + (Math.random() - 0.5) * cr * 0.6;
          corePositions[i3 + 2] = c.z + (Math.random() - 0.5) * cr;
        } else {
          // scattered core elsewhere
          const r = (0.08 + Math.random() * 0.9) * radius * (0.4 + Math.random() * 0.9) * params.initialSpawnRadiusFraction;
          const theta = Math.random() * 2 * Math.PI;
          const phi = Math.acos(2 * Math.random() - 1);
          corePositions[i3] = r * Math.sin(phi) * Math.cos(theta);
          corePositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          corePositions[i3 + 2] = r * Math.cos(phi);
        }
        // Brighter core color
        coreColors[i3] = 1.0; coreColors[i3 + 1] = 1.0; coreColors[i3 + 2] = 1.0;
        // slight initial velocity jitter
        coreVel[i3] = (Math.random() - 0.5) * 0.05;
        coreVel[i3 + 1] = (Math.random() - 0.5) * 0.03;
        coreVel[i3 + 2] = (Math.random() - 0.5) * 0.05;
        // per-core attraction strength and orbit radius scale (cores are generally tighter)
        coreAttractStrengths[i] = params.attractStrengthMin + Math.random() * (params.attractStrengthMax - params.attractStrengthMin) * (0.9 + Math.random() * 0.25);
        coreOrbitScales[i] = params.orbitScaleMin + Math.random() * (params.orbitScaleMax - params.orbitScaleMin) * (0.75 + Math.random() * 0.4);
        // Move cores away from the camera if they were accidentally positioned too close
        if (typeof camera !== 'undefined') {
          const camMin = params.cameraRadius * params.minCameraDistanceFactor;
          const cdx = corePositions[i3] - camera.position.x;
          const cdy = corePositions[i3 + 1] - camera.position.y;
          const cdz = corePositions[i3 + 2] - camera.position.z;
          const camDist = Math.sqrt(cdx*cdx + cdy*cdy + cdz*cdz) + 1e-6;
          if (camDist < camMin) {
            const k = (camMin + (Math.random() * params.radius * 0.06)) / camDist;
            corePositions[i3] = camera.position.x + cdx * k;
            corePositions[i3 + 1] = camera.position.y + cdy * k;
            corePositions[i3 + 2] = camera.position.z + cdz * k;
            coreVel[i3] *= 0.28; coreVel[i3 + 1] *= 0.28; coreVel[i3 + 2] *= 0.28;
          }
        }
      }

      // Create a hard-edged circular sprite texture (no blur)
      const sprite = document.createElement('canvas');
      // use smaller sprite in low quality to reduce texture upload cost; use a mid-size when many particles
      const spriteSize = (params.quality === 'low') ? 24 : 48;
      sprite.width = spriteSize; sprite.height = spriteSize;
      const ctx = sprite.getContext('2d');
      ctx.clearRect(0, 0, spriteSize, spriteSize);
      ctx.imageSmoothingEnabled = false; // avoid smooth interpolation
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(spriteSize/2, spriteSize/2, Math.floor(spriteSize*0.44), 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      const spriteTex = new THREE.CanvasTexture(sprite);
      // Use nearest filtering to keep the circle edge crisp when scaled
      spriteTex.minFilter = THREE.NearestFilter;
      spriteTex.magFilter = THREE.NearestFilter;
      spriteTex.generateMipmaps = false;

      // Points material: additive blending, transparent, vertex colors (now more transparent)
      const material = new THREE.PointsMaterial({
        size: params.baseSize,
        sizeAttenuation: params.sizeAttenuation,
        map: spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.52, // slightly transparent for subtle blending
        blending: THREE.AdditiveBlending,
        depthTest: false, // helps additive overlay look nicer
        depthWrite: false // ensure proper additive transparency
      });
      // Clip partial-alpha pixels so edges are sharp (but leave some margin)
      material.alphaTest = 0.05;
      material.needsUpdate = true;

      particleSystem = new THREE.Points(geometry, material);
      // Disable base velocities entirely so the scene starts without an initial burst.
      // Keep live velocities at zero; motion will come from per-frame noise and gentle stabilizers.
      baseVelocitiesVec = null;
      velocitiesVec.fill(0);
      // Prevent automatic frustum culling from hiding the system (positions update frequently)
      // But allow automatic culling when the particle count is very small (keeps performance tidy)
      particleSystem.frustumCulled = (particleSystemEffectiveCount < 5000) ? true : false;
      scene.add(particleSystem);

      // Core material: slightly larger and brighter so clusters pop, but keep cores smaller overall
      const coreMat = new THREE.PointsMaterial({
        size: params.baseSize * 1.2,
        sizeAttenuation: params.sizeAttenuation,
        map: spriteTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.80, // slight transparency for cores
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false
      });
      coreMat.alphaTest = 0.05;
      coreMat.needsUpdate = true;

      const coreGeom = new THREE.BufferGeometry();
      coreGeom.setAttribute('position', new THREE.BufferAttribute(corePositions, 3));
      coreGeom.setAttribute('color', new THREE.BufferAttribute(coreColors, 3));

      coreSystem = new THREE.Points(coreGeom, coreMat);
      coreSystem.frustumCulled = false;
      scene.add(coreSystem);

      // Disable base core velocities entirely so core clumps don't get an initial burst.
      baseCoreVel = null;
      for (let i = 0; i < coreVel.length; i++) coreVel[i] = 0.0;
      // store core positions/vel arrays globally so animate() can update them
      corePositionsArr = corePositions;
      coreVelArr = coreVel;
      coreCount = coreCountLocal; // export core count to global
    }

    // Animation loop: rotate and drift particles, apply parallax
    function animate() {
      requestAnimationFrame(animate);

      // Adaptive frame-rate: skip frames when idle or not visible
      const now = performance.now();
      let targetInterval = params.activeFrameInterval;
      if (document.hidden || !isInViewport) targetInterval = params.hiddenFrameInterval;
      else {
        // Keep 'active' frame rate while dragging, and for a configurable duration after release
        const sinceRelease = (releaseStartTime > 0) ? (now - releaseStartTime) : Infinity;
        const keepActiveAfterRelease = (releaseStartTime > 0) && (sinceRelease < params.postReleaseActiveMs);
        if (attractionActive || keepActiveAfterRelease) targetInterval = params.activeFrameInterval;
        else targetInterval = params.idleFrameInterval;
      }
      if (now - lastRenderTime < targetInterval) return;
      lastRenderTime = now;

      // Slow camera orbit around Y (adds motion without moving particles themselves)
      cameraAngle += 0.00008; // even slower rotation for calmer scene
      const cr = params.cameraRadius;
      camera.position.x = Math.sin(cameraAngle) * cr;
      camera.position.z = Math.cos(cameraAngle) * cr;
      // Keep camera at a fixed height so it looks from above
      camera.position.y = params.cameraHeight;
      camera.lookAt(scene.position);

      // Subtle automatic particle rotation for extra motion — enabled only when requested
      if (params.enableSceneRotation) {
        particleSystem.rotation.x += 0.00004; // very slight tilt drift
        particleSystem.rotation.y += 0.0003;  // gentle spin (slower)
      }

      // Apply release spin velocity (if any) to both systems and decay it each frame (only if enabled)
      if (params.enableSceneRotation && typeof sceneSpinVel !== 'undefined' && Math.abs(sceneSpinVel) > 1e-9) {
        particleSystem.rotation.y += sceneSpinVel;
        if (typeof coreSystem !== 'undefined') coreSystem.rotation.y += sceneSpinVel;
        sceneSpinVel *= params.releaseSpinDecay;
        if (Math.abs(sceneSpinVel) < 1e-6) sceneSpinVel = 0;
      }

      // Subtle per-frame outward drift; wrap particles back inside the sphere
      const posAttr = particleSystem.geometry.attributes.position;
      const positions = posAttr.array;
      // Use the exact effective count (allow zero) instead of falling back to the configured default
      const count = (typeof particleSystemEffectiveCount === 'number') ? particleSystemEffectiveCount : params.particleCount;
      const radius = params.radius;

      // Smoothly ramp in any base velocities during the startup settle period so the
      // scene doesn't explode on first frame. We add only the delta portion each frame
      // (so we don't overwrite live velocities that could be modified by interactions).
      const startupFactor = Math.min(1, Math.max(0, (now - appStartTime) / params.settleDuration));
      if (startupFactor > prevStartupFactor) {
        const delta = startupFactor - prevStartupFactor;
        if (baseVelocitiesVec && velocitiesVec) {
          for (let i = 0; i < velocitiesVec.length; i++) velocitiesVec[i] += baseVelocitiesVec[i] * delta;
        }
        if (baseCoreVel && coreVelArr) {
          for (let i = 0; i < coreVelArr.length; i++) coreVelArr[i] += baseCoreVel[i] * delta;
        }
        prevStartupFactor = startupFactor;
      }

      // Continuous cursor target projection + wobble + smoothing
      if (typeof raycaster !== 'undefined') {
        raycaster.setFromCamera(mouseNdc, camera);
        raycaster.ray.intersectPlane(plane, targetCursor);
      }
      // Add gentle wobble so motion continues even if mouse doesn't move
      const wobbleStrength = params.radius * 0.02;
      targetCursor.x += Math.sin(now * 0.0004) * wobbleStrength * 0.35;
      targetCursor.y += Math.cos(now * 0.0006) * wobbleStrength * 0.35;

      // Smoothly follow the target cursor
      cursor3D.lerp(targetCursor, params.cursorLerp);

      // Attraction only happens while the pointer is down; hovering does nothing
      const active = attractionActive;
      // When active use full base strength; otherwise zero (no hover effect)
      const strengthBase = active ? params.cursorAttractionBase : 0;

      // Precompute ray origin/direction (kept for older behavior) and allocate reusable temps
      const rayOrigin = raycaster.ray.origin;
      const rayDir = raycaster.ray.direction;
      // temporary vectors reused each frame to avoid GC churn when projecting particles
      const tmpV = new THREE.Vector3();
      const tmpNdc = new THREE.Vector3();
      const tmpTargetWorld = new THREE.Vector3();
      const tmpCamDir = new THREE.Vector3();
      const tmpTangent = new THREE.Vector3();
      const tmpBin = new THREE.Vector3(); // binormal perpendicular to tmpTangent and v_to
      // camera world direction (used to compute consistent tangents in screen plane)
      camera.getWorldDirection(tmpCamDir);

      // Track attraction state without flooding the console
      if (active !== prevAttractionActive) {
        prevAttractionActive = active;
      }

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        let x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];

        // Get and update per-particle velocities
        let vx = velocitiesVec[idx], vy = velocitiesVec[idx + 1], vz = velocitiesVec[idx + 2];

        // --- Screen-space influence: project particle to NDC and pull toward cursor at same depth ---
        // Frame-skipping: only perform expensive projection/unproject every few frames when idle
        const heavySkipFrames = attractionActive ? 1 : (params.idleHeavySkipFrames || 3);
        const heavyTick = (frameCount % heavySkipFrames) === 0;
        let sInfluence = 0.0;
        let dist = 1e6;
        let dx = 0, dy = 0, dz = 0;
        if (heavyTick) {
          // Project particle to NDC to get screen-space coordinates
          tmpV.set(x, y, z);
          tmpNdc.copy(tmpV).project(camera);
          const sx = tmpNdc.x, sy = tmpNdc.y, sz = tmpNdc.z;

          // Compute screen-space distance between particle and cursor (NDC space)
          const screenDist = Math.hypot(sx - mouseNdc.x, sy - mouseNdc.y);
          const screenRadius = params.cursorScreenRadius;
          sInfluence = Math.max(0, 1 - Math.min(screenDist / screenRadius, 1));

          // Compute a world-space target at the particle's depth directly under the cursor.
          // When attraction is active (pointer down) use the single plane intersection point so
          // all particles are attracted to the same 3D point under the cursor; otherwise fall
          // back to per-particle depth unprojection for hover/parallax behavior.
          if (attractionActive) {
            tmpTargetWorld.copy(targetCursor);
          } else {
            tmpTargetWorld.set(mouseNdc.x, mouseNdc.y, sz).unproject(camera);
          }

          // Build a small ring-offset target using a per-particle phase so particles circle the cursor
          const phase = orbitPhases[i] || 0;
          // vector toward the cursor target (world-space)
          const toX0 = tmpTargetWorld.x - x; const toY0 = tmpTargetWorld.y - y; const toZ0 = tmpTargetWorld.z - z;
          tmpV.set(toX0, toY0, toZ0);
          // tangent perpendicular to view direction and v_to
          tmpTangent.crossVectors(tmpCamDir, tmpV);
          let tMag = Math.sqrt(tmpTangent.x*tmpTangent.x + tmpTangent.y*tmpTangent.y + tmpTangent.z*tmpTangent.z) + 1e-6;
          tmpTangent.x /= tMag; tmpTangent.y /= tMag; tmpTangent.z /= tMag;
          // binormal perpendicular to both (forms the local plane for the ring)
          tmpBin.crossVectors(tmpTangent, tmpV);
          let bMag = Math.sqrt(tmpBin.x*tmpBin.x + tmpBin.y*tmpBin.y + tmpBin.z*tmpBin.z) + 1e-6;
          tmpBin.x /= bMag; tmpBin.y /= bMag; tmpBin.z /= bMag;

          // world-space orbit radius (small, scaled by influence so close particles circle tighter)
          let orbitRadius = params.radius * 0.008 * (0.6 + 0.8 * sInfluence * sInfluence);
          // apply per-particle scale so each particle orbits at a slightly different radius
          const orbitScaleLocal = (orbitScales && orbitScales[i]) ? orbitScales[i] : 1.0;
          orbitRadius *= orbitScaleLocal;
          const cosP = Math.cos(phase), sinP = Math.sin(phase);
          const offX = tmpTangent.x * cosP * orbitRadius + tmpBin.x * sinP * orbitRadius;
          const offY = tmpTangent.y * cosP * orbitRadius + tmpBin.y * sinP * orbitRadius;
          const offZ = tmpTangent.z * cosP * orbitRadius + tmpBin.z * sinP * orbitRadius;

          // When actively attracting, retain a reduced ring offset plus small jitter so particles
          // gather near the cursor but remain distributed rather than stacking.
          let targetX = tmpTargetWorld.x + offX;
          let targetY = tmpTargetWorld.y + offY;
          let targetZ = tmpTargetWorld.z + offZ;
          if (attractionActive) {
            const activeScale = params.activeAttractOffset || 0.36;
            // small jitter along the local ring plane to avoid perfect stacking
            const jitterMag = orbitRadius * 0.28 * (0.5 + Math.random() * 0.5);
            const jitterX = (tmpTangent.x + tmpBin.x) * ((Math.random() - 0.5) * jitterMag);
            const jitterY = (tmpTangent.y + tmpBin.y) * ((Math.random() - 0.5) * jitterMag);
            const jitterZ = (tmpTangent.z + tmpBin.z) * ((Math.random() - 0.5) * jitterMag);
            targetX = tmpTargetWorld.x + offX * activeScale + jitterX;
            targetY = tmpTargetWorld.y + offY * activeScale + jitterY;
            targetZ = tmpTargetWorld.z + offZ * activeScale + jitterZ;
          }

          dx = targetX - x;
          dy = targetY - y;
          dz = targetZ - z;
          dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;

          // slowly advance phase so particles orbit (faster when influence larger)
          orbitPhases[i] = phase + 0.014 * (0.8 + (sInfluence * 1.2));

          // Reduce screen influence for particles that are too close to the camera
          const camDxPre = x - camera.position.x;
          const camDyPre = y - camera.position.y;
          const camDzPre = z - camera.position.z;
          const camDistPre = Math.sqrt(camDxPre*camDxPre + camDyPre*camDyPre + camDzPre*camDzPre) + 1e-6;
          const minCamDist = params.cameraRadius * params.minCameraDistanceFactor;
          // Factor in [0..1] — lower when close to camera (reduces attraction)
          const camFactor = Math.min(1, camDistPre / (minCamDist * 1.2));
          sInfluence *= camFactor;

          // If particle is very close to camera, apply a small immediate repulsion so it doesn't get pulled in
          // But skip this pre-repulsion while the pointer is down (we want attraction to dominate when clicking)
          if (!attractionActive && camDistPre < minCamDist * 0.65) {
            const preRep = (1 - camDistPre / (minCamDist * 0.65)) * 0.04; // gentle nudge (reduced)
            vx += (camDxPre / camDistPre) * preRep;
            vy += (camDyPre / camDistPre) * preRep;
            vz += (camDzPre / camDistPre) * preRep;
          }

          // When pointer is down, ensure particles are influenced regardless of screen distance
          if (attractionActive) {
            sInfluence = camFactor; // respect camera-proximity reduction but apply globally
          }

        } else {
          // lightweight background motion when not evaluating heavy influence
          sInfluence = 0.0;
          dx = (Math.random() - 0.5) * 0.002;
          dy = (Math.random() - 0.5) * 0.002;
          dz = (Math.random() - 0.5) * 0.002;
          dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;
        }

        // Radial unit vector (from scene center)
        let rlen = Math.sqrt(x * x + y * y + z * z) || 1;
        const ux = x / rlen, uy = y / rlen, uz = z / rlen;
        // Compute vector from particle to target and its length
        const tox = dx, toy = dy, toz = dz;
        const tlen = Math.sqrt(tox*tox + toy*toy + toz*toz) + 1e-6;
        const tlenSq = tlen * tlen;

        // Compute a consistent tangent direction in world-space by crossing camera direction with v_to
        tmpV.set(tox, toy, toz);
        tmpTangent.crossVectors(tmpCamDir, tmpV);
        const tMag = Math.sqrt(tmpTangent.x*tmpTangent.x + tmpTangent.y*tmpTangent.y + tmpTangent.z*tmpTangent.z) + 1e-6;
        tmpTangent.x /= tMag; tmpTangent.y /= tMag; tmpTangent.z /= tMag;

        // Tangential strength scaled by local screen-space influence
        const influencePow = sInfluence * sInfluence;
        if (sInfluence > 0.001) {
          // Reduce tangential orbiting while the pointer is down so pull dominates
          const tangentialFactor = attractionActive ? 0.06 : 1.0;
          const tangentialStrength = strengthBase * influencePow * (1 / (1 + tlenSq * 0.00035)) * tangentialFactor;
          const tstep = 0.002; // small accumulator for tangential contribution

          vx += tmpTangent.x * tangentialStrength * tstep * tlen;
          vy += tmpTangent.y * tangentialStrength * tstep * tlen;
          vz += tmpTangent.z * tangentialStrength * tstep * tlen;

          // Swirl: reduce strongly while attraction is active so particles don't spin out
          const swirlFactor = attractionActive ? 0.04 : 1.0;
          const s = params.swirlStrength * influencePow * 0.0025 * swirlFactor;
          vx += tmpTangent.x * s;
          vy += tmpTangent.y * s;
          vz += tmpTangent.z * s;

          // Direct pull toward the cursor at particle's depth (screen-space based)
          if (attractionActive) {
            // Pull directly toward the cursor target (no ring offset) and make the pull a bit stronger
            const pullBase = 0.038; // stronger pull while actively attracting
            // distance-based attenuation: particles far from the cursor are attracted extremely slowly
            const attractRadius = params.radius * (params.attractRadiusFactor || 0.28);
            let distanceScale = 1.0;
            if (tlen > attractRadius) {
              const excess = (tlen - attractRadius) / params.radius; // normalized excess [0..1+]
              distanceScale = params.distantAttractScale / Math.pow(1 + excess * 6.0, params.distantAttractFalloff);
              distanceScale = Math.max(distanceScale, 0.0005);
            }
            // scale pull by per-particle attraction strength so different dots have different 'gravity'
            const pull = pullBase * (0.6 + 1.2 * influencePow) * (1 / (1 + tlenSq * 0.0005)) * ((attractStrengths && attractStrengths[i]) ? attractStrengths[i] : 1.0) * distanceScale;
            vx += (dx / dist) * pull;
            vy += (dy / dist) * pull;
            vz += (dz / dist) * pull;
            // reduce orbit nudge to near zero so particles align with the cursor
            const orbitNudge = 0.0005 * influencePow;
            vx += tmpTangent.x * orbitNudge * (0.2 + Math.random() * 0.4);
            vy += tmpTangent.y * orbitNudge * (0.2 + Math.random() * 0.4);
            vz += tmpTangent.z * orbitNudge * (0.2 + Math.random() * 0.4);
          }
        } else {
          // small wandering motion when not influenced
          vx += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
          vy += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
          vz += (Math.random() - 0.5) * (params.noiseStrength * 0.75);
        }

        // Gentle radial stabilization and outward drift (disabled during idle).
        // Only apply radial drift when a release impulse is active so particles don't slowly drift apart.
        if (releaseStartTime > 0) {
          vx += ux * velocities[i] * params.radialDriftScale;
          vy += uy * velocities[i] * params.radialDriftScale;
          vz += uz * velocities[i] * params.radialDriftScale;
        }

        // Soft push outward if particle collapses too close
        const minRadius = params.radius * 0.22;
        // Damping and organic noise
        vx += (Math.random() - 0.5) * params.noiseStrength;
        vy += (Math.random() - 0.5) * params.noiseStrength;
        vz += (Math.random() - 0.5) * params.noiseStrength;

        // Release impulse (when pointer was just released): outward from the release origin
        if (releaseStartTime > 0) {
          // ignore releases that occurred during the startup grace period
          if ((releaseStartTime - appStartTime) <= params.startupGraceMs) {
            releaseStartTime = 0;
          } else {
            const since = performance.now() - releaseStartTime;
            if (since < params.releaseDuration) {
              const f = 1 - (since / params.releaseDuration); // decays 1 -> 0
              const rx = x - releaseOrigin.x, ry = y - releaseOrigin.y, rz = z - releaseOrigin.z;
              const rdist = Math.sqrt(rx*rx + ry*ry + rz*rz) + 1e-6;
              // scale by camera factor so we don't push into camera
              const camDxR = x - camera.position.x, camDyR = y - camera.position.y, camDzR = z - camera.position.z;
              const camDistR = Math.sqrt(camDxR*camDxR + camDyR*camDyR + camDzR*camDzR) + 1e-6;
              const minCamDistR = params.cameraRadius * params.minCameraDistanceFactor;
              const camFactorR = Math.min(1, camDistR / (minCamDistR * 1.1));
              // release base amount (increased)
              const releaseAmountBase = params.releaseStrength * f * camFactorR;
              // Invert distance scaling: particles closer to the release origin get a larger impulse
              const nearFactor = 1 - Math.min(1, rdist / (params.radius * 0.18));
              const distScale = Math.pow(Math.max(0, nearFactor), 0.8);
              // give an extra multiplier so near particles get a strong kick
              let releaseAmount = releaseAmountBase * (0.9 + 3.2 * distScale);
              // add tangential + binormal randomness and a small jitter so release looks natural
              const randOffT = (Math.random() - 0.5) * 1.1; // stronger tangential randomness
              const randOffB = (Math.random() - 0.5) * 0.9; // binormal randomness for spread
              let addX = (rx / rdist) * releaseAmount
                         + tmpTangent.x * randOffT * releaseAmount
                         + tmpBin.x * randOffB * releaseAmount
                         + (Math.random() - 0.5) * 0.02 * releaseAmount; // tiny random nudge
              let addY = (ry / rdist) * releaseAmount
                         + tmpTangent.y * randOffT * releaseAmount
                         + tmpBin.y * randOffB * releaseAmount
                         + (Math.random() - 0.5) * 0.02 * releaseAmount;
              let addZ = (rz / rdist) * releaseAmount
                         + tmpTangent.z * randOffT * releaseAmount
                         + tmpBin.z * randOffB * releaseAmount
                         + (Math.random() - 0.5) * 0.02 * releaseAmount;
              const addMag = Math.sqrt(addX*addX + addY*addY + addZ*addZ) + 1e-9;
              if (addMag > params.releaseMax) {
                const sc = params.releaseMax / addMag;
                addX *= sc; addY *= sc; addZ *= sc;
              }
              // extra per-particle scattering for natural dispersion
              const scatterJit = 0.12 * (0.5 + Math.random() * 0.9) * releaseAmount;
              vx += addX + (Math.random() - 0.5) * scatterJit;
              vy += addY + (Math.random() - 0.5) * scatterJit;
              vz += addZ + (Math.random() - 0.5) * scatterJit;
            } else {
              // clear release once finished
              releaseStartTime = 0;
            }
          }
        }

        // Apply extra damping during initial settle period so the scene starts gently
        if (performance.now() - appStartTime < params.settleDuration) {
          vx *= params.startupDamping;
          vy *= params.startupDamping;
          vz *= params.startupDamping;
        }
        const damp = params.velocityDamping;
        vx *= damp; vy *= damp; vz *= damp;

        // Integrate position
        x += vx;
        y += vy;
        z += vz;

        // Soft radial boundary handling (smooth restoring forces to avoid jitter)
        const newLen = Math.sqrt(x * x + y * y + z * z);
        const over = Math.max(0, newLen - radius);
        const innerDeficit = Math.max(0, minRadius - newLen);

        // Apply gentle inward restoring acceleration when outside the radius
        if (over > 0) {
          const restore = (over / radius) * params.boundaryForce;
          vx -= ux * restore;
          vy -= uy * restore;
          vz -= uz * restore;
        }

        // Particles that are slightly inside the minRadius are left as-is so they
        // remain nearer the center (do not push outward), avoiding idle spread.
        if (innerDeficit > 0) {
          // intentionally no outward push to keep particles centered during idle
        }

        // Camera proximity avoidance: gently push particles away when they approach the camera
        const camDx = x - camera.position.x;
        const camDy = y - camera.position.y;
        const camDz = z - camera.position.z;
        const camDist = Math.sqrt(camDx*camDx + camDy*camDy + camDz*camDz) + 1e-6;
        const minCamDist = params.cameraRadius * params.minCameraDistanceFactor;
        if (camDist < minCamDist) {
          // compute repulsive strength proportional to how close they are (stronger now)
          const rep = (1 - camDist / minCamDist) * 0.28; // increased multiplier for firmer push-back
          vx += (camDx / camDist) * rep;
          vy += (camDy / camDist) * rep;
          vz += (camDz / camDist) * rep;
          // damp velocity component toward camera for extra stability
          const velToward = (vx * camDx + vy * camDy + vz * camDz) / (camDist + 1e-6);
          if (velToward < 0) {
            vx -= (camDx / camDist) * (velToward * 0.45);
            vy -= (camDy / camDist) * (velToward * 0.45);
            vz -= (camDz / camDist) * (velToward * 0.45);
          }
        }

        // soften noise near boundary to prevent jitter
        const boundaryMargin = params.radius * params.boundaryMargin;
        if (Math.abs(newLen - radius) < boundaryMargin) {
          // scale down noise contribution
          vx *= 0.995; vy *= 0.995; vz *= 0.995;
        }

        // Save position and velocity back
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        velocitiesVec[idx] = vx;
        velocitiesVec[idx + 1] = vy;
        velocitiesVec[idx + 2] = vz;
        // Save position and velocity back
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        velocitiesVec[idx] = vx;
        velocitiesVec[idx + 1] = vy;
        velocitiesVec[idx + 2] = vz;
      }

      posAttr.needsUpdate = true;

      // Update core particles (bright clumps) using a similar but slightly stronger behavior
      if (typeof coreSystem !== 'undefined' && coreCount > 0) {
        const corePosAttr = coreSystem.geometry.attributes.position;
        const cpos = corePosAttr.array;
        const ccount = coreCount;
        for (let i = 0; i < ccount; i++) {
          const idx = i * 3;
          let x = cpos[idx], y = cpos[idx + 1], z = cpos[idx + 2];
          let vx = coreVelArr[idx], vy = coreVelArr[idx + 1], vz = coreVelArr[idx + 2];

          // Screen-space attraction for cores (stronger influence) — project and pull toward cursor at same depth
          tmpV.set(x, y, z);
          tmpNdc.copy(tmpV).project(camera);
          const sx = tmpNdc.x, sy = tmpNdc.y, sz = tmpNdc.z;
          const screenDist = Math.hypot(sx - mouseNdc.x, sy - mouseNdc.y);
          const screenRadius = params.cursorScreenRadius * 1.1; // slightly larger for cores
          let influence = Math.max(0, 1 - Math.min(screenDist / screenRadius, 1));
          const tstep = 0.008;

          // world target at the particle's depth under the cursor; when attracting use the
          // shared plane intersection point so cores gather at a single 3D point.
          if (attractionActive) {
            tmpTargetWorld.copy(targetCursor);
          } else {
            tmpTargetWorld.set(mouseNdc.x, mouseNdc.y, sz).unproject(camera);
          }
          // ring-offset for core so they circle the cursor rather than stacking
          const phaseC = coreOrbitPhases[i] || 0;
          const toCX = tmpTargetWorld.x - x; const toCY = tmpTargetWorld.y - y; const toCZ = tmpTargetWorld.z - z;
          tmpV.set(toCX, toCY, toCZ);
          tmpTangent.crossVectors(tmpCamDir, tmpV);
          const tMagC = Math.sqrt(tmpTangent.x*tmpTangent.x + tmpTangent.y*tmpTangent.y + tmpTangent.z*tmpTangent.z) + 1e-6;
          tmpTangent.x /= tMagC; tmpTangent.y /= tMagC; tmpTangent.z /= tMagC;
          tmpBin.crossVectors(tmpTangent, tmpV);
          const bMagC = Math.sqrt(tmpBin.x*tmpBin.x + tmpBin.y*tmpBin.y + tmpBin.z*tmpBin.z) + 1e-6;
          tmpBin.x /= bMagC; tmpBin.y /= bMagC; tmpBin.z /= bMagC;
          // compute core orbit radius and apply per-core scale
          let orbitRadiusC = params.radius * 0.01 * (0.5 + 0.7 * influence);
          const orbitScaleC = (coreOrbitScales && coreOrbitScales[i]) ? coreOrbitScales[i] : 1.0;
          orbitRadiusC *= orbitScaleC;
          const cosPC = Math.cos(phaseC), sinPC = Math.sin(phaseC);
          const offCX = tmpTangent.x * cosPC * orbitRadiusC + tmpBin.x * sinPC * orbitRadiusC;
          const offCY = tmpTangent.y * cosPC * orbitRadiusC + tmpBin.y * sinPC * orbitRadiusC;
          const offCZ = tmpTangent.z * cosPC * orbitRadiusC + tmpBin.z * sinPC * orbitRadiusC;

          // When actively attracting, use a reduced ring offset so cores gather near the cursor but stay distributed
          let targetCX = tmpTargetWorld.x + offCX;
          let targetCY = tmpTargetWorld.y + offCY;
          let targetCZ = tmpTargetWorld.z + offCZ;
          if (attractionActive) {
            const activeScaleC = params.coreActiveAttractOffset || 0.22;
            const jitterMagC = orbitRadiusC * 0.20 * (0.5 + Math.random() * 0.5);
            const jx = (tmpTangent.x + tmpBin.x) * ((Math.random() - 0.5) * jitterMagC);
            const jy = (tmpTangent.y + tmpBin.y) * ((Math.random() - 0.5) * jitterMagC);
            const jz = (tmpTangent.z + tmpBin.z) * ((Math.random() - 0.5) * jitterMagC);
            targetCX = tmpTargetWorld.x + offCX * activeScaleC + jx;
            targetCY = tmpTargetWorld.y + offCY * activeScaleC + jy;
            targetCZ = tmpTargetWorld.z + offCZ * activeScaleC + jz;
          }

          const dx = targetCX - x;
          const dy = targetCY - y;
          const dz = targetCZ - z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;
          coreOrbitPhases[i] = phaseC + 0.012 * (0.8 + influence * 1.1);

          // Reduce core influence when core is very close to camera and add small repulsion
          const camDxC = x - camera.position.x, camDyC = y - camera.position.y, camDzC = z - camera.position.z;
          const camDistC = Math.sqrt(camDxC*camDxC + camDyC*camDyC + camDzC*camDzC) + 1e-6;
          const minCamDistC = params.cameraRadius * params.minCameraDistanceFactor;
          const camFactorC = Math.min(1, camDistC / (minCamDistC * 1.25));
          influence *= camFactorC;
          if (!attractionActive && camDistC < minCamDistC * 0.6) {
            const preRepC = (1 - camDistC / (minCamDistC * 0.6)) * 0.06;
            vx += (camDxC / camDistC) * preRepC;
            vy += (camDyC / camDistC) * preRepC;
            vz += (camDzC / camDistC) * preRepC;
          }

          // Force all cores to be influenced while pointer is down (respect camera-proximity reduction)
          if (attractionActive) {
            influence = camFactorC;
          }

          // Compute tangent using camera direction so cores orbit around the cursor consistently
          const tlen = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;
          tmpV.set(dx, dy, dz);
          tmpTangent.crossVectors(tmpCamDir, tmpV);
          const tMag = Math.sqrt(tmpTangent.x*tmpTangent.x + tmpTangent.y*tmpTangent.y + tmpTangent.z*tmpTangent.z) + 1e-6;
          tmpTangent.x /= tMag; tmpTangent.y /= tMag; tmpTangent.z /= tMag;

          // Apply attraction only when pointer is down to prevent hover effects
          if (attractionActive) {
            // Reduce tangential to favor direct pull during clicks
            const tangentialFactor = 0.08; // smaller fraction for cores while attracting
            const tangentialStrength = (params.cursorAttractionBase * 0.9) * (influence*influence) * tangentialFactor;
            vx += tmpTangent.x * tangentialStrength * tstep * tlen;
            vy += tmpTangent.y * tangentialStrength * tstep * tlen;
            vz += tmpTangent.z * tangentialStrength * tstep * tlen;

            // reduce swirl for cores while attracting
            const s = params.swirlStrength * influence * 0.0008;
            vx += tmpTangent.x * s; vy += tmpTangent.y * s; vz += tmpTangent.z * s;

            // direct pull for cores (stronger so cores settle near cursor)
            const corePullBase = 0.05; // slightly stronger
            const cpull = corePullBase * (influence * influence) * (1 / (1 + screenDist * 1.6)) * ((coreAttractStrengths && coreAttractStrengths[i]) ? coreAttractStrengths[i] : 1.0);
            vx += (dx / dist) * cpull;
            vy += (dy / dist) * cpull;
            vz += (dz / dist) * cpull;
          }

          // radial stabilization disabled (previously pulled cores inward and caused global collapse)
          // let rlenc = Math.sqrt(x*x + y*y + z*z) || 1;
          // const ux = x / rlenc, uy = y / rlenc, uz = z / rlenc;
          // vx -= ux * params.coreRadialStabScale; vy -= uy * params.coreRadialStabScale; vz -= uz * params.coreRadialStabScale;

          // noise and damping
          vx += (Math.random() - 0.5) * (params.noiseStrength * 2.2);
          vy += (Math.random() - 0.5) * (params.noiseStrength * 2.2);
          vz += (Math.random() - 0.5) * (params.noiseStrength * 2.2);

          // release impulse for cores
          if (releaseStartTime > 0) {
            // ignore releases that occurred very early during app startup
            if ((releaseStartTime - appStartTime) <= params.startupGraceMs) {
              releaseStartTime = 0;
            } else {
              const since = performance.now() - releaseStartTime;
              if (since < params.releaseDuration) {
                const f = 1 - (since / params.releaseDuration);
                const rx = x - releaseOrigin.x, ry = y - releaseOrigin.y, rz = z - releaseOrigin.z;
                const rdist = Math.sqrt(rx*rx + ry*ry + rz*rz) + 1e-6;
                const camDxR = x - camera.position.x, camDyR = y - camera.position.y, camDzR = z - camera.position.z;
                const camDistR = Math.sqrt(camDxR*camDxR + camDyR*camDyR + camDzR*camDzR) + 1e-6;
                const minCamDistR = params.cameraRadius * params.minCameraDistanceFactor;
                const camFactorR = Math.min(1, camDistR / (minCamDistR * 1.1));
                // cores get a stronger kick on release, inverted distance scaling so close cores scatter more
                const releaseAmountBase = params.releaseStrength * f * camFactorR;
                const nearFactor = 1 - Math.min(1, rdist / (params.radius * 0.18));
                const distScale = Math.pow(Math.max(0, nearFactor), 0.8);
                let releaseAmount = releaseAmountBase * (1.2 + 4.0 * distScale);
                // add tangential + binormal randomness and a small jitter so cores scatter naturally
                const randOffT = (Math.random() - 0.5) * 1.3; // stronger sideways for cores
                const randOffB = (Math.random() - 0.5) * 1.0;
                let addX = (rx / rdist) * releaseAmount
                           + tmpTangent.x * randOffT * releaseAmount
                           + tmpBin.x * randOffB * releaseAmount
                           + (Math.random() - 0.5) * 0.03 * releaseAmount;
                let addY = (ry / rdist) * releaseAmount
                           + tmpTangent.y * randOffT * releaseAmount
                           + tmpBin.y * randOffB * releaseAmount
                           + (Math.random() - 0.5) * 0.03 * releaseAmount;
                let addZ = (rz / rdist) * releaseAmount
                           + tmpTangent.z * randOffT * releaseAmount
                           + tmpBin.z * randOffB * releaseAmount
                           + (Math.random() - 0.5) * 0.03 * releaseAmount;
                const addMag = Math.sqrt(addX*addX + addY*addY + addZ*addZ) + 1e-9;
                if (addMag > params.releaseMax) {
                  const sc = params.releaseMax / addMag;
                  addX *= sc; addY *= sc; addZ *= sc;
                }
                const scatterJitC = 0.18 * (0.6 + Math.random() * 1.0) * releaseAmount;
                vx += addX + (Math.random() - 0.5) * scatterJitC;
                vy += addY + (Math.random() - 0.5) * scatterJitC;
                vz += addZ + (Math.random() - 0.5) * scatterJitC;
              } else {
                releaseStartTime = 0;
              }
            }
          }

          if (performance.now() - appStartTime < params.settleDuration) {
            vx *= params.startupDamping; vy *= params.startupDamping; vz *= params.startupDamping;
          }
          const damp = Math.max(0.9, params.velocityDamping - 0.01);
          vx *= damp; vy *= damp; vz *= damp;

          x += vx; y += vy; z += vz;

          // soft bounds with smooth restoring forces
          const newLen = Math.sqrt(x*x + y*y + z*z);
          const over = Math.max(0, newLen - params.radius);
          if (over > 0) {
            const restore = (over / params.radius) * (params.boundaryForce * 1.2);
            vx -= (x / newLen) * restore;
            vy -= (y / newLen) * restore;
            vz -= (z / newLen) * restore;
          }

          // Camera avoidance for cores (prevent core particles getting too close to camera)
          const camDx = x - camera.position.x;
          const camDy = y - camera.position.y;
          const camDz = z - camera.position.z;
          const camDist = Math.sqrt(camDx*camDx + camDy*camDy + camDz*camDz) + 1e-6;
          const minCamDist = params.cameraRadius * params.minCameraDistanceFactor * 0.9; // slightly smaller for cores
          if (camDist < minCamDist) {
            const rep = (1 - camDist / minCamDist) * 0.18;
            vx += (camDx / camDist) * rep;
            vy += (camDy / camDist) * rep;
            vz += (camDz / camDist) * rep;
            const velToward = (vx * camDx + vy * camDy + vz * camDz) / (camDist + 1e-6);
            if (velToward < 0) {
              vx -= (camDx / camDist) * (velToward * 0.45);
              vy -= (camDy / camDist) * (velToward * 0.45);
              vz -= (camDz / camDist) * (velToward * 0.45);
            }
          }

          cpos[idx] = x; cpos[idx + 1] = y; cpos[idx + 2] = z;
          coreVelArr[idx] = vx; coreVelArr[idx + 1] = vy; coreVelArr[idx + 2] = vz;
        }
        corePosAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
      // increment frame counter for frame-skipping logic
      frameCount++; 
    }

    // Resize handler
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      // Adjust pixel ratio when the canvas size changes to remain performant for small embeds
      const rect = renderer.domElement.getBoundingClientRect();
      const area = Math.max(1, rect.width * rect.height);
      const smallCanvas = area < (800 * 200);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallCanvas ? 1 : 1.5));
    }

    // Mouse move -> update normalized coordinates
    // NOTE: movement alone does not trigger attraction; attraction occurs on pointer down/click
    function onMouseMove(event) {
      // parallax coords in -0.5 .. 0.5
      mouse.x = (event.clientX / window.innerWidth) - 0.5;
      mouse.y = (event.clientY / window.innerHeight) - 0.5;
      // normalized device coords for raycasting in -1 .. 1
      mouseNdc.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseNdc.y = - (event.clientY / window.innerHeight) * 2 + 1;
      // If user is dragging (pointer down), update the target cursor immediately
      if (attractionActive && typeof raycaster !== 'undefined') {
        raycaster.setFromCamera(mouseNdc, camera);
        raycaster.ray.intersectPlane(plane, targetCursor);
      }
    }

    // Pointer down/up handlers to enable click-driven attraction
    function onPointerDown(e) {
      onMouseMove(e); // ensure coords are current
      attractionActive = true;
      lastClickTime = performance.now();
      if (typeof raycaster !== 'undefined') {
        raycaster.setFromCamera(mouseNdc, camera);
        raycaster.ray.intersectPlane(plane, targetCursor);
        cursor3D.copy(targetCursor);
      }
    }
    function onPointerUp() {
      attractionActive = false;
      lastClickTime = performance.now();
      // set a release impulse origin and start time so particles fly apart slightly
      releaseStartTime = performance.now();
      releaseOrigin.copy(cursor3D);
      // Add a small random rotational impulse so the scene rotates slightly after release
      if (params.enableSceneRotation) {
        sceneSpinVel += (Math.random() * 2 - 1) * params.releaseSpinImpulse;
      }
    }

  });

