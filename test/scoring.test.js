import { calculateTimingScore } from '../js/scoring.js';

const output = document.getElementById('test-output');
const progress = document.getElementById('test-progress');
let passed = 0;
let total = 0;

function assertEqual(name, actual, expected, tolerance = 0.01) {
    total++;
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual.toFixed(2)})\n`;
        passed++;
    } else {
        output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected.toFixed(2)}, Got: ${actual.toFixed(2)}\n`;
    }
}

try {
    output.innerHTML += `Running scoring.js tests...\n--------------------------\n`;
    
    // Perfect Hits
    assertEqual('0ms offset at 120bpm is 100', calculateTimingScore(0, 120), 100);
    assertEqual('0ms offset at 60bpm is 100', calculateTimingScore(0, 60), 100);

    // Minor deviation
    // sigma = 0.15. At 120bpm, D16th = (60000/120)/4 = 125ms
    // offset = 18.75ms (exactly 1 sigma) -> S_hit = 100 * e^(-1) ≈ 36.78
    assertEqual('+18.75ms offset at 120bpm (1 Sigma) is ~36.78', calculateTimingScore(18.75, 120), 36.78, 0.05);

    // Negative temporal offset
    assertEqual('-18.75ms offset at 120bpm (1 Sigma) is ~36.78', calculateTimingScore(-18.75, 120), 36.78, 0.05);

    // BPM Normalization effect
    // To achieve the exact same penalty at 60bpm, the offset should be double because D16th is double (250ms).
    // Exactly 1 sigma at 60bpm = 37.5ms. Score should still be ~36.78.
    assertEqual('+37.5ms offset at 60bpm matches 120bpm error penalty', calculateTimingScore(37.5, 60), 36.78, 0.05);

    // Huge deviation
    assertEqual('300ms offset at 120bpm is effectively 0', calculateTimingScore(300, 120), 0, 0.01);
    
    // Missing arguments
    assertEqual('Missing BPM gracefully falls back without Infinity error', calculateTimingScore(10, 0), calculateTimingScore(10, 120));
    
    output.innerHTML += `\n--------------------------\n`;
    progress.innerHTML = `Tests Completed: ${passed}/${total} passed.`;
    if (passed === total) {
        progress.style.color = '#a3e635';
    } else {
        progress.style.color = '#f87171';
    }
} catch(e) {
    output.innerHTML += `\n💥 ERROR during test execution: ${e.message}`;
    progress.innerHTML = `Test suite crashed or failed to load modules.`;
    progress.style.color = '#f87171';
}
