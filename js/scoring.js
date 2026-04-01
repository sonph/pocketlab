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
 * Selects the primary (loudest) hit from a list of snare candidates landing on the same beat target.
 * Used for flam detection: when two snare hits arrive within the evaluation window of a single target,
 * we evaluate the one with the higher velocity (the main stroke) rather than the ghost/flam grace note.
 *
 * @param {{ offsetMs: number, velocity: number }[]} candidates - Array of candidate snare hits.
 * @returns {{ offsetMs: number, velocity: number } | null} The selected candidate, or null for empty input.
 */
export function selectFlamCandidate(candidates) {
    if (!candidates || candidates.length === 0) return null;
    return candidates.reduce((best, hit) => hit.velocity > best.velocity ? hit : best, candidates[0]);
}
