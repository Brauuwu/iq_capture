/* ================================================================
   Colormaps Module — Scientific colormaps for spectrogram rendering
   ================================================================ */

const Colormaps = (() => {

    // Viridis colormap (256 entries) - perceptually uniform
    function viridis(t) {
        // Approximate viridis using polynomial fits
        t = Math.max(0, Math.min(1, t));
        const r = Math.max(0, Math.min(255, Math.round(
            (-1532.0 * t * t * t + 2015.0 * t * t - 463.0 * t + 68.0)
        )));
        const g = Math.max(0, Math.min(255, Math.round(
            (160.0 * t * t * t - 520.0 * t * t + 530.0 * t + 1.0)
        )));
        const b = Math.max(0, Math.min(255, Math.round(
            (575.0 * t * t * t - 1160.0 * t * t + 455.0 * t + 84.0)
        )));
        return [r, g, b];
    }

    // Inferno colormap
    function inferno(t) {
        t = Math.max(0, Math.min(1, t));
        const r = Math.max(0, Math.min(255, Math.round(
            (-1700.0 * t * t * t + 2680.0 * t * t - 520.0 * t + 1.0)
        )));
        const g = Math.max(0, Math.min(255, Math.round(
            (450.0 * t * t * t - 750.0 * t * t + 550.0 * t - 8.0)
        )));
        const b = Math.max(0, Math.min(255, Math.round(
            (2200.0 * t * t * t - 4400.0 * t * t + 2340.0 * t - 5.0)
        )));
        return [r, g, b];
    }

    // Plasma colormap
    function plasma(t) {
        t = Math.max(0, Math.min(1, t));
        const r = Math.max(0, Math.min(255, Math.round(
            (-750.0 * t * t * t + 1100.0 * t * t + 50.0 * t + 13.0)
        )));
        const g = Math.max(0, Math.min(255, Math.round(
            (610.0 * t * t * t - 820.0 * t * t + 460.0 * t + 2.0)
        )));
        const b = Math.max(0, Math.min(255, Math.round(
            (2900.0 * t * t * t - 5400.0 * t * t + 2550.0 * t + 120.0)
        )));
        return [r, g, b];
    }

    // Jet colormap
    function jet(t) {
        t = Math.max(0, Math.min(1, t));
        let r, g, b;
        if (t < 0.125) {
            r = 0; g = 0; b = 128 + t * 1024;
        } else if (t < 0.375) {
            r = 0; g = (t - 0.125) * 1020; b = 255;
        } else if (t < 0.625) {
            r = (t - 0.375) * 1020; g = 255; b = 255 - (t - 0.375) * 1020;
        } else if (t < 0.875) {
            r = 255; g = 255 - (t - 0.625) * 1020; b = 0;
        } else {
            r = 255 - (t - 0.875) * 1024; g = 0; b = 0;
        }
        return [Math.round(Math.max(0, Math.min(255, r))),
                Math.round(Math.max(0, Math.min(255, g))),
                Math.round(Math.max(0, Math.min(255, b)))];
    }

    // Grayscale
    function grayscale(t) {
        t = Math.max(0, Math.min(1, t));
        const v = Math.round(t * 255);
        return [v, v, v];
    }

    // Build lookup table for fast rendering (256 RGBA entries)
    function buildLUT(colormapFunc) {
        const lut = new Uint8Array(256 * 4);
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const [r, g, b] = colormapFunc(t);
            lut[i * 4] = r;
            lut[i * 4 + 1] = g;
            lut[i * 4 + 2] = b;
            lut[i * 4 + 3] = 255;
        }
        return lut;
    }

    const colormapFunctions = {
        viridis, inferno, plasma, jet, grayscale
    };

    const lutCache = {};

    function getLUT(name) {
        if (!lutCache[name]) {
            lutCache[name] = buildLUT(colormapFunctions[name] || viridis);
        }
        return lutCache[name];
    }

    /**
     * Map a normalized value (0-1) to an RGBA pixel using the LUT
     */
    function mapValue(lut, normalizedValue) {
        const idx = Math.max(0, Math.min(255, Math.round(normalizedValue * 255)));
        return [lut[idx * 4], lut[idx * 4 + 1], lut[idx * 4 + 2], 255];
    }

    return {
        getLUT,
        mapValue,
        colormapFunctions,
        buildLUT
    };
})();
