from ursina import *
import random
import time
import math

# --- Global Game State Variables ---
app = Ursina()

# Scene container for rotation
container_entity = Entity()

# Global parameters - Adjusted for slower animation and Pythonic naming
NUMBER_OF_PARTICLES = 1000
PARTICLE_SPEED_FACTOR = 0.002
BOX_SIZE = 200
PARTICLE_RADIUS = 1.0
DAMPING = 0.9995

GRAVITATIONAL_PULL = 0.00002
ORBITAL_VELOCITY_FACTOR = 0.0002
GALACTIC_RANDOM_MOTION = 0.0002

PECULIAR_VELOCITY = Vec3(0.000005, 0.0000025, 0.000005)
PECULIAR_VELOCITY_CHANGE_RATE = 0.00000005

COSMIC_EXPANSION_FACTOR = 0.00000005

CURRENT_ORBITAL_VELOCITY_FACTOR = ORBITAL_VELOCITY_FACTOR
CURRENT_GRAVITATIONAL_PULL = GRAVITATIONAL_PULL
MAX_ORBITAL_VELOCITY_FACTOR = 0.0015
MAX_GRAVITATIONAL_PULL = 0.00004
SWIRL_INCREASE_RATE = 0.000002

AUTO_ROTATION_SPEED = 0.0005

NUMBER_OF_SELECTED_PARTICLES = 6
particles = []
selected_particles_array = []
lucky_particle_selected = False
simulation_started = False
explosion_active = False
explosion_start_time = 0
EXPLOSION_DURATION = 1.5  # seconds

is_lining_up = False
line_up_start_time = 0
LINE_UP_DURATION = 2.0  # seconds for particles to line up and camera to zoom
INITIAL_CAMERA_Z_FOR_LINE_UP = 0 # Will be set dynamically
TARGET_CAMERA_Z = 60 # Closer zoom for lined-up particles

# Target positions for the 6 selected particles to line up horizontally in the center
TARGET_PARTICLE_POSITIONS = [
    Vec3(-50, 0, 0),
    Vec3(-30, 0, 0),
    Vec3(-10, 0, 0),
    Vec3(10, 0, 0),
    Vec3(30, 0, 0),
    Vec3(50, 0, 0)
]

# Particle color definition (HSL values, converted to RGB by Ursina)
PARTICLE_COLOR_HUE = 270 # Purple-ish
PARTICLE_COLOR_SATURATION = 0.7 # 70%
PARTICLE_COLOR_LIGHTNESS = 0.6 # 60%

# UI Elements
countdown_text = Text(text='', scale=5, origin=(0,0), color=color.magenta, z=-1, enabled=False)
status_output_text = Text(text='Press Start to begin the Lucky Draw!', origin=(0, -0.8), scale=1.5, color=color.light_gray)
message_box_panel = Panel(scale=0.5, origin=(0,0), color=color.black66, z=-2, enabled=False, model='quad', collider='box', radius=0.1)
message_box_text = Text(text='', parent=message_box_panel, scale=0.1, origin=(0,0), color=color.white)
message_box_button = Button(text='OK', parent=message_box_panel, scale=(0.2, 0.1), origin=(0, -0.4), color=color.magenta, on_click=lambda: hide_message_box())

# --- Utility Functions ---
def show_message_box(message):
    message_box_text.text = message
    message_box_panel.enabled = True
    message_box_panel.z = -1 # Bring to front
    message_box_panel.scale = (camera.aspect_ratio * 0.5, 0.5) # Adjust size based on aspect ratio
    message_box_text.world_scale = 0.05 # Ensure text scales properly
    message_box_button.world_scale = 0.05 # Ensure button scales properly

def hide_message_box():
    message_box_panel.enabled = False

def reduce_to_single_digit(number):
    if number in [11, 22, 33]:
        return number
    s = 0
    while number > 0 or s > 9:
        if number == 0:
            number = s
            s = 0
        s += number % 10
        number = math.floor(number / 10)
    return s

