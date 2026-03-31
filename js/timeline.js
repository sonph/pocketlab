export class TimelineVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.hits = [];
        this.tracks = ['ride', 'hihat', 'tom1', 'snare', 'tom2', 'kick'];
        
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.canvas.parentElement);
        
        this.windowBars = 2;
        this.bpm = 120;
        this.tsCount = 4;
        
        this.currentWindowIndex = -1;
        this.frozenPlayheadSecs = -1;
        this.needsRender = true;
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        this.needsRender = true;
        // Don't draw immediately if not initialized
    }

    updateConfig(windowBars, bpm, tsCount, gridSubdivisions) {
        this.windowBars = parseInt(windowBars) || 2;
        this.bpm = bpm || 120;
        this.tsCount = tsCount || 4;
        this.gridSubdivs = parseInt(gridSubdivisions) || 4;
        this.needsRender = true;
    }

    addHit(instrument, velocity, color, shape, elapsedSecs) {
        if (!this.tracks.includes(instrument)) return;
        
        const secondsPerBar = (60.0 / this.bpm) * this.tsCount;
        const windowDuration = secondsPerBar * this.windowBars;
        // Safety guard for negatives due to latency math
        if (elapsedSecs < 0) return;
        
        const windowIndex = Math.floor(elapsedSecs / windowDuration);
        const hitX = (elapsedSecs % windowDuration) / windowDuration; 

        this.hits.push({
            instrument,
            velocity,
            hitX,
            windowIndex,
            color,
            shape
        });
        
        this.needsRender = true;
    }

    render(isPlaying, elapsedSecs) {
        if (!this.ctx) return;
        
        if (!isPlaying && !this.needsRender) return;
        this.needsRender = false;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const trackHeight = this.canvas.height / this.tracks.length;
        
        let playheadXRatio = 0;
        let activeWindowIndex = -1;
        
        if (isPlaying && elapsedSecs >= 0) {
            this.frozenPlayheadSecs = elapsedSecs; // store for stop state
        }
        
        const renderSecs = isPlaying ? elapsedSecs : this.frozenPlayheadSecs;
        
        if (renderSecs >= 0) {
            const secondsPerBar = (60.0 / this.bpm) * this.tsCount;
            const windowDuration = secondsPerBar * this.windowBars;
            activeWindowIndex = Math.floor(renderSecs / windowDuration);
            playheadXRatio = (renderSecs % windowDuration) / windowDuration;
            
            // Clear old hits when wrapping around
            if (activeWindowIndex !== this.currentWindowIndex && isPlaying) {
                this.hits = this.hits.filter(h => h.windowIndex === activeWindowIndex);
                this.currentWindowIndex = activeWindowIndex;
            }
        }

        // Layout UI Grid
        this.ctx.font = '11px JetBrains Mono';
        this.ctx.textBaseline = 'middle';
        this.ctx.lineWidth = 1;
        
        for (let i = 0; i < this.tracks.length; i++) {
            const yCenter = (i * trackHeight) + (trackHeight / 2);
            
            // Alternate lane shading matching UI aesthetic
            if (i % 2 === 0) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.02)';
                this.ctx.fillRect(0, i * trackHeight, this.canvas.width, trackHeight);
            }
            
            // Central strike line
            this.ctx.beginPath();
            this.ctx.moveTo(0, yCenter);
            this.ctx.lineTo(this.canvas.width, yCenter);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            this.ctx.stroke();

            // Track Label Anchor
            this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(this.tracks[i].toUpperCase(), 15, (i * trackHeight) + 4);
            this.ctx.textBaseline = 'middle'; // reset for other uses if any
            
            // Right edge border
            this.ctx.beginPath();
            this.ctx.moveTo(this.canvas.width - 1, i * trackHeight);
            this.ctx.lineTo(this.canvas.width - 1, (i + 1) * trackHeight);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            this.ctx.stroke();
        }

        // Background Math Grids
        const validGridConfig = this.gridSubdivs || 4;
        const totalSubdivs = this.windowBars * this.tsCount * validGridConfig;
        for (let b = 0; b <= totalSubdivs; b++) {
            const x = (b / totalSubdivs) * this.canvas.width;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.strokeStyle = (b % validGridConfig === 0) ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
            this.ctx.stroke();
        }

        // Plot registered strikes
        for (const hit of this.hits) {
            // Safety: render only current active window index
            if (hit.windowIndex !== activeWindowIndex) continue;
            
            const trackIdx = this.tracks.indexOf(hit.instrument);
            if (trackIdx === -1) continue;
            
            const x = hit.hitX * this.canvas.width;
            const y = (trackIdx * trackHeight) + (trackHeight / 2);
            
            // Opacity maps physical velocity. Base 10% floor for extreme ghost hits.
            const alpha = Math.max(0.1, hit.velocity / 127.0);
            
            this.ctx.fillStyle = hit.color;
            this.ctx.globalAlpha = alpha;
            this.ctx.beginPath();
            
            const size = 9; // Increased by 50% from 6
            if (hit.shape === 'circle') {
                this.ctx.arc(x, y, size, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (hit.shape === 'square') {
                this.ctx.fillRect(x - size, y - size, size * 2, size * 2);
            } else if (hit.shape === 'triangle') {
                this.ctx.moveTo(x, y - size);
                this.ctx.lineTo(x + size, y + size);
                this.ctx.lineTo(x - size, y + size);
                this.ctx.fill();
            } else if (hit.shape === 'diamond') {
                this.ctx.moveTo(x, y - size);
                this.ctx.lineTo(x + size, y);
                this.ctx.lineTo(x, y + size);
                this.ctx.lineTo(x - size, y);
                this.ctx.fill();
            } else {
                this.ctx.arc(x, y, size, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.globalAlpha = 1.0;
        }

        // Playhead sweep
        if (renderSecs >= 0) {
            const px = playheadXRatio * this.canvas.width;
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.canvas.height);
            
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#38bdf8';
            this.ctx.strokeStyle = '#38bdf8';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.shadowBlur = 0;
            this.ctx.lineWidth = 1;
        }
    }
}
