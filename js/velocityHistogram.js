/**
 * Velocity Histogram — Pocket Lab
 *
 * A single canvas visualization showing the velocity distribution for multiple
 * instruments simultaneously. Each instrument is drawn with its own color.
 * Rendering order is determined dynamically: the instrument with the HIGHEST
 * peak bucket count is drawn first (furthest back), and the one with the LOWEST
 * peak bucket count is drawn last (in the foreground). This ensures every
 * instrument remains visible even when distributions overlap.
 */
export class VelocityHistogram {
    /**
     * @param {string} canvasId - ID of the <canvas> element to bind to.
     */
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.width = 0;
        this.height = 0;

        // Per-instrument data stores keyed by instrument id (e.g. 'kick', 'snare', 'hihat')
        // Each entry: { hits: number[], color: string, label: string, enabled: boolean }
        this.instruments = {};

        // Velocity X-axis range
        this.minVelocity = 0;   // updated from ghost note filter
        this.maxVelocity = 127;

        this.bucketCount = 21;
        this.needsRender = true;

        this.initResizeObserver();
        this.startRenderLoop();
    }

    initResizeObserver() {
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                this.width = entry.contentRect.width;
                this.height = entry.contentRect.height;
                this.canvas.width = this.width * window.devicePixelRatio;
                this.canvas.height = this.height * window.devicePixelRatio;
                this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                this.needsRender = true;
            }
        });
        observer.observe(this.canvas.parentElement);
    }

    /**
     * Register an instrument track. Must be called before addHit.
     * @param {string} id - Instrument key, e.g. 'snare'
     * @param {string} color - CSS color string from MIDI mapping
     * @param {string} label - Display label
     */
    registerInstrument(id, color, label) {
        this.instruments[id] = { hits: [], color, label, enabled: true };
        this.needsRender = true;
    }

    /** Update the instrument color (e.g. when user changes mapping colors) */
    setInstrumentColor(id, color) {
        if (this.instruments[id]) {
            this.instruments[id].color = color;
            this.needsRender = true;
        }
    }

    /** Show or hide an instrument's bars */
    setInstrumentEnabled(id, enabled) {
        if (this.instruments[id]) {
            this.instruments[id].enabled = enabled;
            this.needsRender = true;
        }
    }

    /**
     * Record a velocity hit for a specific instrument.
     * @param {string} id - Instrument key
     * @param {number} velocity - Raw MIDI velocity 0–127
     */
    addHit(id, velocity) {
        if (!this.instruments[id] || !this.instruments[id].enabled) return;
        this.instruments[id].hits.push(velocity);
        this.needsRender = true;
    }

    /** Update the visible X-axis range (called when ghost note filter changes). */
    setRange(minVelocity, maxVelocity = 127) {
        this.minVelocity = Math.max(0, minVelocity);
        this.maxVelocity = Math.min(127, maxVelocity);
        this.needsRender = true;
    }

    /** Clear all hit data for all instruments. */
    clear() {
        for (const id of Object.keys(this.instruments)) {
            this.instruments[id].hits = [];
        }
        this.needsRender = true;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /** Compute frequency buckets for one instrument. Returns { buckets, peak }. */
    _buildBuckets(hits) {
        const range = this.maxVelocity - this.minVelocity;
        const buckets = new Array(this.bucketCount).fill(0);
        let peak = 0;

        for (const v of hits) {
            if (v < this.minVelocity || v > this.maxVelocity) continue;
            const idx = Math.min(
                this.bucketCount - 1,
                Math.floor(((v - this.minVelocity) / (range || 1)) * this.bucketCount)
            );
            buckets[idx]++;
            if (buckets[idx] > peak) peak = buckets[idx];
        }
        return { buckets, peak };
    }

    startRenderLoop() {
        const render = () => {
            if (this.width === 0) { requestAnimationFrame(render); return; }
            if (!this.needsRender) { requestAnimationFrame(render); return; }
            this.needsRender = false;

            // Background
            this.ctx.fillStyle = '#0f172a';
            this.ctx.fillRect(0, 0, this.width, this.height);

            const ids = Object.keys(this.instruments).filter(id => this.instruments[id].enabled);
            if (ids.length === 0) { requestAnimationFrame(render); return; }

            // Build bucket data for each active instrument
            const data = ids.map(id => {
                const { buckets, peak } = this._buildBuckets(this.instruments[id].hits);
                return { id, color: this.instruments[id].color, label: this.instruments[id].label, buckets, peak };
            });

            // Sort descending by peak so the noisiest instrument is drawn first (background)
            data.sort((a, b) => b.peak - a.peak);

            // Global peak across all instruments for shared Y-axis scaling
            const globalPeak = Math.max(...data.map(d => d.peak), 1);

            const barWidth = this.width / this.bucketCount;
            const drawH = this.height - 20; // bottom margin for labels

            for (const { color, buckets, peak } of data) {
                if (peak === 0) continue;
                for (let b = 0; b < this.bucketCount; b++) {
                    const count = buckets[b];
                    if (count === 0) continue;

                    const barH = (count / globalPeak) * drawH;
                    const x = b * barWidth;
                    const y = this.height - barH - 20;

                    // Draw with 80% opacity so layered instruments remain visible through each other
                    this.ctx.globalAlpha = 0.82;
                    this.ctx.fillStyle = color;
                    this.ctx.fillRect(Math.floor(x) + 1, y, Math.ceil(barWidth) - 1, barH);
                }
            }
            this.ctx.globalAlpha = 1.0;

            // X-axis labels: min and max velocity
            this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
            this.ctx.font = '10px JetBrains Mono, monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`${this.minVelocity}`, 4, this.height - 4);
            this.ctx.textAlign = 'right';
            this.ctx.fillText(`${this.maxVelocity}`, this.width - 4, this.height - 4);

            // Center label
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Velocity', this.width / 2, this.height - 4);

            // Legend: instrument color dots
            let legendX = 6;
            for (const { label, color } of data) {
                this.ctx.fillStyle = color;
                this.ctx.beginPath();
                this.ctx.arc(legendX + 4, 8, 4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
                this.ctx.textAlign = 'left';
                this.ctx.fillText(label, legendX + 11, 12);
                legendX += this.ctx.measureText(label).width + 20;
            }

            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}