def get_numerology_meaning(number):
    meanings = {
        1: "The Leader: New beginnings, independence, and strong will. You are destined to forge your own path.",
        2: "The Harmonizer: Balance, cooperation, and diplomacy. Your path is one of partnership and understanding.",
        3: "The Creator: Creativity, communication, and joy. Express yourself and inspire others with your vibrant energy.",
        4: "The Builder: Stability, hard work, and strong foundations. Diligence will lead you to lasting success.",
        5: "The Adventurer: Freedom, change, and adaptability. Embrace new experiences and explore the world around you.",
        6: "The Nurturer: Responsibility, harmony, and compassion. Your focus is on home, family, and service to others.",
        7: "The Seeker: Spirituality, introspection, and wisdom. Your journey is one of deep thought and discovery.",
        8: "The Achiever: Abundance, power, and ambition. You have the potential for great material and personal success.",
        9: "The Humanitarian: Completion, compassion, and universal love. Your purpose is to serve humanity.",
        11: "The Master Intuitive: High intuition, inspiration, and spiritual insight. You are a channel for higher truths.",
        22: "The Master Builder: Practical idealism, vision, and large-scale creation. You can manifest great dreams.",
        33: "The Master Teacher: Compassionate service, universal love, and healing. You are here to uplift humanity.",
    }
    return meanings.get(number, "An unknown cosmic energy surrounds your numbers. Explore further!")

def display_numerology_fortune(total_sum, selected_numbers_string):
    numerology_number = reduce_to_single_digit(total_sum)
    meaning = get_numerology_meaning(numerology_number)
    message = (
        f'Your Lucky Numbers: {selected_numbers_string}\n'
        f'Numerology Sum: {numerology_number}\n'
        f'{meaning}'
    )
    show_message_box(message)

# --- Particle Class ---
class Particle(Entity):
    def __init__(self, position, velocity, number):
        super().__init__(
            parent=container_entity,
            model='sphere',
            scale=PARTICLE_RADIUS * 2,
            position=position,
            color=color.hsv(PARTICLE_COLOR_HUE / 360, PARTICLE_COLOR_SATURATION, PARTICLE_COLOR_LIGHTNESS + random.uniform(-0.1, 0.1)),
            collider='sphere'
        )
        self.velocity = velocity
        self.number = number
        self.is_selected = False
        self.text_entity = None # To hold the Text entity for selected particles

    def update(self):
        global explosion_active, is_lining_up

        if explosion_active and not self.is_selected:
            # Fade out non-selected particles
            elapsed_time = time.time() - explosion_start_time
            opacity = 1 - (elapsed_time / EXPLOSION_DURATION)
            self.color = color.hsv(self.color.h, self.color.s, self.color.v, max(0, opacity))
            if self.color.a <= 0.01:
                self.enabled = False # Hide particle if fully transparent

        # Apply damping
        self.velocity *= DAMPING

        # Apply dynamic forces if not selected and not lining up
        if not lucky_particle_selected and simulation_started and not is_lining_up:
            center = Vec3(0, 0, 0)
            direction_from_center = (self.position - center).normalized()
            distance_to_center = self.position.length()

            # Gravitational Pull (inward)
            gravitational_force = direction_from_center * (-distance_to_center * CURRENT_GRAVITATIONAL_PULL)
            self.velocity += gravitational_force

            # Orbital Velocity (tangential, differential rotation)
            axis = Vec3(0, 1, 0) # Galactic plane is Y-axis for rotation
            tangential_velocity = axis.cross(direction_from_center).normalized()
            differential_factor = max(0, 1 - (distance_to_center / (BOX_SIZE / 2)))
            self.velocity += tangential_velocity * (distance_to_center * CURRENT_ORBITAL_VELOCITY_FACTOR * differential_factor)

            # Random Galactic Motion
            self.velocity.x += (random.random() - 0.5) * GALACTIC_RANDOM_MOTION
            self.velocity.y += (random.random() - 0.5) * GALACTIC_RANDOM_MOTION
            self.velocity.z += (random.random() - 0.5) * GALACTIC_RANDOM_MOTION

            # Intergalactic Movement (Peculiar Velocities)
            self.velocity += PECULIAR_VELOCITY

            # Cosmic Expansion (very subtle outward push)
            cosmic_expansion_force = direction_from_center * COSMIC_EXPANSION_FACTOR
            self.velocity += cosmic_expansion_force

            # Dynamic color shift during swirl
            # Ursina colors are 0-1 for H, S, V, A
            self.color = color.hsv(
                (PARTICLE_COLOR_HUE / 360 + math.sin(time.time() * 0.0001 + self.number * 0.01) * 0.05) % 1,
                PARTICLE_COLOR_SATURATION,
                PARTICLE_COLOR_LIGHTNESS
            )
        elif lucky_particle_selected and self.is_selected:
            # Keep selected particles' colors vibrant
            self.color = color.hsv(PARTICLE_COLOR_HUE / 360, PARTICLE_COLOR_SATURATION, PARTICLE_COLOR_LIGHTNESS)

        # Handle lining up animation for selected particles
        if is_lining_up and self.is_selected:
            elapsed_time = time.time() - line_up_start_time
            t = min(1, elapsed_time / LINE_UP_DURATION) # Animation progress (0 to 1)

            selected_index = selected_particles_array.index(self)
            if selected_index != -1 and selected_index < len(TARGET_PARTICLE_POSITIONS):
                # Interpolate position
                self.position = self.position.lerp(TARGET_PARTICLE_POSITIONS[selected_index], t)
                self.velocity = Vec3(0, 0, 0) # Stop particle's own velocity

                # Ensure text is always facing the camera
                if self.text_entity:
                    self.text_entity.look_at(camera)
                    self.text_entity.rotation_y += 180 # Adjust for text orientation if needed

        elif is_lining_up and not self.is_selected:
            # If lining up, and not selected, ensure non-selected particles are fully hidden
            self.color = color.clear
            self.enabled = False

        # Ensure minimum speed for continuous floating (only if not lining up)
        MIN_CONTINUOUS_SPEED = 0.0005
        if not is_lining_up and self.velocity.length() < MIN_CONTINUOUS_SPEED:
            self.velocity.x += (random.random() - 0.5) * PARTICLE_SPEED_FACTOR * 0.5
            self.velocity.y += (random.random() - 0.5) * PARTICLE_SPEED_FACTOR * 0.5
            self.velocity.z += (random.random() - 0.5) * PARTICLE_SPEED_FACTOR * 0.5

        self.position += self.velocity

        # Boundary collision (bounce off cube walls) and color change
        half_box = BOX_SIZE / 2
        collided = False

        # Check and clamp position for X-axis
        if self.position.x + PARTICLE_RADIUS > half_box:
            self.velocity.x *= -1
            self.position.x = half_box - PARTICLE_RADIUS
            collided = True
        elif self.position.x - PARTICLE_RADIUS < -half_box:
            self.velocity.x *= -1
            self.position.x = -half_box + PARTICLE_RADIUS
            collided = True

        # Check and clamp position for Y-axis
        if self.position.y + PARTICLE_RADIUS > half_box:
            self.velocity.y *= -1
            self.position.y = half_box - PARTICLE_RADIUS
            collided = True
        elif self.position.y - PARTICLE_RADIUS < -half_box:
            self.velocity.y *= -1
            self.position.y = -half_box + PARTICLE_RADIUS
            collided = True

        # Check and clamp position for Z-axis
        if self.position.z + PARTICLE_RADIUS > half_box:
            self.velocity.z *= -1
            self.position.z = half_box - PARTICLE_RADIUS
            collided = True
        elif self.position.z - PARTICLE_RADIUS < -half_box:
            self.velocity.z *= -1
            self.position.z = -half_box + PARTICLE_RADIUS
            collided = True

        # Change color if collision occurred (only before selection)
        if collided and not lucky_particle_selected:
            new_hue = random.random()
            new_saturation = 0.7 + random.random() * 0.3
            new_lightness = 0.5 + random.random() * 0.3
            self.color = color.hsv(new_hue, new_saturation, new_lightness)


