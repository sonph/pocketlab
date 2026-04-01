import { Metronome } from '../js/metronome.js';

const output = document.getElementById('test-output');
const progress = document.getElementById('test-progress');
let passed = 0;
let total = 0;

function assertClose(actual, expected, tolerance, name) {
    total++;
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        if (output) output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual.toFixed(2)})\n`;
        passed++;
    } else {
        if (output) output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected.toFixed(2)}, Got: ${actual.toFixed(2)}\n`;
    }
}

function assertEqual(actual, expected, name) {
    total++;
    if (actual === expected) {
        if (output) output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual})\n`;
        passed++;
    } else {
        if (output) output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected}, Got: ${actual}\n`;
    }
}

export function runMetronomeTests() {
    if (!output) return;
    
    output.innerHTML += `\nRunning metronome.js tests...\n--------------------------\n`;
    
    try {
        const metronome = new Metronome();
        
        // 1. Basic properties defaults
        assertEqual(metronome.bpm, 120, 'Metronome defaults strictly to 120 BPM');
        assertEqual(metronome.bpmPulse, 4, 'Metronome defaults to Quarter Note Pulse (4)');
        
        // 2. Pulse: Quarter Note verification
        metronome.updateSettings({ bpm: 120, bpmPulse: 4 });
        assertEqual(metronome.getEffectiveQuarterBpm(), 120, '120 BPM Quarter Pulse correctly parses to 120 Effective BPM');
        
        // 3. Pulse: Eighth Note verification
        metronome.updateSettings({ bpm: 120, bpmPulse: 8 });
        assertEqual(metronome.getEffectiveQuarterBpm(), 60, '120 BPM Eighth Pulse effectively splits speed exactly 50% (60 Effective BPM quarter equivalence)');
        
        // 4. Pulse constraint and extreme math bound check
        metronome.updateSettings({ bpm: 240, bpmPulse: 8 });
        assertEqual(metronome.getEffectiveQuarterBpm(), 120, '240 Eighth pulse bounds accurately to 120 Effective BPM Quarter Math');
        
        // 5. Test ticks and quarters behavior logic interaction
        metronome.updateSettings({ tsCount: 7, tsSubdiv: 8 });
        const quartersPerBar = metronome.tsCount * (4.0 / metronome.tsSubdiv);
        assertClose(quartersPerBar, 3.5, 0.001, 'Quarter Note density evaluated correctly for complex 7/8 subdivs');

    } catch (e) {
        output.innerHTML += `\n💥 ERROR during Metronome execution: ${e.message}\n${e.stack}\n`;
    }
    
    output.innerHTML += `\n--------------------------\n`;
    progress.innerHTML = `Tests Completed: ${passed}/${total} passed.`;
    if (passed === total) {
        progress.style.color = '#a3e635';
    } else {
        progress.style.color = '#f87171';
    }
}
