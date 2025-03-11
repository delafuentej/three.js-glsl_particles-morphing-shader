import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';
import gsap from 'gsap';
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';

/**
 * PARTICLES MORPHING
 * - We are going to send 2 sets of positions to the vertex shader: 1) initial shape as "position"; 2)targeted shape as "aPositionTarget"
 * - We send the uniform uProgress from 0 to 1 to mix between position-aPositionTarget according to uProgress
 * 1. PATTERN: We want to draw a bright point at the center of the particle & have that point fade out
* 2. LOAD THE MODELS: Models/Objects that have been smoothed, it reduces the amount of data contained in the model
    smoothed geometry results in an indexed geometry => each vertex is unique.
    - we have to put all the code related to the particles in the callback function of load models
3. EXTRACT THE GEOMETRY POSITION FROM THE OBJECTS  (in loaded model). We want the position attribute 
4. MIX POSITIONS
    - We already sendet one set of vertices positon,  the positions attibute & we are going to send another set
    and we are going to mix them between those positions ("position" & "aPositionTarget")
5. BETTER TRANSITION
-   All the particles are starting at the same time, go to their destination at a linear speed and arrive at the same time
-  Then we are going to make them start at a different time, making the animation start slowly, accelerate in the middle, and
slow down when arriving
- To control the dalay before they start, we are going to use a Perlin Nois(Simplex Noise)) => effect pieces of the model  that are separating (getting stretched/bigger)
- OFFSET of PROGRESS in vertex.js according noise:  We need all the particles to be at 1.0 when the progress arrives at 1.0
    - all particles take the same amount of time before they end their animations , but they end the animations at different moments(from 0 to 1) 
    - duration = they all take as much time to finish their animation = 0.4
    - maximum delay should be 0.6 (1- duration(0.4))
    -  end animation = delay + duration
    We are going to calculate two noises for the position and for the aPositionTarget// for the initial shape and the targeted shap
6. ANIMATE THE PROGRESS: 4 BUTTON IN DEBUGGER PANEL. Clickin on any of them will transition the particles to the corresponding shape
This requires:
    -1. Setting the position attribute to the original geometry
    -2. Setting the aPositionTarget attribute to the targeted geometry
    -3. Animate uProgress from 0 to 1
Despite we need to save the current index so that we know from what geometry to another geometry// to remember the last one =>particles.index
-To automatise the transition to a different geometry, we are goint to create a "morph" method on particles & animate with the library gsap
//Unfortunately we cannot send functions with parameters to lil.gui
7. RANDOM SIZE. Random the size of particles.maxCount => attribute aSize
8.COLOR GRADIENT. We are going to mix between two colors and use the perlin as the mix factor
9. BUG FRUSTUM CULLING. It is a feature that we can fing in most real time rendering solutions which prevents rendering
// objects that are not in the view.
In order to know if objects are in the view or not on each frame, three.js calculates a "bounding" = mathematical representation of the object
The bounding can have the shape of a box or a sphere(by default).
Three.js calculate the bounding sphere according to the initial shape(tourus)
We can find the boundingSphere arter creating the Points :
window.requestAnimationFrame(()=> {
    console.log('boundingSphere',particles.points.geometry.boundingSphere);
})
    We have 2 options to fix that: 
    - Recompute the bounding sphere- very difficult to apply
    - Ignoring the frustum culling

 */
/**
 * Base
 */
// Debug
const gui = new GUI({ width: 340 });
const debugObject = {};

// Canvas
const canvas = document.querySelector('canvas.webgl');

// Scene
const scene = new THREE.Scene();

// Loaders
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
};

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

    // Materials
    if(particles !== null) particles.material.uniforms.uResolution.value.set(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio);

    // Update camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(sizes.pixelRatio);
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 0, 8 * 2);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
});

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

debugObject.clearColor = '#000000';
gui.addColor(debugObject, 'clearColor').onChange(() => { renderer.setClearColor(debugObject.clearColor) });
renderer.setClearColor(debugObject.clearColor);



/**
 * Models
 */

let particles = null;

