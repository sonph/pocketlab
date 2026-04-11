import { resizeHiDPICanvas } from './visualizer.js';

export class TimelineVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.hits = [];
        this.allPossibleTracks = ['ride', 'hihat', 'tom1', 'snare', 'tom2', 'tom3', 'kick'];
        this.tracks = [...this.allPossibleTracks];
        this._rebuildTrackMaps();
        this.staticCanvas = document.createElement('canvas');
        this.staticCtx = this.staticCanvas.getContext('2d');
        this.staticLayoutDirty = true;
        
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.canvas.parentElement);
        
        this.windowBars = 2;
        this.bpm = 120;
        this.tsCount = 4;
        this.tsSubdiv = 4;
        
        this.currentWindowIndex = -1;
        this.frozenPlayheadSecs = -1;
        this.needsRender = true;
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.width = parent.clientWidth;
        this.height = parent.clientHeight;
        resizeHiDPICanvas(this.canvas, this.ctx, this.width, this.height, window.devicePixelRatio);
        resizeHiDPICanvas(this.staticCanvas, this.staticCtx, this.width, this.height, window.devicePixelRatio);
        this.staticLayoutDirty = true;
        this.needsRender = true;
        // Don't draw immediately if not initialized
    }

    _rebuildTrackMaps() {
        this.trackIndexMap = this.tracks.reduce((acc, track, index) => {
            acc[track] = index;
            return acc;
        }, {});
        this.trackLabels = this.tracks.map(track => {
            if (track === 'tom1') return 'TOM 1';
            if (track === 'tom2') return 'TOM 2';
            if (track === 'tom3') return 'TOM 3';
            if (track === 'hihat') return 'HI-HAT';
            return track.toUpperCase();
        });
        this.staticLayoutDirty = true;
        this.needsRender = true;
    }

    setVisibleTracks(mappings, mergeRide = false) {
        const newTracks = this.allPossibleTracks.filter(track => {
            if (mergeRide && track === 'ride') return false;
            const config = mappings[track];
            return config && config.noteIds && config.noteIds.length > 0;
        });

        // Only rebuild if the track list actually changed
        if (JSON.stringify(newTracks) !== JSON.stringify(this.tracks)) {
            this.tracks = newTracks;
            this._rebuildTrackMaps();
            
            // Re-map existing hits to new track indices
            for (const hit of this.hits) {
                hit.trackIdx = this.trackIndexMap[hit.instrument];
            }
            
            // Clean up hits that are no longer in visible tracks
            this.hits = this.hits.filter(hit => hit.trackIdx !== undefined);
        }
    }

    updateConfig(windowBars, bpm, tsCount, tsSubdiv, gridSubdivisions, anchorShift = 0) {
        this.windowBars = parseInt(windowBars) || 2;
        this.bpm = bpm || 120;
        this.tsCount = tsCount || 4;
        this.tsSubdiv = tsSubdiv || 4;
        this.gridSubdivs = parseInt(gridSubdivisions) || 4;

        if (anchorShift !== 0 || true) { // Always recalculate hitX/windowIndex on config change
            const quartersPerBar = this.tsCount * (4.0 / this.tsSubdiv);
            const secondsPerBar = (60.0 / this.bpm) * quartersPerBar;
            const windowDuration = secondsPerBar * this.windowBars;

            for (const hit of this.hits) {
                if (anchorShift !== 0) {
                    hit.elapsedSecs -= anchorShift;
                }
                hit.windowIndex = Math.floor(hit.elapsedSecs / windowDuration);
                hit.hitX = (hit.elapsedSecs % windowDuration) / windowDuration;
            }
        }

        this.staticLayoutDirty = true;
        this.needsRender = true;
    }

    addHit(instrument, velocity, color, shape, elapsedSecs) {
        const trackIdx = this.trackIndexMap[instrument];
        if (trackIdx === undefined) return;
        
        if (elapsedSecs < 0) return;
        
        const quartersPerBar = this.tsCount * (4.0 / this.tsSubdiv);
        const secondsPerBar = (60.0 / this.bpm) * quartersPerBar;
        const windowDuration = secondsPerBar * this.windowBars;
        
        const windowIndex = Math.floor(elapsedSecs / windowDuration);
        const hitX = (elapsedSecs % windowDuration) / windowDuration; 

        this.hits.push({
            instrument,
            velocity,
            hitX,
            windowIndex,
            elapsedSecs,
            trackIdx,
            color,
            shape
        });
        
        this.needsRender = true;
    }

    render(isPlaying, elapsedSecs) {
        if (!this.ctx) return;
        if (this.width === 0 || this.height === 0) return;
        
        if (!isPlaying && !this.needsRender) return;
        this.needsRender = false;

        const trackHeight = this.height / this.tracks.length;
        
        let playheadXRatio = 0;
        let activeWindowIndex = -1;
        let halfBeatRatio = 0;
        let fadeZoneRatio = 0;
        
        if (isPlaying && elapsedSecs >= 0) {
            this.frozenPlayheadSecs = elapsedSecs; // store for stop state
        }
        
        const renderSecs = isPlaying ? elapsedSecs : this.frozenPlayheadSecs;
        
        if (renderSecs >= 0) {
            const quartersPerBar = this.tsCount * (4.0 / this.tsSubdiv);
            const secondsPerBar = (60.0 / this.bpm) * quartersPerBar;
            const windowDuration = secondsPerBar * this.windowBars;
            halfBeatRatio = (30.0 / this.bpm) / windowDuration;
            fadeZoneRatio = halfBeatRatio * 5.0; // Starts fading 2.5 beats early
            
            activeWindowIndex = Math.floor(renderSecs / windowDuration);
            playheadXRatio = (renderSecs % windowDuration) / windowDuration;
            
            // Maintain current and previous window hits for wiping effect
            if (activeWindowIndex !== this.currentWindowIndex && isPlaying) {
                while (this.hits.length > 0 && this.hits[0].windowIndex < activeWindowIndex - 1) {
                    this.hits.shift();
                }
                this.currentWindowIndex = activeWindowIndex;
            }
        }

        this._renderStaticLayout(trackHeight);
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.drawImage(this.staticCanvas, 0, 0, this.width, this.height);

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
            
            const x = hit.hitX * this.width;
            const y = (hit.trackIdx * trackHeight) + (trackHeight / 2);
            
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
            if (x + size > this.width) {
                drawHitShape(x - this.width);
            } else if (x - size < 0) {
                drawHitShape(x + this.width);
            }
            this.ctx.globalAlpha = 1.0;
        }

        // Playhead sweep
        if (renderSecs >= 0) {
            const px = playheadXRatio * this.width;
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.height);
            
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#38bdf8';
            this.ctx.strokeStyle = '#38bdf8';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.shadowBlur = 0;
            this.ctx.lineWidth = 1;
        }
    }

    _renderStaticLayout(trackHeight) {
        if (!this.staticLayoutDirty) return;

        const ctx = this.staticCtx;
        const width = this.width;
        const height = this.height;
        ctx.clearRect(0, 0, width, height);
        ctx.font = '11px JetBrains Mono';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 1;

        for (let i = 0; i < this.tracks.length; i++) {
            const yCenter = (i * trackHeight) + (trackHeight / 2);

            if (i % 2 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.02)';
                ctx.fillRect(0, i * trackHeight, width, trackHeight);
            }

            ctx.beginPath();
            ctx.moveTo(0, yCenter);
            ctx.lineTo(width, yCenter);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(this.trackLabels[i], 15, (i * trackHeight) + 4);
            ctx.textBaseline = 'middle';

            ctx.beginPath();
            ctx.moveTo(width - 1, i * trackHeight);
            ctx.lineTo(width - 1, (i + 1) * trackHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.stroke();
        }

        const validGridConfig = this.gridSubdivs || 4;
        const quartersPerBar = this.tsCount * (4.0 / this.tsSubdiv);
        const totalQuarters = this.windowBars * quartersPerBar;

        for (let bar = 0; bar <= this.windowBars; bar++) {
            const barOffsetQ = bar * quartersPerBar;
            const barX = (barOffsetQ / totalQuarters) * width;
            ctx.beginPath();
            ctx.moveTo(barX, 0);
            ctx.lineTo(barX, height);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();

            if (bar === this.windowBars) continue;

            const numLinesOverBar = Math.floor(quartersPerBar * validGridConfig);
            for (let b = 1; b <= numLinesOverBar; b++) {
                const subQ = b / validGridConfig;
                if (Math.abs(subQ - quartersPerBar) < 0.001) continue;

                const qPos = barOffsetQ + subQ;
                const gridX = (qPos / totalQuarters) * width;
                ctx.beginPath();
                ctx.moveTo(gridX, 0);
                ctx.lineTo(gridX, height);
                if (b % validGridConfig === 0) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1;
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                    ctx.lineWidth = 1;
                }
                ctx.stroke();
            }
        }

        ctx.lineWidth = 1;
        this.staticLayoutDirty = false;
    }
}
