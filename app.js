/* ================================================================
   App Module — Main application logic, UI events, rendering
   ================================================================ */

(() => {
    'use strict';

    // --- State ---
    let iqData = null;          // Float32Array of interleaved I,Q
    let spectrogramResult = null; // { data, numRows, numCols, hopSize }
    let currentView = 'spectrogram';
    let currentColormap = 'viridis';
    let sampleRate = 2400000;
    let centerFreq = 0;
    let fftSize = 1024;
    let windowFunc = 'hann';
    let dynamicRangeMin = -100;
    let dynamicRangeMax = -20;
    let viewStartRow = 0;
    let viewEndRow = 0;
    let viewStartCol = 0;
    let viewEndCol = 0;
    let fileName = '';

    // Zoom & Pan state
    let zoomLevel = 1;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartRow = 0;
    let panStartCol = 0;

    // Chirp analysis state
    let chirpFrames = [];
    let chirpOverlayEnabled = true;
    let detectedChirps = [];

    // --- DOM References ---
    const dom = {
        dropZoneContainer: document.getElementById('dropZoneContainer'),
        dropZone: document.getElementById('dropZone'),
        fileInput: document.getElementById('fileInput'),
        settingsModal: document.getElementById('settingsModal'),
        modalClose: document.getElementById('modalClose'),
        analysisContainer: document.getElementById('analysisContainer'),
        mainCanvas: document.getElementById('mainCanvas'),
        overviewCanvas: document.getElementById('overviewCanvas'),
        canvasWrapper: document.getElementById('canvasWrapper'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        progressFill: document.getElementById('progressFill'),
        fileInfo: document.getElementById('fileInfo'),
        fileName: document.getElementById('fileName'),
        fileSize: document.getElementById('fileSize'),
        btnNewFile: document.getElementById('btnNewFile'),
        btnAnalyze: document.getElementById('btnAnalyze'),
        btnSettings: document.getElementById('btnSettings'),
        btnExport: document.getElementById('btnExport'),
        sampleRateInput: document.getElementById('sampleRate'),
        centerFreqInput: document.getElementById('centerFreq'),
        fftSizeSelect: document.getElementById('fftSize'),
        windowFuncSelect: document.getElementById('windowFunc'),
        colormapOptions: document.getElementById('colormapOptions'),
        rangeMin: document.getElementById('rangeMin'),
        rangeMax: document.getElementById('rangeMax'),
        rangeMinVal: document.getElementById('rangeMinVal'),
        rangeMaxVal: document.getElementById('rangeMaxVal'),
        rangeControl: document.getElementById('rangeControl'),
        timeNav: document.getElementById('timeNav'),
        infoSamples: document.getElementById('infoSamples'),
        infoDuration: document.getElementById('infoDuration'),
        infoSR: document.getElementById('infoSR'),
        cursorInfo: document.getElementById('cursorInfo'),
        cursorFreq: document.getElementById('cursorFreq'),
        cursorTime: document.getElementById('cursorTime'),
        cursorPower: document.getElementById('cursorPower'),
        cursorDeltaFreq: document.getElementById('cursorDeltaFreq'),
        cursorDeltaTime: document.getElementById('cursorDeltaTime'),
        sliderWindow: document.getElementById('sliderWindow'),
        // Zoom controls
        btnZoomIn: document.getElementById('btnZoomIn'),
        btnZoomOut: document.getElementById('btnZoomOut'),
        btnZoomReset: document.getElementById('btnZoomReset'),
        btnPlayback: document.getElementById('btnPlayback'),
        zoomLevel: document.getElementById('zoomLevel'),
        // Chirp panel
        chirpPanel: document.getElementById('chirpPanel'),
        chirpOverlay: document.getElementById('chirpOverlay'),
        chirpSF: document.getElementById('chirpSF'),
        chirpBW: document.getElementById('chirpBW'),
        chirpThreshold: document.getElementById('chirpThreshold'),
        chirpThresholdVal: document.getElementById('chirpThresholdVal'),
        btnDetectChirps: document.getElementById('btnDetectChirps'),
        btnDetectChirps: document.getElementById('btnDetectChirps'),
        chirpResults: document.getElementById('chirpResults'),
        // Overlap
        overlapInput: document.getElementById('overlap'),
        overlapValue: document.getElementById('overlapValue'),
        // Crosshair & power sidebar
        crosshairCanvas: document.getElementById('crosshairCanvas'),
        powerSidebar: document.getElementById('powerSidebar'),
        powerCanvas: document.getElementById('powerCanvas'),
    };

    // --- Utilities ---
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function formatFrequency(hz) {
        const absHz = Math.abs(hz);
        if (absHz >= 1e9) return (hz / 1e9).toFixed(3) + ' GHz';
        if (absHz >= 1e6) return (hz / 1e6).toFixed(3) + ' MHz';
        if (absHz >= 1e3) return (hz / 1e3).toFixed(1) + ' kHz';
        return hz.toFixed(0) + ' Hz';
    }

    function formatTime(seconds) {
        const absSec = Math.abs(seconds);
        if (absSec < 1e-3) return (seconds * 1e6).toFixed(1) + ' µs';
        if (absSec < 1) return (seconds * 1e3).toFixed(2) + ' ms';
        return seconds.toFixed(3) + ' s';
    }

    // --- Drag & Drop ---
    function initDragDrop() {
        const dz = dom.dropZone;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
            dz.addEventListener(event, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        dz.addEventListener('dragenter', () => dz.classList.add('drag-over'));
        dz.addEventListener('dragover', () => dz.classList.add('drag-over'));
        dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
        dz.addEventListener('drop', e => {
            dz.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFile(files[0]);
        });

        dz.addEventListener('click', () => dom.fileInput.click());
        dom.fileInput.addEventListener('change', e => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });
    }

    function handleFile(file) {
        if (!file.name.endsWith('.cf32')) {
            alert('Only .cf32 (Complex Float32) files are supported');
            return;
        }

        fileName = file.name;
        dom.fileName.textContent = file.name;
        dom.fileSize.textContent = formatBytes(file.size);

        // Read file as ArrayBuffer
        const reader = new FileReader();
        reader.onload = (e) => {
            iqData = new Float32Array(e.target.result);
            showSettingsModal();
        };
        reader.readAsArrayBuffer(file);
    }

    // --- Settings Modal ---
    function showSettingsModal() {
        dom.settingsModal.style.display = 'flex';
    }

    function hideSettingsModal() {
        dom.settingsModal.style.display = 'none';
    }

    function initSettingsModal() {
        dom.modalClose.addEventListener('click', hideSettingsModal);
        dom.settingsModal.addEventListener('click', e => {
            if (e.target === dom.settingsModal) hideSettingsModal();
        });

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.value;
                const targetId = btn.dataset.target;
                
                if (targetId) {
                    const input = document.getElementById(targetId);
                    if (input) {
                        input.value = value;
                        // Trigger input event to update displays
                        input.dispatchEvent(new Event('input'));
                    }
                } else {
                    const input = btn.closest('.input-with-presets').querySelector('input');
                    if (input) input.value = value;
                }
                
                // Mark active
                btn.closest('.presets').querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Overlap slider text
        if (dom.overlapInput) {
            dom.overlapInput.addEventListener('input', () => {
                dom.overlapValue.textContent = dom.overlapInput.value + '%';
            });
        }

        // Colormap selection
        dom.colormapOptions.querySelectorAll('.colormap-option').forEach(opt => {
            opt.addEventListener('click', () => {
                dom.colormapOptions.querySelectorAll('.colormap-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                currentColormap = opt.dataset.value;
            });
        });

        // Analyze button
        dom.btnAnalyze.addEventListener('click', startAnalysis);
    }

    // --- Analysis ---
    function startAnalysis() {
        sampleRate = parseInt(dom.sampleRateInput.value) || 2400000;
        centerFreq = parseInt(dom.centerFreqInput.value) || 0;
        fftSize = parseInt(dom.fftSizeSelect.value) || 1024;
        windowFunc = dom.windowFuncSelect.value;

        hideSettingsModal();
        showAnalysisView();
        showLoading('Computing FFT...');

        // Use requestAnimationFrame + setTimeout to let the UI update
        setTimeout(() => {
            computeAndRender();
        }, 100);
    }

    function getOverlap() {
        return (parseFloat(dom.overlapInput.value) || 87.5) / 100;
    }

    function computeAndRender() {
        const startTime = performance.now();

        spectrogramResult = DSP.computeSpectrogram(
            iqData, fftSize, windowFunc, getOverlap(),
            (progress) => {
                dom.progressFill.style.width = (progress * 100) + '%';
                dom.loadingText.textContent = `Computing FFT... ${Math.round(progress * 100)}%`;
            }
        );

        const elapsed = performance.now() - startTime;
        console.log(`Spectrogram computed in ${elapsed.toFixed(0)}ms: ${spectrogramResult.numRows} rows × ${spectrogramResult.numCols} cols`);

        // Update info
        const numSamples = iqData.length / 2;
        const duration = numSamples / sampleRate;
        dom.infoSamples.textContent = `${(numSamples / 1e6).toFixed(2)}M samples`;
        dom.infoDuration.textContent = formatTime(duration);
        dom.infoSR.textContent = formatFrequency(sampleRate) + '/s';

        // Set view range
        viewStartRow = 0;
        viewEndRow = spectrogramResult.numRows;
        viewStartCol = 0;
        viewEndCol = spectrogramResult.numCols;

        zoomLevel = 1;
        dom.zoomLevel.textContent = '100%';
        chirpFrames = [];
        detectedChirps = [];

        hideLoading();
        renderCurrentView();
        renderOverview();
    }
    
    let isPlaybackRunning = false;
    let playbackAnimationId = null;
    let lastPlaybackTime = 0;
    let playbackRow = -1;

    function togglePlayback() {
        if (!spectrogramResult) return;
        
        isPlaybackRunning = !isPlaybackRunning;
        const iconPlay = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-play"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        const iconPause = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-pause"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        
        dom.btnPlayback.innerHTML = isPlaybackRunning ? iconPause : iconPlay;
        dom.btnPlayback.classList.toggle('btn-primary', isPlaybackRunning);
        dom.btnPlayback.classList.toggle('btn-ghost', !isPlaybackRunning);

        if (isPlaybackRunning) {
            if (playbackRow < viewStartRow || playbackRow > viewEndRow) {
                playbackRow = viewStartRow;
            }
            lastPlaybackTime = performance.now();
            playbackLoop(performance.now());
        } else {
            if (playbackAnimationId) {
                cancelAnimationFrame(playbackAnimationId);
                playbackAnimationId = null;
            }
            // Trigger one last render to keep the cursor visible when paused
            window.dispatchEvent(new Event('render-overlays'));
        }
    }
    
    function playbackLoop(timestamp) {
        if (!isPlaybackRunning || !spectrogramResult) return;
        
        const dt = timestamp - lastPlaybackTime;
        lastPlaybackTime = timestamp;
        
        // Decrease speed: Scroll 10% of the visible screen per second (slower, more manageable)
        const rowsPerSecond = (viewEndRow - viewStartRow) * 0.1; 
        let shiftRows = (rowsPerSecond * dt) / 1000;
        if (shiftRows < 0.1) shiftRows = 0.1;
        
        playbackRow += shiftRows;
        
        if (playbackRow >= spectrogramResult.numRows - 1) {
            playbackRow = spectrogramResult.numRows - 1;
            togglePlayback();
            window.dispatchEvent(new Event('render-overlays'));
            return;
        }
        
        if (playbackRow > viewEndRow) {
            const range = viewEndRow - viewStartRow;
            viewStartRow = Math.floor(playbackRow);
            viewEndRow = viewStartRow + range;
            if (viewEndRow > spectrogramResult.numRows) {
                viewEndRow = spectrogramResult.numRows;
                viewStartRow = Math.max(0, viewEndRow - range);
            }
            renderCurrentView();
            renderOverview();
        }
        
        window.dispatchEvent(new Event('render-overlays'));
        
        playbackAnimationId = requestAnimationFrame(playbackLoop);
    }
    
    function showAnalysisView() {
        // dom.dropZoneContainer.style.display = 'none'; // Keep drop zone visible
        dom.analysisContainer.style.display = 'flex';
        dom.fileInfo.style.display = 'flex';
        // dom.btnNewFile.style.display = 'flex'; // Not needed since drop zone is visible
        resizeCanvas();
    }

    function showLoading(text) {
        dom.loadingOverlay.style.display = 'flex';
        dom.loadingText.textContent = text || 'Processing...';
        dom.progressFill.style.width = '0%';
    }

    function hideLoading() {
        dom.loadingOverlay.style.display = 'none';
    }

    // --- Canvas Rendering ---
    function resizeCanvas() {
        const wrapper = dom.canvasWrapper;
        const canvas = dom.mainCanvas;
        const crosshair = dom.crosshairCanvas;
        
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        if (crosshair) {
            crosshair.width = canvas.width;
            crosshair.height = canvas.height;
            crosshair.style.width = canvas.style.width;
            crosshair.style.height = canvas.style.height;
        }

        const sidebar = dom.powerSidebar;
        const powerCanvas = dom.powerCanvas;
        if (sidebar && powerCanvas) {
            const sideRect = sidebar.getBoundingClientRect();
            powerCanvas.width = sideRect.width * dpr;
            powerCanvas.height = sideRect.height * dpr;
        }

        // Overview canvas
        const ovRect = dom.timeNav.getBoundingClientRect();
        dom.overviewCanvas.width = (ovRect.width - 32) * (window.devicePixelRatio || 1);
        dom.overviewCanvas.height = 40 * (window.devicePixelRatio || 1);
    }

    function renderCurrentView() {
        if (!spectrogramResult) return;

        // Show/hide chirp panel based on view
        if (dom.chirpPanel) {
            dom.chirpPanel.style.display = currentView === 'chirp' ? 'flex' : 'none';
        }

        switch (currentView) {
            case 'spectrogram':
                renderSpectrogram();
                dom.rangeControl.style.display = 'flex';
                dom.timeNav.style.display = 'block';
                break;
            case 'chirp':
                renderSpectrogram(true);
                dom.rangeControl.style.display = 'flex';
                dom.timeNav.style.display = 'block';
                break;
            case 'psd':
                renderPSD();
                dom.rangeControl.style.display = 'none';
                dom.timeNav.style.display = 'none';
                break;
            case 'timedomain':
                renderTimeDomain();
                dom.rangeControl.style.display = 'none';
                dom.timeNav.style.display = 'none';
                break;
            case 'constellation':
                renderConstellation();
                dom.rangeControl.style.display = 'none';
                dom.timeNav.style.display = 'none';
                break;
        }
    }

    function renderSpectrogram(showChirpOverlay = false) {
        const canvas = dom.mainCanvas;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const dpr = window.devicePixelRatio || 1;

        ctx.clearRect(0, 0, W, H);

        if (!spectrogramResult) return;

        const lut = Colormaps.getLUT(currentColormap);
        const { data, numCols } = spectrogramResult;
        const numVisibleRows = viewEndRow - viewStartRow;
        const numVisibleCols = viewEndCol - viewStartCol;

        // Layout: left margin for freq labels, bottom margin for time labels
        const marginLeft = 65 * dpr;
        const marginBottom = 30 * dpr;
        const marginTop = 10 * dpr;
        const marginRight = 20 * dpr;
        const plotW = W - marginLeft - marginRight;
        const plotH = H - marginTop - marginBottom;

        if (plotW <= 0 || plotH <= 0) return;

        // Create ImageData for the spectrogram
        // X-axis = time (rows), Y-axis = frequency (cols, inverted so high freq on top)
        const imgData = ctx.createImageData(plotW, plotH);
        const pixels = imgData.data;

        const rangeSpan = dynamicRangeMax - dynamicRangeMin;

        for (let py = 0; py < plotH; py++) {
            // Map pixel Y to frequency bin within visible range (inverted)
            const colFrac = (plotH - 1 - py) / plotH;
            const col = Math.floor(viewStartCol + colFrac * numVisibleCols);
            if (col < 0 || col >= numCols) continue;

            for (let px = 0; px < plotW; px++) {
                // Map pixel X to spectrogram row (time)
                const row = viewStartRow + Math.floor((px / plotW) * numVisibleRows);
                if (row >= data.length) continue;

                const val = data[row][col];
                const normalized = Math.max(0, Math.min(1, (val - dynamicRangeMin) / rangeSpan));

                const lutIdx = Math.round(normalized * 255) * 4;
                const pixIdx = (py * plotW + px) * 4;

                pixels[pixIdx] = lut[lutIdx];
                pixels[pixIdx + 1] = lut[lutIdx + 1];
                pixels[pixIdx + 2] = lut[lutIdx + 2];
                pixels[pixIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, marginLeft, marginTop);

        // Draw axes
        ctx.save();
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#9898a6';
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;

        // Time axis (X - horizontal)
        const numTimeTicks = Math.min(10, Math.floor(plotW / (70 * dpr)));
        for (let i = 0; i <= numTimeTicks; i++) {
            const frac = i / numTimeTicks;
            const x = marginLeft + frac * plotW;
            const rowIdx = viewStartRow + Math.floor(frac * numVisibleRows);
            const time = (rowIdx * spectrogramResult.hopSize) / sampleRate;

            ctx.beginPath();
            ctx.moveTo(x, marginTop);
            ctx.lineTo(x, marginTop + plotH);
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillText(formatTime(time), x, H - 8 * dpr);
        }

        // Frequency axis (Y - vertical, high freq on top)
        const numFreqTicks = Math.min(10, Math.floor(plotH / (35 * dpr)));
        for (let i = 0; i <= numFreqTicks; i++) {
            const frac = i / numFreqTicks;
            const y = marginTop + frac * plotH;
            // Map from visible col range to frequency
            const colFracTick = 1 - frac; // invert for frequency (top = high)
            const visibleCol = viewStartCol + colFracTick * numVisibleCols;
            const freqFrac = visibleCol / numCols; // 0 to 1 across full bandwidth
            const freqOffset = (freqFrac - 0.5) * sampleRate;
            const freq = centerFreq + freqOffset;

            ctx.beginPath();
            ctx.moveTo(marginLeft, y);
            ctx.lineTo(marginLeft + plotW, y);
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.fillText(formatFrequency(freq), marginLeft - 6 * dpr, y + 3 * dpr);
        }

        // Axis borders
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        ctx.restore();

        // Draw chirp overlay
        if (showChirpOverlay && chirpOverlayEnabled && chirpFrames.length > 0) {
            renderChirpOverlay(ctx, marginLeft, marginTop, plotW, plotH, dpr);
        }
    }

    function renderPSD() {
        const canvas = dom.mainCanvas;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const dpr = window.devicePixelRatio || 1;

        ctx.clearRect(0, 0, W, H);

        const avgPSD = DSP.computeAveragePSD(spectrogramResult.data);
        if (!avgPSD) return;

        const marginLeft = 65 * dpr;
        const marginBottom = 40 * dpr;
        const marginTop = 20 * dpr;
        const marginRight = 20 * dpr;
        const plotW = W - marginLeft - marginRight;
        const plotH = H - marginTop - marginBottom;

        // Find data range
        let minVal = Infinity, maxVal = -Infinity;
        for (let i = 0; i < avgPSD.length; i++) {
            if (avgPSD[i] < minVal) minVal = avgPSD[i];
            if (avgPSD[i] > maxVal) maxVal = avgPSD[i];
        }
        const padding = (maxVal - minVal) * 0.1;
        minVal -= padding;
        maxVal += padding;

        // Grid
        ctx.save();
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#9898a6';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;

        // Y-axis grid (dB)
        const numYTicks = 8;
        for (let i = 0; i <= numYTicks; i++) {
            const frac = i / numYTicks;
            const y = marginTop + frac * plotH;
            const val = maxVal - frac * (maxVal - minVal);

            ctx.beginPath();
            ctx.moveTo(marginLeft, y);
            ctx.lineTo(marginLeft + plotW, y);
            ctx.stroke();

            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(0) + ' dB', marginLeft - 6 * dpr, y + 3 * dpr);
        }

        // X-axis (frequency)
        const numXTicks = Math.min(8, Math.floor(plotW / (70 * dpr)));
        for (let i = 0; i <= numXTicks; i++) {
            const frac = i / numXTicks;
            const x = marginLeft + frac * plotW;
            const freqOffset = (frac - 0.5) * sampleRate;
            const freq = centerFreq + freqOffset;

            ctx.beginPath();
            ctx.moveTo(x, marginTop);
            ctx.lineTo(x, marginTop + plotH);
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillText(formatFrequency(freq), x, H - 14 * dpr);
        }

        // Plot gradient fill
        const gradient = ctx.createLinearGradient(0, marginTop, 0, marginTop + plotH);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.02)');

        ctx.beginPath();
        ctx.moveTo(marginLeft, marginTop + plotH);
        for (let i = 0; i < avgPSD.length; i++) {
            const x = marginLeft + (i / (avgPSD.length - 1)) * plotW;
            const y = marginTop + ((maxVal - avgPSD[i]) / (maxVal - minVal)) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineTo(marginLeft + plotW, marginTop + plotH);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Plot line
        ctx.beginPath();
        for (let i = 0; i < avgPSD.length; i++) {
            const x = marginLeft + (i / (avgPSD.length - 1)) * plotW;
            const y = marginTop + ((maxVal - avgPSD[i]) / (maxVal - minVal)) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        // Axis labels
        ctx.fillStyle = '#6b6b7a';
        ctx.textAlign = 'center';
        ctx.fillText('Frequency', marginLeft + plotW / 2, H - 2 * dpr);

        ctx.save();
        ctx.translate(12 * dpr, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Power (dB)', 0, 0);
        ctx.restore();

        ctx.restore();
    }

    function renderTimeDomain() {
        const canvas = dom.mainCanvas;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const dpr = window.devicePixelRatio || 1;

        ctx.clearRect(0, 0, W, H);

        if (!iqData) return;

        const marginLeft = 55 * dpr;
        const marginBottom = 35 * dpr;
        const marginTop = 20 * dpr;
        const marginRight = 20 * dpr;
        const plotW = W - marginLeft - marginRight;
        const plotH = H - marginTop - marginBottom;

        // Show first N samples
        const maxSamplesToShow = Math.min(iqData.length / 2, 10000);
        const halfH = plotH / 2;

        // Find max amplitude
        let maxAmp = 0;
        for (let i = 0; i < maxSamplesToShow * 2; i++) {
            const absVal = Math.abs(iqData[i]);
            if (absVal > maxAmp) maxAmp = absVal;
        }
        maxAmp = maxAmp || 1;

        // Grid
        ctx.save();
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#9898a6';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;

        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(marginLeft, marginTop + halfH);
        ctx.lineTo(marginLeft + plotW, marginTop + halfH);
        ctx.stroke();

        // X-axis labels (time)
        const numXTicks = 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i <= numXTicks; i++) {
            const frac = i / numXTicks;
            const x = marginLeft + frac * plotW;
            const time = (frac * maxSamplesToShow) / sampleRate;

            ctx.beginPath();
            ctx.moveTo(x, marginTop);
            ctx.lineTo(x, marginTop + plotH);
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillText(formatTime(time), x, H - 10 * dpr);
        }

        // Draw I (in-phase) - blue
        ctx.beginPath();
        for (let i = 0; i < maxSamplesToShow; i++) {
            const x = marginLeft + (i / maxSamplesToShow) * plotW;
            const y = marginTop + halfH - (iqData[i * 2] / maxAmp) * halfH * 0.9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        // Draw Q (quadrature) - orange
        ctx.beginPath();
        for (let i = 0; i < maxSamplesToShow; i++) {
            const x = marginLeft + (i / maxSamplesToShow) * plotW;
            const y = marginTop + halfH - (iqData[i * 2 + 1] / maxAmp) * halfH * 0.9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.8)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        // Legend
        const legendX = marginLeft + 10 * dpr;
        const legendY = marginTop + 16 * dpr;
        ctx.font = `${11 * dpr}px 'Inter', sans-serif`;

        ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
        ctx.fillRect(legendX, legendY - 6 * dpr, 12 * dpr, 3 * dpr);
        ctx.fillStyle = '#e8e8ed';
        ctx.textAlign = 'left';
        ctx.fillText('I (In-phase)', legendX + 18 * dpr, legendY);

        ctx.fillStyle = 'rgba(251, 146, 60, 0.9)';
        ctx.fillRect(legendX + 110 * dpr, legendY - 6 * dpr, 12 * dpr, 3 * dpr);
        ctx.fillStyle = '#e8e8ed';
        ctx.fillText('Q (Quadrature)', legendX + 128 * dpr, legendY);

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        ctx.restore();
    }

    function renderConstellation() {
        const canvas = dom.mainCanvas;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const dpr = window.devicePixelRatio || 1;

        ctx.clearRect(0, 0, W, H);

        if (!iqData) return;

        const size = Math.min(W, H) - 60 * dpr;
        const cx = W / 2;
        const cy = H / 2;
        const halfSize = size / 2;

        // Find max amplitude
        const maxSamples = Math.min(iqData.length / 2, 50000);
        let maxAmp = 0;
        for (let i = 0; i < maxSamples * 2; i++) {
            if (Math.abs(iqData[i]) > maxAmp) maxAmp = Math.abs(iqData[i]);
        }
        maxAmp = maxAmp || 1;

        // Draw grid
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;

        // Cross-hair
        ctx.beginPath();
        ctx.moveTo(cx - halfSize, cy);
        ctx.lineTo(cx + halfSize, cy);
        ctx.moveTo(cx, cy - halfSize);
        ctx.lineTo(cx, cy + halfSize);
        ctx.stroke();

        // Circles
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        for (let r = 0.25; r <= 1; r += 0.25) {
            ctx.beginPath();
            ctx.arc(cx, cy, r * halfSize, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Labels
        ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#6b6b7a';
        ctx.textAlign = 'center';
        ctx.fillText('I', cx + halfSize + 12 * dpr, cy + 4 * dpr);
        ctx.fillText('Q', cx, cy - halfSize - 8 * dpr);

        // Plot points with density-based transparency
        const step = Math.max(1, Math.floor(maxSamples / 20000));
        for (let i = 0; i < maxSamples; i += step) {
            const iVal = iqData[i * 2] / maxAmp;
            const qVal = iqData[i * 2 + 1] / maxAmp;
            const x = cx + iVal * halfSize;
            const y = cy - qVal * halfSize;

            ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
            ctx.fillRect(x - 0.5 * dpr, y - 0.5 * dpr, 1 * dpr, 1 * dpr);
        }

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - halfSize, cy - halfSize, size, size);

        ctx.restore();
    }

    function renderOverview() {
        if (!spectrogramResult) return;

        const canvas = dom.overviewCanvas;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        const lut = Colormaps.getLUT(currentColormap);
        const { data, numRows, numCols } = spectrogramResult;
        const rangeSpan = dynamicRangeMax - dynamicRangeMin;

        // Render mini spectrogram overview: X = time, Y = frequency
        const imgData = ctx.createImageData(W, H);
        const pixels = imgData.data;

        for (let py = 0; py < H; py++) {
            // Y maps to frequency (inverted: top = high freq)
            const col = Math.floor(((H - 1 - py) / H) * numCols);

            for (let px = 0; px < W; px++) {
                // X maps to time (rows)
                const row = Math.floor((px / W) * numRows);
                if (row >= data.length) continue;

                const val = data[row][col];
                const normalized = Math.max(0, Math.min(1, (val - dynamicRangeMin) / rangeSpan));
                const lutIdx = Math.round(normalized * 255) * 4;
                const pixIdx = (py * W + px) * 4;

                pixels[pixIdx] = lut[lutIdx];
                pixels[pixIdx + 1] = lut[lutIdx + 1];
                pixels[pixIdx + 2] = lut[lutIdx + 2];
                pixels[pixIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    // --- Toolbar / View Switching ---
    function initToolbar() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentView = btn.dataset.view;
                renderCurrentView();
            });
        });

        // Dynamic range sliders
        dom.rangeMin.addEventListener('input', () => {
            dynamicRangeMin = parseInt(dom.rangeMin.value);
            if (dynamicRangeMin >= dynamicRangeMax) {
                dynamicRangeMin = dynamicRangeMax - 1;
                dom.rangeMin.value = dynamicRangeMin;
            }
            dom.rangeMinVal.textContent = dynamicRangeMin + ' dB';
            renderCurrentView();
            renderOverview();
        });

        dom.rangeMax.addEventListener('input', () => {
            dynamicRangeMax = parseInt(dom.rangeMax.value);
            if (dynamicRangeMax <= dynamicRangeMin) {
                dynamicRangeMax = dynamicRangeMin + 1;
                dom.rangeMax.value = dynamicRangeMax;
            }
            dom.rangeMaxVal.textContent = dynamicRangeMax + ' dB';
            renderCurrentView();
            renderOverview();
        });

        // Settings button
        dom.btnSettings.addEventListener('click', showSettingsModal);

        // New file button
        dom.btnNewFile.addEventListener('click', () => {
            dom.analysisContainer.style.display = 'none';
            dom.dropZoneContainer.style.display = 'flex';
            dom.fileInfo.style.display = 'none';
            dom.btnNewFile.style.display = 'none';
            iqData = null;
            spectrogramResult = null;
        });

        // Export button
        dom.btnExport.addEventListener('click', exportImage);
    }

    function exportImage() {
        const canvas = dom.mainCanvas;
        const link = document.createElement('a');
        link.download = `${fileName.replace('.cf32', '')}_${currentView}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // --- Cursor Info ---
    function initCursorTracking() {
        const wrapper = dom.canvasWrapper;
        const crosshairCtx = dom.crosshairCanvas ? dom.crosshairCanvas.getContext('2d') : null;
        const powerCtx = dom.powerCanvas ? dom.powerCanvas.getContext('2d') : null;
        let refCursor = null; // { time, freq, row, col }
        let currentMouseX = -1;
        let currentMouseY = -1;

        function clearCrosshairAndPower() {
            if (crosshairCtx && dom.crosshairCanvas) {
                crosshairCtx.clearRect(0, 0, dom.crosshairCanvas.width, dom.crosshairCanvas.height);
            }
            if (powerCtx && dom.powerCanvas) {
                powerCtx.clearRect(0, 0, dom.powerCanvas.width, dom.powerCanvas.height);
            }
        }

        wrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!spectrogramResult || (currentView !== 'spectrogram' && currentView !== 'chirp')) return;

            if (refCursor) {
                // If it already exists, toggle it off
                refCursor = null;
                dom.cursorDeltaFreq.style.display = 'none';
                dom.cursorDeltaTime.style.display = 'none';
                // Trigger a mousemove to clear the drawing
                wrapper.dispatchEvent(new MouseEvent('mousemove', {
                    clientX: e.clientX,
                    clientY: e.clientY
                }));
            } else {
                // Set reference cursor
                const rect = wrapper.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const marginLeft = 65;
                const marginTop = 10;
                const marginRight = 20;
                const marginBottom = 30;
                const plotW = rect.width - marginLeft - marginRight;
                const plotH = rect.height - marginTop - marginBottom;

                const px = x - marginLeft;
                const py = y - marginTop;

                if (px >= 0 && px <= plotW && py >= 0 && py <= plotH) {
                    const fracX = px / plotW;
                    const fracY = py / plotH;

                    const numVisibleRows = viewEndRow - viewStartRow;
                    const row = viewStartRow + (fracX * numVisibleRows);
                    const time = (row * spectrogramResult.hopSize) / sampleRate;

                    const numVisibleCols = viewEndCol - viewStartCol;
                    const colFrac = 1 - fracY;
                    const visibleCol = viewStartCol + colFrac * numVisibleCols;
                    const freqFrac = visibleCol / spectrogramResult.numCols;
                    const freqOffset = (freqFrac - 0.5) * sampleRate;
                    const freq = centerFreq + freqOffset;

                    refCursor = { time, freq, row, col: visibleCol };
                    
                    // Trigger a mousemove to update the drawing
                    wrapper.dispatchEvent(new MouseEvent('mousemove', {
                        clientX: e.clientX,
                        clientY: e.clientY
                    }));
                }
            }
        });

        wrapper.addEventListener('mousemove', (e) => {
            if (!spectrogramResult || (currentView !== 'spectrogram' && currentView !== 'chirp')) {
                dom.cursorInfo.style.display = 'none';
                clearCrosshairAndPower();
                return;
            }
            if (isPanning) {
                clearCrosshairAndPower();
                return;
            }

            const rect = wrapper.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const marginLeft = 65;
            const marginTop = 10;
            const marginRight = 20;
            const marginBottom = 30;
            const plotW = rect.width - marginLeft - marginRight;
            const plotH = rect.height - marginTop - marginBottom;

            currentMouseX = x;
            currentMouseY = y;

            window.dispatchEvent(new Event('render-overlays'));

            const px = x - marginLeft;
            const py = y - marginTop;

            if (px < 0 || px > plotW || py < 0 || py > plotH) {
                dom.cursorInfo.style.display = 'none';
                clearCrosshairAndPower();
                return;
            }

            const fracX = px / plotW; // time fraction (horizontal)
            const fracY = py / plotH; // frequency fraction (vertical)

            // X = time
            const numVisibleRows = viewEndRow - viewStartRow;
            const row = viewStartRow + Math.floor(fracX * numVisibleRows);
            const time = (row * spectrogramResult.hopSize) / sampleRate;

            // Y = frequency (inverted: top = high freq) — zoom-aware
            const numVisibleCols = viewEndCol - viewStartCol;
            const colFrac = 1 - fracY;
            const visibleCol = viewStartCol + colFrac * numVisibleCols;
            const freqFrac = visibleCol / spectrogramResult.numCols;
            const freqOffset = (freqFrac - 0.5) * sampleRate;
            const freq = centerFreq + freqOffset;
            const col = Math.floor(visibleCol);

            let power = '';
            let rowData = null;
            if (row < spectrogramResult.data.length && col >= 0 && col < spectrogramResult.numCols) {
                power = spectrogramResult.data[row][col].toFixed(1) + ' dB';
                rowData = spectrogramResult.data[row];
            }

            dom.cursorFreq.textContent = 'f: ' + formatFrequency(freq);
            dom.cursorTime.textContent = 't: ' + formatTime(time);
            dom.cursorPower.textContent = 'P: ' + power;

            if (refCursor) {
                const dt = time - refCursor.time;
                const df = freq - refCursor.freq;
                // Add explicit sign for delta
                const signT = dt > 0 ? '+' : '';
                const signF = df > 0 ? '+' : '';
                dom.cursorDeltaTime.textContent = `Δt: ${signT}${formatTime(dt)}`;
                dom.cursorDeltaFreq.textContent = `Δf: ${signF}${formatFrequency(df)}`;
                dom.cursorDeltaTime.style.display = 'block';
                dom.cursorDeltaFreq.style.display = 'block';
            } else {
                dom.cursorDeltaTime.style.display = 'none';
                dom.cursorDeltaFreq.style.display = 'none';
            }

            // Position cursor info
            let infoX = x + 15;
            let infoY = y - 30;
            if (infoX + 300 > rect.width) infoX = x - 250;
            if (infoY < 0) infoY = y + 15;

            dom.cursorInfo.style.display = 'flex';
            dom.cursorInfo.style.left = infoX + 'px';
            dom.cursorInfo.style.top = infoY + 'px';


        });

        wrapper.addEventListener('mouseleave', () => {
            dom.cursorInfo.style.display = 'none';
            currentMouseX = -1;
            currentMouseY = -1;
            window.dispatchEvent(new Event('render-overlays'));
        });

        window.addEventListener('render-overlays', () => {
            if (!crosshairCtx || !dom.crosshairCanvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = wrapper.getBoundingClientRect();
            const marginLeft = 65;
            const marginTop = 10;
            const marginRight = 20;
            const marginBottom = 30;
            const plotW = rect.width - marginLeft - marginRight;
            const plotH = rect.height - marginTop - marginBottom;

            crosshairCtx.clearRect(0, 0, dom.crosshairCanvas.width, dom.crosshairCanvas.height);
            
            const numVisibleRows = viewEndRow - viewStartRow;
            const numVisibleCols = viewEndCol - viewStartCol;

            // 1. Draw Reference Cursor
            if (refCursor) {
                const refFracX = (refCursor.row - viewStartRow) / numVisibleRows;
                const refColFrac = (refCursor.col - viewStartCol) / numVisibleCols;
                const refFracY = 1 - refColFrac;
                
                const refPx = refFracX * plotW;
                const refPy = refFracY * plotH;
                const refX = refPx + marginLeft;
                const refY = refPy + marginTop;
                
                crosshairCtx.save();
                crosshairCtx.strokeStyle = 'var(--accent-secondary, #f43f5e)';
                crosshairCtx.lineWidth = 1 * dpr;
                
                crosshairCtx.beginPath();
                if (refY >= marginTop && refY <= marginTop + plotH) {
                    crosshairCtx.moveTo((marginLeft) * dpr, refY * dpr);
                    crosshairCtx.lineTo((marginLeft + plotW) * dpr, refY * dpr);
                }
                if (refX >= marginLeft && refX <= marginLeft + plotW) {
                    crosshairCtx.moveTo(refX * dpr, (marginTop) * dpr);
                    crosshairCtx.lineTo(refX * dpr, (marginTop + plotH) * dpr);
                }
                crosshairCtx.stroke();
                crosshairCtx.restore();
            }

            // 2. Draw Playback Cursor (Vertical Line)
            if (playbackRow >= 0 && playbackRow >= viewStartRow && playbackRow <= viewEndRow) {
                const fracX = (playbackRow - viewStartRow) / numVisibleRows;
                const px = fracX * plotW;
                const x = px + marginLeft;
                
                crosshairCtx.save();
                crosshairCtx.strokeStyle = 'rgba(56, 189, 248, 0.9)'; // bright blue
                crosshairCtx.lineWidth = 2 * dpr;
                crosshairCtx.beginPath();
                crosshairCtx.moveTo(x * dpr, marginTop * dpr);
                crosshairCtx.lineTo(x * dpr, (marginTop + plotH) * dpr);
                crosshairCtx.stroke();
                
                // Draw a small triangle at the top of the playback cursor
                crosshairCtx.fillStyle = 'rgba(56, 189, 248, 0.9)';
                crosshairCtx.beginPath();
                crosshairCtx.moveTo(x * dpr, marginTop * dpr);
                crosshairCtx.lineTo((x - 4) * dpr, (marginTop - 6) * dpr);
                crosshairCtx.lineTo((x + 4) * dpr, (marginTop - 6) * dpr);
                crosshairCtx.fill();
                crosshairCtx.restore();
            }

            // 3. Draw Mouse Crosshair
            if (currentMouseX >= 0 && currentMouseY >= 0 && !isPanning) {
                const px = currentMouseX - marginLeft;
                const py = currentMouseY - marginTop;
                if (px >= 0 && px <= plotW && py >= 0 && py <= plotH) {
                    crosshairCtx.save();
                    crosshairCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                    crosshairCtx.lineWidth = 1 * dpr;
                    crosshairCtx.setLineDash([4 * dpr, 4 * dpr]);
                    
                    crosshairCtx.beginPath();
                    // Horizontal line
                    crosshairCtx.moveTo((marginLeft) * dpr, currentMouseY * dpr);
                    crosshairCtx.lineTo((marginLeft + plotW) * dpr, currentMouseY * dpr);
                    // Vertical line
                    crosshairCtx.moveTo(currentMouseX * dpr, (marginTop) * dpr);
                    crosshairCtx.lineTo(currentMouseX * dpr, (marginTop + plotH) * dpr);
                    crosshairCtx.stroke();
                    crosshairCtx.restore();
                }
            }

            // 4. Update Power Sidebar
            if (powerCtx && dom.powerCanvas && spectrogramResult) {
                let targetRow = -1;
                let drawCrosshairY = -1;

                if (isPlaybackRunning || (playbackRow >= viewStartRow && playbackRow <= viewEndRow)) {
                    targetRow = Math.floor(playbackRow);
                } else if (currentMouseX >= 0) {
                    const px = currentMouseX - marginLeft;
                    if (px >= 0 && px <= plotW) {
                        const fracX = px / plotW;
                        targetRow = Math.floor(viewStartRow + fracX * numVisibleRows);
                        drawCrosshairY = currentMouseY;
                    }
                }

                const pW = dom.powerCanvas.width;
                const pH = dom.powerCanvas.height;
                powerCtx.clearRect(0, 0, pW, pH);

                if (targetRow >= 0 && targetRow < spectrogramResult.data.length) {
                    const rowData = spectrogramResult.data[targetRow];
                    
                    powerCtx.save();
                    
                    // Background grid
                    powerCtx.strokeStyle = 'rgba(255,255,255,0.05)';
                    powerCtx.lineWidth = 1 * dpr;
                    powerCtx.beginPath();
                    // Vertical grid (dB)
                    const numDbTicks = 4;
                    for (let i = 1; i < numDbTicks; i++) {
                        const x = (i / numDbTicks) * pW;
                        powerCtx.moveTo(x, 0);
                        powerCtx.lineTo(x, pH);
                    }
                    // Horizontal grid (Freq)
                    const numFreqTicks = 8;
                    for (let i = 1; i < numFreqTicks; i++) {
                        const cy = (marginTop * dpr) + (i / numFreqTicks) * (plotH * dpr);
                        powerCtx.moveTo(0, cy);
                        powerCtx.lineTo(pW, cy);
                    }
                    powerCtx.stroke();
                    
                    // Draw spectrum
                    const rangeSpan = dynamicRangeMax - dynamicRangeMin;
                    powerCtx.beginPath();
                    
                    for (let i = 0; i < numVisibleCols; i++) {
                        const c = Math.floor(viewStartCol + i);
                        if (c < 0 || c >= spectrogramResult.numCols) continue;
                        
                        const val = rowData[c];
                        const normPower = Math.max(0, Math.min(1, (val - dynamicRangeMin) / rangeSpan));
                        const px = normPower * pW;
                        
                        const yFrac = 1 - (i / numVisibleCols);
                        const pyY = (marginTop * dpr) + (yFrac * plotH * dpr);
                        
                        if (i === 0) {
                            powerCtx.moveTo(px, pyY);
                        } else {
                            powerCtx.lineTo(px, pyY);
                        }
                    }
                    
                    // Fill under curve
                    powerCtx.lineTo(0, (marginTop * dpr));
                    powerCtx.lineTo(0, (marginTop + plotH) * dpr);
                    powerCtx.closePath();
                    
                    const grad = powerCtx.createLinearGradient(0, 0, pW, 0);
                    grad.addColorStop(0, 'rgba(99, 102, 241, 0.1)');
                    grad.addColorStop(1, 'rgba(99, 102, 241, 0.6)');
                    powerCtx.fillStyle = grad;
                    powerCtx.fill();
                    
                    // Stroke line
                    powerCtx.beginPath();
                    for (let i = 0; i < numVisibleCols; i++) {
                        const c = Math.floor(viewStartCol + i);
                        if (c < 0 || c >= spectrogramResult.numCols) continue;
                        const val = rowData[c];
                        const normPower = Math.max(0, Math.min(1, (val - dynamicRangeMin) / rangeSpan));
                        const px = normPower * pW;
                        const yFrac = 1 - (i / numVisibleCols);
                        const pyY = (marginTop * dpr) + (yFrac * plotH * dpr);
                        
                        if (i === 0) powerCtx.moveTo(px, pyY);
                        else powerCtx.lineTo(px, pyY);
                    }
                    powerCtx.strokeStyle = 'var(--accent-primary, #6366f1)';
                    powerCtx.lineWidth = 1.5 * dpr;
                    powerCtx.stroke();

                    // Draw Crosshair if hovering
                    if (drawCrosshairY >= 0 && !isPanning && !isPlaybackRunning) {
                        powerCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        powerCtx.lineWidth = 1 * dpr;
                        powerCtx.setLineDash([4 * dpr, 4 * dpr]);
                        powerCtx.beginPath();
                        powerCtx.moveTo(0, drawCrosshairY * dpr);
                        powerCtx.lineTo(pW, drawCrosshairY * dpr);
                        powerCtx.stroke();
                    }
                    
                    powerCtx.restore();
                }
            }
        });
    }

    // --- Zoom & Pan ---
    function initZoom() {
        const wrapper = dom.canvasWrapper;

        // Mouse wheel zoom
        wrapper.addEventListener('wheel', (e) => {
            if (!spectrogramResult) return;
            if (currentView !== 'spectrogram' && currentView !== 'chirp') return;
            e.preventDefault();

            const rect = wrapper.getBoundingClientRect();
            const mx = (e.clientX - rect.left - 65) / (rect.width - 65 - 20); // normalized X in plot
            const my = (e.clientY - rect.top - 10) / (rect.height - 10 - 30);  // normalized Y in plot

            const zoomFactor = e.deltaY < 0 ? 1.4 : 1 / 1.4;

            // Inspectrum style zooming:
            // Default: zoom time (X)
            // Ctrl/Shift: zoom frequency (Y)
            // Alt: zoom both
            let factorX = 1;
            let factorY = 1;

            if (e.altKey) {
                factorX = zoomFactor;
                factorY = zoomFactor;
            } else if (e.ctrlKey || e.shiftKey) {
                factorY = zoomFactor;
            } else {
                factorX = zoomFactor;
            }

            zoomAt(mx, my, factorX, factorY);
        }, { passive: false });

        // Pan via mouse drag or set playback position
        wrapper.addEventListener('mousedown', (e) => {
            if (!spectrogramResult) return;
            if (currentView !== 'spectrogram' && currentView !== 'chirp') return;

            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const px = x - 65; // marginLeft
            const plotW = rect.width - 65 - 20;

            // Set playback row instantly on click
            if (px >= 0 && px <= plotW) {
                const fracX = px / plotW;
                const numVisibleRows = viewEndRow - viewStartRow;
                playbackRow = viewStartRow + (fracX * numVisibleRows);
                if (!isPlaybackRunning) {
                    window.dispatchEvent(new Event('render-overlays'));
                }
            }

            const numVisibleRows = viewEndRow - viewStartRow;
            const numVisibleCols = viewEndCol - viewStartCol;
            if (numVisibleRows >= spectrogramResult.numRows && numVisibleCols >= spectrogramResult.numCols) return; // cannot pan if fully zoomed out

            isPanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            panStartRow = viewStartRow;
            panStartCol = viewStartCol;
            wrapper.classList.add('grabbing');
            dom.cursorInfo.style.display = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isPanning) return;

            const rect = dom.canvasWrapper.getBoundingClientRect();
            const plotW = rect.width - 65 - 20;
            const plotH = rect.height - 10 - 30;

            const dx = e.clientX - panStartX;
            const dy = e.clientY - panStartY;

            const numVisibleRows = viewEndRow - viewStartRow;
            const numVisibleCols = viewEndCol - viewStartCol;
            const totalRows = spectrogramResult.numRows;
            const totalCols = spectrogramResult.numCols;

            // Pan time (X) — drag left = move forward in time
            const rowDelta = Math.round((-dx / plotW) * numVisibleRows);
            let newStartRow = Math.max(0, Math.min(totalRows - numVisibleRows, panStartRow + rowDelta));
            viewStartRow = newStartRow;
            viewEndRow = viewStartRow + numVisibleRows;

            // Pan frequency (Y) — drag up = move to higher freq
            const colDelta = Math.round((dy / plotH) * numVisibleCols);
            let newStartCol = Math.max(0, Math.min(totalCols - numVisibleCols, panStartCol + colDelta));
            viewStartCol = newStartCol;
            viewEndCol = viewStartCol + numVisibleCols;

            renderCurrentView();
        });

        window.addEventListener('mouseup', () => {
            if (isPanning) {
                isPanning = false;
                dom.canvasWrapper.classList.remove('grabbing');
            }
        });

        // Zoom buttons (zoom both)
        dom.btnZoomIn.addEventListener('click', () => zoomAt(0.5, 0.5, 1.5, 1.5));
        dom.btnZoomOut.addEventListener('click', () => zoomAt(0.5, 0.5, 1 / 1.5, 1 / 1.5));
        dom.btnZoomReset.addEventListener('click', () => {
            if (isPlaybackRunning) togglePlayback();
            resetZoom();
        });
        
        // Playback button
        if (dom.btnPlayback) {
            dom.btnPlayback.addEventListener('click', togglePlayback);
        }
    }

    function zoomAt(normX, normY, factorX, factorY) {
        if (!spectrogramResult) return;

        const totalRows = spectrogramResult.numRows;
        const totalCols = spectrogramResult.numCols;

        const numVisibleRows = viewEndRow - viewStartRow;
        const numVisibleCols = viewEndCol - viewStartCol;

        // Compute new visible ranges, allow zooming in down to 2 rows/cols
        const newVisibleRows = Math.max(2, Math.min(totalRows, Math.round(numVisibleRows / factorX)));
        const newVisibleCols = Math.max(2, Math.min(totalCols, Math.round(numVisibleCols / factorY)));

        // Keep the point under cursor fixed
        const pivotRow = viewStartRow + normX * numVisibleRows;
        const pivotCol = viewStartCol + (1 - normY) * numVisibleCols;

        let newStartRow = Math.round(pivotRow - normX * newVisibleRows);
        let newStartCol = Math.round(pivotCol - (1 - normY) * newVisibleCols);

        // Clamp
        newStartRow = Math.max(0, Math.min(totalRows - newVisibleRows, newStartRow));
        newStartCol = Math.max(0, Math.min(totalCols - newVisibleCols, newStartCol));

        viewStartRow = newStartRow;
        viewEndRow = newStartRow + newVisibleRows;
        viewStartCol = newStartCol;
        viewEndCol = newStartCol + newVisibleCols;

        // Update zoom level display
        const rowZoom = totalRows / newVisibleRows;
        const colZoom = totalCols / newVisibleCols;
        zoomLevel = Math.max(rowZoom, colZoom);
        dom.zoomLevel.textContent = `${Math.round(zoomLevel * 100)}%`;
        dom.canvasWrapper.classList.toggle('can-pan', newVisibleRows < totalRows || newVisibleCols < totalCols);

        renderCurrentView();
        renderOverview();
    }

    function resetZoom() {
        if (!spectrogramResult) return;
        viewStartRow = 0;
        viewEndRow = spectrogramResult.numRows;
        viewStartCol = 0;
        viewEndCol = spectrogramResult.numCols;
        zoomLevel = 1;
        dom.zoomLevel.textContent = '100%';
        dom.canvasWrapper.classList.remove('can-pan');
        renderCurrentView();
        renderOverview();
    }

    // --- Chirp Overlay Rendering ---
    function renderChirpOverlay(ctx, marginLeft, marginTop, plotW, plotH, dpr) {
        const numVisibleRows = viewEndRow - viewStartRow;

        const colors = {
            preamble:  { fill: 'rgba(34, 197, 94, 0.15)',  stroke: 'rgba(34, 197, 94, 0.7)' },
            sync:      { fill: 'rgba(239, 68, 68, 0.15)',  stroke: 'rgba(239, 68, 68, 0.7)' },
            header:    { fill: 'rgba(245, 158, 11, 0.15)', stroke: 'rgba(245, 158, 11, 0.7)' },
            payload:   { fill: 'rgba(59, 130, 246, 0.15)', stroke: 'rgba(59, 130, 246, 0.7)' }
        };

        ctx.save();

        for (const frame of chirpFrames) {
            for (const section of frame.sections) {
                // Map section row range to X pixels
                const x1 = marginLeft + ((section.startRow - viewStartRow) / numVisibleRows) * plotW;
                const x2 = marginLeft + ((section.endRow - viewStartRow) / numVisibleRows) * plotW;

                // Skip if completely outside view
                if (x2 < marginLeft || x1 > marginLeft + plotW) continue;

                const clampX1 = Math.max(marginLeft, x1);
                const clampX2 = Math.min(marginLeft + plotW, x2);
                const rectW = clampX2 - clampX1;

                if (rectW < 1) continue;

                const color = colors[section.type] || colors.payload;

                // Draw filled region (full height)
                ctx.fillStyle = color.fill;
                ctx.fillRect(clampX1, marginTop, rectW, plotH);

                // Draw border lines at start and end
                ctx.strokeStyle = color.stroke;
                ctx.lineWidth = 1.5 * dpr;
                ctx.setLineDash([4 * dpr, 3 * dpr]);

                ctx.beginPath();
                ctx.moveTo(clampX1, marginTop);
                ctx.lineTo(clampX1, marginTop + plotH);
                ctx.stroke();

                if (rectW > 3) {
                    ctx.beginPath();
                    ctx.moveTo(clampX2, marginTop);
                    ctx.lineTo(clampX2, marginTop + plotH);
                    ctx.stroke();
                }

                ctx.setLineDash([]);

                // Label at top
                if (rectW > 30 * dpr) {
                    ctx.font = `bold ${9 * dpr}px 'Inter', sans-serif`;
                    ctx.fillStyle = color.stroke;
                    ctx.textAlign = 'center';
                    const labelX = (clampX1 + clampX2) / 2;
                    ctx.fillText(section.type.charAt(0).toUpperCase() + section.type.slice(1),
                                 labelX, marginTop + 12 * dpr);
                    ctx.font = `${8 * dpr}px 'JetBrains Mono', monospace`;
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.fillText(section.label, labelX, marginTop + 22 * dpr);
                }

                // Draw Symbol Values if payload
                if (section.type === 'payload' && section.symbols) {
                    ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    for (let j = 0; j < section.symbols.length; j++) {
                        const symChirp = section.chirps[j];
                        const symX = marginLeft + ((symChirp.startRow + symChirp.endRow) / 2 - viewStartRow) / numVisibleRows * plotW;
                        
                        if (symX >= marginLeft && symX <= marginLeft + plotW) {
                            ctx.fillText(section.symbols[j], symX, marginTop + plotH / 2);
                        }
                    }
                }
            }
        }

        ctx.restore();
    }

    // --- Chirp Detection ---
    function initChirpAnalysis() {
        // Threshold slider
        dom.chirpThreshold.addEventListener('input', () => {
            dom.chirpThresholdVal.textContent = dom.chirpThreshold.value;
        });

        // Overlay toggle
        dom.chirpOverlay.addEventListener('change', () => {
            chirpOverlayEnabled = dom.chirpOverlay.checked;
            renderCurrentView();
        });

        // Detect button
        dom.btnDetectChirps.addEventListener('click', runChirpDetection);

        // Auto BW button
        const btnAutoBW = document.getElementById('btnAutoBW');
        if (btnAutoBW) {
            btnAutoBW.addEventListener('click', () => {
                if (!spectrogramResult) return;
                
                const startRow = Math.floor(viewStartRow);
                const endRow = Math.floor(viewEndRow);
                const startCol = Math.floor(viewStartCol);
                const endCol = Math.floor(viewEndCol);
                
                let powerProfile = new Float32Array(endCol - startCol + 1);
                for (let r = startRow; r <= endRow; r++) {
                    const rowData = spectrogramResult.data[r];
                    for (let c = startCol; c <= endCol; c++) {
                        // Average in linear scale
                        powerProfile[c - startCol] += Math.pow(10, rowData[c] / 10);
                    }
                }
                
                let maxPower = -Infinity;
                for (let i = 0; i < powerProfile.length; i++) {
                    powerProfile[i] = 10 * Math.log10(powerProfile[i] / (endRow - startRow + 1));
                    if (powerProfile[i] > maxPower) maxPower = powerProfile[i];
                }
                
                // Find edges (-6dB from maxPower)
                let leftEdge = 0;
                let rightEdge = powerProfile.length - 1;
                const threshold = maxPower - 6; // -6dB bandwidth
                
                for (let i = 0; i < powerProfile.length; i++) {
                    if (powerProfile[i] >= threshold) {
                        leftEdge = i;
                        break;
                    }
                }
                for (let i = powerProfile.length - 1; i >= 0; i--) {
                    if (powerProfile[i] >= threshold) {
                        rightEdge = i;
                        break;
                    }
                }
                
                const bins = rightEdge - leftEdge;
                const estimatedBW = Math.max(1000, (bins / spectrogramResult.numCols) * sampleRate);
                
                // Standard LoRa BWs (in Hz)
                const standardBWs = [7800, 10400, 15600, 20800, 31200, 41700, 62500, 125000, 250000, 500000];
                let closestBW = standardBWs[0];
                let minDiff = Math.abs(estimatedBW - closestBW);
                for (const bw of standardBWs) {
                    const diff = Math.abs(estimatedBW - bw);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestBW = bw;
                    }
                }
                
                // Ensure option exists in dropdown
                if (!Array.from(dom.chirpBW.options).some(opt => parseInt(opt.value) === closestBW)) {
                    const opt = document.createElement('option');
                    opt.value = closestBW;
                    opt.textContent = (closestBW >= 100000 ? (closestBW / 1000).toFixed(0) : (closestBW / 1000).toFixed(1));
                    dom.chirpBW.appendChild(opt);
                }
                
                dom.chirpBW.value = closestBW;
                
                // Highlight button briefly
                const origText = btnAutoBW.textContent;
                btnAutoBW.textContent = (closestBW / 1000).toFixed(1) + 'k';
                btnAutoBW.classList.replace('btn-secondary', 'btn-primary');
                setTimeout(() => {
                    btnAutoBW.textContent = origText;
                    btnAutoBW.classList.replace('btn-primary', 'btn-secondary');
                }, 1000);
            });
        }
    }

    function runChirpDetection() {
        if (!spectrogramResult) return;

        const sf = parseInt(dom.chirpSF.value);
        const bw = parseInt(dom.chirpBW.value);
        const threshold = parseInt(dom.chirpThreshold.value);

        showLoading('Detecting chirps...');

        setTimeout(() => {
            // Step 1: Detect peak frequencies within the currently zoomed-in frequency band
            // This prevents out-of-band noise or DC spikes from breaking the detection!
            const startCol = Math.floor(viewStartCol);
            const endCol = Math.floor(viewEndCol);
            const peaks = DSP.detectPeakFrequencies(spectrogramResult.data, threshold, startCol, endCol);

            // Step 2: Detect individual chirps
            detectedChirps = DSP.detectChirps(
                peaks, fftSize, sf, bw, sampleRate, spectrogramResult.hopSize
            );

            console.log(`Detected ${detectedChirps.length} chirps`);

            // Step 3: Analyze frame structure and extract symbols
            const bwBins = Math.round((bw / sampleRate) * fftSize);
            chirpFrames = DSP.analyzeFrameStructure(
                detectedChirps, spectrogramResult.hopSize, sampleRate, bwBins, sf
            );

            console.log(`Detected ${chirpFrames.length} frames`);

            hideLoading();
            renderChirpResults();
            renderCurrentView();
        }, 50);
    }

    function renderChirpResults() {
        const container = dom.chirpResults;

        if (chirpFrames.length === 0) {
            container.innerHTML = `
                <div class="chirp-empty">
                    No frames found.<br>
                    Try adjusting the threshold or SF/BW.
                </div>`;
            return;
        }

        let html = '';
        chirpFrames.forEach((frame, idx) => {
            html += `<div class="chirp-frame">
                <div class="chirp-frame-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <span>Frame #${idx + 1}</span>
                    <span class="frame-time">${formatTime(frame.startTime)} — ${formatTime(frame.endTime)}</span>
                </div>
                <div class="chirp-frame-body">`;

            for (const section of frame.sections) {
                const startTime = (section.startRow * spectrogramResult.hopSize) / sampleRate;
                const endTime = (section.endRow * spectrogramResult.hopSize) / sampleRate;
                const duration = endTime - startTime;

                html += `<div class="chirp-section">
                    <div class="chirp-section-color ${section.type}"></div>
                    <span class="chirp-section-name">${section.type.charAt(0).toUpperCase() + section.type.slice(1)}</span>
                    <span class="chirp-section-info">${section.label} · ${formatTime(duration)}</span>
                </div>`;
            }

            html += `</div></div>`;
        });

        container.innerHTML = html;
    }

    // --- Window Resize ---
    function initResize() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                resizeCanvas();
                renderCurrentView();
                renderOverview();
            }, 100);
        });
    }

    // --- Init ---
    function init() {
        initDragDrop();
        initSettingsModal();
        initToolbar();
        initCursorTracking();
        initZoom();
        initChirpAnalysis();
        initResize();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
