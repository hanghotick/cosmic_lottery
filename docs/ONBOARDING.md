# Developer Onboarding Guide

This guide will help you get started with developing for the Cosmic Lottery project.

## Development Environment Setup

### Required Tools
1. Visual Studio Code
2. Git
3. Modern web browser (Chrome/Firefox recommended)
4. Node.js (optional, for development tools)

### VS Code Extensions
1. Live Server
   - Install from VS Code marketplace
   - Used for local development server
   - Enables automatic reloading

2. WebGL Shader
   - Syntax highlighting for GLSL files
   - Shader validation
   - IntelliSense support

3. Three.js Snippets
   - Code snippets for Three.js
   - Quick access to common patterns
   - API documentation

### Initial Setup

1. Clone the repository
```powershell
git clone https://github.com/yourusername/cosmic-lottery.git
cd cosmic-lottery
```

2. Open in VS Code
```powershell
code .
```

3. Start the development server
   - Right-click on `index.html`
   - Select "Open with Live Server"
   - The app should open in your default browser

## Project Structure Overview

### Core Files
- `index.html`: Main entry point and UI structure
- `worker.js`: Web Worker for physics calculations
- `js/config.js`: Configuration constants

### Managers
- `WebGLManager.js`: WebGL and Three.js setup
- `SimulationController.js`: Physics and animation control
- `UIController.js`: User interface management
- `LanguageManager.js`: Internationalization

### Graphics
- `ParticleRenderer.js`: Particle system renderer
- `shaders/`: GLSL shader programs
  - `particle.vert`: Vertex shader
  - `particle.frag`: Fragment shader

## Common Development Tasks

### Adding Features
1. Plan your feature
2. Create a new branch
3. Implement changes
4. Test thoroughly
5. Submit PR

### Debugging Tips
- Use the debug overlay (Ctrl+Shift+D)
- Check browser console
- Use Three.js Inspector
- Monitor WebGL context

### Performance Testing
1. Open Chrome DevTools
2. Go to Performance tab
3. Start recording
4. Perform actions
5. Analyze results

## Best Practices

### Code Style
- Use ES6+ features
- Comment complex logic
- Follow naming conventions
- Keep functions small

### WebGL
- Batch operations
- Reuse geometries
- Optimize shaders
- Handle context loss

### Testing
1. Browser compatibility
2. Mobile responsiveness
3. Memory leaks
4. Error handling

## Common Issues

### WebGL Context Loss
- Usually happens on mobile
- Check `handleContextLost`
- Verify state restoration

### Performance Issues
- Too many particles
- Shader complexity
- Memory leaks
- Garbage collection

### Browser Compatibility
- Check caniuse.com
- Test in major browsers
- Mobile testing
- Feature detection

## Resources

### Documentation
- [Three.js Docs](https://threejs.org/docs/)
- [WebGL Reference](https://www.khronos.org/webgl/)
- Project Architecture
- API Reference

### Tools
- [Three.js Inspector](https://chrome.google.com/webstore/detail/threejs-inspector/dnhjfclbfhcbcdfpjaeacomhbdfjbebi)
- [Chrome DevTools](https://developers.google.com/web/tools/chrome-devtools)
- [WebGL Report](https://webglreport.com/)

### Support
- Issue tracker
- Wiki
- Team chat
