/* ================================================================
   DSP Module — FFT, Windowing, Spectrogram computation
   ================================================================ */

const DSP = (() => {

    /**
     * Generate window function coefficients
     */
    function generateWindow(size, type) {
        const w = new Float32Array(size);
        switch (type) {
            case 'hann':
                for (let i = 0; i < size; i++)
                    w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
                break;
            case 'hamming':
                for (let i = 0; i < size; i++)
                    w[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (size - 1));
                break;
            case 'blackman':
                for (let i = 0; i < size; i++)
                    w[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1))
                         + 0.08 * Math.cos(4 * Math.PI * i / (size - 1));
                break;
            case 'blackmanharris':
                for (let i = 0; i < size; i++)
                    w[i] = 0.35875 - 0.48829 * Math.cos(2 * Math.PI * i / (size - 1))
                         + 0.14128 * Math.cos(4 * Math.PI * i / (size - 1))
                         - 0.01168 * Math.cos(6 * Math.PI * i / (size - 1));
                break;
            case 'rectangular':
            default:
                w.fill(1);
                break;
        }
        return w;
    }

    /**
     * Radix-2 Cooley-Tukey FFT (in-place)
     * real and imag are Float32Arrays of length N (must be power of 2)
     */
    function fft(real, imag) {
        const N = real.length;
        if (N <= 1) return;

        // Bit-reversal permutation
        let j = 0;
        for (let i = 0; i < N - 1; i++) {
            if (i < j) {
                let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
                tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
            }
            let k = N >> 1;
            while (k <= j) { j -= k; k >>= 1; }
            j += k;
        }

        // FFT butterfly
        for (let len = 2; len <= N; len <<= 1) {
            const halfLen = len >> 1;
            const angle = -2 * Math.PI / len;
            const wRe = Math.cos(angle);
            const wIm = Math.sin(angle);

            for (let i = 0; i < N; i += len) {
                let curRe = 1, curIm = 0;
                for (let k = 0; k < halfLen; k++) {
                    const idx1 = i + k;
                    const idx2 = idx1 + halfLen;
                    const tRe = curRe * real[idx2] - curIm * imag[idx2];
                    const tIm = curRe * imag[idx2] + curIm * real[idx2];
                    real[idx2] = real[idx1] - tRe;
                    imag[idx2] = imag[idx1] - tIm;
                    real[idx1] += tRe;
                    imag[idx1] += tIm;
                    const newCurRe = curRe * wRe - curIm * wIm;
                    curIm = curRe * wIm + curIm * wRe;
                    curRe = newCurRe;
                }
            }
        }
    }

    /**
     * Perform FFT shift (swap left and right halves) for centered spectrum
     */
    function fftShift(arr) {
        const N = arr.length;
        const half = N >> 1;
        for (let i = 0; i < half; i++) {
            const tmp = arr[i];
            arr[i] = arr[i + half];
            arr[i + half] = tmp;
        }
    }

    /**
     * Compute power spectrum (dB) from a single IQ segment
     * Returns Float32Array of FFT_SIZE power values in dB
     */
    function computePowerSpectrum(iqData, offset, fftSize, window) {
        const real = new Float32Array(fftSize);
        const imag = new Float32Array(fftSize);

        // Apply window and load IQ samples
        for (let i = 0; i < fftSize; i++) {
            const sampleIdx = offset + i;
            if (sampleIdx < iqData.length / 2) {
                real[i] = iqData[sampleIdx * 2] * window[i];
                imag[i] = iqData[sampleIdx * 2 + 1] * window[i];
            }
        }

        fft(real, imag);
        fftShift(real);
        fftShift(imag);

        // Compute power in dB
        const power = new Float32Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            const mag2 = real[i] * real[i] + imag[i] * imag[i];
            power[i] = 10 * Math.log10(Math.max(mag2 / (fftSize * fftSize), 1e-20));
        }

        return power;
    }

    /**
     * Compute full spectrogram from IQ data
     * Returns { data: Float32Array[], numRows, numCols }
     */
    function computeSpectrogram(iqData, fftSize, windowType, overlap = 0.5, onProgress = null) {
        const window = generateWindow(fftSize, windowType);
        const hopSize = Math.floor(fftSize * (1 - overlap));
        const numSamples = iqData.length / 2; // complex samples
        const numRows = Math.floor((numSamples - fftSize) / hopSize) + 1;

        const spectrogramData = new Array(numRows);

        for (let row = 0; row < numRows; row++) {
            const offset = row * hopSize;
            spectrogramData[row] = computePowerSpectrum(iqData, offset, fftSize, window);

            if (onProgress && row % 100 === 0) {
                onProgress(row / numRows);
            }
        }

        return {
            data: spectrogramData,
            numRows: numRows,
            numCols: fftSize,
            hopSize: hopSize
        };
    }

    /**
     * Compute average PSD over all rows
     */
    function computeAveragePSD(spectrogramData) {
        if (!spectrogramData || spectrogramData.length === 0) return null;
        const numCols = spectrogramData[0].length;
        const avg = new Float32Array(numCols);

        for (let col = 0; col < numCols; col++) {
            let sum = 0;
            for (let row = 0; row < spectrogramData.length; row++) {
                sum += spectrogramData[row][col];
            }
            avg[col] = sum / spectrogramData.length;
        }

        return avg;
    }

    /**
     * Detect peak frequency bin per spectrogram row within a specific column range
     * Returns array of { bin, power } per row
     */
    function detectPeakFrequencies(spectrogramData, threshold, startCol = 0, endCol = null) {
        const numRows = spectrogramData.length;
        const numCols = spectrogramData[0].length;
        if (endCol === null) endCol = numCols - 1;

        const peaks = new Array(numRows);

        for (let row = 0; row < numRows; row++) {
            const rowData = spectrogramData[row];
            let maxBin = startCol;
            let maxPower = -Infinity;

            for (let col = startCol; col <= endCol; col++) {
                if (rowData[col] > maxPower) {
                    maxPower = rowData[col];
                    maxBin = col;
                }
            }

            peaks[row] = {
                bin: maxBin,
                power: maxPower,
                active: maxPower >= threshold
            };
        }

        return peaks;
    }

    /**
     * Detect chirps from peak frequency data
     * A chirp is identified by a monotonically changing frequency sweep
     * For LoRa: up-chirp sweeps low->high, down-chirp sweeps high->low
     *
     * @param {Array} peaks - Array of { bin, power, active } per row
     * @param {number} fftSize - FFT size (number of frequency bins)
     * @param {number} sf - Spreading Factor (7-12)
     * @param {number} bandwidth - Signal bandwidth in Hz
     * @param {number} sampleRate - Sample rate in Hz
     * @param {number} hopSize - Hop size in samples
     * @returns {Array} Detected chirps
     */
    function detectChirps(peaks, fftSize, sf, bandwidth, sampleRate, hopSize) {
        const symbolSamples = Math.pow(2, sf) * sampleRate / bandwidth;
        const symbolRows = Math.max(1, Math.round(symbolSamples / hopSize));

        // We still need bwBins to identify large frequency jumps (wrapping)
        const bwBins = Math.round((bandwidth / sampleRate) * fftSize);

        const chirps = [];
        let i = 0;

        while (i < peaks.length) {
            if (!peaks[i].active) {
                i++;
                continue;
            }

            let chirpLen = 1;
            let upSteps = 0;
            let downSteps = 0;
            let sumPower = peaks[i].power;
            let prevBin = peaks[i].bin;

            for (let j = i + 1; j < Math.min(i + symbolRows * 2, peaks.length); j++) {
                if (!peaks[j].active) break;
                const curBin = peaks[j].bin;

                const diff = curBin - prevBin;
                
                // Ignore large jumps (frequency wraps) when counting steps
                if (Math.abs(diff) < bwBins * 0.5) {
                    if (diff > 0) upSteps++;
                    if (diff < 0) downSteps++;
                }

                chirpLen++;
                sumPower += peaks[j].power;
                prevBin = curBin;
            }

            // A valid chirp should be long enough and have a consistent direction
            if (chirpLen >= Math.max(2, Math.floor(symbolRows * 0.4))) {
                let type = 'unknown';
                // Need a clear majority of steps in one direction
                if (upSteps > downSteps * 1.5) type = 'up';
                else if (downSteps > upSteps * 1.5) type = 'down';

                if (type !== 'unknown') {
                    chirps.push({
                        startRow: i,
                        endRow: i + chirpLen - 1,
                        length: chirpLen,
                        type: type,
                        avgPower: sumPower / chirpLen,
                        startBin: peaks[i].bin,
                        endBin: peaks[i + chirpLen - 1].bin,
                        symbolRows: symbolRows
                    });
                    i += chirpLen;
                    continue;
                }
            }
            i++;
        }

        return chirps;
    }

    /**
     * Analyze frame structure from detected chirps
     * LoRa frame: Preamble (N up-chirps) + Sync (2 down-chirps) + Header + Payload
     *
     * @param {Array} chirps - Detected chirps
     * @param {number} hopSize - Hop size in samples
     * @param {number} sampleRate - Sample rate
     * @param {number} bwBins - Bandwidth in FFT bins
     * @param {number} sf - Spreading Factor
     * @returns {Array} Detected frames
     */
    function analyzeFrameStructure(chirps, hopSize, sampleRate, bwBins, sf) {
        if (chirps.length === 0) return [];

        const frames = [];
        let i = 0;

        while (i < chirps.length) {
            // Look for preamble: sequence of consecutive up-chirps
            let preambleStart = -1;
            let preambleCount = 0;

            // Find start of preamble (at least 4 consecutive up-chirps)
            if (chirps[i].type === 'up') {
                preambleStart = i;
                preambleCount = 1;

                for (let j = i + 1; j < chirps.length; j++) {
                    if (chirps[j].type === 'up' &&
                        chirps[j].startRow - chirps[j-1].endRow <= chirps[j].symbolRows * 1.5) {
                        preambleCount++;
                    } else {
                        break;
                    }
                }
            }

            if (preambleCount >= 4) {
                const frame = {
                    startRow: chirps[preambleStart].startRow,
                    startTime: (chirps[preambleStart].startRow * hopSize) / sampleRate,
                    sections: []
                };

                // Preamble section
                const preambleEndIdx = preambleStart + preambleCount - 1;
                frame.sections.push({
                    type: 'preamble',
                    startRow: chirps[preambleStart].startRow,
                    endRow: chirps[preambleEndIdx].endRow,
                    count: preambleCount,
                    label: `${preambleCount} up-chirps`
                });

                let nextIdx = preambleStart + preambleCount;

                // Look for sync word (down-chirps immediately after preamble)
                let syncCount = 0;
                let syncStartIdx = nextIdx;
                while (nextIdx < chirps.length &&
                       chirps[nextIdx].type === 'down' &&
                       (syncCount === 0 || chirps[nextIdx].startRow - chirps[nextIdx-1].endRow <= chirps[nextIdx].symbolRows * 1.5)) {
                    syncCount++;
                    nextIdx++;
                }

                if (syncCount > 0) {
                    frame.sections.push({
                        type: 'sync',
                        startRow: chirps[syncStartIdx].startRow,
                        endRow: chirps[nextIdx - 1].endRow,
                        count: syncCount,
                        label: `${syncCount} down-chirps`
                    });
                }

                // Remaining chirps until gap = data (header + payload)
                let dataStartIdx = nextIdx;
                let dataCount = 0;
                let headerDone = false;

                while (nextIdx < chirps.length) {
                    // Check for gap indicating end of frame
                    if (dataCount > 0 && chirps[nextIdx].startRow - chirps[nextIdx-1].endRow > chirps[nextIdx].symbolRows * 2) {
                        break;
                    }
                    dataCount++;
                    nextIdx++;

                    // First ~2-3 symbols after sync are header (in explicit mode)
                    if (!headerDone && dataCount >= 2) {
                        const headerEndIdx = nextIdx - 1;
                        if (dataStartIdx <= headerEndIdx && dataStartIdx < chirps.length) {
                            frame.sections.push({
                                type: 'header',
                                startRow: chirps[dataStartIdx].startRow,
                                endRow: chirps[headerEndIdx].endRow,
                                count: dataCount,
                                label: `${dataCount} symbols`
                            });
                        }
                        headerDone = true;
                        dataStartIdx = nextIdx;
                        dataCount = 0;
                    }
                }

                // Remaining data = payload
                if (dataCount > 0 && dataStartIdx < chirps.length) {
                    const payloadChirps = chirps.slice(dataStartIdx, nextIdx);
                    
                    // Extract raw symbols based on frequency shift relative to preamble
                    let refBinSum = 0;
                    for (let p = preambleStart; p < preambleStart + preambleCount; p++) {
                        refBinSum += chirps[p].startBin;
                    }
                    const refBin = refBinSum / preambleCount;
                    
                    const maxVal = Math.pow(2, sf);
                    const symbols = payloadChirps.map(c => {
                        let shift = c.startBin - refBin;
                        while (shift < 0) shift += bwBins;
                        shift = shift % bwBins;
                        
                        const val = Math.round((shift / bwBins) * maxVal);
                        return val % maxVal;
                    });

                    frame.sections.push({
                        type: 'payload',
                        startRow: chirps[dataStartIdx].startRow,
                        endRow: chirps[nextIdx - 1].endRow,
                        count: dataCount,
                        label: `${dataCount} symbols`,
                        symbols: symbols,
                        chirps: payloadChirps
                    });
                }

                // Calculate frame end
                const lastSection = frame.sections[frame.sections.length - 1];
                frame.endRow = lastSection.endRow;
                frame.endTime = (frame.endRow * hopSize) / sampleRate;
                frame.duration = frame.endTime - frame.startTime;

                frames.push(frame);
                i = nextIdx;
            } else {
                i++;
            }
        }

        return frames;
    }

    return {
        generateWindow,
        fft,
        fftShift,
        computePowerSpectrum,
        computeSpectrogram,
        computeAveragePSD,
        detectPeakFrequencies,
        detectChirps,
        analyzeFrameStructure
    };
})();
