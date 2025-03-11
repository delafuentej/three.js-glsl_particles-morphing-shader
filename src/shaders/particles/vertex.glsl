uniform vec2 uResolution;
uniform float uSize;
uniform float uProgress;
uniform float uDuration;
uniform float uFrecuency;
uniform vec3 uColor1;
uniform vec3 uColor2;

attribute vec3 aPositionTarget;
attribute float aSize;

varying vec3 vColor;

#include ../includes/simplexNoise3d.glsl


void main()
{
    // we are goint to mix the initial position with position target
    float noiseOrigin = simplexNoise3d(position * uFrecuency);// we have to send noise to the color trough varyings
    float noiseTarget = simplexNoise3d(aPositionTarget * uFrecuency);
    float noise = mix(noiseOrigin, noiseTarget, uProgress);
    noise = smoothstep(-1.0, 1.0, noise);// (-1,1) remap it to (0,1)


    float duration = uDuration;
    float delay = (1.0 - duration) * noise;
    float end = delay + duration;

    //float progress = uProgress; // than we have to offset the progress according that noise=> remap the progress:
    float progress = uProgress;
    progress = smoothstep(delay, end, progress);
    vec3 mixedPosition = mix(position, aPositionTarget, progress);
    // Final position
   // vec4 modelPosition = modelMatrix * vec4(position, 1.0);
   vec4 modelPosition = modelMatrix * vec4(mixedPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Point size
    gl_PointSize = aSize * uSize * uResolution.y;
    gl_PointSize *= (1.0 / - viewPosition.z);

    //Varyings
   // vColor = vec3(noise);
   vColor = mix(uColor1, uColor2, noise);
}