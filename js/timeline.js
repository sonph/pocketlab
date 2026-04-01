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
        let halfBeatRatio = 0;
        let fadeZoneRatio = 0;
        
        if (isPlaying && elapsedSecs >= 0) {
            this.frozenPlayheadSecs = elapsedSecs; // store for stop state
        }
        
        const renderSecs = isPlaying ? elapsedSecs : this.frozenPlayheadSecs;
        
        if (renderSecs >= 0) {
            const secondsPerBar = (60.0 / this.bpm) * this.tsCount;
            const windowDuration = secondsPerBar * this.windowBars;
            halfBeatRatio = (30.0 / this.bpm) / windowDuration;
            fadeZoneRatio = halfBeatRatio * 5.0; // Starts fading 2.5 beats early
            
            activeWindowIndex = Math.floor(renderSecs / windowDuration);
            playheadXRatio = (renderSecs % windowDuration) / windowDuration;
            
            // Maintain current and previous window hits for wiping effect
            if (activeWindowIndex !== this.currentWindowIndex && isPlaying) {
                this.hits = this.hits.filter(h => h.windowIndex >= activeWindowIndex - 1);
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
        const subdivsPerBar = this.tsCount * validGridConfig;
        
        for (let b = 0; b <= totalSubdivs; b++) {
            const x = (b / totalSubdivs) * this.canvas.width;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            
            if (b % subdivsPerBar === 0) {
                this.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                this.ctx.lineWidth = 2; // bolder bar separators
            } else if (b % validGridConfig === 0) {
                this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                this.ctx.lineWidth = 1;
            } else {
                this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                this.ctx.lineWidth = 1;
            }
            this.ctx.stroke();
        }
        this.ctx.lineWidth = 1; // reset after grid loop

        // Plot registered strikes
        for (const hit of this.hits) {
            // Render current active window, and previous window if ahead of playhead
            if (hit.windowIndex !== activeWindowIndex && hit.windowIndex !== activeWindowIndex - 1) continue;
            
            let fadeMult = 1.0;
            if (hit.windowIndex === activeWindowIndex - 1) {
                const distanceActive = hit.hitX - playheadXRatio;
                if (distanceActive <= halfBeatRatio) {
                    continue; // Erase previous loop note as playhead approaches closely
                } else if (distanceActive < fadeZoneRatio) {
                    // Smoothly fade the note away before it hits the erase boundary
                    fadeMult = (distanceActive - halfBeatRatio) / (fadeZoneRatio - halfBeatRatio);
                }
            }
            
            const trackIdx = this.tracks.indexOf(hit.instrument);
            if (trackIdx === -1) continue;
            
            const x = hit.hitX * this.canvas.width;
            const y = (trackIdx * trackHeight) + (trackHeight / 2);
            
            // Opacity maps physical velocity. Base 10% floor for extreme ghost hits.
            const alpha = Math.max(0.1, hit.velocity / 127.0) * fadeMult;
            
            this.ctx.fillStyle = hit.color;
            this.ctx.globalAlpha = alpha;
            const size = 9; // Increased by 50% from 6
            
            if (!this.shapeCache) this.shapeCache = {};
            const cacheKey = hit.shape + '_' + hit.color;
            if (!this.shapeCache[cacheKey]) {
                const c = document.createElement('canvas');
                c.width = 30; c.height = 30;
                const cctx = c.getContext('2d');
                const center = 15;
                const s = 9;
                cctx.fillStyle = hit.color;
                cctx.strokeStyle = hit.color;
                cctx.lineJoin = 'round';
                cctx.lineWidth = 4.5;
                cctx.beginPath();
                if (hit.shape === 'circle') {
                    cctx.arc(center, center, s, 0, Math.PI * 2);
                    cctx.fill();
                } else if (hit.shape === 'square') {
                    cctx.rect(center - s, center - s, s * 2, s * 2);
                    cctx.fill();
                    cctx.stroke();
                } else if (hit.shape === 'triangle') {
                    cctx.moveTo(center, center - s);
                    cctx.lineTo(center + s, center + s);
                    cctx.lineTo(center - s, center + s);
                    cctx.closePath();
                    cctx.fill();
                    cctx.stroke();
                } else if (hit.shape === 'diamond') {
                    cctx.moveTo(center, center - s);
                    cctx.lineTo(center + s, center);
                    cctx.lineTo(center, center + s);
                    cctx.lineTo(center - s, center);
                    cctx.closePath();
                    cctx.fill();
                    cctx.stroke();
                } else {
                    cctx.arc(center, center, s, 0, Math.PI * 2);
                    cctx.fill();
                }
                this.shapeCache[cacheKey] = c;
            }
            
            const drawHitShape = (drawX) => {
                this.ctx.drawImage(this.shapeCache[cacheKey], drawX - 15, y - 15);
            };
            
            // Primary render
            drawHitShape(x);
            
            // Boundary wrap-around (left/right rollover)
            if (x + size > this.canvas.width) {
                drawHitShape(x - this.canvas.width);
            } else if (x - size < 0) {
                drawHitShape(x + this.canvas.width);
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
