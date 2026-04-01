import { TimelineVisualizer } from '../js/timeline.js';

const output = document.getElementById('test-output');
const progress = document.getElementById('test-progress');
let passed = 0;
let total = 0;

function assertClose(actual, expected, tolerance, name) {
    total++;
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual.toFixed(2)})\n`;
        passed++;
    } else {
        output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected.toFixed(2)}, Got: ${actual.toFixed(2)}\n`;
    }
}

function assertEqual(actual, expected, name) {
    total++;
    if (actual === expected) {
        output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual})\n`;
        passed++;
    } else {
        output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected}, Got: ${actual}\n`;
    }
}

export function runTimelineTests() {
    output.innerHTML += `\nRunning timeline.js tests...\n--------------------------\n`;
    
    // Create a mock canvas for the visualizer to anchor to without polluting the DOM visually
    const mockCanvas = document.createElement('canvas');
    mockCanvas.id = 'mock-timeline';
    document.body.appendChild(mockCanvas);
    
    try {
        const timeline = new TimelineVisualizer('mock-timeline');
        
        // Setup a standard 120BPM, 4/4 window 
        // 1 Beat = 0.5s. 1 Bar = 2.0s. Default window is 2 bars (4.0s).
        timeline.updateConfig(2, 120, 4, 4);
        
        assertEqual(timeline.windowBars, 2, 'Timeline configures default window size properly');
        
        // Add a hit at exactly 1.0 seconds (Middle of 1st bar) -> xRatio should be 0.25 (1s / 4s total window)
        timeline.addHit('snare', 100, '#fff', 'circle', 1.0);
        
        assertEqual(timeline.hits.length, 1, 'Timeline successfully records structural hits');
        assertClose(timeline.hits[0].hitX, 0.25, 0.01, 'Hit X-Ratio correctly calculated exactly 0.25 within the window');
        assertEqual(timeline.hits[0].windowIndex, 0, 'Hit bound accurately to exactly window 0');
        
        // Add a hit at 5.0 seconds (1 second into the SECOND window loop)
        timeline.addHit('kick', 127, '#f00', 'square', 5.0);
        
        assertEqual(timeline.hits.length, 2, 'Timeline handles rollover data');
        assertClose(timeline.hits[1].hitX, 0.25, 0.01, 'Hit X-Ratio loops recursively around bounds inside second 4-second loop window');
        assertEqual(timeline.hits[1].windowIndex, 1, 'Hit accurately indexed into window 1 rollover');
        
        // Attempt to pollute array with invalid instrument (should get rejected)
        timeline.addHit('piano', 100, '#000', 'circle', 1.0);
        assertEqual(timeline.hits.length, 2, 'Timeline safely rejects unregistered track signatures');

    } catch (e) {
        output.innerHTML += `\n💥 ERROR during Timeline execution: ${e.message}\n${e.stack}\n`;
    } finally {
        mockCanvas.remove();
    }
    
    output.innerHTML += `\n--------------------------\n`;
    progress.innerHTML = `Tests Completed: ${passed}/${total} passed.`;
    if (passed === total) {
        progress.style.color = '#a3e635';
    } else {
        progress.style.color = '#f87171';
    }
}
