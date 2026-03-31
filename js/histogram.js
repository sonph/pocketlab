export class Histogram {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.width = 0;
        this.height = 0;
        
        // Data pipeline
        this.offsets = []; // Store raw ms offsets of all hit points
        
        // Match visualizer physics to keep X-Axis completely synchronous
        this.baseMaxTiming = 50; 
        this.currentMaxTiming = this.baseMaxTiming;
        this.measureMode = '16th'; // 'ms' or '16th'
        this.bpm = 120;
        this.difficultyMode = 'medium';
        
        // Rendering constraints
        this.bucketCount = 80; // Total number of vertical bars rendering the curve
        this.peakBucketVolume = 10; // Auto-scales during render to prevent clipping
        this.lastLocalPeak = 0;
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
                // Native pixel scaling for Retina/HDPI screens
                this.canvas.width = this.width * window.devicePixelRatio;
                this.canvas.height = this.height * window.devicePixelRatio;
                this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                this.needsRender = true;
            }
        });
        observer.observe(this.canvas.parentElement);
    }
    
    addHit(offsetMs) {
        this.offsets.push(offsetMs);
        this.needsRender = true;
    }
    
    clear() {
        this.offsets = [];
        this.peakBucketVolume = 10; // reset
        this.lastLocalPeak = 0;
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
        this.updateScaling();
        this.needsRender = true;
    }
    
    updateScaling() {
        // Exactly mirrors the Scatter Plot limit architecture
        let dynamicLimit = this.baseMaxTiming;
        if (this.measureMode === '16th') {
            const msPerBeat = 60000 / this.bpm;
            dynamicLimit = msPerBeat / 4; 
        } 
        
        let targetMax = dynamicLimit * 1.2;
        if (targetMax < this.baseMaxTiming) targetMax = this.baseMaxTiming;
        this.currentMaxTiming = targetMax;
    }

    startRenderLoop() {
        const render = () => {
            if (this.width === 0) return requestAnimationFrame(render);
            
            if (!this.needsRender && this.peakBucketVolume <= Math.max(this.lastLocalPeak, 10)) {
                requestAnimationFrame(render);
                return;
            }
            this.needsRender = false;
            
            // Clear buffer with solid dark background
            this.ctx.fillStyle = '#0f172a'; // Match global background
            this.ctx.fillRect(0, 0, this.width, this.height);
            
            const centerX = this.width / 2;
            
            // Draw Center 0ms Axis (Perfect Time)
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, 0);
            this.ctx.lineTo(centerX, this.height);
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw Target Zone Highlights bridging from the Scatter Plot
            let diffFactor = 0.5;
            if (this.difficultyMode === 'easy') diffFactor = 0.8;
            else if (this.difficultyMode === 'hard') diffFactor = 0.2;
            const goodZoneMs = (60000 / this.bpm) / 8.0 * diffFactor;
            const goodZonePixels = (goodZoneMs / this.currentMaxTiming) * (this.width / 2);
            
            this.ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
            this.ctx.fillRect(centerX - goodZonePixels, 0, goodZonePixels * 2, this.height);
            
            // ----------------------------------------------------
            // 1. Process Data into Frequency Buckets
            // ----------------------------------------------------
            const buckets = new Array(this.bucketCount).fill(0);
            
            // Map the total X-axis timeline: -currentMaxTiming to +currentMaxTiming
            const timelineRange = this.currentMaxTiming * 2;
            const msPerBucket = timelineRange / this.bucketCount;
            
            let localPeak = 0;
            
            for (let i = 0; i < this.offsets.length; i++) {
                const offset = this.offsets[i];
                // Shift offset mathematically so -currentMaxTiming = 0
                const shifted = offset + this.currentMaxTiming;
                
                let bucketIndex = Math.floor(shifted / msPerBucket);
                
                // Drop outliers that fall completely outside the visual scope rather than stacking them on the edges
                if (bucketIndex < 0 || bucketIndex >= this.bucketCount) continue;
                
                buckets[bucketIndex]++;
                if (buckets[bucketIndex] > localPeak) {
                    localPeak = buckets[bucketIndex];
                }
            }
            
            // Auto-scale vertical height so the graph doesn't break the roof. 
            // We use a smoothed climb to prevent vicious flickering.
            if (localPeak > this.peakBucketVolume) {
                this.peakBucketVolume = localPeak; 
            } else if (this.peakBucketVolume > Math.max(localPeak, 10)) {
                // Extremely slow decay if the user clears or data shifts unexpectedly
                this.peakBucketVolume -= 0.1;
            }
            this.lastLocalPeak = localPeak;

            // ----------------------------------------------------
            // 2. Render Histogram Bars
            // ----------------------------------------------------
            const barWidth = (this.width / this.bucketCount);
            const pHeight = this.height - 10; // Small padding at the roof
            
            for (let b = 0; b < this.bucketCount; b++) {
                const count = buckets[b];
                if (count === 0) continue;
                
                // Bucket physical center timing (in MS offset)
                // b=0 is left edge, b=bucketCount/2 is 0ms
                const bucketCenterMs = -this.currentMaxTiming + (b * msPerBucket) + (msPerBucket / 2);
                const absMs = Math.abs(bucketCenterMs);
                
                // Color Math (as defined by Spec: C. The Pocket Heatmap)
                let fillStyle = '#ef4444'; // Red: Out of Pocket (> 15ms or 20ms? Spec says >20 out of pocket, Yellow 15)
                if (absMs <= 5.0) {
                    fillStyle = '#a3e635'; // Green: Perfect
                } else if (absMs <= 15.0) {
                    fillStyle = '#facc15'; // Yellow: Solid
                }
                
                const barH = (count / this.peakBucketVolume) * pHeight;
                const xPos = b * barWidth;
                const yPos = this.height - barH;
                
                this.ctx.fillStyle = fillStyle;
                // Add tiny 1px padding for distinct columns
                this.ctx.fillRect(Math.floor(xPos) + 1, yPos, Math.ceil(barWidth) - 1, barH);
            }
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}
