# Pocket Lab

A high-precision Web MIDI drumming coach designed to diagnose timing offsets, visualize "limb smear," and gamify the development of a deep pocket.

## 🚀 Getting Started

This application is built with vanilla HTML, CSS, and JavaScript to maximize performance and minimize dependency overhead. This approach ensures low latency for MIDI processing and Canvas/SVG rendering.

### Prerequisites

* A modern web browser with **Web MIDI API** support (e.g., Google Chrome, Microsoft Edge, Opera).
* A local development server. Browsers block Web MIDI access on `file://` protocols for security reasons, so the app must be served over `http://localhost` or `https://`.

### 🛠️ Development

To run the app locally for development, you can use any static local web server. Here are a few common options:

**Using Python:**
```bash
# If you have Python 3 installed
python -m http.server 8000
```

**Using Node.js:**
```bash
# If you have Node/npm installed
npx serve .
```

**Using VS Code:**
1. Install the **Live Server** extension.
2. Right-click `index.html` and select **"Open with Live Server"**.

Once your server is running, navigate to `http://localhost:8000` (or the port specified by your server) in your browser. Keep your console open to view MIDI access logs.

### 🏗️ Deploying to GitHub Pages

Since this is currently a vanilla web application without a complex build pipeline, deploying to GitHub Pages is straightforward as it serves static files directly from your repository.

**Steps to deploy:**
1. Ensure all code modifications are complete and unnecessary `console.log` statements are removed per the coding rules.
2. Commit and push your code (`index.html`, `css/`, `js/`) to your GitHub repository's `main` branch.
3. In your GitHub repository, go to **Settings** > **Pages**.
4. Under the "Build and deployment" section, choose **Deploy from a branch**.
5. Select the `main` branch (and `/root` folder) then click **Save**. 

Your application will be live at `https://[your-username].github.io/[repository-name]/` shortly after!

*(Note: If a build step like Vite is introduced in the future, we will set up a GitHub Actions workflow to auto-build and deploy to GitHub Pages).*

### 🧪 Running Tests

*(Automated testing framework pending initialization)*

Per the established coding rules, test cases must be added for new features. Currently, the project is in its structural boilerplate phase. 

Once a testing infrastructure is fully set up (such as Jest for logic or a browser-based runner for DOM/Canvas manipulation), you will be able to run tests via:
```bash
# Example anticipated command
npm run test
```
For now, perform manual verification through the development server, ensuring you test MIDI input responses and layout responsiveness.

## 📐 Project Structure

* `index.html`: Main application entry point and layout structure.
* `css/style.css`: UI styling utilizing the "Obsidian Midnight" design system.
* `js/app.js`: Core application logic, initializing Web MIDI and the display rendering engines.
* `SPECS.md`: Detailed product specifications, feature requirements, and scoring algorithms.
