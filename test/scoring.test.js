import { calculateTimingScore, calculateBpmFromDeltas, selectFlamCandidate, evaluateFeedbackResult } from '../js/scoring.js';
import { runTimelineTests } from './timeline.test.js';

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

function assertStrictEqual(name, actual, expected) {
    total++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name}\n`;
        passed++;
    } else {
        output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}\n`;
    }
}

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
    
    output.innerHTML += `Running Clock Sync tests...\n`;
    const ticks120 = Array(24).fill(500.0 / 24.0);
    assertClose(calculateBpmFromDeltas(ticks120), 120.0, 0.01, 'BPM computes exactly 120 from 20.833ms ticks');

    const ticks160 = Array(48).fill(15.625);
    assertClose(calculateBpmFromDeltas(ticks160), 160.0, 0.01, 'BPM tracks 160 correctly');

    const dirtyTicks = [20.83, 20.83, -500, 20.83, 20.83, 5000, 20.83];
    assertClose(calculateBpmFromDeltas(dirtyTicks), 120.0, 0.1, 'BPM strictly ignores invalid jitter boundaries');

    assertClose(calculateBpmFromDeltas([]), 0, 0, 'Should return 0 for safe fallback');

    output.innerHTML += `\n--------------------------\n`;
    output.innerHTML += `Running Flam Selection tests...\n`;

    // Single hit - should just return it
    assertStrictEqual(
        'Single candidate returns itself',
        selectFlamCandidate([{ offsetMs: 10, velocity: 80 }]),
        { offsetMs: 10, velocity: 80 }
    );

    // Flam: second hit is louder (main stroke) - should be selected
    assertStrictEqual(
        'Selects louder hit (main stroke) from a flam',
        selectFlamCandidate([
            { offsetMs: -15, velocity: 40 },  // grace note
            { offsetMs:   5, velocity: 110 }, // main stroke
        ]),
        { offsetMs: 5, velocity: 110 }
    );

    // Flam: first hit is louder - should be selected
    assertStrictEqual(
        'Selects louder hit when grace note comes after main stroke',
        selectFlamCandidate([
            { offsetMs: -5, velocity: 115 },  // main stroke first
            { offsetMs: 18, velocity: 38 },   // grace note second
        ]),
        { offsetMs: -5, velocity: 115 }
    );

    // Equal velocities: first candidate wins (stable)
    assertStrictEqual(
        'Tie in velocity returns first candidate (stable behaviour)',
        selectFlamCandidate([
            { offsetMs: -5, velocity: 80 },
            { offsetMs:  3, velocity: 80 },
        ]),
        { offsetMs: -5, velocity: 80 }
    );

    // Empty array returns null
    assertStrictEqual('Empty candidates returns null', selectFlamCandidate([]), null);
    assertStrictEqual('Null input returns null', selectFlamCandidate(null), null);

    output.innerHTML += `\n--------------------------\n`;
    output.innerHTML += `Running Feedback Evaluation tests...\n`;

    // At 120bpm, 32nd note window is ±62.5ms
    // Medium difficulty (diffFactor 0.5) -> Good zone is ±31.25ms

    assertStrictEqual(
        'Perfect hit (0ms) is in-zone',
        evaluateFeedbackResult(0, 120, 'medium'),
        'in-zone'
    );

    assertStrictEqual(
        '10ms offset is in-zone (Medium)',
        evaluateFeedbackResult(10, 120, 'medium'),
        'in-zone'
    );

    assertStrictEqual(
        '40ms offset is too-slow (Medium)',
        evaluateFeedbackResult(40, 120, 'medium'),
        'too-slow'
    );

    assertStrictEqual(
        '-40ms offset is too-fast (Medium)',
        evaluateFeedbackResult(-40, 120, 'medium'),
        'too-fast'
    );

    assertStrictEqual(
        '70ms offset is IGNORED (outside ±62.5ms window)',
        evaluateFeedbackResult(70, 120, 'medium'),
        'ignore'
    );

    assertStrictEqual(
        '-70ms offset is IGNORED (outside ±62.5ms window)',
        evaluateFeedbackResult(-70, 120, 'medium'),
        'ignore'
    );

    // Difficulty scaling
    // Hard (diffFactor 0.2) -> Good zone is ±12.5ms
    assertStrictEqual(
        '20ms offset is too-slow on HARD difficulty',
        evaluateFeedbackResult(20, 120, 'hard'),
        'too-slow'
    );

    // Easy (diffFactor 0.8) -> Good zone is ±50ms
    assertStrictEqual(
        '40ms offset is in-zone on EASY difficulty',
        evaluateFeedbackResult(40, 120, 'easy'),
        'in-zone'
    );

    output.innerHTML += `\n--------------------------\n`;
    progress.innerHTML = `Tests Completed: ${passed}/${total} passed.`;
    if (passed === total) {
        progress.style.color = '#a3e635';
    } else {
        progress.style.color = '#f87171';
    }
    
    // Defer to the Timeline test suite
    runTimelineTests();
} catch(e) {
    output.innerHTML += `\n💥 ERROR during test execution: ${e.message}`;
    progress.innerHTML = `Test suite crashed or failed to load modules.`;
    progress.style.color = '#f87171';
}
