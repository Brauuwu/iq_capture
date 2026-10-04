# IQ Spectrogram Analyzer

A web-based interactive visualization tool to analyze IQ signal spectrograms from `.cf32` (Complex Float32) files.

## Features
- **Client-Side Processing**: Processes `.cf32` files directly in your web browser. No data is uploaded to a server.
- **Interactive UI**: Drag and drop `.cf32` files to visualize.
- **Configurable Settings**: Adjustable Sample Rate with common presets (1 MHz, 2.4 MHz, 10 MHz, etc.).
- **Dynamic Spectrogram**: View signal frequency components over time.

## Quick Start
1. Clone this repository:
   ```bash
   git clone <your-repo-url>
   ```
2. Open `index.html` in any modern web browser.
3. Drag and drop your `.cf32` file into the designated drop zone to begin analysis.

## Development
- `index.html`: The main user interface.
- `app.js`: Application logic and UI interaction.
- `dsp.js`: Digital Signal Processing core (FFT, signal processing).
- `colormaps.js`: Spectrogram color mappings.
- `style.css`: Styling and layout.

## Deployment
This project includes a GitHub Actions workflow to automatically deploy to GitHub Pages whenever changes are pushed to the `main` branch.
