/**
 * Pure analytical scoring physics and mathematics for Pocket Lab.
 * Extracted so that we can run pure deterministic tests on them seamlessly.
 */

/**
 * Calculates a Gaussian decay score ensuring consistent "feel" across BPMs.
 * Based on SPECS Section 6a: S_hit = 100 * e^( -( |dt| / (D_16th * sigma) )^2 )
 * 
 * @param {number} offsetMs - Raw millisecond offset from the target physical strike.
 * @param {number} bpm - The current application BPM tempo setting.
 * @param {number} [sigma=0.15] - The sensitivity curve penalty factor.
 * @returns {number} The evaluated timing score ranging logically from 0 to 100.
 */
export function calculateTimingScore(offsetMs, bpm, sigma = 0.15) {
    // Fallbacks to avoid Infinity/NaN explosions
    if (!bpm || bpm <= 0) bpm = 120;
    
    const duration16thMs = (60000.0 / bpm) / 4.0;
    const errorRatio = Math.abs(offsetMs) / (duration16thMs * sigma);
    return 100.0 * Math.exp(-(errorRatio * errorRatio));
}

/**
 * Calculates a stable BPM value given an array of millisecond deltas between consecutive MIDI clock ticks.
 * A standard MIDI Clock outputs 24 ticks per quarter note.
 * 
 * @param {number[]} deltasMs - Array of millisecond durations between raw 0xF8 ticks.
 * @returns {number} The calculated Beats Per Minute, or 0 if invalid input is provided.
 */
export function calculateBpmFromDeltas(deltasMs) {
    if (!deltasMs || deltasMs.length === 0) return 0;
    
    // Safety check for impossible negative times or heavy outliers
    const validDeltas = deltasMs.filter(d => d > 0 && d < 1000);
    if (validDeltas.length === 0) return 0;

    const sum = validDeltas.reduce((a, b) => a + b, 0);
    const avgDelta = sum / validDeltas.length;

    // formula: 1 beat = 24 ticks * avgDelta ms
    // So BPM = 60000ms / (avgDelta * 24)
    return 60000.0 / (avgDelta * 24);
}


/**
 * Evaluates the result of a hit for the audible feedback engine.
 * 
 * @param {number} offsetMs - Timing offset in milliseconds.
 * @param {number} bpm - Current tempo.
 * @param {string} difficultyMode - 'easy', 'medium', or 'hard'.
 * @returns {'ignore'|'in-zone'|'too-fast'|'too-slow'} The evaluation result.
 */
export function evaluateFeedbackResult(offsetMs, bpm, difficultyMode) {
    const offsetSecs = offsetMs / 1000.0;
    const thirtySecondSecs = (60.0 / bpm) / 8.0;

    let diffFactor = 0.4;
    if (difficultyMode === 'easy') diffFactor = 0.6;
    else if (difficultyMode === 'hard') diffFactor = 0.2;

    if (Math.abs(offsetSecs) > thirtySecondSecs) {
        return 'ignore';
    }

    const absOffset = Math.abs(offsetSecs);
    if (absOffset <= thirtySecondSecs * diffFactor) {
        return 'in-zone';
    } else {
        return offsetSecs < 0 ? 'too-fast' : 'too-slow';
    }
}

/**
 * Selects which audible feedback cue should play for a feedback result.
 *
 * @param {'ignore'|'in-zone'|'too-fast'|'too-slow'} result - Classified feedback result.
 * @param {number} consecutiveGoodHits - Current in-zone streak after incrementing for this hit.
 * @param {boolean} [onlyCorrections=false] - Whether to suppress positive cues.
 * @returns {'good'|'great'|'perfect'|'toofast'|'tooslow'|null} The feedback sample key to play, if any.
 */
export function selectFeedbackCue(result, consecutiveGoodHits, onlyCorrections = false) {
    if (result === 'ignore') {
        return null;
    }

    if (result === 'in-zone') {
        if (onlyCorrections) {
            return null;
        }
        if (consecutiveGoodHits <= 2) {
            return 'good';
        }
        if (consecutiveGoodHits === 3) {
            return 'great';
        }
        return 'perfect';
    }

    return result === 'too-fast' ? 'toofast' : 'tooslow';
}

/**
 * Finds the expected hit whose physical arrival time is closest to the current performance timestamp.
 * Stable on ties: the earliest matching candidate in the array wins.
 *
 * @param {Array<{ time: number }>} expectedHits - Scheduled expected hits.
 * @param {number} nowPerf - Current performance.now() timestamp.
 * @param {(audioTimeSecs: number) => number} expectedHitPerfTime - Maps audio time to performance time.
 * @returns {{ time: number } | null} The closest expected hit, or null if none exist.
 */
export function findClosestExpectedHit(expectedHits, nowPerf, expectedHitPerfTime) {
    if (!expectedHits || expectedHits.length === 0) {
        return null;
    }
    
    let left = 0;
    let right = expectedHits.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const perfTime = expectedHitPerfTime(expectedHits[mid].time);

        if (perfTime < nowPerf) {
            left = mid + 1;
        } else if (perfTime > nowPerf) {
            right = mid - 1;
        } else {
            return expectedHits[mid];
        }
    }

    const prevHit = right >= 0 ? expectedHits[right] : null;
    const nextHit = left < expectedHits.length ? expectedHits[left] : null;

    if (!prevHit) return nextHit;
    if (!nextHit) return prevHit;

    const prevDiff = Math.abs(nowPerf - expectedHitPerfTime(prevHit.time));
    const nextDiff = Math.abs(nowPerf - expectedHitPerfTime(nextHit.time));
    return prevDiff <= nextDiff ? prevHit : nextHit;
}
