"""
Cosmic Lottery - Python Version (Windows Compatible)

Dependencies:
- pyglet (for 3D rendering): pip install pyglet
- requests (for Gemini API): pip install requests
- tkinter (built-in for UI)

Run: python cosmic_lottery.py
"""
import pyglet
from pyglet.gl import *
import tkinter as tk
from tkinter import ttk
import threading
import random
import math
import requests
import json

# --- Gemini API Setup ---
GEMINI_API_KEY = ""  # <-- Put your Gemini API key here
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

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

# --- UI State ---
llm_output = "Click a button to interact with the AI!"

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
        # Draw the number above the particle
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

# --- Tkinter UI ---
def run_ui():
    global camera_zoom
    root = tk.Tk()
    root.title("Cosmic Lottery Controls")
    root.geometry("500x400+1050+100")
    # Mood input
    mood_label = tk.Label(root, text="Enter a mood (e.g., 'calm', 'energetic'):")
    mood_label.pack(pady=5)
    mood_entry = tk.Entry(root, width=30)
    mood_entry.pack(pady=5)
    def on_apply_mood():
        mood = mood_entry.get().strip()
        if not mood:
            set_llm_output("Please enter a mood or theme!")
            return
        set_llm_output(f'Applying "{mood}" mood...")
        threading.Thread(target=apply_mood_to_particles, args=(mood,)).start()
    tk.Button(root, text="✨ Apply Mood ✨", command=on_apply_mood).pack(pady=5)
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
    tk.Button(root, text="🔄 Restart Simulation 🔄", command=lambda: [reset_particles(), set_llm_output("Simulation restarted!")]).pack(pady=5)
    # Particle insight
    tk.Button(root, text="✨ Get Particle Insight ✨", command=lambda: threading.Thread(target=get_particle_insight).start()).pack(pady=5)
    # Narrate scene
    tk.Button(root, text="✨ Narrate Scene ✨", command=lambda: threading.Thread(target=narrate_particle_scene).start()).pack(pady=5)
    # Lucky particle
    tk.Button(root, text="🎲 Select Lucky Particle 🎲", command=lambda: [select_lucky_particle(), set_llm_output("Lucky particle selected!")]).pack(pady=5)
    # LLM output
    output_label = tk.Label(root, textvariable=llm_output_var, wraplength=400, justify='center', bg='#2a2a4a', fg='#e0e0e0', height=4)
    output_label.pack(pady=10, fill='x')
    root.mainloop()

def set_llm_output(text):
    global llm_output
    llm_output = text
    llm_output_var.set(text)

# --- LLM API Calls ---
def get_particle_insight():
    set_llm_output('Generating insight...')
    prompt = f"""Describe the behavior of a 3D particle system with the following characteristics in a concise and imaginative way (max 50 words):\n- Number of particles: {numberOfParticles}\n- Average speed: {particleSpeedFactor}\n- Damping: {damping}\n- Mouse interaction radius: {mouseReactionRadius}\n- Mouse push force: {mousePushForce}\n- Initial whirlwind strength: {whirlwindStrength}\n- Inward spiral factor: {inwardSpiralFactor}\n- Particles never return to original position.\n- Particle Color: HSL({particleColorHue}, {particleColorSaturation}%, {particleColorLightness}%)\n- Particle Shape: Sphere\n- Particles slow down but never stop.\nFocus on the overall visual impression and motion."""
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    try:
        r = requests.post(GEMINI_API_URL, headers={'Content-Type': 'application/json'}, data=json.dumps(payload))
        result = r.json()
        if 'candidates' in result and result['candidates']:
            text = result['candidates'][0]['content']['parts'][0]['text']
            set_llm_output(text)
        else:
            set_llm_output('Failed to get insight.')
    except Exception as e:
        set_llm_output(f'Error: {e}')

def apply_mood_to_particles(mood):
    global numberOfParticles, particleSpeedFactor, damping, mouseReactionRadius, mousePushForce, whirlwindStrength, inwardSpiralFactor, particleColorHue, particleColorSaturation, particleColorLightness
    prompt = f"Given the mood/theme '{mood}', suggest numerical parameters for a 3D particle system to visually represent this mood. Provide values for:\n- numberOfParticles (integer, 500-1500)\n- particleSpeedFactor (float, 0.001-0.02)\n- damping (float, 0.95-0.999)\n- mouseReactionRadius (integer, 20-100)\n- mousePushForce (float, 0.1-1.0)\n- whirlwindStrength (float, 0.0001-0.005)\n- inwardSpiralFactor (float, 0.00001-0.0005)\n- particleColorHue (integer, 0-360)\n- particleColorSaturation (integer, 50-100)\n- particleColorLightness (integer, 30-90)\nAlso, provide a short description (max 30 words) of how these parameters evoke the mood. Ensure all values are within the specified ranges. Particles should never return to original position and slow down but never stop. Return as a JSON object."
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    try:
        r = requests.post(GEMINI_API_URL, headers={'Content-Type': 'application/json'}, data=json.dumps(payload))
        result = r.json()
        if 'candidates' in result and result['candidates']:
            jsonText = result['candidates'][0]['content']['parts'][0]['text']
            parsed = json.loads(jsonText)
            numberOfParticles = parsed['numberOfParticles']
            particleSpeedFactor = parsed['particleSpeedFactor']
            damping = parsed['damping']
            mouseReactionRadius = parsed['mouseReactionRadius']
            mousePushForce = parsed['mousePushForce']
            whirlwindStrength = parsed['whirlwindStrength']
            inwardSpiralFactor = parsed['inwardSpiralFactor']
            particleColorHue = parsed['particleColorHue']
            particleColorSaturation = parsed['particleColorSaturation']
            particleColorLightness = parsed['particleColorLightness']
            reset_particles()
            set_llm_output(f"Mood Applied! {parsed['description']}")
        else:
            set_llm_output('Failed to apply mood.')
    except Exception as e:
        set_llm_output(f'Error: {e}')

def narrate_particle_scene():
    prompt = f"""Narrate a short, imaginative story or poem (max 60 words) about a 3D particle system. Focus on its current state:\n- Number of particles: {numberOfParticles}\n- Particle speed: {particleSpeedFactor} (consider its current dynamic state)\n- Damping: {damping} (how it affects motion)\n- Mouse interaction: {'present' if mouseReactionRadius > 0 else 'absent'}\n- Lucky particle selected: {'Yes, particle ' + str(selectedParticle['number']) if selectedParticle else 'No lucky particle selected.'}\n- Overall mood: Describe the visual and motion characteristics."""
    payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    try:
        r = requests.post(GEMINI_API_URL, headers={'Content-Type': 'application/json'}, data=json.dumps(payload))
        result = r.json()
        if 'candidates' in result and result['candidates']:
            text = result['candidates'][0]['content']['parts'][0]['text']
            set_llm_output(text)
        else:
            set_llm_output('Failed to generate narration.')
    except Exception as e:
        set_llm_output(f'Error: {e}')

# --- Main ---
llm_output_var = tk.StringVar()
llm_output_var.set(llm_output)
reset_particles()

# Start UI in a thread
ui_thread = threading.Thread(target=run_ui, daemon=True)
ui_thread.start()

# Start 3D window (main thread)
ParticleWindow().run()
