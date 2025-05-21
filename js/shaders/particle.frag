uniform float time;
uniform float phase;
varying float vOpacity;
varying vec3 vColor;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    // Calculate distance from center of point sprite
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Base particle shape with soft edges
    float alpha = smoothstep(0.5, 0.45, dist);
    
    // Enhanced glow effect based on phase
    float glowStrength = 1.0;
    if (phase > 1.0) { // Stronger glow during blackhole phase
        glowStrength = 2.0;
    }
    float glow = exp(-dist * 4.0) * glowStrength;
    
    // Convert HSV color to RGB with time-based animation
    vec3 baseColor = hsv2rgb(vColor);
    vec3 glowColor = hsv2rgb(vec3(vColor.x, vColor.y * 0.5, vColor.z * 1.5));
    vec3 finalColor = mix(glowColor, baseColor, glow);
    
    // Add sparkle effect during transitions
    if (phase > 0.0) {
        float sparkle = pow(sin(time * 10.0 + dist * 20.0) * 0.5 + 0.5, 3.0);
        finalColor += vec3(sparkle) * 0.2;
    }
    
    // Apply opacity from vertex shader with smooth fade
    gl_FragColor = vec4(finalColor, alpha * vOpacity);
}
