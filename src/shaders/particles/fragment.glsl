varying vec3 vColor;

void main()
{
    vec2 uv = gl_PointCoord;
    float distanceToCenter = length(uv - vec2(0.5));
    //same result float distanceToCenter = distance(uv,vec2(0.5));
   float alpha = 0.05 / distanceToCenter - 0.1;//We want a value very high at the center and that pluge very fast (0.1 = twice the small number of  0.05) 
    //gl_FragColor = vec4(vec3(1.0), alpha);
    gl_FragColor = vec4(vColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}