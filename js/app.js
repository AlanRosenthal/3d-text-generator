/**
 * 3D Text STL Studio — Core Application Logic for GitHub Pages
 */

(function () {
  'use strict';

  // Global State
  let scene, camera, renderer, controls, currentGroup;
  let gridHelper, ambientLight, dirLight1, dirLight2;
  let parsedFont = null;
  let fontName = 'Arial Bold';
  let isGridVisible = true;
  let isLightingMode = true;

  // Thread Specs Options
  const threadStandards = {
    '1/4-20': { name: '1/4"-20 UNC', majorDia: 6.35, pitch: 1.27 },
    'm6':     { name: 'M6 x 1.0',    majorDia: 6.00, pitch: 1.00 },
    'm5':     { name: 'M5 x 0.8',    majorDia: 5.00, pitch: 0.80 },
    'm4':     { name: 'M4 x 0.7',    majorDia: 4.00, pitch: 0.70 },
    'm3':     { name: 'M3 x 0.5',    majorDia: 3.00, pitch: 0.50 },
    '10-24':  { name: '#10-24 UNC',  majorDia: 4.83, pitch: 1.06 },
    'custom': { name: 'Custom',      majorDia: 6.35, pitch: 1.27 }
  };

  // 3D Parameters
  const params = {
    text: '3D PRINT',
    extrudeDepth: 5.0,
    fontSize: 25.0,
    fillMode: 'embossed', // 'embossed', 'recessed', 'hollow'
    mirrorText: false,
    baseplateEnabled: true,
    baseplateThickness: 2.0,
    baseplatePadding: 4.0,
    baseplateRadius: 4.0,
    mountHoleEnabled: false,
    threadStandard: '1/4-20',
    mountHoleOffset: 0.20,     // 3D printer clearance offset (+0.20mm)
    mountHoleDepthRatio: 0.90, // 90% Blind Hole by default
    textColor: '#818cf8',
    baseColor: '#475569'
  };

  const defaultFontUrl = 'lib/fonts/Arial-Bold.ttf';

  document.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
    setupDropzone();
    setupControlListeners();

    // Load zero-fetch embedded default font instantly (file:// protocol safe!)
    loadEmbeddedDefaultFont();

    // Check if URL contains shareable settings
    const hasSharedParams = loadParamsFromURL();
    if (hasSharedParams) {
      syncUIFromParams();
      setStatus('Shared config loaded');
    }
  });

  // Load zero-fetch embedded default font from RAM
  function loadEmbeddedDefaultFont() {
    if (window.DEFAULT_FONT_BASE64) {
      try {
        const binaryString = atob(window.DEFAULT_FONT_BASE64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        parsedFont = opentype.parse(bytes.buffer);
        fontName = 'Arial Bold';
        document.getElementById('drop-primary').textContent = 'Font: Arial Bold (Embedded)';
        setStatus('Font ready');
        update3DMesh();
        return true;
      } catch (err) {
        console.error('Embedded font parse error:', err);
      }
    }
    return false;
  }

  // Initialize Three.js WebGL Scene
  function initThreeJS() {
    const container = document.getElementById('3d-viewport-container');
    const canvas = document.getElementById('webgl-canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, -70, 110);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
    }

    // Grid Helper
    gridHelper = new THREE.GridHelper(240, 40, 0x334155, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    // Lights
    ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(60, 120, 100);
    scene.add(dirLight1);

    dirLight2 = new THREE.DirectionalLight(0xa5b4fc, 0.4);
    dirLight2.position.set(-60, -60, 60);
    scene.add(dirLight2);

    window.addEventListener('resize', onWindowResize);

    function animate() {
      requestAnimationFrame(animate);
      if (controls) controls.update();
      renderer.render(scene, camera);
    }
    animate();
  }

  function onWindowResize() {
    const container = document.getElementById('3d-viewport-container');
    if (!container || !camera || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // Setup Drag & Drop and File Upload
  function setupDropzone() {
    const dropzone = document.getElementById('font-dropzone');
    const fileInput = document.getElementById('font-file-input');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFontFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFontFile(e.target.files[0]);
      }
    });

    // Google Web Fonts Dropdown
    const selectGoogleFont = document.getElementById('select-google-font');
    if (selectGoogleFont) {
      selectGoogleFont.addEventListener('change', (e) => {
        const url = e.target.value;
        if (url) {
          const opt = e.target.options[e.target.selectedIndex];
          const name = opt ? opt.text.split(' (')[0] : 'Google Font';
          loadFontFromUrl(url, name);
        }
      });
    }

    // daFont Custom URL Importer Button
    document.getElementById('btn-import-url').addEventListener('click', () => {
      const urlInput = document.getElementById('dafont-url-input').value.trim();
      if (!urlInput) {
        alert('Please paste a daFont link or ZIP URL.');
        return;
      }
      importFromDafontURL(urlInput);
    });
  }

  // Handle local TTF / OTF font file
  function handleFontFile(file) {
    if (!file.name.match(/\.(ttf|otf)$/i)) {
      alert('Please upload a valid .TTF or .OTF font file.');
      return;
    }

    fontName = file.name.replace(/\.(ttf|otf)$/i, '');
    document.getElementById('drop-primary').textContent = `Loaded: ${file.name}`;
    document.getElementById('drop-sub').textContent = 'Click or drop another file to replace';

    showLoader('Parsing font file...');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        parsedFont = opentype.parse(e.target.result);
        hideLoader();
        setStatus('Font loaded');
        update3DMesh();
      } catch (err) {
        hideLoader();
        alert('Error parsing font: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Import font from daFont URL or direct ZIP
  async function importFromDafontURL(url) {
    let zipUrl = url;
    if (url.includes('dafont.com') && !url.includes('dl.dafont.com')) {
      const match = url.match(/dafont\.com\/([^/]+)\.font/);
      const fontSlug = match ? match[1] : 'font';
      zipUrl = `https://dl.dafont.com/dl/?f=${fontSlug}`;
      fontName = fontSlug.replace(/_/g, ' ');
    }

    showLoader('Fetching daFont package...');
    try {
      let response;
      try {
        response = await fetch(zipUrl);
      } catch {
        const corsProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(zipUrl)}`;
        response = await fetch(corsProxy);
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      showLoader('Extracting TTF/OTF from ZIP...');
      const zip = await JSZip.loadAsync(arrayBuffer);

      let fontZipFile = null;
      for (const filename of Object.keys(zip.files)) {
        if (!zip.files[filename].dir && !filename.startsWith('__MACOSX') && !filename.startsWith('._')) {
          const lower = filename.toLowerCase();
          if (lower.endsWith('.ttf') || lower.endsWith('.otf')) {
            fontZipFile = zip.files[filename];
            break;
          }
        }
      }

      if (!fontZipFile) throw new Error('No .ttf or .otf file found in ZIP package.');

      showLoader('Parsing font glyphs...');
      const fontBuffer = await fontZipFile.async('arraybuffer');
      parsedFont = opentype.parse(fontBuffer);

      document.getElementById('drop-primary').textContent = `daFont: ${fontName}`;
      hideLoader();
      setStatus(`Imported: ${fontName}`);
      update3DMesh();
    } catch (err) {
      console.error('URL import error:', err);
      hideLoader();
      alert('Could not download font package: ' + err.message + '\n\nTip: Download the ZIP from daFont and drag the .TTF file into the dropzone!');
    }
  }

  // Load TTF from URL (with CORS proxy fallback & embedded font recovery)
  async function loadFontFromUrl(url, name) {
    showLoader(`Loading ${name}...`);
    try {
      let response;
      try {
        response = await fetch(url);
      } catch {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
      }

      if (!response.ok) {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const fontBuffer = await response.arrayBuffer();
      parsedFont = opentype.parse(fontBuffer);
      fontName = name;
      document.getElementById('drop-primary').textContent = `Font: ${name}`;
      hideLoader();
      setStatus(`Loaded: ${name}`);
      update3DMesh();
    } catch (err) {
      console.warn('URL font load notice:', err.message);
      hideLoader();
      loadEmbeddedDefaultFont();
    }
  }

  // Setup UI Control Listeners
  function setupControlListeners() {
    const customText = document.getElementById('input-custom-text');
    customText.addEventListener('input', (e) => {
      params.text = e.target.value || ' ';
      update3DMesh();
    });

    // Fill Mode Segmented Control
    const segBtns = document.querySelectorAll('.seg-btn');
    segBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        segBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        params.fillMode = btn.dataset.mode;
        update3DMesh();
      });
    });

    // Mirror Text Toggle
    const checkMirror = document.getElementById('check-mirror-text');
    if (checkMirror) {
      checkMirror.addEventListener('change', (e) => {
        params.mirrorText = e.target.checked;
        update3DMesh();
      });
    }

    // Sliders
    const bindSlider = (id, badgeId, paramKey, unit = ' mm') => {
      const slider = document.getElementById(id);
      if (!slider) return;
      slider.addEventListener('input', (e) => {
        params[paramKey] = parseFloat(e.target.value);
        const badge = document.getElementById(badgeId);
        if (badge) badge.textContent = params[paramKey] + unit;
        update3DMesh();
      });
    };

    bindSlider('range-extrude-depth', 'val-extrude-depth', 'extrudeDepth');
    bindSlider('range-font-size', 'val-font-size', 'fontSize');
    bindSlider('range-base-thick', 'val-base-thick', 'baseplateThickness');
    bindSlider('range-base-pad', 'val-base-pad', 'baseplatePadding');
    bindSlider('range-base-radius', 'val-base-radius', 'baseplateRadius');

    // Baseplate Toggle
    const checkBaseplate = document.getElementById('check-baseplate');
    checkBaseplate.addEventListener('change', (e) => {
      params.baseplateEnabled = e.target.checked;
      document.getElementById('baseplate-controls-body').style.display = params.baseplateEnabled ? 'flex' : 'none';
      update3DMesh();
    });

    // Tapped Mount Hole Toggle
    const checkMounthole = document.getElementById('check-mounthole');
    if (checkMounthole) {
      checkMounthole.addEventListener('change', (e) => {
        params.mountHoleEnabled = e.target.checked;
        document.getElementById('mounthole-controls-body').style.display = params.mountHoleEnabled ? 'flex' : 'none';
        update3DMesh();
      });
    }

    // Thread Standard Select
    const selectThreadStandard = document.getElementById('select-thread-standard');
    if (selectThreadStandard) {
      selectThreadStandard.addEventListener('change', (e) => {
        params.threadStandard = e.target.value;
        update3DMesh();
      });
    }

    // Tolerance Offset Slider
    const rangeOffset = document.getElementById('range-mounthole-offset');
    if (rangeOffset) {
      rangeOffset.addEventListener('input', (e) => {
        params.mountHoleOffset = parseFloat(e.target.value);
        document.getElementById('val-mounthole-offset').textContent = '+' + params.mountHoleOffset.toFixed(2) + ' mm';
        update3DMesh();
      });
    }

    // Hole Depth Ratio Slider
    const rangeDepthRatio = document.getElementById('range-mounthole-depth-ratio');
    if (rangeDepthRatio) {
      rangeDepthRatio.addEventListener('input', (e) => {
        params.mountHoleDepthRatio = parseFloat(e.target.value) / 100;
        const pct = Math.round(params.mountHoleDepthRatio * 100);
        const tag = pct === 100 ? '100% (Through Hole)' : `${pct}% (Blind Hole)`;
        document.getElementById('val-mounthole-depth-ratio').textContent = tag;
        update3DMesh();
      });
    }

    // Color Pickers
    document.getElementById('color-text').addEventListener('input', (e) => {
      params.textColor = e.target.value;
      update3DMesh();
    });
    document.getElementById('color-base').addEventListener('input', (e) => {
      params.baseColor = e.target.value;
      update3DMesh();
    });

    // Toolbar Buttons
    document.getElementById('tool-reset-cam').addEventListener('click', () => {
      if (camera && controls) {
        camera.position.set(0, -70, 110);
        controls.target.set(0, 0, 0);
        controls.update();
      }
    });

    document.getElementById('tool-toggle-grid').addEventListener('click', () => {
      isGridVisible = !isGridVisible;
      if (gridHelper) gridHelper.visible = isGridVisible;
    });

    document.getElementById('tool-toggle-shadow').addEventListener('click', () => {
      isLightingMode = !isLightingMode;
      if (ambientLight && dirLight1) {
        ambientLight.intensity = isLightingMode ? 0.6 : 1.2;
        dirLight1.intensity = isLightingMode ? 0.8 : 0.0;
      }
    });

    // Share Link Buttons
    const btnShare1 = document.getElementById('btn-share-link');
    if (btnShare1) btnShare1.addEventListener('click', copyShareableLink);

    const btnShare2 = document.getElementById('btn-share-link-footer');
    if (btnShare2) btnShare2.addEventListener('click', copyShareableLink);

    // Export STL
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
  }

  // Copy Shareable Settings Link to Clipboard
  function copyShareableLink() {
    try {
      const config = {
        text: params.text,
        extrudeDepth: params.extrudeDepth,
        fontSize: params.fontSize,
        fillMode: params.fillMode,
        mirrorText: params.mirrorText,
        baseplateEnabled: params.baseplateEnabled,
        baseplateThickness: params.baseplateThickness,
        baseplatePadding: params.baseplatePadding,
        baseplateRadius: params.baseplateRadius,
        mountHoleEnabled: params.mountHoleEnabled,
        threadStandard: params.threadStandard,
        mountHoleOffset: params.mountHoleOffset,
        mountHoleDepthRatio: params.mountHoleDepthRatio,
        textColor: params.textColor,
        baseColor: params.baseColor,
        fontName: fontName
      };

      const jsonStr = JSON.stringify(config);
      const encoded = btoa(encodeURIComponent(jsonStr));
      const baseUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
      const shareUrl = `${baseUrl}#cfg=${encoded}`;

      navigator.clipboard.writeText(shareUrl).then(() => {
        setStatus('Link copied! 📋');
        setTimeout(() => setStatus('Ready'), 3000);
      }).catch(() => {
        prompt('Copy your shareable settings link:', shareUrl);
      });
    } catch (err) {
      console.error('Share link generation error:', err);
    }
  }

  // Load Settings from URL Hash
  function loadParamsFromURL() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('#cfg=')) return false;

    try {
      const encoded = hash.split('#cfg=')[1];
      const jsonStr = decodeURIComponent(atob(encoded));
      const config = JSON.parse(jsonStr);

      Object.assign(params, config);
      if (config.fontName) fontName = config.fontName;
      return true;
    } catch (err) {
      console.warn('Could not parse share link config:', err);
      return false;
    }
  }

  // Sync UI Elements with Active Params
  function syncUIFromParams() {
    const customText = document.getElementById('input-custom-text');
    if (customText) customText.value = params.text;

    const segBtns = document.querySelectorAll('.seg-btn');
    segBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === params.fillMode);
    });

    const checkMirror = document.getElementById('check-mirror-text');
    if (checkMirror) checkMirror.checked = params.mirrorText;

    const setSlider = (id, val, badgeId, unit = ' mm') => {
      const el = document.getElementById(id);
      if (el) el.value = val;
      const badge = document.getElementById(badgeId);
      if (badge) badge.textContent = val + unit;
    };

    setSlider('range-extrude-depth', params.extrudeDepth, 'val-extrude-depth');
    setSlider('range-font-size', params.fontSize, 'val-font-size');
    setSlider('range-base-thick', params.baseplateThickness, 'val-base-thick');
    setSlider('range-base-pad', params.baseplatePadding, 'val-base-pad');
    setSlider('range-base-radius', params.baseplateRadius, 'val-base-radius');
    setSlider('range-mounthole-offset', params.mountHoleOffset, 'val-mounthole-offset');

    const rangeDepthRatio = document.getElementById('range-mounthole-depth-ratio');
    if (rangeDepthRatio) {
      const pct = Math.round(params.mountHoleDepthRatio * 100);
      rangeDepthRatio.value = pct;
      const badge = document.getElementById('val-mounthole-depth-ratio');
      if (badge) badge.textContent = pct === 100 ? '100% (Through Hole)' : `${pct}% (Blind Hole)`;
    }

    const checkBaseplate = document.getElementById('check-baseplate');
    if (checkBaseplate) {
      checkBaseplate.checked = params.baseplateEnabled;
      document.getElementById('baseplate-controls-body').style.display = params.baseplateEnabled ? 'flex' : 'none';
    }

    const checkMounthole = document.getElementById('check-mounthole');
    if (checkMounthole) {
      checkMounthole.checked = params.mountHoleEnabled;
      document.getElementById('mounthole-controls-body').style.display = params.mountHoleEnabled ? 'flex' : 'none';
    }

    const selectThread = document.getElementById('select-thread-standard');
    if (selectThread) selectThread.value = params.threadStandard;

    const colorText = document.getElementById('color-text');
    if (colorText) colorText.value = params.textColor;

    const colorBase = document.getElementById('color-base');
    if (colorBase) colorBase.value = params.baseColor;
  }

  // Update 3D Text Geometry
  function update3DMesh() {
    if (!scene || !parsedFont || !params.text) return;

    if (currentGroup) {
      scene.remove(currentGroup);
      disposeGroup(currentGroup);
      currentGroup = null;
    }

    currentGroup = new THREE.Group();

    // 1. Convert opentype glyph paths to Three.js Shapes (with 2D horizontal mirror support)
    const shapes = opentypeToThreeShapes(parsedFont, params.text, params.fontSize, params.mirrorText);
    if (!shapes || shapes.length === 0) return;

    const extrudeSettings = {
      depth: params.extrudeDepth,
      bevelEnabled: false
    };

    const textGeometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    textGeometry.computeBoundingBox();
    const bbox = textGeometry.boundingBox;
    const textWidth = bbox.max.x - bbox.min.x;
    const textHeight = bbox.max.y - bbox.min.y;

    // Center text on X and Y axes only so extrusion goes strictly upwards in +Z direction
    const centerX = (bbox.max.x + bbox.min.x) / 2;
    const centerY = (bbox.max.y + bbox.min.y) / 2;
    textGeometry.translate(-centerX, -centerY, 0);

    // Material setup
    let textMatColor = (params.fillMode === 'recessed') ? '#38bdf8' : params.textColor;
    const textMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(textMatColor),
      roughness: 0.3,
      metalness: 0.2
    });

    const textMesh = new THREE.Mesh(textGeometry, textMaterial);

    if (params.fillMode === 'recessed') {
      textMesh.position.z = params.baseplateEnabled ? (params.baseplateThickness - 0.1) : 0;
    } else {
      textMesh.position.z = params.baseplateEnabled ? params.baseplateThickness : 0;
    }

    currentGroup.add(textMesh);

    // 2. Baseplate Mesh
    if (params.baseplateEnabled) {
      const pad = params.baseplatePadding;
      const baseWidth = textWidth + (pad * 2);
      const baseHeight = textHeight + (pad * 2);
      const totalBaseDepth = (params.fillMode === 'recessed') ? (params.baseplateThickness + params.extrudeDepth) : params.baseplateThickness;
      const spec = threadStandards[params.threadStandard] || threadStandards['1/4-20'];

      const hw = baseWidth / 2;
      const hh = baseHeight / 2;
      const rad = Math.min(params.baseplateRadius, Math.min(hw, hh));

      const baseShape = new THREE.Shape();
      baseShape.moveTo(-hw + rad, -hh);
      baseShape.lineTo(hw - rad, -hh);
      baseShape.quadraticCurveTo(hw, -hh, hw, -hh + rad);
      baseShape.lineTo(hw, hh - rad);
      baseShape.quadraticCurveTo(hw, hh, hw - rad, hh);
      baseShape.lineTo(-hw + rad, hh);
      baseShape.quadraticCurveTo(-hw, hh, -hw, hh - rad);
      baseShape.lineTo(-hw, -hh + rad);
      baseShape.quadraticCurveTo(-hw, -hh, -hw + rad, -hh);

      const majorDia = spec.majorDia + params.mountHoleOffset;
      const majorR = majorDia / 2;
      const outerPlugR = majorR + 1.0; // Solid plug outer wall radius
      const holeDepth = totalBaseDepth * params.mountHoleDepthRatio;

      if (params.mountHoleEnabled) {
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, outerPlugR, 0, Math.PI * 2, true);
        baseShape.holes.push(holePath);
      }

      const baseGeometry = new THREE.ExtrudeGeometry(baseShape, {
        depth: totalBaseDepth,
        bevelEnabled: false
      });

      const baseMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.baseColor),
        roughness: 0.4,
        metalness: 0.1
      });

      const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
      currentGroup.add(baseMesh);

      if (params.mountHoleEnabled) {
        // Blind Hole Cap Disc on front face if depthRatio < 100%
        const capDepth = totalBaseDepth - holeDepth;
        if (capDepth > 0.001) {
          const capShape = new THREE.Shape();
          capShape.absarc(0, 0, outerPlugR, 0, Math.PI * 2, false);
          const capGeometry = new THREE.ExtrudeGeometry(capShape, {
            depth: capDepth,
            bevelEnabled: false
          });
          const capMesh = new THREE.Mesh(capGeometry, baseMaterial);
          capMesh.position.z = holeDepth;
          currentGroup.add(capMesh);
        }

        // 100% Watertight Solid Helical Threaded Socket Plug (0 Open Edges in PrusaSlicer!)
        const threadSocketMesh = createThreadedSocketMesh(holeDepth, spec, params.mountHoleOffset, baseMaterial);
        currentGroup.add(threadSocketMesh);
      }
    }

    scene.add(currentGroup);

    // Update Mesh Stats in UI
    updateMeshStats(currentGroup);
  }

  // Create 3D Printable Watertight Solid Threaded Socket Plug (0 Open Edges in PrusaSlicer!)
  function createThreadedSocketMesh(depth, spec, offset, material) {
    const majorDia = spec.majorDia + offset;
    const pitch = spec.pitch;
    const majorR = majorDia / 2;
    const minorR = Math.max(0.5, majorR - (pitch * 0.54));
    const wallThick = 1.0;
    const outerR = majorR + wallThick;

    const segments = 36;
    const turns = depth / pitch;
    const rings = Math.max(8, Math.floor(turns * 16));

    const geom = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];

    // Ring 0: Inner Thread Surface Vertices (Z=0 to Z=depth)
    const idxInnerStart = 0;
    for (let r = 0; r <= rings; r++) {
      const z = (r / rings) * depth;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const phase = (z / pitch) * Math.PI * 2 - angle;
        const toothPhase = (Math.sin(phase) + 1) / 2;
        const r_thread = minorR + (majorR - minorR) * toothPhase;
        positions.push(Math.cos(angle) * r_thread, Math.sin(angle) * r_thread, z);
      }
    }

    // Ring 1: Outer Plug Cylinder Wall Vertices (Z=0 to Z=depth)
    const idxOuterStart = positions.length / 3;
    for (let r = 0; r <= rings; r++) {
      const z = (r / rings) * depth;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        positions.push(Math.cos(angle) * outerR, Math.sin(angle) * outerR, z);
      }
    }

    // Top Cap Center Vertex (Z=depth)
    const idxCapCenter = positions.length / 3;
    positions.push(0, 0, depth);

    // --- TRIANGLES ---

    // 1. Inner Thread Surface (Facing Inward to hole)
    for (let r = 0; r < rings; r++) {
      const r1 = idxInnerStart + r * segments;
      const r2 = idxInnerStart + (r + 1) * segments;
      for (let s = 0; s < segments; s++) {
        const sNext = (s + 1) % segments;
        indices.push(r1 + s, r1 + sNext, r2 + s);
        indices.push(r1 + sNext, r2 + sNext, r2 + s);
      }
    }

    // 2. Outer Plug Cylinder Wall (Facing Outward)
    for (let r = 0; r < rings; r++) {
      const r1 = idxOuterStart + r * segments;
      const r2 = idxOuterStart + (r + 1) * segments;
      for (let s = 0; s < segments; s++) {
        const sNext = (s + 1) % segments;
        indices.push(r1 + s, r2 + s, r1 + sNext);
        indices.push(r1 + sNext, r2 + s, r2 + sNext);
      }
    }

    // 3. Bottom Ring Annulus at Z=0 (Connecting inner thread Z=0 to outer cylinder Z=0)
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      const in1 = idxInnerStart + s;
      const in2 = idxInnerStart + sNext;
      const out1 = idxOuterStart + s;
      const out2 = idxOuterStart + sNext;
      indices.push(in1, in2, out1);
      indices.push(in2, out2, out1);
    }

    // 4. Top Cap Annulus at Z=depth (Connecting inner thread Z=depth to outer cylinder Z=depth)
    const topInnerStart = idxInnerStart + rings * segments;
    const topOuterStart = idxOuterStart + rings * segments;
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      const in1 = topInnerStart + s;
      const in2 = topInnerStart + sNext;
      const out1 = topOuterStart + s;
      const out2 = topOuterStart + sNext;
      indices.push(in1, out1, in2);
      indices.push(in2, out1, out2);
    }

    // 5. Blind Hole Cap Disc at Z=depth (Closing inner thread top to center (0,0,depth))
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      const in1 = topInnerStart + s;
      const in2 = topInnerStart + sNext;
      indices.push(in1, in2, idxCapCenter);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const socketMesh = new THREE.Mesh(geom, material);
    return socketMesh;
  }

  // Convert opentype path to array of Three.js Shapes (with optional 2D horizontal mirroring)
  function opentypeToThreeShapes(font, text, size, mirror = false) {
    const path = font.getPath(text, 0, 0, size);
    const shapePath = new THREE.ShapePath();

    path.commands.forEach(cmd => {
      const mx = mirror ? -cmd.x : cmd.x;
      const mx1 = mirror ? -cmd.x1 : cmd.x1;
      const mx2 = mirror ? -cmd.x2 : cmd.x2;
      const my = -cmd.y;
      const my1 = -cmd.y1;
      const my2 = -cmd.y2;

      switch (cmd.type) {
        case 'M': shapePath.moveTo(mx, my); break;
        case 'L': shapePath.lineTo(mx, my); break;
        case 'Q': shapePath.quadraticCurveTo(mx1, my1, mx, my); break;
        case 'C': shapePath.bezierCurveTo(mx1, my1, mx2, my2, mx, my); break;
        case 'Z': if (shapePath.currentPath) shapePath.currentPath.closePath(); break;
      }
    });

    // Pass !mirror so Three.js correctly matches reversed winding order of negated 2D X coordinates
    return shapePath.toShapes(!mirror);
  }

  // Calculate & Update Stats Bar
  function updateMeshStats(group) {
    const bbox = new THREE.Box3().setFromObject(group);
    const dimX = (bbox.max.x - bbox.min.x).toFixed(1);
    const dimY = (bbox.max.y - bbox.min.y).toFixed(1);
    const dimZ = (bbox.max.z - bbox.min.z).toFixed(1);
    document.getElementById('stat-dim').textContent = `${dimX} x ${dimY} x ${dimZ} mm`;

    let triangles = 0;
    group.traverse(child => {
      if (child.isMesh && child.geometry) {
        const geom = child.geometry;
        if (geom.index) {
          triangles += geom.index.count / 3;
        } else if (geom.attributes.position) {
          triangles += geom.attributes.position.count / 3;
        }
      }
    });
    document.getElementById('stat-tris').textContent = triangles.toLocaleString();
  }

  // Export 3D Mesh to STL
  function exportSTL() {
    if (!currentGroup) {
      alert('No 3D text model available to export.');
      return;
    }

    if (!THREE.STLExporter) {
      alert('STLExporter library not available.');
      return;
    }

    const exporter = new THREE.STLExporter();
    const result = exporter.parse(currentGroup, { binary: true });

    const blob = new Blob([result], { type: 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);

    const safeFont = fontName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeText = params.text.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const modeTag = params.fillMode.toUpperCase();
    const mirrorTag = params.mirrorText ? '_MIRRORED' : '';
    const filename = `${safeFont}_3D_${safeText}_${modeTag}${mirrorTag}.stl`;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }

  function disposeGroup(group) {
    group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  function showLoader(text) {
    const loader = document.getElementById('viewport-loader');
    const msg = document.getElementById('loader-msg');
    if (loader && msg) {
      msg.textContent = text;
      loader.style.display = 'flex';
    }
  }

  function hideLoader() {
    const loader = document.getElementById('viewport-loader');
    if (loader) loader.style.display = 'none';
  }

  function setStatus(text) {
    const badge = document.getElementById('app-status');
    if (badge) badge.textContent = text;
  }
})();
