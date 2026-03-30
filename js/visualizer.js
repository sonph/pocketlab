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
        this.baseMaxY = 50; // ms
        this.currentMaxY = this.baseMaxY;
        
        // 16th Beat Logic
        this.measureMode = '16th'; // 'ms' or '16th'
        this.bpm = 120;
        
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
            }
        });
        observer.observe(this.canvas.parentElement);
    }
    
    addHit(velocity, offsetMs, color, shape) {
        this.hits.push({
            velocity,
            offsetMs,
            color,
            shape
        });
        
        if (this.hits.length > this.maxHits) {
            this.hits.shift();
        }
        
        this.updateScaling();
    }
    
    setMeasureMode(mode) {
        this.measureMode = mode;
        this.updateScaling();
    }
    
    setBpm(bpm) {
        this.bpm = bpm;
        if (this.measureMode === '16th') {
            this.updateScaling();
        }
    }
    
    updateScaling() {
        if (this.measureMode === '16th') {
            // Calculate specific 16th note threshold
            // 1 beat = 60000ms / BPM. 16th note = beat / 4
            const msPerBeat = 60000 / this.bpm;
            this.currentMaxY = msPerBeat / 4;
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
        if (targetMax < this.baseMaxY) targetMax = this.baseMaxY;
        
        // Smoothing auto-scale logic could go here, but snapping works for aggressive visuals
        this.currentMaxY = targetMax;
    }
    
    startRenderLoop() {
        const render = () => {
            if (this.width === 0) return requestAnimationFrame(render);
            
            // Clear buffer
            this.ctx.clearRect(0, 0, this.width, this.height);
            
            const centerY = this.height / 2;
            
            // Draw Center 0ms Axis (Perfect Time)
            this.ctx.beginPath();
            this.ctx.moveTo(0, centerY);
            this.ctx.lineTo(this.width, centerY);
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'; // Primary accent washed out
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw Axis Labels
            this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
            this.ctx.font = '12px JetBrains Mono, monospace';
            if (this.measureMode === '16th') {
                this.ctx.fillText(`+1.0 16th (LATE - ${this.currentMaxY.toFixed(0)}ms)`, 10, 20);
                this.ctx.fillText(`-1.0 16th (EARLY - ${this.currentMaxY.toFixed(0)}ms)`, 10, this.height - 10);
            } else {
                this.ctx.fillText(`+${this.currentMaxY.toFixed(0)}ms (LATE)`, 10, 20);
                this.ctx.fillText(`-${this.currentMaxY.toFixed(0)}ms (EARLY)`, 10, this.height - 10);
            }
            this.ctx.fillText('Velocity \u2192', this.width - 90, centerY - 10);

            // Render Hits
            for (let i = 0; i < this.hits.length; i++) {
                const hit = this.hits[i];
                const ageFactor = i / this.hits.length; // 0.0 (oldest) to 1.0 (newest)
                // Opacity curve: exponential decay so newest are bright, mid are dim, older are ghostly
                const opacity = Math.pow(ageFactor, 3) * 0.9 + 0.1;
                
                // X = Velocity (0 to 127) -> bounded horizontally
                // We add some padding on the X-axis so velocity 127 doesn't sit exactly on the edge
                const xPad = 40;
                const plottableWidth = this.width - (xPad * 2);
                const x = xPad + (hit.velocity / 127) * plottableWidth;
                
                // Y = Offset. Center is 0. 
                // Positive offset (Late) visually draws ABOVE the line (Y-coord is smaller)
                // Negative offset (Early) visually draws BELOW the line (Y-coord is bigger)
                let yPercent = hit.offsetMs / this.currentMaxY; // -1.0 to 1.0
                if (yPercent > 1.0) yPercent = 1.0;
                if (yPercent < -1.0) yPercent = -1.0;
                
                const y = centerY - (yPercent * (this.height / 2));
                
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
