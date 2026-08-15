/**
 * 3D Text STL Studio — Core Application Logic for GitHub Pages
 */

// Cloudflare Worker API URL for zero-cors font package downloads
window.CUSTOM_PROXY_URL = 'https://3d-text-generator.alan-rosenthal.workers.dev';

(function () {
  'use strict';

  // Global State
  let scene, camera, renderer, controls, currentGroup;
  let gridHelper, ambientLight, dirLight1, dirLight2;
  let parsedFont = null;
  let fontName = 'Arial';
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
    text: 'Your Text Here',
    extrudeDepth: 5.0,
    fontSize: 25.0,
    letterSpacing: 0.0,
    textThickness: 0.0,
    fillMode: 'embossed', // 'embossed', 'engraved'
    mirrorText: false,
    baseplateEnabled: true,
    baseplateProfile: 'fillet', // 'fillet', 'chamfer', 'square'
    baseplateThickness: 2.0,
    baseplatePadding: 4.0,
    baseplateRadius: 4.0,
    mountHoleEnabled: false,
    threadStandard: '1/4-20',
    mountHoleOffset: 0.20,     // Tolerance compensation (+0.20mm to -0.50mm)
    mountHoleDepthRatio: 0.90, // 90% Blind Hole by default
    textColor: '#818cf8',
    baseColor: '#475569',
    threadColor: '#f59e0b'
  };

  document.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
    setupDropzone();
    setupControlListeners();

    // Check if URL contains shareable settings
    const hasSharedParams = loadParamsFromURL();
    if (hasSharedParams) {
      syncUIFromParams();
      setStatus('Shared config loaded');
    }

    // Load default font from RAM
    loadEmbeddedFont('arial');
  });

  function updateFontStatusText(name) {
    const elSub = document.getElementById('drop-sub');
    if (elSub) elSub.textContent = `Active Font: ${name}`;
    const elPri = document.getElementById('drop-primary');
    if (elPri) elPri.textContent = name;
  }

  // Load font directly from RAM
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
        fontName = 'Arial';
        updateFontStatusText('Arial');
        setStatus('Font ready');
        update3DMesh();
        return true;
      } catch (err) {
        console.error('Embedded font parse error:', err);
      }
    }
    return false;
  }

  // Setup WebGL Three.js Viewport
  function initThreeJS() {
    const container = document.getElementById('3d-viewport-container');
    const canvas = document.getElementById('webgl-canvas');

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, -90, 80);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;

    gridHelper = new THREE.GridHelper(200, 40, 0x475569, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    scene.add(gridHelper);

    ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(50, 50, 100);
    scene.add(dirLight1);

    dirLight2 = new THREE.DirectionalLight(0x818cf8, 0.4);
    dirLight2.position.set(-50, -50, 50);
    scene.add(dirLight2);

    window.addEventListener('resize', onWindowResize);
    animate();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function onWindowResize() {
    const container = document.getElementById('3d-viewport-container');
    if (!container || !renderer || !camera) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function setupDropzone() {
    const fileInput = document.getElementById('font-file-input');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFontFile(e.target.files[0]);
        }
      });
    }
  }

  function setupControlListeners() {
    const fileInput = document.getElementById('font-file-input');

    // Fonts Dropdown
    const selectGoogleFont = document.getElementById('select-google-font');
    if (selectGoogleFont) {
      selectGoogleFont.addEventListener('change', (e) => {
        const fontKey = e.target.value;
        if (fontKey) {
          loadEmbeddedFont(fontKey);
        }
      });
    }

    // daFont Custom URL / Name Importer
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

    // Upload Custom Font Button
    const btnUploadFont = document.getElementById('btn-upload-font');
    if (btnUploadFont && fileInput) {
      btnUploadFont.addEventListener('click', () => fileInput.click());
    }

    // Clear / Reset to Default Font Button
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

    // Text Input Listener
    const inputCustomText = document.getElementById('input-custom-text');
    if (inputCustomText) {
      inputCustomText.addEventListener('input', (e) => {
        params.text = e.target.value || ' ';
        update3DMesh();
      });
    }

    // Segmented Control (Embossed vs Engraved)
    const segBtns = document.querySelectorAll('.seg-btn');
    segBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        segBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        params.fillMode = e.target.getAttribute('data-mode') || 'embossed';

        const checkBaseplate = document.getElementById('check-baseplate');
        if (params.fillMode === 'engraved') {
          // Force enable baseplate for engraved mode!
          params.baseplateEnabled = true;
          if (checkBaseplate) {
            checkBaseplate.checked = true;
            checkBaseplate.disabled = true;
            document.getElementById('baseplate-controls-body').style.display = 'flex';
          }
        } else {
          if (checkBaseplate) {
            checkBaseplate.disabled = false;
          }
        }

        update3DMesh();
      });
    });

    // Mirror Text Toggle
    const checkMirrorText = document.getElementById('check-mirror-text');
    if (checkMirrorText) {
      checkMirrorText.addEventListener('change', (e) => {
        params.mirrorText = e.target.checked;
        update3DMesh();
      });
    }

    // Baseplate Corner Profile Dropdown
    const selectBaseProfile = document.getElementById('select-baseplate-profile');
    if (selectBaseProfile) {
      selectBaseProfile.addEventListener('change', (e) => {
        params.baseplateProfile = e.target.value || 'fillet';
        update3DMesh();
      });
    }

    // Baseplate Toggle
    const checkBaseplate = document.getElementById('check-baseplate');
    if (checkBaseplate) {
      checkBaseplate.addEventListener('change', (e) => {
        if (params.fillMode === 'engraved') {
          params.baseplateEnabled = true;
          checkBaseplate.checked = true;
          return;
        }
        params.baseplateEnabled = e.target.checked;
        document.getElementById('baseplate-controls-body').style.display = params.baseplateEnabled ? 'flex' : 'none';
        update3DMesh();
      });
    }

    // Mount Hole Toggle
    const checkMounthole = document.getElementById('check-mounthole');
    if (checkMounthole) {
      checkMounthole.addEventListener('change', (e) => {
        params.mountHoleEnabled = e.target.checked;
        document.getElementById('mounthole-controls-body').style.display = params.mountHoleEnabled ? 'flex' : 'none';
        update3DMesh();
      });
    }

    // Thread Standard Dropdown
    const selectThread = document.getElementById('select-thread-standard');
    if (selectThread) {
      selectThread.addEventListener('change', (e) => {
        params.threadStandard = e.target.value;
        update3DMesh();
      });
    }

    // Sliders Bindings
    bindSlider('range-extrude-depth', 'val-extrude-depth', (val) => { params.extrudeDepth = val; }, 'mm');
    bindSlider('range-font-size', 'val-font-size', (val) => { params.fontSize = val; }, 'mm');
    bindSlider('range-letter-spacing', 'val-letter-spacing', (val) => { params.letterSpacing = val; }, 'mm');
    bindSlider('range-text-thickness', 'val-text-thickness', (val) => { params.textThickness = val; }, 'mm');
    bindSlider('range-base-thick', 'val-base-thick', (val) => { params.baseplateThickness = val; }, 'mm');
    bindSlider('range-base-pad', 'val-base-pad', (val) => { params.baseplatePadding = val; }, 'mm');
    bindSlider('range-base-radius', 'val-base-radius', (val) => { params.baseplateRadius = val; }, 'mm');
    bindSlider('range-mounthole-offset', 'val-mounthole-offset', (val) => { params.mountHoleOffset = val; }, 'mm', true);

    const rangeDepthRatio = document.getElementById('range-mounthole-depth-ratio');
    if (rangeDepthRatio) {
      rangeDepthRatio.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        params.mountHoleDepthRatio = val / 100;
        const badge = document.getElementById('val-mounthole-depth-ratio');
        if (badge) badge.textContent = val === 100 ? '100% (Through Hole)' : `${val}% (Blind Hole)`;
        update3DMesh();
      });
    }

    // Color Pickers
    const colorText = document.getElementById('color-text');
    if (colorText) {
      colorText.addEventListener('input', (e) => {
        params.textColor = e.target.value;
        update3DMesh();
      });
    }

    const colorBase = document.getElementById('color-base');
    if (colorBase) {
      colorBase.addEventListener('input', (e) => {
        params.baseColor = e.target.value;
        update3DMesh();
      });
    }

    const colorThread = document.getElementById('color-thread');
    if (colorThread) {
      colorThread.addEventListener('input', (e) => {
        params.threadColor = e.target.value;
        update3DMesh();
      });
    }

    // Toolbar Actions
    const btnResetCam = document.getElementById('tool-reset-cam');
    if (btnResetCam) {
      btnResetCam.addEventListener('click', () => {
        camera.position.set(0, -90, 80);
        camera.lookAt(0, 0, 0);
        controls.reset();
      });
    }

    const btnToggleGrid = document.getElementById('tool-toggle-grid');
    if (btnToggleGrid) {
      btnToggleGrid.addEventListener('click', () => {
        isGridVisible = !isGridVisible;
        if (gridHelper) gridHelper.visible = isGridVisible;
      });
    }

    const btnToggleShadow = document.getElementById('tool-toggle-shadow');
    if (btnToggleShadow) {
      btnToggleShadow.addEventListener('click', () => {
        isLightingMode = !isLightingMode;
        dirLight1.intensity = isLightingMode ? 0.8 : 0.2;
        ambientLight.intensity = isLightingMode ? 0.7 : 1.2;
      });
    }

    // Shareable Link Buttons
    const btnShare = document.getElementById('btn-share-link');
    const btnShareFooter = document.getElementById('btn-share-link-footer');

    const handleShare = (btnEvt) => {
      const shareUrl = generateShareableURL();
      const targetBtn = btnEvt && btnEvt.currentTarget ? btnEvt.currentTarget : btnShare;

      const setCopySuccess = () => {
        setStatus('🔗 Link copied to clipboard!');
        if (targetBtn) {
          const origText = targetBtn.innerHTML;
          targetBtn.innerHTML = '✓ Copied!';
          targetBtn.style.borderColor = 'var(--accent-color, #818cf8)';
          setTimeout(() => {
            targetBtn.innerHTML = origText;
            targetBtn.style.borderColor = '';
          }, 2000);
        }
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(setCopySuccess).catch(() => {
          fallbackCopyTextToClipboard(shareUrl);
          setCopySuccess();
        });
      } else {
        fallbackCopyTextToClipboard(shareUrl);
        setCopySuccess();
      }
    };

    function fallbackCopyTextToClipboard(text) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch {
        // ignore
      }
      document.body.removeChild(textArea);
    }

    if (btnShare) btnShare.addEventListener('click', handleShare);
    if (btnShareFooter) btnShareFooter.addEventListener('click', handleShare);

    // Export STL Button
    const btnExport = document.getElementById('btn-export-stl');
    if (btnExport) btnExport.addEventListener('click', exportSTL);
  }

  function bindSlider(id, badgeId, updateParam, unit = '', showSign = false) {
    const slider = document.getElementById(id);
    const badge = document.getElementById(badgeId);
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        updateParam(val);
        if (badge) {
          const sign = (showSign && val > 0) ? '+' : '';
          badge.textContent = `${sign}${val.toFixed(1)} ${unit}`.trim();
        }
        update3DMesh();
      });
    }
  }

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

  // Import font via Cloudflare Worker API exclusively (Requirement 18: 0 external fallbacks!)
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

    const displayName = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    showLoader(`Fetching ${displayName}...`);

    const cleanWorker = window.CUSTOM_PROXY_URL.trim().replace(/\/+$/, '');
    const candidates = [
      `${cleanWorker}?f=${encodeURIComponent(slug.replace(/-/g, '_'))}`,
      `${cleanWorker}?f=${encodeURIComponent(slug)}`,
      `${cleanWorker}?url=${encodeURIComponent(inputStr)}`
    ];

    let arrayBuffer = null;
    let lastError = null;

    for (const workerUrl of candidates) {
      try {
        const res = await fetch(workerUrl);
        if (res && res.ok) {
          const buf = await res.arrayBuffer();
          if (buf && buf.byteLength > 100) {
            arrayBuffer = buf;
            break;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!arrayBuffer) {
      throw new Error(lastError ? lastError.message : 'Cloudflare Worker proxy could not retrieve font package');
    }

      const head = new Uint8Array(arrayBuffer.slice(0, 4));
      const isFont = (
        (head[0] === 0x4F && head[1] === 0x54 && head[2] === 0x54 && head[3] === 0x4F) || // OTTO
        (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00) || // TTF
        (head[0] === 0x74 && head[1] === 0x72 && head[2] === 0x75 && head[3] === 0x65)    // true
      );

      showLoader('Parsing font glyphs...');

      if (isFont) {
        parsedFont = opentype.parse(arrayBuffer);
      } else {
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
      console.error('daFont import error via Worker API:', err);
      hideLoader();
      alert(`Could not import daFont "${displayName}": ${err.message}\n\nTip: You can download the ZIP directly from daFont and click "📁 Upload" to select the .TTF file!`);
    }
  }

  // Create Baseplate 2D Shape with Corner Profile (Fillet, Chamfer, Square)
  function createBaseplateShape(hw, hh, rad, profile = 'fillet') {
    const shape = new THREE.Shape();
    const r = Math.min(rad, Math.min(hw, hh));

    if (profile === 'square' || r <= 0.001) {
      shape.moveTo(-hw, -hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(hw, hh);
      shape.lineTo(-hw, hh);
      shape.lineTo(-hw, -hh);
    } else if (profile === 'chamfer') {
      shape.moveTo(-hw + r, -hh);
      shape.lineTo(hw - r, -hh);
      shape.lineTo(hw, -hh + r);
      shape.lineTo(hw, hh - r);
      shape.lineTo(hw - r, hh);
      shape.lineTo(-hw + r, hh);
      shape.lineTo(-hw, hh - r);
      shape.lineTo(-hw, -hh + r);
      shape.lineTo(-hw + r, -hh);
    } else {
      // Fillet (Round)
      shape.moveTo(-hw + r, -hh);
      shape.lineTo(hw - r, -hh);
      shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
      shape.lineTo(hw, hh - r);
      shape.quadraticCurveTo(hw, hh, hw - r, hh);
      shape.lineTo(-hw + r, hh);
      shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
      shape.lineTo(-hw, -hh + r);
      shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    }
    return shape;
  }

  // Mirror 2D curve on X axis (x -> -x) with curve direction reversal
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
    const rawShapes = opentypeToThreeShapes(parsedFont, params.text, params.fontSize, params.letterSpacing, params.textThickness);
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
    if (isEngraved) {
      params.baseplateEnabled = true;
    }

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
      textMesh.position.z = floorThickness;
      currentGroup.add(textMesh);

      // 2. Baseplate Mesh
      if (params.baseplateEnabled) {
        const pad = params.baseplatePadding;
        const baseWidth = textWidth + (pad * 2);
        const baseHeight = textHeight + (pad * 2);

        const hw = baseWidth / 2;
        const hh = baseHeight / 2;
        const rad = Math.min(params.baseplateRadius, Math.min(hw, hh));

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

        const threadMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(params.threadColor),
          roughness: 0.3,
          metalness: 0.5
        });

        // A. Bottom Solid Baseplate Floor (Z=0 to Z=floorThickness)
        const bottomShape = createBaseplateShape(hw, hh, rad, params.baseplateProfile);
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
        const topBaseShape = createBaseplateShape(hw, hh, rad, params.baseplateProfile);
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

        // C. Inner Island Pillars for letters with holes ('A', 'B', 'P', 'R', 'g', 'o', '0', '8')
        shapes.forEach(s => {
          s.holes.forEach(h => {
            const islandShape = new THREE.Shape();
            islandShape.curves = h.curves;
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

          const threadSocketMesh = createThreadedSocketMesh(holeDepth, spec, params.mountHoleOffset, threadMaterial);
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

        const baseShape = createBaseplateShape(hw, hh, rad, params.baseplateProfile);

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

        const threadMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(params.threadColor),
          roughness: 0.3,
          metalness: 0.5
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

          const threadSocketMesh = createThreadedSocketMesh(holeDepth, spec, params.mountHoleOffset, threadMaterial);
          currentGroup.add(threadSocketMesh);
        }
      }
    }

    scene.add(currentGroup);
    updateMeshStats(currentGroup);
  }

  // Create 3D Printable Watertight Solid Threaded Socket Plug (0 Open Edges in PrusaSlicer!)
  function createThreadedSocketMesh(depth, spec, offset, material) {
    const majorDia = spec.majorDia + offset;
    const pitch = spec.pitch;
    const majorR = Math.max(0.5, majorDia / 2);
    const minorR = Math.max(0.3, majorR - (pitch * 0.54));
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

    // 3. Bottom Ring Annulus at Z=0
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      const in1 = idxInnerStart + s;
      const in2 = idxInnerStart + sNext;
      const out1 = idxOuterStart + s;
      const out2 = idxOuterStart + sNext;
      indices.push(in1, in2, out1);
      indices.push(in2, out2, out1);
    }

    // 4. Top Cap Annulus at Z=depth
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

    // 5. Blind Hole Cap Disc at Z=depth
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
  function opentypeToThreeShapes(font, text, size, letterSpacing = 0, textThickness = 0) {
    const shapes = [];
    const effectiveSize = Math.max(2, size + (textThickness * 2));
    const fontScale = (1 / (font.unitsPerEm || 1000)) * effectiveSize;

    let currentX = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const glyph = font.charToGlyph(char);
      const advanceWidth = (glyph.advanceWidth ? glyph.advanceWidth * fontScale : effectiveSize * 0.6) + letterSpacing;

      const path = glyph.getPath(currentX, 0, effectiveSize);
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
        const pathInfos = [];
        subPaths.forEach(sp => {
          const pts = sp.getPoints(16);
          if (pts && pts.length >= 3) {
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
          pathInfos.sort((a, b) => b.area - a.area);
          const charRootShapes = [];

          for (let k = 0; k < pathInfos.length; k++) {
            const pInfo = pathInfos[k];
            let parent = null;
            const testPt = pInfo.points[0];

            for (let m = 0; m < charRootShapes.length; m++) {
              const rShape = charRootShapes[m];
              if (pointInPolygon(testPt, rShape.points)) {
                parent = rShape;
                break;
              }
            }

            if (parent) {
              const holePath = new THREE.Path();
              holePath.curves = pInfo.subPath.curves;
              parent.shape.holes.push(holePath);
            } else {
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
    const elDim = document.getElementById('stat-dim');
    if (elDim) elDim.textContent = `${dimX} x ${dimY} x ${dimZ} mm`;

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
    const elTris = document.getElementById('stat-tris');
    if (elTris) elTris.textContent = triangles.toLocaleString();
  }

  // Human-Readable Shareable Link Generator
  function generateShareableURL() {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('text', params.text);
    url.searchParams.set('font', fontName);
    url.searchParams.set('style', params.fillMode);
    url.searchParams.set('extrudeDepth', params.extrudeDepth);
    url.searchParams.set('fontHeight', params.fontSize);
    url.searchParams.set('letterSpacing', params.letterSpacing);
    url.searchParams.set('textThickness', params.textThickness);
    url.searchParams.set('mirrorText', params.mirrorText ? 'true' : 'false');
    url.searchParams.set('baseplate', params.baseplateEnabled ? 'true' : 'false');
    url.searchParams.set('baseProfile', params.baseplateProfile);
    url.searchParams.set('baseThickness', params.baseplateThickness);
    url.searchParams.set('basePadding', params.baseplatePadding);
    url.searchParams.set('baseRadius', params.baseplateRadius);
    url.searchParams.set('mountHole', params.mountHoleEnabled ? 'true' : 'false');
    url.searchParams.set('threadStandard', params.threadStandard);
    url.searchParams.set('tolerance', params.mountHoleOffset);
    url.searchParams.set('holeDepthRatio', params.mountHoleDepthRatio);
    url.searchParams.set('textColor', params.textColor);
    url.searchParams.set('baseColor', params.baseColor);
    url.searchParams.set('threadColor', params.threadColor);

    return url.toString();
  }

  // Parse Human-Readable Query Parameters on Startup
  function loadParamsFromURL() {
    const searchParams = new URLSearchParams(window.location.search);
    if (!searchParams.has('text') && !searchParams.has('style')) return false;

    if (searchParams.has('text')) params.text = searchParams.get('text');
    if (searchParams.has('style')) params.fillMode = searchParams.get('style');
    if (searchParams.has('extrudeDepth')) params.extrudeDepth = parseFloat(searchParams.get('extrudeDepth'));
    if (searchParams.has('fontHeight')) params.fontSize = parseFloat(searchParams.get('fontHeight'));
    if (searchParams.has('letterSpacing')) params.letterSpacing = parseFloat(searchParams.get('letterSpacing'));
    if (searchParams.has('textThickness')) params.textThickness = parseFloat(searchParams.get('textThickness'));
    if (searchParams.has('mirrorText')) params.mirrorText = searchParams.get('mirrorText') === 'true';
    if (searchParams.has('baseplate')) params.baseplateEnabled = searchParams.get('baseplate') === 'true';
    if (searchParams.has('baseProfile')) params.baseplateProfile = searchParams.get('baseProfile');
    if (searchParams.has('baseThickness')) params.baseplateThickness = parseFloat(searchParams.get('baseThickness'));
    if (searchParams.has('basePadding')) params.baseplatePadding = parseFloat(searchParams.get('basePadding'));
    if (searchParams.has('baseRadius')) params.baseplateRadius = parseFloat(searchParams.get('baseRadius'));
    if (searchParams.has('mountHole')) params.mountHoleEnabled = searchParams.get('mountHole') === 'true';
    if (searchParams.has('threadStandard')) params.threadStandard = searchParams.get('threadStandard');
    if (searchParams.has('tolerance')) params.mountHoleOffset = parseFloat(searchParams.get('tolerance'));
    if (searchParams.has('holeDepthRatio')) params.mountHoleDepthRatio = parseFloat(searchParams.get('holeDepthRatio'));
    if (searchParams.has('textColor')) params.textColor = searchParams.get('textColor');
    if (searchParams.has('baseColor')) params.baseColor = searchParams.get('baseColor');
    if (searchParams.has('threadColor')) params.threadColor = searchParams.get('threadColor');

    if (params.fillMode === 'engraved') {
      params.baseplateEnabled = true;
    }

    return true;
  }

  function syncUIFromParams() {
    const inputCustomText = document.getElementById('input-custom-text');
    if (inputCustomText) inputCustomText.value = params.text;

    const segBtns = document.querySelectorAll('.seg-btn');
    segBtns.forEach(btn => {
      const mode = btn.getAttribute('data-mode');
      if (mode === params.fillMode) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    const checkMirrorText = document.getElementById('check-mirror-text');
    if (checkMirrorText) checkMirrorText.checked = params.mirrorText;

    const selectBaseProfile = document.getElementById('select-baseplate-profile');
    if (selectBaseProfile) selectBaseProfile.value = params.baseplateProfile;

    bindSliderValue('range-extrude-depth', params.extrudeDepth, 'val-extrude-depth', 'mm');
    bindSliderValue('range-font-size', params.fontSize, 'val-font-size', 'mm');
    bindSliderValue('range-letter-spacing', params.letterSpacing, 'val-letter-spacing', 'mm');
    bindSliderValue('range-text-thickness', params.textThickness, 'val-text-thickness', 'mm');
    bindSliderValue('range-base-thick', params.baseplateThickness, 'val-base-thick', 'mm');
    bindSliderValue('range-base-pad', params.baseplatePadding, 'val-base-pad', 'mm');
    bindSliderValue('range-base-radius', params.baseplateRadius, 'val-base-radius', 'mm');
    bindSliderValue('range-mounthole-offset', params.mountHoleOffset, 'val-mounthole-offset', 'mm', true);

    const checkBaseplate = document.getElementById('check-baseplate');
    if (checkBaseplate) {
      checkBaseplate.checked = params.baseplateEnabled;
      document.getElementById('baseplate-controls-body').style.display = params.baseplateEnabled ? 'flex' : 'none';
      if (params.fillMode === 'engraved') {
        checkBaseplate.disabled = true;
      }
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

    const colorThread = document.getElementById('color-thread');
    if (colorThread) colorThread.value = params.threadColor;
  }

  function bindSliderValue(sliderId, value, badgeId, unit = '', showSign = false) {
    const slider = document.getElementById(sliderId);
    const badge = document.getElementById(badgeId);
    if (slider) slider.value = value;
    if (badge) {
      const sign = (showSign && value > 0) ? '+' : '';
      badge.textContent = `${sign}${value.toFixed(1)} ${unit}`.trim();
    }
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
