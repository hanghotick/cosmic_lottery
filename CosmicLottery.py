"""
Cosmic Lottery - Python Version (Windows Compatible)

Dependencies:
- pyglet (for 3D rendering): pip install pyglet
- PyOpenGL (for OpenGL functions): pip install PyOpenGL
- tkinter (for UI, built-in)

Run: python CosmicLottery.py
"""
import pyglet
import tkinter as tk
import threading
import random
import math

# Use PyOpenGL for OpenGL functions/constants
try:
    from OpenGL.GL import *
    from OpenGL.GLU import *
except ImportError:
    raise ImportError("PyOpenGL is required. Install it with: pip install PyOpenGL")

# --- Particle System Parameters (defaults) ---
numberOfParticles = 1000
particleSpeedFactor = 0.015
boxSize = 200
particleRadius = 2.0
mouseReactionRadius = 80
mousePushForce = 1.5
damping = 0.995
minContinuousSpeed = 0.008
whirlwindStrength = 0.002
inwardSpiralFactor = 0.00005
particleColorHue = 240
particleColorSaturation = 80
particleColorLightness = 65

# --- Particle System State ---
particles = []  # Each: {pos, vel, color, number}
selectedParticle = None
explosionActive = False
luckyParticleSelected = False

# --- Camera State ---
camera_zoom = 160
camera_angle = 0.0

# --- Helper Functions ---
def hsl_to_rgb(h, s, l):
    # h: 0-360, s: 0-100, l: 0-100
    s /= 100
    l /= 100
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c/2
    if h < 60:
        r, g, b = c, x, 0
    elif h < 120:
        r, g, b = x, c, 0
    elif h < 180:
        r, g, b = 0, c, x
    elif h < 240:
        r, g, b = 0, x, c
    elif h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    return (int((r + m) * 255), int((g + m) * 255), int((b + m) * 255))

def random_color():
    return hsl_to_rgb(
        random.randint(0, 360),
        random.randint(50, 100),
        random.randint(30, 90)
    )

def reset_particles():
    global particles, selectedParticle, luckyParticleSelected, explosionActive
    particles = []
    selectedParticle = None
    luckyParticleSelected = False
    explosionActive = False
    for i in range(numberOfParticles):
        # Random position in box
        x = (random.random() - 0.5) * boxSize
        y = (random.random() - 0.5) * boxSize
        z = (random.random() - 0.5) * boxSize
        # Whirlwind velocity
        angle = math.atan2(z, x)
        speed = random.uniform(0.5, 1.5) * particleSpeedFactor * boxSize / 100
        vx = -math.sin(angle) * speed
        vy = (random.random() - 0.5) * speed
        vz = math.cos(angle) * speed
        color = hsl_to_rgb(particleColorHue, particleColorSaturation, particleColorLightness)
        particles.append({
            'pos': [x, y, z],
            'vel': [vx, vy, vz],
            'color': color,
            'number': i + 1,
            'visible': True,
            'opacity': 1.0
        })

def select_lucky_particle():
    global selectedParticle, luckyParticleSelected, explosionActive
    if not particles:
        return
    # Select the particle with highest velocity
    max_speed = -1
    idx = 0
    for i, p in enumerate(particles):
        v = p['vel']
        speed = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
        if speed > max_speed:
            max_speed = speed
            idx = i
    selectedParticle = particles[idx]
    luckyParticleSelected = True
    explosionActive = True
    # Fade out others
    for p in particles:
        if p != selectedParticle:
            p['opacity'] = 1.0
            p['visible'] = True

def update_particles(dt):
    for p in particles:
        if explosionActive and p != selectedParticle:
            p['opacity'] -= 0.02
            if p['opacity'] <= 0:
                p['visible'] = False
        # Damping
        p['vel'][0] *= damping
        p['vel'][1] *= damping
        p['vel'][2] *= damping
        # Never stop
        speed = math.sqrt(sum(v*v for v in p['vel']))
        if speed < minContinuousSpeed:
            p['vel'][0] += (random.random() - 0.5) * particleSpeedFactor
            p['vel'][1] += (random.random() - 0.5) * particleSpeedFactor
            p['vel'][2] += (random.random() - 0.5) * particleSpeedFactor
        # Update position
        p['pos'][0] += p['vel'][0]
        p['pos'][1] += p['vel'][1]
        p['pos'][2] += p['vel'][2]
        # Bounce off box
        for i in range(3):
            if p['pos'][i] > boxSize/2 - particleRadius:
                p['pos'][i] = boxSize/2 - particleRadius
                p['vel'][i] *= -1
                p['color'] = random_color()
            if p['pos'][i] < -boxSize/2 + particleRadius:
                p['pos'][i] = -boxSize/2 + particleRadius
                p['vel'][i] *= -1
                p['color'] = random_color()

