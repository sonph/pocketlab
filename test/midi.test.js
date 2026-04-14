import { MidiEngine } from '../js/midi.js';

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

export async function runMidiTests() {
    if (!output) return;
    
    output.innerHTML += `\nRunning midi.js tests...\n--------------------------\n`;
    
    try {
        const engine = new MidiEngine();
        
        // 1. Mock the Web MIDI API dynamically
        const mockInputs = new Map();
        navigator.requestMIDIAccess = async () => {
            return {
                inputs: mockInputs,
                onstatechange: null
            };
        };

        // 2. Initialization and Refresh Validation
        // Initially empty
        let devicesChangedCallCount = 0;
        engine.onDevicesChanged = (inputs) => {
            devicesChangedCallCount++;
        };
        
        const initSuccess = await engine.init();
        assertEqual(initSuccess, true, 'Engine successfully initializes with mocked navigator');
        assertEqual(engine.inputs.length, 0, 'Inputs array should be empty on boot');
        assertEqual(devicesChangedCallCount, 1, 'onDevicesChanged emits exactly once during initial boot');

        // Add a mock device
        const mockDevice = { id: 'device-123', name: 'Roland TD-17', manufacturer: 'Roland' };
        mockInputs.set(mockDevice.id, mockDevice);
        
        // Fire refresh manually to simulate plugin
        engine.refreshInputs();
        assertEqual(engine.inputs.length, 1, 'refreshInputs updates the internal inputs array');
        assertEqual(engine.inputs[0].name, 'Roland TD-17', 'Extracts correct name from device iterator');
        assertEqual(devicesChangedCallCount, 2, 'onDevicesChanged fires on refresh boundary');

        // 3. Ghost Threshold Evaluation
        let midiLogOutputs = [];
        engine.onMidiLog = (msg) => midiLogOutputs.push(msg);
        engine.isLoggingEnabled = true;
        
        // Let's create a Note On event (144) for a Snare (38) with Velocity (20) [Under threshold]
        const underThresholdEvent = {
            data: new Uint8Array([144, 38, 20])
        };
        
        let onHitEmitted = false;
        engine.onHit = () => { onHitEmitted = true; };
        
        engine.handleMidiMessage(underThresholdEvent);
        assertEqual(onHitEmitted, false, 'Ghost note filter natively ignores hits under standard 32 velocity threshold');
        
        // And above threshold
        const validEvent = {
            data: new Uint8Array([144, 38, 60])
        };
        engine.handleMidiMessage(validEvent);
        assertEqual(onHitEmitted, true, 'Valid velocity passes through the ghost note threshold bounds properly');

        // 4. Clock Message Routing
        let syncStatusChanged = false;
        let beatCount = 0;
        engine.onMidiStart = () => { syncStatusChanged = true; };
        engine.onMidiBeat = (b) => { beatCount++; };
        
        // Start Message (250)
        engine.handleMidiMessage({ data: new Uint8Array([250]) });
        assertEqual(syncStatusChanged, true, 'Start command 0xFA correctly bubbles to onMidiStart');
        
        // Simulate 24 clocks (1 quarter note beat)
        for (let i=0; i<24; i++) {
            engine.handleMidiMessage({ data: new Uint8Array([248]) });
        }
        
        // We evaluate strictly for internal logic, onMidiBeat fires at modulo 1
        assertEqual(beatCount, 1, 'Fires precisely 1 beat tick after receiving 24 clock timing ticks');
        
    } catch (e) {
        output.innerHTML += `\n💥 ERROR during MIDI execution: ${e.message}\n${e.stack}\n`;
    }
    
    output.innerHTML += `\n--------------------------\n`;
    progress.innerHTML = `Tests Completed: ${passed}/${total} passed.`;
    if (passed === total) {
        progress.style.color = '#a3e635';
    } else {
        progress.style.color = '#f87171';
    }
}