gltfLoader
.load('./models.glb',
    (gltf)=> {
    /**
     * Particles
     */
        particles = {};
        //setting index property (Animate the progress)
        particles.index = 0;
    
        //Positions 
       const positionsArr = gltf.scene.children.map((child) => {
            // to become the position attribute=> BurrerAtribute: child.geometry.attributes.position// count = vertices
            return child.geometry.attributes.position;
        })
        // this positionsArr cointain the vertices of 4 different objects, but none of them
        // have the exact same size(count)
        console.log('positionsArr',positionsArr);

           particles.maxCount = 0;

           for(const position of positionsArr){
            if(position.count > particles.maxCount){
                particles.maxCount = position.count;
            }
           };
          // console.log(particles.maxCount);
           // we need to update the position array, but attributes are made out of the Float32Array
           // create a brand-new Float32Array with the right size
           particles.positions = [];
           for(const position of positionsArr){
            //console.log('position',position);
                const originalArray = position.array;

                const newArray = new Float32Array(particles.maxCount * 3);

                for(let i = 0; i < particles.maxCount; i++){
                    const i3 = i * 3;
                    if(i3 < originalArray.length){
                        newArray[i3 + 0] = originalArray[i3 + 0];//x
                        newArray[i3 + 1] = originalArray[i3 + 1];//y
                        newArray[i3 + 2] = originalArray[i3 + 2]; //z
                    }else{
                        //instead of 0, we are going to pick a random vertex from the originalArray
                        const randomIndex = Math.floor(position.count * Math.random()) * 3;
                        newArray[i3 + 0] = originalArray[randomIndex + 0];
                        newArray[i3 + 1] = originalArray[randomIndex + 1];
                        newArray[i3 + 2] = originalArray[randomIndex + 2];
                    }
                    
                }

                particles.positions.push(new THREE.Float32BufferAttribute(newArray, 3));
           }
          //console.log('particles.position', particles.positions)


// Geometry
//ramdom size particles(7):
const sizesArray = new Float32Array(particles.maxCount);
for(let i = 0; i < particles.maxCount; i++){
    sizesArray[i] = Math.random();
}
// we have to send sizesArray to our geometry as attibute

//particles.geometry = new THREE.SphereGeometry(3);
particles.geometry = new THREE.BufferGeometry();
// set a position attribute; the vertices are unique in the BufferGeometry: one particle per vertex
particles.geometry.setAttribute('position', particles.positions[particles.index]);
particles.geometry.setAttribute('aPositionTarget', particles.positions[3]);
particles.geometry.setAttribute('aSize',new THREE.BufferAttribute(sizesArray, 1));
// despite to the index issue we have to remove the index on the geometry
particles.geometry.setIndex(null); //so we have 1 particle per vertex
console.log('particles', particles)
// Material
particles.color1 = '#00ffcc';//'#ff7300'
particles.color2 = '#9900ff';//'#0091ff'

particles.material = new THREE.ShaderMaterial({
    vertexShader: particlesVertexShader,
    fragmentShader: particlesFragmentShader,
    uniforms:
    {
        uSize: new THREE.Uniform(0.4),
        uResolution: new THREE.Uniform(new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)),
        uProgress: new THREE.Uniform(0),
        uDuration: new THREE.Uniform(0.4),
        uFrecuency: new THREE.Uniform(0.2),
        uColor1: new THREE.Uniform(new THREE.Color(particles.color1)),
        uColor2: new THREE.Uniform(new THREE.Color(particles.color2)),
    },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    
});

// Points
particles.points = new THREE.Points(particles.geometry, particles.material);
particles.points.frustumCulled = false;
scene.add(particles.points);
// to be able to find the boundingSphere:(9)
window.requestAnimationFrame(()=> {
    console.log('boundingSphere',particles.points.geometry.boundingSphere);
})


//Methods
particles.morph = (index) => {
        //update attributes
        particles.geometry.attributes.position = particles.positions[particles.index];
        particles.geometry.attributes.aPositionTarget = particles.positions[index];
        
        // animation of uProgress with gsap
        gsap.fromTo(
            particles.material.uniforms.uProgress,
            {value: 0},
            {value: 1, duration: 3, ease:'linear'}
        );
        // save the current index:
        particles.index = index;
}

for(let i = 0; i < particles.positions.length; i++){
    particles[`morph${i}`] = () => particles.morph(i);
}


// Tweaks

gui.addColor(particles, 'color1').onChange(() => { particles.material.uniforms.uColor1.value.set(particles.color1) });
    gui.addColor(particles, 'color2').onChange(() => { particles.material.uniforms.uColor2.value.set(particles.color2) });
    
gui.add(particles.material.uniforms.uProgress, 'value')
    .min(0)
    .max(1)
    .step(0.001)
    .name('uProgress')
    .listen()

gui.add(particles.material.uniforms.uDuration, 'value')
    .min(0)
    .max(1)
    .step(0.001)
    .name('uDuration')
   

gui.add(particles.material.uniforms.uFrecuency, 'value')
    .min(0)
    .max(1)
    .step(0.001)
    .name('uFrecuency');

const objectsTransformations = gui.addFolder('Transformations')

objectsTransformations.add(particles, 'morph0');
objectsTransformations.add(particles, 'morph1');
objectsTransformations.add(particles, 'morph2');
objectsTransformations.add(particles, 'morph3');

    
});

/**
 * Animate
 */
const tick = () =>
{
    // Update controls
    controls.update();

    // Render normal scene
    renderer.render(scene, camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(tick);
}

tick();