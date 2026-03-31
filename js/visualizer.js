export class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.width = 0;
        this.height = 0;
        
        this.hits = [];
        this.maxHits = 200; // Event count fade
        
        // Auto-scaling dynamic bounds
        this.baseMaxTiming = 50; // ms
        this.currentMaxTiming = this.baseMaxTiming;
        
        // 16th Beat Logic
        this.measureMode = '16th'; // 'ms' or '16th'
        this.bpm = 120;
        this.difficultyMode = 'medium';
        
        // Physics Config
        this.fadeSeconds = 3.0;
        this.virtualTime = 0;
        this.lastRenderRealTime = performance.now();
        this.isPlaying = false;
        this.minVelocity = 1;
        this.needsRender = true;
        
        this.initResizeObserver();
        this.updateScaling(); // calculate immediately for correct axis rendering
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
    
    addHit(velocity, offsetMs, color, shape, providedTimestamp = null) {
        this.hits.push({
            velocity,
            offsetMs,
            color,
            shape,
            timestamp: providedTimestamp !== null ? providedTimestamp : this.virtualTime
        });
        
        if (this.hits.length > this.maxHits) {
            this.hits.shift();
        }
        
        this.updateScaling();
        this.needsRender = true;
    }
    
    setMeasureMode(mode) {
        this.measureMode = mode;
        this.updateScaling();
        this.needsRender = true;
    }
    
    setDifficultyMode(mode) {
        this.difficultyMode = mode;
        this.needsRender = true;
    }
    
    setBpm(bpm) {
        this.bpm = bpm;
        if (this.measureMode === '16th') {
            this.updateScaling();
            this.needsRender = true;
        }
    }
    
    updateScaling() {
        if (this.measureMode === '16th') {
            // Calculate specific 16th note threshold
            // 1 beat = 60000ms / BPM. 16th note = beat / 4
            const msPerBeat = 60000 / this.bpm;
            this.currentMaxTiming = msPerBeat / 4;
            return;
        }

        let absoluteMax = 0;
        for (const hit of this.hits) {
            if (Math.abs(hit.offsetMs) > absoluteMax) {
                absoluteMax = Math.abs(hit.offsetMs);
            }
        }
        
        // Pad the absolute max by 20% visually so notes aren't precisely touching the roof
        let targetMax = absoluteMax * 1.2;
        if (targetMax < this.baseMaxTiming) targetMax = this.baseMaxTiming;
        
        // Smoothing auto-scale logic could go here, but snapping works for aggressive visuals
        this.currentMaxTiming = targetMax;
    }
    
    startRenderLoop() {
        const render = () => {
            if (this.width === 0) return requestAnimationFrame(render);
            
            const realNow = performance.now();
            const deltaMs = realNow - this.lastRenderRealTime;
            this.lastRenderRealTime = realNow;
            
            if (this.isPlaying) {
                this.virtualTime += deltaMs;
            }
            
            let hasActiveHits = false;
            for (let i = 0; i < this.hits.length; i++) {
                if ((this.virtualTime - this.hits[i].timestamp) / 1000.0 <= this.fadeSeconds) {
                    hasActiveHits = true;
                    break;
                }
            }

            if (!this.isPlaying && !hasActiveHits && !this.needsRender) {
                requestAnimationFrame(render);
                return;
            }
            this.needsRender = false;
            
            // Clear buffer
            this.ctx.clearRect(0, 0, this.width, this.height);
            
            const centerX = this.width / 2;
            
            // Calculate Good/Perfect Zone width based on difficulty
            let diffFactor = 0.5;
            if (this.difficultyMode === 'easy') diffFactor = 0.8;
            else if (this.difficultyMode === 'hard') diffFactor = 0.2;
            const goodZoneMs = (60000 / this.bpm) / 8.0 * diffFactor;
            const goodZonePixels = (goodZoneMs / this.currentMaxTiming) * (this.width / 2);
            
            // Shaded Target Zone (Matches Audio Feedback Good/Perfect window)
            this.ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
            this.ctx.fillRect(centerX - goodZonePixels, 0, goodZonePixels * 2, this.height);

            // Draw 32nd note dotted lines if in 16th mode
            if (this.measureMode === '16th') {
                const range32Pixels = 0.50 * (this.width / 2);

                // 32nd Note Dotted Lines
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - range32Pixels, 0);
                this.ctx.lineTo(centerX - range32Pixels, this.height);
                this.ctx.moveTo(centerX + range32Pixels, 0);
                this.ctx.lineTo(centerX + range32Pixels, this.height);
                this.ctx.setLineDash([2, 4]);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            // Draw Center 0ms Axis (Perfect Time)
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, 0);
            this.ctx.lineTo(centerX, this.height);
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'; // Primary accent washed out
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw Axis Labels
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.font = '12px JetBrains Mono, monospace';
            
            // X-Axis (Timing) Legend
            if (this.measureMode === '16th') {
                this.ctx.fillText(`EARLY (-1.0 16th)`, 10, this.height / 2 - 10);
                let lateText = `LATE (+1.0 16th)`;
                let lateWidth = this.ctx.measureText(lateText).width;
                this.ctx.fillText(lateText, this.width - lateWidth - 10, this.height / 2 - 10);
            } else {
                this.ctx.fillText(`EARLY (-${this.currentMaxTiming.toFixed(0)}ms)`, 10, this.height / 2 - 10);
                let lateText = `LATE (+${this.currentMaxTiming.toFixed(0)}ms)`;
                let lateWidth = this.ctx.measureText(lateText).width;
                this.ctx.fillText(lateText, this.width - lateWidth - 10, this.height / 2 - 10);
            }
            
            // Y-Axis (Velocity) Legend
            this.ctx.fillText('Velocity 127', centerX + 10, 20);
            this.ctx.fillText(`Velocity ${this.minVelocity}`, centerX + 10, this.height - 10);

            // Render Hits smoothly synced with time
            for (let i = 0; i < this.hits.length; i++) {
                const hit = this.hits[i];
                
                const ageSecs = (this.virtualTime - hit.timestamp) / 1000.0;
                if (ageSecs > this.fadeSeconds) continue; // Note has fully dissolved
                
                // Opacity curve: exponential decay (inverse cubic) for high-performance fluid tail
                const opacityPercent = 1.0 - (ageSecs / this.fadeSeconds);
                const opacity = Math.pow(opacityPercent, 3);
                
                // X = Offset. Center is 0. 
                // Positive offset (Late) visually draws RIGHT (X-coord is bigger)
                // Negative offset (Early) visually draws LEFT (X-coord is smaller)
                let xPercent = hit.offsetMs / this.currentMaxTiming; // -1.0 to 1.0
                
                const x = centerX + (xPercent * (this.width / 2));

                // Y = Velocity (this.minVelocity to 127) -> bounded vertically
                // Velocity 127 is top (y=0 padding), Velocity minVelocity is bottom
                const yPad = 40;
                const plottableHeight = this.height - (yPad * 2);
                
                let velRange = 127 - this.minVelocity;
                if (velRange < 1) velRange = 1; // Prevent div by 0
                
                let velAdjusted = hit.velocity - this.minVelocity;
                if (velAdjusted < 0) velAdjusted = 0;
                if (velAdjusted > velRange) velAdjusted = velRange;
                
                const y = this.height - yPad - ((velAdjusted / velRange) * plottableHeight);
                
                this.drawShape(x, y, hit.shape, hit.color, opacity);
            }
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
    
    drawShape(x, y, shape, color, opacity) {
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        
        // We parse standard colors to inject opacity, assuming hex or rgb
        this.ctx.fillStyle = color;
        this.ctx.translate(x, y);
        
        const size = 12;
        
        this.ctx.beginPath();
        switch(shape) {
            case 'circle':
                this.ctx.arc(0, 0, size/2, 0, Math.PI * 2);
                break;
            case 'square':
                this.ctx.rect(-size/2, -size/2, size, size);
                break;
            case 'triangle':
                this.ctx.moveTo(0, -size/1.5);
                this.ctx.lineTo(size/1.5, size/1.5);
                this.ctx.lineTo(-size/1.5, size/1.5);
                this.ctx.closePath();
                break;
            case 'diamond':
                this.ctx.moveTo(0, -size/1.2);
                this.ctx.lineTo(size/1.2, 0);
                this.ctx.lineTo(0, size/1.2);
                this.ctx.lineTo(-size/1.2, 0);
                this.ctx.closePath();
                break;
            default:
                this.ctx.arc(0, 0, size/2, 0, Math.PI * 2);
        }
        this.ctx.fill();
        
        // Add a slight stroke/glow 
        this.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        this.ctx.restore();
    }
}
