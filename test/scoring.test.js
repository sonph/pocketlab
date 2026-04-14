import { calculateTimingScore, calculateBpmFromDeltas, evaluateFeedbackResult, selectFeedbackCue, findClosestExpectedHit } from '../js/scoring.js';
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
    output.innerHTML += `Running Feedback Evaluation tests...\n`;

    // At 120bpm, 32nd note window is ±62.5ms
    // Medium difficulty (diffFactor 0.4) -> Good zone is ±25ms

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

    // Easy (diffFactor 0.6) -> Good zone is ±37.5ms
    assertStrictEqual(
        '40ms offset is now TOO-SLOW on EASY difficulty',
        evaluateFeedbackResult(40, 120, 'easy'),
        'too-slow'
    );

    assertStrictEqual(
        '30ms offset is in-zone on EASY difficulty',
        evaluateFeedbackResult(30, 120, 'easy'),
        'in-zone'
    );

    output.innerHTML += `\n--------------------------\n`;
    output.innerHTML += `Running Feedback Cue Selection tests...\n`;

    assertStrictEqual(
        'Ignore result produces no audible cue',
        selectFeedbackCue('ignore', 0, false),
        null
    );

    assertStrictEqual(
        'First in-zone hit plays good',
        selectFeedbackCue('in-zone', 1, false),
        'good'
    );

    assertStrictEqual(
        'Second in-zone hit still plays good',
        selectFeedbackCue('in-zone', 2, false),
        'good'
    );

    assertStrictEqual(
        'Third in-zone hit upgrades to great',
        selectFeedbackCue('in-zone', 3, false),
        'great'
    );

    assertStrictEqual(
        'Fourth in-zone hit upgrades to perfect',
        selectFeedbackCue('in-zone', 4, false),
        'perfect'
    );

    assertStrictEqual(
        'Only-corrections mode suppresses positive cues',
        selectFeedbackCue('in-zone', 4, true),
        null
    );

    assertStrictEqual(
        'Only-corrections mode still plays too-fast',
        selectFeedbackCue('too-fast', 0, true),
        'toofast'
    );

    assertStrictEqual(
        'Only-corrections mode still plays too-slow',
        selectFeedbackCue('too-slow', 0, true),
        'tooslow'
    );

    output.innerHTML += `\n--------------------------\n`;
    output.innerHTML += `Running Expected Hit Selection tests...\n`;

    const expectedHits = [
        { time: 10, beatIndex: 0 },
        { time: 20, beatIndex: 1 },
        { time: 30, beatIndex: 2 }
    ];
    const toPerfTime = (audioTimeSecs) => audioTimeSecs * 10;

    assertStrictEqual(
        'Closest expected hit selection prefers the nearest scheduled target',
        findClosestExpectedHit(expectedHits, 205, toPerfTime),
        expectedHits[1]
    );

    assertStrictEqual(
        'Closest expected hit selection remains stable on equal-distance ties',
        findClosestExpectedHit(expectedHits, 250, toPerfTime),
        expectedHits[1]
    );

    assertStrictEqual(
        'Closest expected hit selection safely returns null for empty input',
        findClosestExpectedHit([], 100, toPerfTime),
        null
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
