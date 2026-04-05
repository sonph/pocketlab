import { resizeHiDPICanvas } from '../js/visualizer.js';
import { runMetronomeTests } from './metronome.test.js';

const output = document.getElementById('test-output');

let passed = 0;
let total = 0;

function assertEqual(actual, expected, name) {
    total++;
    if (actual === expected) {
        if (output) output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name} (Got: ${actual})\n`;
        passed++;
    } else {
        if (output) output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${expected}, Got: ${actual}\n`;
    }
}

function assertStrictEqual(actual, expected, name) {
    total++;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        if (output) output.innerHTML += `✅ <span style="color: #4ade80;">[PASS]</span> ${name}\n`;
        passed++;
    } else {
        if (output) output.innerHTML += `❌ <span style="color: #f87171;">[FAIL]</span> ${name} | Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}\n`;
    }
}

export function runVisualizerTests() {
    if (!output) return;

    output.innerHTML += `\nRunning visualizer.js tests...\n--------------------------\n`;

    try {
        const canvas = { width: 0, height: 0 };
        const setTransformCalls = [];
        const ctxWithSetTransform = {
            setTransform: (...args) => setTransformCalls.push(args),
            scale: () => {
                throw new Error('scale should not be used when setTransform is available');
            }
        };

        resizeHiDPICanvas(canvas, ctxWithSetTransform, 320, 180, 2);
        resizeHiDPICanvas(canvas, ctxWithSetTransform, 400, 200, 2);

        assertEqual(canvas.width, 800, 'HiDPI resize updates backing canvas width using device pixel ratio');
        assertEqual(canvas.height, 400, 'HiDPI resize updates backing canvas height using device pixel ratio');
        assertStrictEqual(
            setTransformCalls,
            [
                [2, 0, 0, 2, 0, 0],
                [2, 0, 0, 2, 0, 0]
            ],
            'HiDPI resize reapplies a stable transform on repeated resizes'
        );

        const fallbackCanvas = { width: 0, height: 0 };
        const scaleCalls = [];
        const fallbackCtx = {
            scale: (...args) => scaleCalls.push(args)
        };

        resizeHiDPICanvas(fallbackCanvas, fallbackCtx, 150, 100, 1.5);

        assertEqual(fallbackCanvas.width, 225, 'Fallback HiDPI resize scales backing width without setTransform');
        assertEqual(fallbackCanvas.height, 150, 'Fallback HiDPI resize scales backing height without setTransform');
        assertStrictEqual(
            scaleCalls,
            [[1.5, 1.5]],
            'Fallback HiDPI resize still supports scale-only contexts'
        );
    } catch (e) {
        output.innerHTML += `\n💥 ERROR during Visualizer execution: ${e.message}\n${e.stack}\n`;
    }

    output.innerHTML += `\n--------------------------\n`;
    runMetronomeTests();
}
