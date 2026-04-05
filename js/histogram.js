import { resizeHiDPICanvas } from './visualizer.js';

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
        this.buckets = new Array(this.bucketCount).fill(0);
        this.bucketCenters = new Array(this.bucketCount).fill(0);
        this.bucketColors = new Array(this.bucketCount).fill('#ef4444');
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
                resizeHiDPICanvas(this.canvas, this.ctx, this.width, this.height, window.devicePixelRatio);
                this.needsRender = true;
            }
        });
        observer.observe(this.canvas.parentElement);
    }
    
    addHit(offsetMs) {
        this.offsets.push(offsetMs);
        this._addOffsetToBuckets(offsetMs);
        this.needsRender = true;
    }
    
    clear() {
        this.offsets = [];
        this.buckets = new Array(this.bucketCount).fill(0);
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
        this._rebuildBuckets();
    }

    _rebuildBuckets() {
        this.buckets = new Array(this.bucketCount).fill(0);
        this._rebuildBucketMetadata();

        let localPeak = 0;
        for (let i = 0; i < this.offsets.length; i++) {
            const bucketIndex = this._getBucketIndex(this.offsets[i]);
            if (bucketIndex === -1) continue;
            this.buckets[bucketIndex]++;
            if (this.buckets[bucketIndex] > localPeak) {
                localPeak = this.buckets[bucketIndex];
            }
        }
        this.lastLocalPeak = localPeak;
    }

    _rebuildBucketMetadata() {
        const timelineRange = this.currentMaxTiming * 2;
        const msPerBucket = timelineRange / this.bucketCount;
        for (let b = 0; b < this.bucketCount; b++) {
            const bucketCenterMs = -this.currentMaxTiming + (b * msPerBucket) + (msPerBucket / 2);
            this.bucketCenters[b] = bucketCenterMs;
            const absMs = Math.abs(bucketCenterMs);
            let fillStyle = '#ef4444';
            if (absMs <= 5.0) {
                fillStyle = '#a3e635';
            } else if (absMs <= 15.0) {
                fillStyle = '#facc15';
            }
            this.bucketColors[b] = fillStyle;
        }
    }

    _getBucketIndex(offset) {
        const timelineRange = this.currentMaxTiming * 2;
        const msPerBucket = timelineRange / this.bucketCount;
        const shifted = offset + this.currentMaxTiming;
        const bucketIndex = Math.floor(shifted / msPerBucket);
        if (bucketIndex < 0 || bucketIndex >= this.bucketCount) return -1;
        return bucketIndex;
    }

    _addOffsetToBuckets(offset) {
        const bucketIndex = this._getBucketIndex(offset);
        if (bucketIndex === -1) return;
        this.buckets[bucketIndex]++;
        if (this.buckets[bucketIndex] > this.lastLocalPeak) {
            this.lastLocalPeak = this.buckets[bucketIndex];
        }
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
            
            // Auto-scale vertical height so the graph doesn't break the roof. 
            // We use a smoothed climb to prevent vicious flickering.
            if (this.lastLocalPeak > this.peakBucketVolume) {
                this.peakBucketVolume = this.lastLocalPeak; 
            } else if (this.peakBucketVolume > Math.max(this.lastLocalPeak, 10)) {
                // Extremely slow decay if the user clears or data shifts unexpectedly
                this.peakBucketVolume -= 0.1;
            }

            // ----------------------------------------------------
            // 2. Render Histogram Bars
            // ----------------------------------------------------
            const barWidth = (this.width / this.bucketCount);
            const pHeight = this.height - 10; // Small padding at the roof
            
            for (let b = 0; b < this.bucketCount; b++) {
                const count = this.buckets[b];
                if (count === 0) continue;
                
                const barH = (count / this.peakBucketVolume) * pHeight;
                const xPos = b * barWidth;
                const yPos = this.height - barH;
                
                this.ctx.fillStyle = this.bucketColors[b];
                // Add tiny 1px padding for distinct columns
                this.ctx.fillRect(Math.floor(xPos) + 1, yPos, Math.ceil(barWidth) - 1, barH);
            }
            
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }
}
