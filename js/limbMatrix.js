export class LimbMatrixVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.width = 0;
        this.height = 0;
        
        this.bpm = 120;
        this.limit32ndMs = 62.5; 
        
        this.pendingWindows = {}; 
        this.points = [];
        this.maxPoints = 150;
        
        this.fadeSeconds = 3.0;
        this.virtualTime = 0;
        this.lastRenderRealTime = performance.now();
        this.isPlaying = false;
        this.needsRender = true;
        
        this.initResizeObserver();
        this.updateScaling();
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

    setBpm(bpm) {
        this.bpm = bpm;
        this.updateScaling();
        this.needsRender = true;
    }

    updateScaling() {
        const msPerBeat = 60000 / this.bpm;
        // 32nd note = beat / 8
        this.limit32ndMs = msPerBeat / 8;
    }

    clear() {
        this.points = [];
        this.pendingWindows = {};
        this.needsRender = true;
    }

    addHit(instrument, offsetMs, expectedTargetId, velocity, color, shape) {
        if (!['hihat', 'kick', 'snare'].includes(instrument)) return;
        
        // Strict boundary evaluation (must fall within \u00B132nd note of expected click)
        if (Math.abs(offsetMs) > this.limit32ndMs) return;

        const winId = typeof expectedTargetId === 'number' ? expectedTargetId.toFixed(6) : expectedTargetId.toString();
        if (!this.pendingWindows[winId]) {
            this.pendingWindows[winId] = { hihat: null, kick: null, snare: null, timeObj: performance.now() };
        }
        
        let pending = this.pendingWindows[winId];
        if (instrument === 'hihat') {
            pending.hihat = offsetMs;
        } else if (instrument === 'kick') {
            pending.kick = { offsetMs, color, shape, timestamp: this.virtualTime };
        } else if (instrument === 'snare') {
            pending.snare = { offsetMs, color, shape, timestamp: this.virtualTime };
        }
        
        this.evaluateWindow(winId);
        this.purgeOldWindows();
        this.needsRender = true;
    }

    evaluateWindow(winId) {
        const pending = this.pendingWindows[winId];
        if (!pending) return;
        
        if (pending.hihat !== null) {
            // Plot Kick vs Hat on the X-axis (Y = 0)
            if (pending.kick !== null) {
                const kickOffsetRel = pending.kick.offsetMs - pending.hihat;
                this.commitPoint(kickOffsetRel, 0, pending.kick.color, pending.kick.shape, pending.kick.timestamp);
                pending.kick = null;
            }
            // Plot Snare vs Hat on the Y-axis (X = 0)
            if (pending.snare !== null) {
                const snareOffsetRel = pending.snare.offsetMs - pending.hihat;
                this.commitPoint(0, snareOffsetRel, pending.snare.color, pending.snare.shape, pending.snare.timestamp);
                pending.snare = null;
            }
        }
    }

    commitPoint(x, y, color, shape, timestamp) {
        this.points.push({ x, y, color, shape, timestamp });
        if (this.points.length > this.maxPoints) {
            this.points.shift();
        }
    }

    purgeOldWindows() {
        // Cleanup expected time maps beyond 2 full seconds trailing
        const nowDOM = performance.now();
        for (const [winId, pending] of Object.entries(this.pendingWindows)) {
            if (nowDOM - pending.timeObj > 2000) {
                delete this.pendingWindows[winId];
            }
        }
    }

    startRenderLoop() {
        const render = () => {
            if (this.width === 0) return requestAnimationFrame(render);
            
            const now = performance.now();
            if (this.isPlaying) {
                const dt = (now - this.lastRenderRealTime) / 1000.0;
                this.virtualTime += dt;
            }
            this.lastRenderRealTime = now;
            
            let hasActiveHits = false;
            for (let i = 0; i < this.points.length; i++) {
                let ageSecs = this.virtualTime - this.points[i].timestamp;
                if (ageSecs < 0) ageSecs = 0;
                let alpha = 1.0 - (ageSecs / this.fadeSeconds);
                if (alpha > 0) {
                    hasActiveHits = true;
                    break;
                }
            }

            if (!this.isPlaying && !hasActiveHits && !this.needsRender) {
                requestAnimationFrame(render);
                return;
            }
            this.needsRender = false;
            
            this.ctx.clearRect(0, 0, this.width, this.height);

            const cx = this.width / 2;
            const cy = this.height / 2;

            // Matrix Grid
            this.ctx.lineWidth = 1;

            // \u00B132nd note boundaries visual indicator
            this.ctx.fillStyle = 'rgba(255,255,255,0.02)';
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Centered Crosshairs (0, 0) representing the Hi-Hat
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.setLineDash([4, 4]); // Dotted Crosshair
            this.ctx.beginPath();
            this.ctx.moveTo(cx, 0);
            this.ctx.lineTo(cx, this.height);
            this.ctx.moveTo(0, cy);
            this.ctx.lineTo(this.width, cy);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // X-Axis Sub-Labels (Kick vs Hat)
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.font = '10px JetBrains Mono';
            this.ctx.textAlign = 'right';
            this.ctx.fillText('+32nd (Kick Late)', this.width - 10, cy + 15);
            this.ctx.textAlign = 'left';
            this.ctx.fillText('-32nd (Kick Early)', 10, cy + 15);
            
            // Y-Axis Sub-Labels (Snare vs Hat)
            this.ctx.textAlign = 'right';
            this.ctx.fillText('(Snare Late)', cx - 5, this.height - 10);
            this.ctx.fillText('(Snare Early)', cx - 5, 15);

            // Points
            for (let i = this.points.length - 1; i >= 0; i--) {
                const p = this.points[i];
                let ageSecs = this.virtualTime - p.timestamp;
                if (ageSecs < 0) ageSecs = 0;
                
                let alpha = 1.0 - (ageSecs / this.fadeSeconds);
                if (alpha <= 0) {
                    this.points.splice(i, 1);
                    continue;
                }
                
                // Opacity curve: Math.pow to make it fade slower organically
                alpha = Math.max(0.1, Math.min(1.0, Math.pow(alpha, 0.4)));

                // Map value: offsetMs ranges [-limit, +limit] mapped to [0, width/height]
                // Negative (early) = plotted up/left
                // Positive (late) = plotted down/right
                // wait, visually standard cartesian: right is positive X, top is positive Y
                // So if hit is late (+ ms), Hat X should be RIGHT
                const mappedX = cx + ((p.x / this.limit32ndMs) * (this.width / 2.0));
                // If Kick is late (+ ms), Y should be BOTTOM (inverted screen coords) or TOP? 
                // Cartesian standard: Y positive is UP. Screen coordinates Y positive is DOWN.
                // Let's do positive (Late) = bottom
                const mappedY = cy + ((p.y / this.limit32ndMs) * (this.height / 2.0));

                this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = alpha;
                
                const size = 6;
                if (!this.shapeCache) this.shapeCache = {};
                const cacheKey = p.shape + '_' + p.color;
                if (!this.shapeCache[cacheKey]) {
                    const c = document.createElement('canvas');
                    c.width = 24; c.height = 24;
                    const cctx = c.getContext('2d');
                    const center = 12;
                    const s = 6;
                    cctx.fillStyle = p.color;
                    cctx.strokeStyle = p.color;
                    cctx.lineJoin = 'round';
                    cctx.lineWidth = 4.5;
                    cctx.beginPath();
                    if (p.shape === 'circle') {
                        cctx.arc(center, center, s, 0, Math.PI * 2);
                        cctx.fill();
                    } else if (p.shape === 'square') {
                        cctx.rect(center - s, center - s, s * 2, s * 2);
                        cctx.fill();
                        cctx.stroke();
                    } else if (p.shape === 'triangle') {
                        cctx.moveTo(center, center - s);
                        cctx.lineTo(center + s, center + s);
                        cctx.lineTo(center - s, center + s);
                        cctx.closePath();
                        cctx.fill();
                        cctx.stroke();
                    } else if (p.shape === 'diamond') {
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
                this.ctx.drawImage(this.shapeCache[cacheKey], mappedX - 12, mappedY - 12);
                this.ctx.globalAlpha = 1.0;
            }
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}
