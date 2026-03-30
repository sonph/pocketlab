import { Metronome } from './metronome.js';
import { MidiEngine } from './midi.js';
import { Visualizer } from './visualizer.js';

/**
 * Pocket Lab Core Application
 * Core initialization for Web MIDI and visualizations.
 */

class PocketLabApp {
    constructor() {
        this.metronome = new Metronome();
        this.midi = new MidiEngine();
        this.visualizer = null;
        this.expectedHits = []; // Queue of structural times the user *should* hit
        this.init();
    }

    init() {
        console.log("Pocket Lab Application initialized.");
        this.setupMetronomeUI();
        this.setupMidi();
        this.setupCanvas();
        
        const urlParams = new URLSearchParams(window.location.search);
        this.isDebug = urlParams.get('debug') === 'true';
        if (this.isDebug) {
            console.log("DEBUG MODE ACTIVE: Simulating 'Money Beat' on Play.");
            this.setupDebugSimulator();
        }
    }

    setupMetronomeUI() {
        const playBtn = document.getElementById('play-btn');
        const bpmInput = document.getElementById('bpm-input');
        const bpmSlider = document.getElementById('bpm-slider');
        
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.metronome.startStop();
                playBtn.textContent = this.metronome.isPlaying ? 'Stop' : 'Play';
            });
        }
        
        const updateBpm = (val) => {
            let bpm = typeof val === 'string' ? parseInt(val, 10) : val;
            if (isNaN(bpm)) return;
            if (bpm < 40) bpm = 40;
            if (bpm > 300) bpm = 300;
            
            if (bpmInput) bpmInput.value = bpm;
            if (bpmSlider) bpmSlider.value = bpm;
            this.metronome.setBpm(bpm);
            if (this.visualizer) this.visualizer.setBpm(bpm);
        };

        if (bpmInput) {
            bpmInput.addEventListener('input', (e) => updateBpm(e.target.value));
        }
        
        if (bpmSlider) {
            bpmSlider.addEventListener('input', (e) => updateBpm(e.target.value));
        }

        const stepBtns = document.querySelectorAll('.bpm-step');
        stepBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const step = parseInt(e.target.dataset.step, 10);
                updateBpm(this.metronome.bpm + step);
            });
        });

        // Advanced Config UI Bindings
        const bindSetting = (id, property, isNumber = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            const handler = (e) => {
                let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                if (isNumber) val = Number(val);
                this.metronome.updateSettings({ [property]: val });
            };
            el.addEventListener('change', handler);
            el.addEventListener('input', handler); 
        };

        bindSetting('setting-intervalMode', 'intervalMode');
        bindSetting('setting-countInBars', 'countInBars', true);
        bindSetting('setting-voicing', 'voicing');
        bindSetting('setting-emphasis', 'emphasis');
        
        bindSetting('setting-gapRadioMode', 'gapRadioMode');
        bindSetting('setting-gapConstantOn', 'gapConstantOn', true);
        bindSetting('setting-gapConstantOff', 'gapConstantOff', true);
        bindSetting('setting-gapChaos', 'gapChaos', true);
        
        // Hide/Show Random Chance slider based on Gap Radio Mode
        const gapRadioSel = document.getElementById('setting-gapRadioMode');
        const gapChaosContainer = document.getElementById('setting-gapChaos-container');
        if (gapRadioSel && gapChaosContainer) {
            const updateChaosVisibility = () => {
                if (gapRadioSel.value === 'random-beat' || gapRadioSel.value === 'random-bar') {
                    gapChaosContainer.style.display = 'flex';
                } else {
                    gapChaosContainer.style.display = 'none';
                }
            };
            gapRadioSel.addEventListener('change', updateChaosVisibility);
            updateChaosVisibility(); // init state
        }
        
        bindSetting('setting-shakyEnabled', 'shakyEnabled');
        bindSetting('setting-shakyRange', 'shakyRange', true);
        bindSetting('setting-shakyChance', 'shakyChance', true);

        // UI toggles and Graph Settings
        const btnToggleChallenges = document.getElementById('btn-toggle-challenges');
        const expandedSettings = document.getElementById('expanded-rhythm-settings');
        if (btnToggleChallenges && expandedSettings) {
            btnToggleChallenges.addEventListener('click', () => {
                if (expandedSettings.style.display === 'none') {
                    expandedSettings.style.display = 'block';
                    btnToggleChallenges.textContent = 'Close △';
                    btnToggleChallenges.style.background = 'rgba(255,255,255,0.3)';
                } else {
                    expandedSettings.style.display = 'none';
                    btnToggleChallenges.textContent = 'More Options ▽';
                    btnToggleChallenges.style.background = 'rgba(255,255,255,0.1)';
                }
            });
        }
        
        const graphScaleSel = document.getElementById('setting-graphScale');
        if (graphScaleSel) {
            graphScaleSel.addEventListener('change', (e) => {
                if (this.visualizer) {
                    this.visualizer.setMeasureMode(e.target.value);
                }
            });
        }

        // Interactive Help System (Event Delegation)
        const mainHelpContent = document.getElementById('help-content');
        const modalHelpContent = document.getElementById('modal-help-content');
        const defaultHelpText = "Hover over any control or graph to see its description and goal here.";
        
        const updateHelpText = (text) => {
            if (mainHelpContent) mainHelpContent.textContent = text;
            if (modalHelpContent) modalHelpContent.textContent = text;
        };

        document.body.addEventListener('mouseover', (e) => {
            const helpTarget = e.target.closest('[data-help]');
            if (helpTarget) {
                updateHelpText(helpTarget.getAttribute('data-help'));
            }
        });

        document.body.addEventListener('mouseout', (e) => {
            const helpTarget = e.target.closest('[data-help]');
            if (helpTarget) {
                updateHelpText(defaultHelpText);
            }
        });

        // Timer Display Loop
        const timerDisplay = document.getElementById('timer-display');
        const barDisplay = document.getElementById('bar-display');
        
        this.metronome.onIntervalComplete = () => {
            if (playBtn) playBtn.textContent = 'Play';
            if (timerDisplay) timerDisplay.textContent = 'DONE';
        };

        const renderTimer = () => {
            if (this.metronome.isPlaying && this.metronome.sessionStartTime) {
                // Time
                const elapsedCtx = this.metronome.audioContext.currentTime - this.metronome.sessionStartTime;
                const m = Math.floor(elapsedCtx / 60);
                const s = Math.floor(elapsedCtx % 60);
                if (elapsedCtx >= 0 && timerDisplay) {
                    timerDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
                }
                // Bars
                if (barDisplay) {
                    const activeBars = this.metronome.currentBarTotal - this.metronome.countInBars + 1;
                    barDisplay.textContent = `BAR ${activeBars}`;
                }
            } else if (this.metronome.isPlaying && this.metronome.currentBarTotal < this.metronome.countInBars) {
                const barsLeft = this.metronome.countInBars - this.metronome.currentBarTotal;
                if (timerDisplay) timerDisplay.textContent = `-IN: ${barsLeft} BAR(S)`;
                if (barDisplay) barDisplay.textContent = 'BAR --';
            } else if (!this.metronome.isPlaying) {
                if (timerDisplay && timerDisplay.textContent !== 'DONE') timerDisplay.textContent = '0:00';
                if (barDisplay) barDisplay.textContent = 'BAR 1';
            }
            requestAnimationFrame(renderTimer);
        };
        requestAnimationFrame(renderTimer);
    }

    async setupMidi() {
        // Modal UI
        const btnSetup = document.getElementById('btn-hardware-setup');
        const modal = document.getElementById('modal-hardware');
        const btnClose = document.getElementById('btn-close-modal');
        
        // Tabs
        const tabSetup = document.getElementById('tab-btn-setup');
        const tabTroubleshoot = document.getElementById('tab-btn-troubleshoot');
        const viewSetup = document.getElementById('view-setup');
        const viewTroubleshoot = document.getElementById('view-troubleshoot');
        
        const syncLoggingState = () => {
            if (modal.open && viewTroubleshoot.style.display !== 'none') {
                this.midi.isLoggingEnabled = true;
            } else {
                this.midi.isLoggingEnabled = false;
            }

            // Cleanup when closing the modal
            if (!modal.open) {
                const ghostStatus = document.getElementById('ghost-status');
                if (ghostStatus) ghostStatus.textContent = '';
                
                if (this.midi.isCalibratingGhostNotes) {
                    this.midi.isCalibratingGhostNotes = false;
                    const ghostBtn = document.getElementById('btn-calibrate-ghost');
                    if (ghostBtn) {
                        ghostBtn.textContent = 'Calibrate';
                        ghostBtn.style.background = 'var(--color-primary-accent)';
                    }
                }
            }
        };

        if (tabSetup && viewSetup) {
            tabSetup.addEventListener('click', () => {
                viewSetup.style.display = 'block';
                viewTroubleshoot.style.display = 'none';
                tabSetup.style.fontWeight = 'bold';
                tabSetup.style.color = 'white';
                tabSetup.style.borderBottom = '2px solid var(--color-primary-accent)';
                tabTroubleshoot.style.fontWeight = 'normal';
                tabTroubleshoot.style.color = 'rgba(255,255,255,0.5)';
                tabTroubleshoot.style.borderBottom = 'none';
                syncLoggingState();
            });
        }

        if (tabTroubleshoot && viewTroubleshoot) {
            tabTroubleshoot.addEventListener('click', () => {
                viewSetup.style.display = 'none';
                viewTroubleshoot.style.display = 'block';
                tabTroubleshoot.style.fontWeight = 'bold';
                tabTroubleshoot.style.color = 'white';
                tabTroubleshoot.style.borderBottom = '2px solid var(--color-primary-accent)';
                tabSetup.style.fontWeight = 'normal';
                tabSetup.style.color = 'rgba(255,255,255,0.5)';
                tabSetup.style.borderBottom = 'none';
                syncLoggingState();
            });
        }

        if (btnSetup && modal) {
            btnSetup.addEventListener('click', () => {
                modal.showModal();
                syncLoggingState();
            });
        }
        if (btnClose && modal) {
            btnClose.addEventListener('click', () => {
                modal.close();
                syncLoggingState();
            });
        }
        
        // Init Engine
        const success = await this.midi.init();
        const statusEl = document.getElementById('midi-status');
        if (statusEl) {
            if (success && this.midi.inputs.length > 0) {
                statusEl.textContent = `Connected! Listening to ${this.midi.inputs.length} devices.`;
                statusEl.style.color = 'var(--color-success)';
            } else if (success) {
                statusEl.textContent = `Initialized, but no MIDI inputs detected. Please connect a device via USB/Bluetooth.`;
                statusEl.style.color = 'var(--color-warning)';
            } else {
                statusEl.textContent = `Error: Web MIDI Access Denied or Not Supported.`;
                statusEl.style.color = 'var(--color-critical)';
            }
        }

        // Ghost Note Config & Calibration
        const ghostThresh = document.getElementById('hw-ghost-threshold');
        const ghostBtn = document.getElementById('btn-calibrate-ghost');
        const ghostStatus = document.getElementById('ghost-status');
        
        if (ghostThresh) {
            ghostThresh.addEventListener('input', (e) => {
                let val = parseInt(e.target.value);
                if (isNaN(val)) val = 0;
                this.midi.ghostThreshold = val;
            });
            ghostThresh.value = this.midi.ghostThreshold;
        }

        if (ghostBtn) {
            ghostBtn.addEventListener('click', () => {
                if (!this.midi.isCalibratingGhostNotes) {
                    // Start Calibrating
                    this.midi.isCalibratingGhostNotes = true;
                    this.midi.ghostCalibrationMax = 0;
                    ghostBtn.textContent = 'Finish';
                    ghostBtn.style.background = 'var(--color-warning)';
                    if (ghostStatus) ghostStatus.textContent = "Hit ghost notes on ANY drum...";
                } else {
                    // Finish Calibration
                    this.midi.isCalibratingGhostNotes = false;
                    ghostBtn.textContent = 'Calibrate';
                    ghostBtn.style.background = 'var(--color-primary-accent)';
                    
                    const newThreshold = this.midi.ghostCalibrationMax > 0 ? this.midi.ghostCalibrationMax + 1 : this.midi.ghostThreshold;
                    this.midi.ghostThreshold = newThreshold;
                    if (ghostThresh) ghostThresh.value = newThreshold;
                    if (ghostStatus) {
                        ghostStatus.textContent = `Maximum ghost note velocity of ${this.midi.ghostCalibrationMax} set as ghost note velocity filter (Threshold: ${newThreshold})`;
                    }
                }
            });
            
            this.midi.onGhostCalibrationHit = (vel, maxVel) => {
                if (ghostStatus) {
                    ghostStatus.textContent = `Hit: ${vel} | Max so far: ${maxVel}`;
                }
            };
        }

        // Live Mapping
        this.renderMappingTable();
        this.midi.onLiveMapComplete = (instrument, noteIdsArray) => {
            this.renderMappingTable();
        };

        // Calibration logic
        const btnCalibration = document.getElementById('btn-start-calibration');
        const calStatus = document.getElementById('calibration-status');
        
        if (btnCalibration) {
            btnCalibration.addEventListener('click', () => {
                if (this.metronome.isPlaying) this.metronome.startStop(); // force stop
                this.metronome.onNoteScheduled = null; 
                this.midi.startCalibration();
                calStatus.textContent = "Calibrating... wait for tick to strike.";
                
                // Expose expectations to MidiEngine
                this.metronome.onNoteScheduled = (scheduleObj) => {
                    if (!this.midi.isCalibrating) return;
                    const nowAudio = this.metronome.audioContext.currentTime;
                    const offsetAudioSecs = scheduleObj.time - nowAudio;
                    const expectedHitPerf = performance.now() + (offsetAudioSecs * 1000);
                    this.midi.expectCalibrationHit(expectedHitPerf);
                };
                
                this.midi.onCalibrationHit = (offset, avg, remaining) => {
                    calStatus.textContent = `Hit! Raw: ${offset.toFixed(1)}ms | Avg: ${avg.toFixed(1)}ms | Left: ${remaining}`;
                    if (remaining <= 0) {
                        calStatus.textContent = `Calibration Complete. L_sys applied: ${this.midi.latencySys.toFixed(1)}ms.`;
                        this.metronome.startStop(); // Kill metronome
                        this.metronome.onNoteScheduled = null;
                        btnCalibration.disabled = false;
                    }
                };

                btnCalibration.disabled = true;
                this.metronome.setBpm(60); 
                this.metronome.startStop(); 
            });
        }

        this.midi.onHit = (hitDetails) => {
            // Find the closest expected hit in our rolling window
            if (this.expectedHits.length === 0 || !this.visualizer) return;
            
            const now = performance.now();
            let closestHit = this.expectedHits[0];
            let minDiff = Math.abs(now - expectedHitPerfTime(closestHit));
            
            for(let i = 1; i < this.expectedHits.length; i++) {
                const diff = Math.abs(now - expectedHitPerfTime(this.expectedHits[i]));
                if (diff < minDiff) {
                    minDiff = diff;
                    closestHit = this.expectedHits[i];
                }
            }
            
            // Expected time physically arriving from drum
            const expectedPerf = expectedHitPerfTime(closestHit);
            const offsetMs = now - expectedPerf;
            
            // Only plot if it's within a very wide logical threshold (e.g. they aren't just jamming randomly while click is running)
            if (Math.abs(offsetMs) < 400) {
                 this.visualizer.addHit(
                     hitDetails.velocity, 
                     offsetMs, 
                     this.midi.mappings[hitDetails.instrument].color, 
                     this.midi.mappings[hitDetails.instrument].shape
                 );
            }
        };

        // Helper to convert audio Time to performance.now()
        const expectedHitPerfTime = (audioTimeSecs) => {
            const nowAudio = this.metronome.audioContext.currentTime;
            const nowPerf = performance.now();
            // T_target_arrival = T_click_audio + L_sys
            return nowPerf + ((audioTimeSecs - nowAudio) * 1000) + this.midi.latencySys;
        };

        // Logging & Troubleshooter logic
        const levelSel = document.getElementById('log-level-filter');
        const btnClearLog = document.getElementById('btn-clear-log');
        const hwConsole = document.getElementById('hw-console');

        if (levelSel) {
            levelSel.addEventListener('change', (e) => {
                this.midi.logLevel = parseInt(e.target.value);
            });
            this.midi.logLevel = parseInt(levelSel.value);
        }

        if (btnClearLog && hwConsole) {
            btnClearLog.addEventListener('click', () => {
                hwConsole.innerHTML = '<div>[System] Console cleared. Waiting for events...</div>';
            });
        }

        this.midi.onMidiLog = (msg) => {
            if (!hwConsole) return;
            const logEl = document.createElement('div');
            logEl.textContent = msg;
            
            // Because flex-direction is column-reverse, appending places it at the topological bottom but visually top
            hwConsole.prepend(logEl);
            
            // Limit to 5000 messages
            while (hwConsole.children.length > 5000) {
                hwConsole.removeChild(hwConsole.lastChild);
            }
        };
    }

    renderMappingTable() {
        const tbody = document.getElementById('mapping-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        for (const [id, config] of Object.entries(this.midi.mappings)) {
            const tr = document.createElement('tr');
            const noteIdsStr = config.noteIds.join(', ');
            tr.innerHTML = `
                <td style="padding: 0.5rem; text-transform: capitalize;">${config.name}</td>
                <td style="padding: 0.5rem;">
                    <input type="text" id="map-note-${id}" data-help="Comma separated numeric Note IDs for this drum zone (e.g. 38, 40)" value="${noteIdsStr}" style="width: 100%; max-width: 120px; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.2); padding: 0.2rem;" placeholder="38, 40">
                </td>
                <td style="padding: 0.5rem; display: flex; gap: 0.5rem;">
                    <button class="live-map-btn" data-id="${id}" data-help="Click this, then physically strike your electronic pad to automatically record its Note ID." style="cursor:pointer; padding: 0.2rem 0.5rem; border-radius: 4px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white;">
                        ${this.midi.liveMapTarget === id ? '🎧...' : 'Listen'}
                    </button>
                    <button class="clear-map-btn" data-id="${id}" data-help="Clear all registered Note IDs for this instrument." style="cursor:pointer; padding: 0.2rem; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: var(--color-critical); border: 1px solid var(--color-critical);" title="Clear Notes">
                        🗑️
                    </button>
                </td>
                <td style="padding: 0.5rem;">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <input type="color" id="map-col-${id}" value="${config.color}" style="border: none; background: none; width: 30px; height: 30px; cursor: pointer;">
                        <select id="map-shape-${id}" style="background: rgba(0,0,0,0.3); color: white; padding: 0.2rem; border-radius: 4px;">
                            <option value="circle" ${config.shape==='circle'?'selected':''}>Circle</option>
                            <option value="square" ${config.shape==='square'?'selected':''}>Square</option>
                            <option value="triangle" ${config.shape==='triangle'?'selected':''}>Triangle</option>
                            <option value="diamond" ${config.shape==='diamond'?'selected':''}>Diamond</option>
                        </select>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
            
            const nInput = document.getElementById(`map-note-${id}`);
            if (nInput) nInput.addEventListener('change', (e) => {
                // Parse "38, 40, 42" into [38, 40, 42]
                const valStr = e.target.value;
                const arr = valStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                this.midi.updateMap(id, arr, null, null);
                this.renderMappingTable(); 
            });
            
            const colInput = document.getElementById(`map-col-${id}`);
            if (colInput) colInput.addEventListener('change', (e) => this.midi.updateMap(id, null, null, e.target.value));
            
            const shapeSel = document.getElementById(`map-shape-${id}`);
            if (shapeSel) shapeSel.addEventListener('change', (e) => this.midi.updateMap(id, null, e.target.value, null));
        }

        const liveBtns = document.querySelectorAll('.live-map-btn');
        liveBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.id;
                this.midi.listenForMap(mapId);
                this.renderMappingTable(); 
            });
        });

        const clearBtns = document.querySelectorAll('.clear-map-btn');
        clearBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.id;
                this.midi.clearMap(mapId);
                this.renderMappingTable();
            });
        });
    }

    setupCanvas() {
        // Initialize Canvas API/SVG rendering
        this.visualizer = new Visualizer('lab-canvas');
        console.log("Canvas mapping established.");

        // Tap into the metronome loop to populate expectations
        const baseOnNoteScheduled = this.metronome.onNoteScheduled;
        this.metronome.onNoteScheduled = (scheduleObj) => {
             if (baseOnNoteScheduled) baseOnNoteScheduled(scheduleObj);
             
             // We only track standard grid hits (don't care about silence notes if any)
             // But actually, even gap radio gap beats should be tracked theoretically so user can play through them?
             // Since gap radio mutes audio, but the structure exists. We'll track the scheduleObj.time.
             
             // Queue management
             this.expectedHits.push(scheduleObj.time);
             
             // If debug is on, money beat uses 8th notes, so we must track 8th note targets to grade against
             if (this.isDebug) {
                 const beatLengthSecs = 60.0 / this.metronome.bpm;
                 this.expectedHits.push(scheduleObj.time + (beatLengthSecs / 2.0));
                 // Also sort expectedHits just in case
                 this.expectedHits.sort((a,b) => a - b);
             }
             
             // Clear out old expectations to prevent memory leak
             const nowAudio = this.metronome.audioContext.currentTime;
             this.expectedHits = this.expectedHits.filter(t => t > nowAudio - 2.0); // keep 2 seconds of history
        };
    }

    setupDebugSimulator() {
        // Pre-configure realistic pad mapping values
        this.midi.mappings = {
            'kick': { name: 'Kick', noteIds: [36], color: '#3b82f6', shape: 'circle' },
            'snare': { name: 'Snare', noteIds: [38], color: '#ef4444', shape: 'square' },
            'hihat': { name: 'Hi-Hat', noteIds: [42], color: '#eab308', shape: 'triangle' },
            'tom1': { name: 'Tom 1', noteIds: [48], color: '#10b981', shape: 'circle' },
            'tom2': { name: 'Tom 2', noteIds: [45], color: '#8b5cf6', shape: 'circle' },
            'ride': { name: 'Ride', noteIds: [51], color: '#14b8a6', shape: 'diamond' }
        };
        this.renderMappingTable();

        // Let's hook into the internal metronome scheduler to generate real-time bot hits
        const baseScheduler = this.metronome.scheduleNote.bind(this.metronome);
        
        let activeBarCounter = 0;
        let lastBarProcessed = -1;

        this.metronome.scheduleNote = (beatNumber16th, time) => {
            baseScheduler(beatNumber16th, time);
            
            // Only fire if Metronome is actively playing
            if (!this.metronome.isPlaying) return;
            
            // Reset bot state if the user restarted playback
            if (this.metronome.currentBarTotal === 0 && beatNumber16th === 0) {
                activeBarCounter = 0;
                lastBarProcessed = -1;
            }
            
            // Only play after the count-in
            const isCountInPhase = this.metronome.currentBarTotal < this.metronome.countInBars;
            if (isCountInPhase) return;
            
            // Track how many active bars the bot has played
            if (this.metronome.currentBarTotal !== lastBarProcessed) {
                if (lastBarProcessed !== -1) activeBarCounter++;
                lastBarProcessed = this.metronome.currentBarTotal;
            }
            
            // Limit to 4 bars
            if (activeBarCounter >= 4) return;
            
            // Money Beat Definition:
            // Kick on 1 & 3 (16th intervals: 0, 8)
            // Snare on 2 & 4 (16th intervals: 4, 12)
            // Hihat on all 8ths (16th intervals: 0, 2, 4, 6, 8, 10, 12, 14)
            let notesToPlay = [];
            if (beatNumber16th === 0 || beatNumber16th === 8) notesToPlay.push({ id: 'kick', vel: 110 });
            if (beatNumber16th === 4 || beatNumber16th === 12) notesToPlay.push({ id: 'snare', vel: 125 });
            if (beatNumber16th % 2 === 0) notesToPlay.push({ id: 'hihat', vel: 85 });
            
            for (let note of notesToPlay) {
                // Introduce varying note accuracy: bounded random offset
                // Hi-Hats tighter, Snare looser etc. We use +/- 30ms total variance
                let accuracyOffsetSecs = (Math.random() * 0.050) - 0.025; 
                if (note.id === 'snare') accuracyOffsetSecs += 0.010; // slightly late backbeat style
                
                const physicalTimeSecs = time + accuracyOffsetSecs;
                
                // Calculate actual real-world JS timer delay to match the Web Audio API time
                const nowSecs = this.metronome.audioContext.currentTime;
                const delayMs = (physicalTimeSecs - nowSecs) * 1000;
                
                if (delayMs > 0) {
                    setTimeout(() => {
                        if (this.midi.onHit) {
                            this.midi.onHit({
                                instrument: note.id,
                                velocity: Math.floor(note.vel + (Math.random()*16 - 8)),
                                timestamp: performance.now()
                            });
                        }
                    }, delayMs);
                }
            }
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pocketLabApp = new PocketLabApp();
});
