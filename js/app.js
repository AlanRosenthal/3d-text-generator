// Optional Cloudflare Worker / Private Proxy URL
// Live Deployed Worker: https://3d-text-generator.alan-rosenthal.workers.dev
window.CUSTOM_PROXY_URL = 'https://3d-text-generator.alan-rosenthal.workers.dev';

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
    fillMode: 'embossed', // 'embossed', 'engraved'
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

    // Load zero-fetch embedded default font instantly (100% file:// protocol safe!)
    loadEmbeddedFont('arial');

    // Check if URL contains shareable settings
    const hasSharedParams = loadParamsFromURL();
    if (hasSharedParams) {
      syncUIFromParams();
      setStatus('Shared config loaded');
    }
  });

  function updateFontStatusText(name) {
    const elSub = document.getElementById('drop-sub');
    if (elSub) elSub.textContent = `Active Font: ${name}`;
    const elPri = document.getElementById('drop-primary');
    if (elPri) elPri.textContent = name;
  }

  // Load zero-fetch embedded font directly from RAM (100% file:// protocol safe!)
  function loadEmbeddedFont(fontKey = 'arial') {
    const key = fontKey || 'arial';
    if (window.EMBEDDED_FONTS && window.EMBEDDED_FONTS[key]) {
      try {
        const item = window.EMBEDDED_FONTS[key];
        const binaryString = atob(item.b64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        parsedFont = opentype.parse(bytes.buffer);
        fontName = item.name;
        updateFontStatusText(item.name);
        setStatus(`Loaded: ${item.name}`);
        update3DMesh();
        return true;
      } catch (err) {
        console.error('Embedded font parse error:', err);
      }
    } else if (window.DEFAULT_FONT_BASE64) {
      try {
        const binaryString = atob(window.DEFAULT_FONT_BASE64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        parsedFont = opentype.parse(bytes.buffer);
        fontName = 'Arial Bold';
        updateFontStatusText('Arial Bold');
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

  // Setup Card 1 Font Control Listeners
  function setupDropzone() {
    const dropzone = document.getElementById('font-dropzone');
    const fileInput = document.getElementById('font-file-input');

    if (dropzone && fileInput) {
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
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFontFile(e.target.files[0]);
        }
      });
    }

    // Standard Web Fonts Dropdown (100% RAM Embedded)
    const selectGoogleFont = document.getElementById('select-google-font');
    if (selectGoogleFont) {
      selectGoogleFont.addEventListener('change', (e) => {
        const fontKey = e.target.value;
        if (fontKey) {
          loadEmbeddedFont(fontKey);
        }
      });
    }

    // 2. daFont Custom URL / Name Importer
    const btnImportUrl = document.getElementById('btn-import-url');
    const dafontUrlInput = document.getElementById('dafont-url-input');

    const triggerImport = () => {
      const urlInput = dafontUrlInput ? dafontUrlInput.value.trim() : '';
      if (!urlInput) {
        alert('Please paste a daFont link, font name, or ZIP URL.');
        return;
      }
      importFromDafontURL(urlInput);
    };

    if (btnImportUrl) btnImportUrl.addEventListener('click', triggerImport);
    if (dafontUrlInput) {
      dafontUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          triggerImport();
        }
      });
    }

    // 3. Upload Custom Font Button
    const btnUploadFont = document.getElementById('btn-upload-font');
    if (btnUploadFont && fileInput) {
      btnUploadFont.addEventListener('click', () => fileInput.click());
    }

    // 4. Clear / Reset to Default Font Button
    const btnResetFont = document.getElementById('btn-reset-default-font');
    if (btnResetFont) {
      btnResetFont.addEventListener('click', () => {
        if (selectGoogleFont) selectGoogleFont.value = 'arial';
        if (dafontUrlInput) dafontUrlInput.value = '';
        if (fileInput) fileInput.value = '';
        loadEmbeddedFont('arial');
        setStatus('Reset to default font');
      });
    }
  }

  // Handle local TTF / OTF font file
  function handleFontFile(file) {
    if (!file.name.match(/\.(ttf|otf)$/i)) {
      alert('Please upload a valid .TTF or .OTF font file.');
      return;
    }

    fontName = file.name.replace(/\.(ttf|otf)$/i, '');
    updateFontStatusText(file.name);

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

  // Import font from daFont URL, slug, or direct ZIP/TTF
  async function importFromDafontURL(userInput) {
    const inputStr = userInput.trim();
    if (!inputStr) return;

    let slug = 'font';
    if (inputStr.includes('dafont.com') || inputStr.includes('f=')) {
      const match = inputStr.match(/f=([a-zA-Z0-9_-]+)/) || inputStr.match(/dafont\.com\/([a-zA-Z0-9_-]+)/);
      if (match && match[1] && match[1] !== 'dl') {
        slug = match[1].replace(/\.font$/i, '');
      }
    } else if (inputStr.match(/^[a-zA-Z0-9_-]+$/)) {
      slug = inputStr;
    }

    const zipUrl = (inputStr.startsWith('http://') || inputStr.startsWith('https://')) && inputStr.match(/\.(zip|ttf|otf)$/i)
      ? inputStr
      : `https://dl.dafont.com/dl/?f=${slug}`;

    const displayName = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    showLoader(`Fetching ${displayName}...`);

    try {
      let arrayBuffer = null;

      const proxies = [];

      if (window.CUSTOM_PROXY_URL) {
        const cleanWorker = window.CUSTOM_PROXY_URL.trim().replace(/\/+$/, '');
        proxies.push(`${cleanWorker}?f=${encodeURIComponent(slug)}`);
        proxies.push(`${cleanWorker}?url=${encodeURIComponent(zipUrl)}`);
      }

      proxies.push(`https://corsproxy.io/?${encodeURIComponent(zipUrl)}`);
      proxies.push(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(zipUrl)}`);
      proxies.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(zipUrl)}`);
      proxies.push(`https://thingproxy.freeboard.io/fetch/${zipUrl}`);

      for (const proxy of proxies) {
        try {
          const res = await fetch(proxy);
          if (res && res.ok) {
            const buf = await res.arrayBuffer();
            if (buf && buf.byteLength > 100) {
              const head = new Uint8Array(buf.slice(0, 4));
              const isZip = (head[0] === 0x50 && head[1] === 0x4B); // PK
              const isFont = (
                (head[0] === 0x4F && head[1] === 0x54 && head[2] === 0x54 && head[3] === 0x4F) || // OTTO
                (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00) || // TTF
                (head[0] === 0x74 && head[1] === 0x72 && head[2] === 0x75 && head[3] === 0x65)    // true
              );

              if (isZip || isFont) {
                arrayBuffer = buf;
                break;
              }
            }
          }
        } catch {
          // try next proxy
        }
      }

      if (!arrayBuffer) {
        throw new Error('Could not retrieve font package from daFont servers via CORS proxies.');
      }

      const head = new Uint8Array(arrayBuffer.slice(0, 4));
      const isFont = (
        (head[0] === 0x4F && head[1] === 0x54 && head[2] === 0x54 && head[3] === 0x4F) ||
        (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00) ||
        (head[0] === 0x74 && head[1] === 0x72 && head[2] === 0x75 && head[3] === 0x65)
      );

      showLoader('Parsing font glyphs...');

      if (isFont) {
        parsedFont = opentype.parse(arrayBuffer);
      } else {
        // Extract from ZIP package
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

        if (!fontZipFile) throw new Error('No .ttf or .otf file found inside ZIP package.');

        const fontBuffer = await fontZipFile.async('arraybuffer');
        parsedFont = opentype.parse(fontBuffer);
      }

      fontName = displayName;
      updateFontStatusText(`daFont: ${displayName}`);
      hideLoader();
      setStatus(`Imported: ${displayName}`);
      update3DMesh();
    } catch (err) {
      console.error('daFont import error:', err);
      hideLoader();
      alert(`Could not import daFont "${displayName}": ${err.message}\n\nTip: You can download the ZIP directly from daFont and click "Browse / Upload Custom Font" to select the .TTF file!`);
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
      updateFontStatusText(name);
      hideLoader();
      setStatus(`Loaded: ${name}`);
      update3DMesh();
    } catch (err) {
      console.warn('URL font load notice:', err.message);
      hideLoader();
      loadEmbeddedFont('arial');
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

  // Mirror 2D curve on X axis (x -> -x) with curve direction reversal to preserve 2D winding orientation
  function mirrorCurve2DX(curve) {
    if (curve.isLineCurve) {
      return new THREE.LineCurve(
        new THREE.Vector2(-curve.v2.x, curve.v2.y),
        new THREE.Vector2(-curve.v1.x, curve.v1.y)
      );
    } else if (curve.isQuadraticBezierCurve) {
      const p0 = curve.v0 || curve.v1;
      const p1 = curve.v1 || curve.v2;
      const p2 = curve.v2;
      return new THREE.QuadraticBezierCurve(
        new THREE.Vector2(-p2.x, p2.y),
        new THREE.Vector2(-p1.x, p1.y),
        new THREE.Vector2(-p0.x, p0.y)
      );
    } else if (curve.isCubicBezierCurve) {
      const p0 = curve.v0 || curve.v1;
      const p1 = curve.v1 || curve.v2;
      const p2 = curve.v2 || curve.v3;
      const p3 = curve.v3;
      return new THREE.CubicBezierCurve(
        new THREE.Vector2(-p3.x, p3.y),
        new THREE.Vector2(-p2.x, p2.y),
        new THREE.Vector2(-p1.x, p1.y),
        new THREE.Vector2(-p0.x, p0.y)
      );
    }
    return curve;
  }

  // Mirror 2D THREE.Shape on X axis
  function mirrorShape2DX(shape) {
    const newShape = new THREE.Shape();
    for (let i = shape.curves.length - 1; i >= 0; i--) {
      newShape.curves.push(mirrorCurve2DX(shape.curves[i]));
    }
    shape.holes.forEach(h => {
      const newHole = new THREE.Path();
      for (let j = h.curves.length - 1; j >= 0; j--) {
        newHole.curves.push(mirrorCurve2DX(h.curves[j]));
      }
      newShape.holes.push(newHole);
    });
    return newShape;
  }

  // Translate 2D vector curve by (dx, dy)
  function translateCurve2D(curve, dx, dy) {
    if (curve.isLineCurve) {
      return new THREE.LineCurve(
        new THREE.Vector2(curve.v1.x + dx, curve.v1.y + dy),
        new THREE.Vector2(curve.v2.x + dx, curve.v2.y + dy)
      );
    } else if (curve.isQuadraticBezierCurve) {
      const p0 = curve.v0 || curve.v1;
      const p1 = curve.v1 || curve.v2;
      const p2 = curve.v2;
      return new THREE.QuadraticBezierCurve(
        new THREE.Vector2(p0.x + dx, p0.y + dy),
        new THREE.Vector2(p1.x + dx, p1.y + dy),
        new THREE.Vector2(p2.x + dx, p2.y + dy)
      );
    } else if (curve.isCubicBezierCurve) {
      const p0 = curve.v0 || curve.v1;
      const p1 = curve.v1 || curve.v2;
      const p2 = curve.v2 || curve.v3;
      const p3 = curve.v3;
      return new THREE.CubicBezierCurve(
        new THREE.Vector2(p0.x + dx, p0.y + dy),
        new THREE.Vector2(p1.x + dx, p1.y + dy),
        new THREE.Vector2(p2.x + dx, p2.y + dy),
        new THREE.Vector2(p3.x + dx, p3.y + dy)
      );
    }
    return curve;
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

    // 1. Convert opentype glyph paths to Three.js Shapes
    const rawShapes = opentypeToThreeShapes(parsedFont, params.text, params.fontSize);
    if (!rawShapes || rawShapes.length === 0) return;

    // Compute 2D bounding box across all raw shapes to determine exact text center
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    rawShapes.forEach(s => {
      const pts = s.getPoints(12);
      pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });

    const centerX = (maxX + minX) / 2;
    const centerY = (maxY + minY) / 2;
    const textWidth = maxX - minX;
    const textHeight = maxY - minY;

    // Create 2D shapes centered around (0, 0)
    let shapes = rawShapes.map(s => {
      const cShape = new THREE.Shape();
      cShape.curves = s.curves.map(c => translateCurve2D(c, -centerX, -centerY));
      s.holes.forEach(h => {
        const cHole = new THREE.Path();
        cHole.curves = h.curves.map(c => translateCurve2D(c, -centerX, -centerY));
        cShape.holes.push(cHole);
      });
      return cShape;
    });

    if (params.mirrorText) {
      shapes = shapes.map(s => mirrorShape2DX(s));
    }

    const isEngraved = (params.fillMode === 'engraved');
    const totalBaseDepth = params.baseplateThickness;

    if (isEngraved) {
      // --- ENGRAVED (CARVED) MODE ---
      const recessDepth = Math.min(params.extrudeDepth, totalBaseDepth * 0.7);
      const floorThickness = Math.max(0.2, totalBaseDepth - recessDepth);

      // 1. Recessed Letter Floor Inlay Mesh (Z = floorThickness)
      const floorGeometry = new THREE.ExtrudeGeometry(shapes, { depth: 0.05, bevelEnabled: false });
      const textMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.textColor),
        roughness: 0.3,
        metalness: 0.2
      });
      const textMesh = new THREE.Mesh(floorGeometry, textMaterial);
      textMesh.position.z = params.baseplateEnabled ? floorThickness : 0;
      currentGroup.add(textMesh);

      // 2. Baseplate Mesh
      if (params.baseplateEnabled) {
        const pad = params.baseplatePadding;
        const baseWidth = textWidth + (pad * 2);
        const baseHeight = textHeight + (pad * 2);

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

        const spec = threadStandards[params.threadStandard] || threadStandards['1/4-20'];
        const majorDia = spec.majorDia + params.mountHoleOffset;
        const majorR = majorDia / 2;
        const outerPlugR = majorR + 1.0;
        const holeDepth = totalBaseDepth * params.mountHoleDepthRatio;

        const baseMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(params.baseColor),
          roughness: 0.4,
          metalness: 0.1
        });

        // A. Bottom Solid Baseplate Floor (Z=0 to Z=floorThickness)
        const bottomShape = new THREE.Shape();
        bottomShape.curves = baseShape.curves;
        if (params.mountHoleEnabled) {
          const holePath = new THREE.Path();
          holePath.absarc(0, 0, outerPlugR, 0, Math.PI * 2, true);
          bottomShape.holes.push(holePath);
        }
        const bottomGeometry = new THREE.ExtrudeGeometry(bottomShape, { depth: floorThickness, bevelEnabled: false });
        const bottomMesh = new THREE.Mesh(bottomGeometry, baseMaterial);
        bottomMesh.position.z = 0;
        currentGroup.add(bottomMesh);

        // B. Top Carved Baseplate Walls (Z=floorThickness to Z=totalBaseDepth)
        const topBaseShape = new THREE.Shape();
        topBaseShape.curves = baseShape.curves;
        shapes.forEach(s => {
          const letterHole = new THREE.Path();
          letterHole.curves = s.curves;
          topBaseShape.holes.push(letterHole);
        });
        if (params.mountHoleEnabled) {
          const holePath = new THREE.Path();
          holePath.absarc(0, 0, outerPlugR, 0, Math.PI * 2, true);
          topBaseShape.holes.push(holePath);
        }

        const topGeometry = new THREE.ExtrudeGeometry(topBaseShape, { depth: recessDepth, bevelEnabled: false });
        const topMesh = new THREE.Mesh(topGeometry, baseMaterial);
        topMesh.position.z = floorThickness;
        currentGroup.add(topMesh);

        // C. Inner Island Pillars for letters with holes ('A', 'B', 'P', 'R', 'g', 'o')
        shapes.forEach(s => {
          s.holes.forEach(h => {
            const islandShape = new THREE.Shape(h.curves);
            const islandGeometry = new THREE.ExtrudeGeometry(islandShape, { depth: recessDepth, bevelEnabled: false });
            const islandMesh = new THREE.Mesh(islandGeometry, baseMaterial);
            islandMesh.position.z = floorThickness;
            currentGroup.add(islandMesh);
          });
        });

        if (params.mountHoleEnabled) {
          const capDepth = totalBaseDepth - holeDepth;
          if (capDepth > 0.001) {
            const capShape = new THREE.Shape();
            capShape.absarc(0, 0, outerPlugR, 0, Math.PI * 2, false);
            const capGeometry = new THREE.ExtrudeGeometry(capShape, { depth: capDepth, bevelEnabled: false });
            const capMesh = new THREE.Mesh(capGeometry, baseMaterial);
            capMesh.position.z = holeDepth;
            currentGroup.add(capMesh);
          }

          const threadSocketMesh = createThreadedSocketMesh(holeDepth, spec, params.mountHoleOffset, baseMaterial);
          currentGroup.add(threadSocketMesh);
        }
      }
    } else {
      // --- EMBOSSED (RAISED) MODE ---
      const textDepth = params.extrudeDepth;
      const extrudeSettings = { depth: textDepth, bevelEnabled: false };
      const textGeometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);

      const textMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(params.textColor),
        roughness: 0.3,
        metalness: 0.2
      });

      const textMesh = new THREE.Mesh(textGeometry, textMaterial);
      textMesh.position.z = params.baseplateEnabled ? totalBaseDepth : 0;
      currentGroup.add(textMesh);

      if (params.baseplateEnabled) {
        const pad = params.baseplatePadding;
        const baseWidth = textWidth + (pad * 2);
        const baseHeight = textHeight + (pad * 2);

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

        const spec = threadStandards[params.threadStandard] || threadStandards['1/4-20'];
        const majorDia = spec.majorDia + params.mountHoleOffset;
        const majorR = majorDia / 2;
        const outerPlugR = majorR + 1.0;
        const holeDepth = totalBaseDepth * params.mountHoleDepthRatio;

        if (params.mountHoleEnabled) {
          const holePath = new THREE.Path();
          holePath.absarc(0, 0, outerPlugR, 0, Math.PI * 2, true);
          baseShape.holes.push(holePath);
        }

        const baseGeometry = new THREE.ExtrudeGeometry(baseShape, { depth: totalBaseDepth, bevelEnabled: false });
        const baseMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(params.baseColor),
          roughness: 0.4,
          metalness: 0.1
        });

        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        currentGroup.add(baseMesh);

        if (params.mountHoleEnabled) {
          const capDepth = totalBaseDepth - holeDepth;
          if (capDepth > 0.001) {
            const capShape = new THREE.Shape();
            capShape.absarc(0, 0, outerPlugR, 0, Math.PI * 2, false);
            const capGeometry = new THREE.ExtrudeGeometry(capShape, { depth: capDepth, bevelEnabled: false });
            const capMesh = new THREE.Mesh(capGeometry, baseMaterial);
            capMesh.position.z = holeDepth;
            currentGroup.add(capMesh);
          }

          const threadSocketMesh = createThreadedSocketMesh(holeDepth, spec, params.mountHoleOffset, baseMaterial);
          currentGroup.add(threadSocketMesh);
        }
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

  // Pure 2D Point-in-Polygon Containment Test (Ray-casting Algorithm)
  function pointInPolygon(point, vs) {
    const x = point.x !== undefined ? point.x : point[0];
    const y = point.y !== undefined ? point.y : point[1];
    let inside = false;

    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x !== undefined ? vs[i].x : vs[i][0];
      const yi = vs[i].y !== undefined ? vs[i].y : vs[i][1];
      const xj = vs[j].x !== undefined ? vs[j].x : vs[j][0];
      const yj = vs[j].y !== undefined ? vs[j].y : vs[j][1];

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  // Convert opentype path to array of Three.js Shapes using Pure 2D Point-in-Polygon Containment
  function opentypeToThreeShapes(font, text, size) {
    const shapes = [];
    const fontScale = (1 / (font.unitsPerEm || 1000)) * size;

    let currentX = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const glyph = font.charToGlyph(char);
      const advanceWidth = glyph.advanceWidth ? glyph.advanceWidth * fontScale : size * 0.6;

      const path = glyph.getPath(currentX, 0, size);
      const shapePath = new THREE.ShapePath();

      path.commands.forEach(cmd => {
        const mx = cmd.x;
        const mx1 = cmd.x1;
        const mx2 = cmd.x2;
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

      const subPaths = shapePath.subPaths;
      if (subPaths && subPaths.length > 0) {
        // Extract 2D sampled points and area for each subpath
        const pathInfos = [];
        subPaths.forEach(sp => {
          const pts = sp.getPoints(16);
          if (pts && pts.length >= 3) {
            // Deduplicate end point if identical to start point
            if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) {
              pts.pop();
            }
            if (pts.length >= 3) {
              const area = Math.abs(THREE.ShapeUtils.area(pts));
              pathInfos.push({
                subPath: sp,
                points: pts,
                area: area
              });
            }
          }
        });

        if (pathInfos.length > 0) {
          // Sort subpaths by area descending (largest outer boundaries first)
          pathInfos.sort((a, b) => b.area - a.area);

          const charRootShapes = [];

          // Classify each subpath of this character using point-in-polygon containment
          for (let k = 0; k < pathInfos.length; k++) {
            const pInfo = pathInfos[k];
            let parent = null;

            // Check if test point of pInfo lies inside any already established outer shape
            const testPt = pInfo.points[0];

            for (let m = 0; m < charRootShapes.length; m++) {
              const rShape = charRootShapes[m];
              if (pointInPolygon(testPt, rShape.points)) {
                parent = rShape;
                break;
              }
            }

            if (parent) {
              // Inside an outer shape -> add as inner hole!
              const holePath = new THREE.Path();
              holePath.curves = pInfo.subPath.curves;
              parent.shape.holes.push(holePath);
            } else {
              // Top-level solid outer shape!
              const shape = new THREE.Shape();
              shape.curves = pInfo.subPath.curves;
              charRootShapes.push({
                shape: shape,
                points: pInfo.points
              });
            }
          }

          charRootShapes.forEach(r => shapes.push(r.shape));
        }
      }

      currentX += advanceWidth;
    }

    return shapes;
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