# --- Pyglet 3D Rendering ---
class ParticleWindow(pyglet.window.Window):
    def __init__(self):
        super().__init__(width=900, height=700, caption="Cosmic Lottery 3D", resizable=False)
        glEnable(GL_DEPTH_TEST)
        pyglet.clock.schedule_interval(self.update, 1/60.0)
        self.set_location(100, 100)

    def on_draw(self):
        self.clear()
        glClearColor(0.05, 0.05, 0.1, 1)
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
        glMatrixMode(GL_PROJECTION)
        glLoadIdentity()
        gluPerspective(60, self.width/self.height, 1, 2000)
        glMatrixMode(GL_MODELVIEW)
        glLoadIdentity()
        # Camera
        cam_x = math.sin(camera_angle) * camera_zoom
        cam_z = math.cos(camera_angle) * camera_zoom
        cam_y = boxSize * 0.2
        gluLookAt(cam_x, cam_y, cam_z, 0, 0, 0, 0, 1, 0)
        # Draw box
        glColor3f(0.25, 0.25, 0.5)
        glLineWidth(2)
        glBegin(GL_LINES)
        for x in [-boxSize/2, boxSize/2]:
            for y in [-boxSize/2, boxSize/2]:
                for z in [-boxSize/2, boxSize/2]:
                    for dx, dy, dz in [(1,0,0),(0,1,0),(0,0,1)]:
                        nx, ny, nz = x+dx*boxSize, y+dy*boxSize, z+dz*boxSize
                        if abs(nx) <= boxSize/2 and abs(ny) <= boxSize/2 and abs(nz) <= boxSize/2:
                            glVertex3f(x, y, z)
                            glVertex3f(nx, ny, nz)
        glEnd()
        # Draw particles
        for p in particles:
            if not p['visible']:
                continue
            r, g, b = [c/255 for c in p['color']]
            glColor4f(r, g, b, p['opacity'])
            glPushMatrix()
            glTranslatef(*p['pos'])
            quad = gluNewQuadric()
            gluSphere(quad, particleRadius, 12, 12)
            gluDeleteQuadric(quad)
            glPopMatrix()
        # Draw lucky particle number
        if luckyParticleSelected and selectedParticle:
            self.draw_particle_number(selectedParticle)

    def draw_particle_number(self, p):
        glPushMatrix()
        glTranslatef(p['pos'][0], p['pos'][1]+8, p['pos'][2])
        glColor3f(1, 1, 1)
        pyglet.text.Label(str(p['number']), font_size=24, x=0, y=0, anchor_x='center', anchor_y='center').draw()
        glPopMatrix()

    def update(self, dt):
        update_particles(dt)
        self.dispatch_events()
        self.on_draw()

    def on_mouse_drag(self, x, y, dx, dy, buttons, modifiers):
        global camera_angle
        camera_angle += dx * 0.01

# --- Tkinter UI (Optional, for controls) ---
def run_ui():
    global camera_zoom
    root = tk.Tk()
    root.title("Cosmic Lottery Controls")
    root.geometry("400x300+1050+100")
    # Zoom slider
    zoom_label = tk.Label(root, text="Initial Zoom:")
    zoom_label.pack(pady=5)
    zoom_slider = tk.Scale(root, from_=100, to=500, orient=tk.HORIZONTAL, length=300)
    zoom_slider.set(camera_zoom)
    zoom_slider.pack(pady=5)
    def on_zoom(val):
        global camera_zoom
        camera_zoom = float(val)
    zoom_slider.config(command=on_zoom)
    # Restart button
    tk.Button(root, text="🔄 Restart Simulation 🔄", command=reset_particles).pack(pady=10)
    # Lucky particle
    tk.Button(root, text="🎲 Select Lucky Particle 🎲", command=select_lucky_particle).pack(pady=10)
    # Exit button
    tk.Button(root, text="Exit", command=root.destroy).pack(pady=10)
    root.mainloop()

# --- Main ---
def main():
    reset_particles()
    # Start UI in a thread (enabled)
    ui_thread = threading.Thread(target=run_ui, daemon=True)
    ui_thread.start()
    # Start 3D window (main thread)
    window = ParticleWindow()
    pyglet.app.run()

if __name__ == "__main__":
    main()
