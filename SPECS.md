# Product Specification: "Pocket Lab"

**Project Goal:** A high-precision Web MIDI drumming coach designed to diagnose timing offsets, visualize "limb smear," and gamify the development of a deep pocket.

## 1. Core Technical Architecture

* **Technology:** Web MIDI API (for low-latency MIDI capture), Canvas API/SVG (for real-time visualizations).

* **Calibration Layer:** A mandatory "Sync" step where the user hits a pad exactly with the click to calculate system latency ($L_{sys}$).

* **Advanced MIDI Mapping & Configuration:**

  * **Default Mapping:** Standard General MIDI (Kick: 36, Snare: 38, Closed Hat: 42).

  * **Live Map (Registration):** User enters "Live Map" mode, selects an instrument (e.g., "Hi-Hat"), then strikes the physical pad. The app captures the unique MIDI Note ID and assigns it.

  * **Manual Table:** A table view where MIDI Note IDs can be manually typed for precision or troubleshooting.

  * **Visual Customization:** For each registered instrument (Kick, Snare, Hi-Hat Closed/Open), the user can choose unique **Shapes** (Circle, Square, Triangle, Diamond) and **Colors**.

  * **Ghost Note Filter:** A global velocity slider (0-127). MIDI notes with a velocity below this threshold are ignored by the scoring and visualization engines.

## 2. Advanced Metronome Engine ("The Pulse")

* **Accuracy:** Must use `AudioContext.currentTime` with a lookahead scheduler to ensure precise timing independent of the main UI thread, maintaining rock-solid accuracy.
* **Dynamic Tempo:** 
  * The general BPM must be adjustable in real-time during playback without skipping beats or restarting the audio scheduler.
  * **BPM Stepping:** The UI must provide -10, -5, -1, +1, +5, and +10 quick-step adjustment buttons around the main BPM display for rapid tuning.
* **Time-Based Intervals:**

  * **Endless:** Free-play for jamming (Note: Scores are *not* recorded in history).

  * **Focus (1 min):** High-intensity concentration.

  * **Stamina (3 min):** Endurance training.
  
  * **Real-time Tracking:** The UI must display a precise elapsed time counter synced directly to the AudioContext alongside an active Bar count tracker.

* **Count-In Logic:** Default is **2 bars**. User configurable to 1 bar or Off.

* **Voicing Options:**
  * Standard Beep: Uses lighter, higher frequencies (e.g., 1200Hz/800Hz) to prevent the click from sounding "heavy."
  * Human Voice (1, 2, 3, 4)
  * "Woodblock"

* **Rhythm Challenges:**

  * **Emphasis Modes:** "Ands" only, "2 and 4" only (Backbeat focus), or standard "On-beat."

  * **Gap Radio:**

    * *Constant:* X bars on, Y bars off.

    * *Random Beat:* A "Chaos" slider (%) for the probability of any individual beat being silent.

    * *Random Bar:* Randomizes the number of active vs. silent bars within a user-defined range.

  * **Shaky Click (The "Bad Bassist" Mode):** A toggle that introduces random timing jitter to the click itself (configurable % chance and ms range) to train the drummer to hold their own time.

## 3. Visualization Suite ("The Lab")

### A. The "Open Ended" Scatter Plot

* **Axes:** X-axis = Velocity; Y-axis = Timing Offset (-ms to +ms).

* **The "Fade" Logic:** Notes are plotted as symbols. As new notes arrive, older notes' opacity ($\alpha$) decreases until they disappear.

* **Memory:** Default is **8 bars** (User configurable).

### B. Limb Offset Matrix (The "Smear" Detector)

* **Data Points:** Tracks the timing difference between simultaneous MIDI notes (e.g., Kick vs. Hi-Hat).

* **Modes:**

  * **Merged:** Kick, Snare, and Hat on one graph using user-defined symbols and colors.

  * **Isolated:** User can toggle pairs: Snare+Hat, Kick+Hat, or Snare+Kick.

* **Layout:** Option to show as one merged graph or three separate stacked mini-graphs.

### C. The Pocket Heatmap

* **Visual:** A bell-curve (histogram) of all hits.

* **Color Coding:** \* Green: Perfect (within ±5ms).

  * Yellow: Solid (±15ms).

  * Red: Out of Pocket (> ±20ms).

## 4. UI Design System (Modern & Clean)

* **Theme:** "Obsidian Midnight" (Dark Mode by default).

* **Palette:**

  * **Background:** `#0F172A` (Slate 900) - Deep, low-fatigue dark blue.

  * **Surface:** `#1E293B` (Slate 800) - For cards and panels.

  * **Primary Accent:** `#38BDF8` (Sky 400) - For the active metronome pulse.

  * **Success (Pocket):** `#10B981` (Emerald 500).

  * **Warning (Early/Late):** `#F59E0B` (Amber 500).

  * **Critical (Off-beat):** `#EF4444` (Red 500).

* **Typography:** Monospace (e.g., `JetBrains Mono` or `Roboto Mono`) for all numeric values and scores to prevent "jumping" text.

