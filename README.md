# Cosmic Lottery (Stellar Fortune)

An interactive, visually stunning 3D particle system game of chance and numerology, built with HTML, CSS, and Three.js. Features a swirling cosmic cube, dynamic particle selection, numerology fortune, and full bilingual support (English/Hungarian).

## Features

- **3D Interactive Cube:** Swirl, drag, and rotate a cube filled with hundreds to tens of thousands of particles.
- **Dynamic Lucky Draw:** Configure the highest lucky number and how many numbers to draw (1-10). Watch as the system randomly selects and lines up your lucky numbers.
- **Bilingual UI:** Instantly switch between English and Hungarian. All UI, messages, and numerology content are translated.
- **Responsive Design:** Auto-scales for Full HD (1920x1080) and adapts gracefully to tablets and mobile devices. All controls and text remain legible and touch-friendly.
- **Modern UI/UX:** Sidebar control panel, clear labels, accessible controls, and consistent visual feedback. High-contrast, unified styling throughout.
- **Touch & Mouse Support:** Drag, zoom, and interact on any device.
- **Starfield/Nebula Background:** Animated cosmic backdrop for immersive experience.
- **High-Performance Rendering:** Utilizes Three.js `InstancedMesh` for efficient rendering of tens of thousands of particles, ensuring smooth visuals even with large draws.
- **Web Worker Physics:** Particle physics and movement calculations are offloaded to a Web Worker, keeping the UI responsive and fluid during heavy computation.
- **Loading Indicator:** A loading overlay/spinner is displayed during particle initialization for a polished user experience.

## How to Use

1. **Open `index.html` in your browser.**
2. Use the sidebar to:
   - Select your language (English/Magyar)
   - Set the highest lucky number (1-10000)
   - Choose how many lucky numbers to draw (1-10)
   - Adjust the initial camera zoom
3. Click **Start** to begin the cosmic draw. Watch the particles swirl, clash, and reveal your lucky numbers.
4. View your numerology fortune and start a new game anytime.

## Controls

- **Rotate Cube:** Click and drag (mouse) or swipe (touch) on the 3D area.
- **Zoom:** Use the slider or mouse wheel/pinch gesture.
- **Sidebar:** Toggle with ☰ button for settings and controls.

## Performance & Technology

- **InstancedMesh Rendering:** The game uses Three.js `InstancedMesh` to render all particles in a single draw call, allowing for high particle counts without sacrificing performance.
- **Web Worker Physics:** All particle movement and collision logic is computed in a separate thread (Web Worker), ensuring the main UI remains smooth and interactive.
- **Loading Overlay:** A loading spinner appears while particles are being generated and initialized, especially noticeable with large draws.

## Deployment Notes

- **GitHub Pages Compatible:** All assets and worker paths are set relative for seamless deployment on GitHub Pages or any static hosting.
- **No Build Step Required:** Simply upload the contents of the `comic_lottery` folder to your web host or GitHub Pages.
- **Web Worker Path:** Ensure the `worker.js` file remains in the same directory as `index.html` for correct loading.

## Requirements

- Modern web browser (Chrome, Firefox, Edge, Safari)
- No installation or server required (pure HTML/JS)

## Accessibility & Responsiveness

- All controls are keyboard and touch accessible.
- UI auto-scales for all screen sizes.
- High-contrast, legible text and controls.

## Credits

- Built with [Three.js](https://threejs.org/)
- Designed and developed by [Your Name/Team]

---

For questions, feedback, or contributions, please contact the project maintainer.