# --- Game Flow Functions ---
def init_game_elements():
    global particles, cube_wireframe, CURRENT_ORBITAL_VELOCITY_FACTOR, CURRENT_GRAVITATIONAL_PULL

    # Clear existing particles
    for p in particles:
        destroy(p)
    particles = []
    global selected_particles_array
    selected_particles_array = []

    global lucky_particle_selected, simulation_started, explosion_active, is_lining_up
    lucky_particle_selected = False
    simulation_started = False
    explosion_active = False
    is_lining_up = False

    # Reset dynamic swirl parameters
    CURRENT_ORBITAL_VELOCITY_FACTOR = ORBITAL_VELOCITY_FACTOR
    CURRENT_GRAVITATIONAL_PULL = GRAVITATIONAL_PULL

    status_output_text.text = 'Press Start to begin the Lucky Draw!'
    countdown_text.enabled = False

    # Re-create cube wireframe if it doesn't exist or was destroyed
    global cube_wireframe
    if not 'cube_wireframe' in globals() or cube_wireframe is None:
        cube_wireframe = Entity(
            parent=container_entity,
            model='cube',
            scale=BOX_SIZE,
            color=color.color(0.6, 0.6, 0.8, 0.5), # Slightly transparent blue-ish
            render_mode='wireframe',
            collider='box'
        )
    else:
        cube_wireframe.enabled = True # Ensure it's visible

    center = Vec3(0, 0, 0)

    for i in range(NUMBER_OF_PARTICLES):
        x = (random.random() - 0.5) * BOX_SIZE
        y = (random.random() - 0.5) * BOX_SIZE
        z = (random.random() - 0.5) * BOX_SIZE

        particle_pos = Vec3(x, y, z)
        direction_from_center = (particle_pos - center).normalized()

        initial_gravitational_force = direction_from_center * (-particle_pos.length() * GRAVITATIONAL_PULL)

        axis = Vec3(0, 1, 0)
        initial_tangential_velocity = axis.cross(direction_from_center).normalized()
        initial_differential_factor = max(0, 1 - (particle_pos.length() / (BOX_SIZE / 2)))
        initial_tangential_velocity *= (particle_pos.length() * ORBITAL_VELOCITY_FACTOR * initial_differential_factor)

        initial_random_motion = Vec3(
            (random.random() - 0.5) * GALACTIC_RANDOM_MOTION,
            (random.random() - 0.5) * GALACTIC_RANDOM_MOTION,
            (random.random() - 0.5) * GALACTIC_RANDOM_MOTION
        )

        initial_peculiar_velocity = PECULIAR_VELOCITY
        cosmic_expansion_force = direction_from_center * COSMIC_EXPANSION_FACTOR

        initial_velocity = (
            initial_gravitational_force +
            initial_tangential_velocity +
            initial_random_motion +
            initial_peculiar_velocity +
            cosmic_expansion_force
        )

        p = Particle(position=particle_pos, velocity=initial_velocity, number=i + 1)
        particles.append(p)

    # Reset camera position
    camera.world_position = Vec3(0, BOX_SIZE * 0.2, initial_zoom_value)
    camera.look_at(Vec3(0,0,0))


