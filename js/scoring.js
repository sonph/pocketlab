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