* **Borders:** Subtle `1px` borders with `rounded-xl` (12px) corners for a modern, mobile-app feel.

* **Interactions:** Use "Glow" effects (box-shadow) for the active metronome beat rather than just color changes.

## 5. UI, Settings & Help

* **Global Layout:** Left Panel (Metronome/Timer & Help system), Center Panel (Active Visualization), Right Panel (Session Stats).

* **Help System:** A collapsible Help section located directly below the metronome which is expanded by default. Its content dynamically updates to display the description and goal whenever the cursor hovers over a control or graph.

## 6. Success Metrics & Scoring

### A. The Timing Score ($S_{hit}$)

Uses a tempo-normalized Gaussian decay function to ensure consistent "feel" across BPMs.

$$
S_{hit} = 100 \cdot e^{-\left( \frac{|\Delta t|}{D_{16th} \cdot \sigma} \right)^2}
$$

* $\Delta t$: Raw offset in ms.

* $D_{16th}$: Duration of a 16th note at current BPM.

* $\sigma$: Sensitivity coefficient (Standard = 0.15).

### B. Limb Alignment Score ($S_{limb}$)

Calculates the Standard Deviation ($SD$) of simultaneous hits.

$$
S_{limb} = \max(0, 100 - (SD \cdot \text{Penalty Coefficient}))
$$

### C. Session History

* Scores are saved to `LocalStorage` only upon completion of a timed interval (1 or 3 min).

* Endless mode provides real-time feedback but does not commit to the history log.

## Scoring Logic & Formulas

This section defines the mathematical engine used to calculate the **Pocket Score** and **Limb Alignment Score**.

### 1. Tempo-Normalized Error ($E_{norm}$)

To ensure the score feels the same at 60 BPM and 200 BPM, we first calculate the "Window of Tolerance" based on the current tempo.

* **Beat Duration (**$D_{beat}$**):** $60,000 / \text{BPM}$ (ms)
* **16th Note Duration (**$D_{16th}$**):** $D_{beat} / 4$
* **Raw Offset (**$\Delta t$**):** $T_{actual} - T_{click}$ (ms)

**The Formula:**

$$E_{norm} = \frac{|\Delta t|}{D_{16th}}$$

*This expresses your error as a percentage of a 16th note.*

### 2. The Individual Hit Score ($S_{hit}$)

We use an **Exponential Decay** or a **Squared Penalty** function. A squared penalty is better because it ignores tiny "human" micro-variations but punishes "flams" or "drags" heavily.

**The Formula (Gaussian-style):**

$$S_{hit} = 100 \cdot e^{-\left( \frac{E_{norm}}{\sigma} \right)^2}$$

* $\sigma$ **(Sensitivity):** A constant that defines how "strict" the app is.
  * *Pro Level:* $\sigma = 0.10$ (10% of a 16th note)
  * *Standard:* $\sigma = 0.15$
* **Result:** A hit exactly on the click = 100. A hit off by 15% of a 16th note = ~36.

### 3. Limb Alignment Score ($S_{limb}$)

This measures the "smear" or "flam" between two pads that were intended to be simultaneous (e.g., Kick and Hi-Hat).

**The Formula:**

1. Identify a "Limb Group" (notes occurring within 40ms of each other).
2. Calculate the **Standard Deviation** ($\text{SD}$) of the offsets within that group.
3. $$S_{limb} = \max(0, 100 - (\text{SD} \cdot \text{Penalty Coefficient}))$$

*If your Kick and Hat are 2ms apart, the score remains near 100. If they are 25ms apart (a noticeable flam), the score drops significantly.*

### 4. Global Session Pocket Score ($S_{total}$)

For the final score at the end of a 1-minute or 3-minute interval:

$$S_{total} = (w_1 \cdot \overline{S_{hit}}) + (w_2 \cdot \overline{S_{limb}}) - (w_3 \cdot \text{Jitter Penalty})$$

* $\overline{S_{hit}}$**:** Average of all hit scores.
* $\overline{S_{limb}}$**:** Average alignment score.
* **Jitter Penalty:** Calculated based on the variance of your timing. Even if your average offset is 0ms, if you are constantly oscillating between +10ms and -10ms, your "Pocket" isn't solid.
* **Weights (**$w$**):** Typically 70% timing accuracy, 30% limb alignment.

### 5. Implementation Notes for "Shaky Click"

When "Shaky Click" is active, the $T_{click}$ used in the formula above is the **actual** (shifted) time the click played, not the theoretical grid time. This rewards the drummer for following the "bad bassist" perfectly, rather than staying on a grid the user can no longer hear.

## Performance

Make sure the app is performant and responsive.

## Coding Rules

1. Always add test cases for new features.

2. Always remove unnecessary imports, logging, comments before adding a commit.

3. Follow Google style guides and best practices.

4. Always update README after significant changes.

5. Always update SPECS after additional requirements are added in the chats to keep it as a single source of truth for the project which will be used as a reference for future development.