def start_lucky_draw():
    global simulation_started
    if simulation_started:
        restart_simulation()
        return
    simulation_started = True
    status_output_text.text = 'Spheres are swirling for luck...'
    start_countdown()

def start_countdown():
    global countdown_value
    countdown_value = 10 # Reset countdown
    countdown_text.text = str(countdown_value)
    countdown_text.enabled = True

    def countdown_tick():
        global countdown_value
        countdown_value -= 1
        if countdown_value > 0:
            countdown_text.text = str(countdown_value)
            invoke(countdown_tick, delay=1)
        else:
            countdown_text.text = 'GO!'
            invoke(auto_select_lucky_particles, delay=0.5)

    invoke(countdown_tick, delay=1)

def auto_select_lucky_particles():
    global selected_particles_array, lucky_particle_selected, explosion_active, explosion_start_time

    if not particles:
        show_message_box('No particles to select from!')
        return

    selected_particles_array = []
    # Create a fresh array of available indices for unbiased selection.
    # This ensures every particle has an equal chance of being picked.
    available_indices = list(range(len(particles)))

    for i in range(NUMBER_OF_SELECTED_PARTICLES):
        if not available_indices:
            break

        # Randomly select an index from the available pool.
        # This provides equal probability for all remaining particles.
        random_index = random.randint(0, len(available_indices) - 1)
        # Get the actual particle index and remove it from the available pool.
        # This ensures independence of outcomes and no duplicate selections.
        particle_idx = available_indices.pop(random_index)
        p = particles[particle_idx]
        p.is_selected = True # Mark as selected

        selected_particles_array.append(p)

        # Add text entity for each selected particle
        # Ursina Text entities are usually in screen space, but can be parented to 3D entities
        p.text_entity = Text(
            text=str(p.number),
            parent=p, # Parent to the particle mesh
            scale=0.2, # Adjust scale relative to particle
            color=color.white,
            billboard=True, # Always face the camera
            origin=(0,0,-0.5) # Position slightly in front of the particle
        )
        p.text_entity.z = -0.5 # Ensure it's slightly in front of the sphere

    explosion_active = True
    explosion_start_time = time.time()

    lucky_particle_selected = True
    status_output_text.text = 'Lucky Numbers Selected!'

    selected_numbers_str = ", ".join(str(p.number) for p in selected_particles_array)
    sum_of_numbers = sum(p.number for p in selected_particles_array)

    # Delay displaying the numerology fortune until after the explosion animation
    invoke(lambda: start_lining_up_animation(selected_numbers_str, sum_of_numbers), delay=EXPLOSION_DURATION)


