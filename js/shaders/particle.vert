uniform float time;
uniform vec3 center;
uniform float phase; // 0: floating, 1: swirling, 2: blackhole, 3: clashing, 4: lining up
uniform float phaseProgress;
uniform vec3 targetPosition;
varying float vOpacity;
varying vec3 vColor;
attribute float particleIndex;

// Easing functions
float easeInOutCubic(float t) {
    return t < 0.5 
        ? 4.0 * t * t * t 
        : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

float easeInExpo(float t) {
    return t == 0.0 ? 0.0 : pow(2.0, 10.0 * t - 10.0);
}

void main() {
    vec3 pos = position;
    vOpacity = 1.0;
    float distToCenter = distance(pos, center);
    
    // Phase-specific transformations
    if (phase > 0.0) { // Swirling
        float swirl = easeInOutCubic(phaseProgress);
        float angle = time * (2.0 - distToCenter * 0.01) + swirl * 3.14159;
        float radius = distToCenter * (1.0 - swirl * 0.3);
        
        // Apply spiral motion
        pos.x = cos(angle) * radius;
        pos.z = sin(angle) * radius;
        pos.y *= (1.0 - swirl * 0.5);
    }
    
    if (phase > 1.0) { // Blackhole
        float collapse = easeInExpo(phaseProgress);
        float pullStrength = collapse * 2.0;
        vec3 toCenter = normalize(center - pos);
        pos += toCenter * (distToCenter * pullStrength);
        
        // Add dramatic spiral effect
        float spiral = time * 5.0 * collapse;
        mat2 rotMat = mat2(cos(spiral), -sin(spiral), sin(spiral), cos(spiral));
        pos.xz = rotMat * pos.xz;
        
        // Fade out non-selected particles
        if (particleIndex < 0.5) {
            vOpacity = 1.0 - collapse;
        }
    }
    
    if (phase > 2.0) { // Clashing/Explosion
        if (particleIndex < 0.5) {
            // Non-selected particles explode outward
            vec3 explosionDir = normalize(pos - center);
            pos += explosionDir * (50.0 * easeInExpo(phaseProgress));
            vOpacity = 1.0 - phaseProgress;
        } else {
            // Selected particles move toward center
            pos = mix(pos, center, easeInOutCubic(phaseProgress));
        }
    }
    
    if (phase > 3.0) { // Lining up
        if (particleIndex > 0.5) {
            // Move selected particles to their final positions
            pos = mix(pos, targetPosition, easeInOutCubic(phaseProgress));
        }
    }
    
    // Calculate final position
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Dynamic point size based on distance and phase
    float size = 2.0;
    if (phase > 1.0) { // Larger points during blackhole phase
        size *= 1.0 + easeInExpo(phaseProgress);
    }
    size *= (300.0 / -mvPosition.z);
    
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
    
    // Pass color variations to fragment shader
    float hue = 0.75 + sin(time + distToCenter * 0.1) * 0.1;
    float saturation = 0.7;
    float brightness = 0.6 + sin(time * 2.0) * 0.1;
    vColor = vec3(hue, saturation, brightness);
}