def start_lining_up_animation(selected_numbers_str, sum_of_numbers):
    global is_lining_up, INITIAL_CAMERA_Z_FOR_LINE_UP
    is_lining_up = True
    line_up_start_time = time.time()
    INITIAL_CAMERA_Z_FOR_LINE_UP = camera.world_position.z

    # Animate camera zoom
    camera.animate_z(TARGET_CAMERA_Z, duration=LINE_UP_DURATION, curve=curve.in_out_sine)
    # Animate container (scene) rotation to align with the lined-up particles
    container_entity.animate_rotation(Vec3(0,0,0), duration=LINE_UP_DURATION, curve=curve.in_out_sine)
    
    # Hide countdown text immediately when lining up starts
    countdown_text.enabled = False

    invoke(lambda: finish_lining_up_and_display_fortune(selected_numbers_str, sum_of_numbers), delay=LINE_UP_DURATION)

def finish_lining_up_and_display_fortune(selected_numbers_str, sum_of_numbers):
    global is_lining_up
    is_lining_up = False
    display_numerology_fortune(sum_of_numbers, selected_numbers_str)


def restart_simulation():
    global countdown_value, simulation_started, explosion_active, is_lining_up
    countdown_value = 10 # Reset countdown
    simulation_started = False
    explosion_active = False
    is_lining_up = False
    
    init_game_elements() # Re-initialize particles and scene

# --- Ursina Setup ---
window.title = 'Cosmic Lottery'
window.borderless = False
window.fullscreen = False
window.exit_button.visible = False
window.fps_counter.visible = False
camera.orthographic = False # Ensure perspective camera

# Set initial camera position
initial_zoom_value = 160 # Default zoom from slider
camera.world_position = Vec3(0, BOX_SIZE * 0.2, initial_zoom_value)
camera.look_at(Vec3(0,0,0))

# Background (can be a solid color or an image)
# If you want the futuristic background image, you'd load it here as a Plane
# For simplicity, using a solid black background
Entity(model='quad', scale=1000, z=100, color=color.black, double_sided=True)

# Mouse control for camera rotation (similar to your JS drag)
editor_camera = EditorCamera(enabled=False, rotation_speed=200) # Disable default editor camera

# Custom mouse dragging for the container_entity
mouse_down_pos = None
def on_mouse_down():
    global mouse_down_pos
    if mouse.hovered_entity == cube_wireframe or mouse.hovered_entity == None: # Only drag if hovering cube or empty space
        mouse_down_pos = mouse.position
        container_entity.original_rotation = container_entity.rotation_euler

def on_mouse_drag():
    global mouse_down_pos
    if mouse_down_pos is not None:
        delta_x = mouse.x - mouse_down_pos.x
        delta_y = mouse.y - mouse_down_pos.y

        # Apply rotation to the container entity
        container_entity.rotation_y += delta_x * 200 # Adjust sensitivity
        container_entity.rotation_x -= delta_y * 200 # Adjust sensitivity

def on_mouse_up():
    global mouse_down_pos
    mouse_down_pos = None

mouse_handler = Entity() # Dummy entity to attach mouse events
mouse_handler.on_mouse_down = on_mouse_down
mouse_handler.on_mouse_drag = on_mouse_drag
mouse_handler.on_mouse_up = on_mouse_up


# --- Main Update Loop for Ursina ---
def update():
    global CURRENT_ORBITAL_VELOCITY_FACTOR, CURRENT_GRAVITATIONAL_PULL

    # Auto-rotation of the cube/scene if not dragging and no lucky particle selected
    if not lucky_particle_selected and not mouse_down_pos and not is_lining_up:
        container_entity.rotation_y += AUTO_ROTATION_SPEED * time.dt * 100 # Adjust speed for smooth rotation

        if simulation_started:
            CURRENT_ORBITAL_VELOCITY_FACTOR = min(MAX_ORBITAL_VELOCITY_FACTOR, CURRENT_ORBITAL_VELOCITY_FACTOR + SWIRL_INCREASE_RATE * time.dt)
            CURRENT_GRAVITATIONAL_PULL = min(MAX_GRAVITATIONAL_PULL, CURRENT_GRAVITATIONAL_PULL + SWIRL_INCREASE_RATE * 0.1 * time.dt)

# --- UI Buttons ---
start_button = Button(text='▶️ Start Lucky Draw ▶️', scale=0.2, x=-0.3, y=-0.4, color=color.azure, on_click=start_lucky_draw)
restart_button = Button(text='🔄 Restart Simulation 🔄', scale=0.2, x=0.3, y=-0.4, color=color.magenta, on_click=restart_simulation)

# Initial game setup
init_game_elements()

app.run()
