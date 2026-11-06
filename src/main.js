import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_YAW = 0; // turn the model so its front faces the driving direction

// ---------- Scene, camera, renderer ----------
const scene = new THREE.Scene();
const FOG = 0x8a5a3c; // brownish dusty haze
scene.fog = new THREE.FogExp2(FOG, 0.012);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft shadows (blurred with shadow.radius)
renderer.toneMapping = THREE.ACESFilmicToneMapping; // cinematic colors
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

// ---------- Twilight sky (gradient dome) ----------
const SUN_DIR = new THREE.Vector3(0.3, 0.1, 1).normalize(); // low sun = twilight
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 dir = normalize(vDir); // per-pixel direction: smooth glow
        float h = clamp(dir.y, 0.0, 1.0);
        vec3 horizon = vec3(0.78, 0.50, 0.30);   // warm dusty horizon
        vec3 zenith  = vec3(0.22, 0.13, 0.10);   // dark brown sky above
        vec3 col = mix(horizon, zenith, pow(h, 0.5));
        float s = max(dot(dir, sunDir), 0.0);
        col += vec3(0.55, 0.65, 0.85) * pow(s, 60.0) * 0.6; // Mars blue sunset halo
        col += vec3(1.0, 0.75, 0.5) * pow(s, 6.0) * 0.35;   // warm glow
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
scene.add(sky);

// Sun disc (small and pale, as seen from Mars)
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(16, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff2dd, fog: false })
);
scene.add(sunDisc);

// The two moons: Phobos (bigger, closer) and Deimos (tiny)
function moon(size, color) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size, 16, 12),
    new THREE.MeshBasicMaterial({ color, fog: false })
  );
  scene.add(m);
  return m;
}
const phobos = moon(7, 0xbfae9c);
phobos.scale.set(1.3, 1, 1); // Phobos is potato-shaped
const deimos = moon(3, 0xd8cbbb);

// ---------- Warm, soft lights ----------
scene.add(new THREE.HemisphereLight(0xffb98a, 0x4a2414, 1.0));
const sun = new THREE.DirectionalLight(0xffb070, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6;
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 200 });
scene.add(sun, sun.target);

// ---------- Terrain: dunes + rolling hills ----------
function hill(x, z) {
  const rolling = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 4;
  // dunes: sharp-crested ridges along one wind direction
  const d = x * 0.8 + z * 0.6;
  const dunes = Math.pow(Math.abs(Math.sin(d * 0.08 + Math.sin(z * 0.03) * 2)), 3) * 3;
  const ripples = Math.sin(d * 1.3) * 0.05;
  const flat = Math.min(Math.hypot(x, z) / 25, 1); // flatter near the start
  return (rolling + dunes) * flat + ripples;
}
const groundGeo = new THREE.PlaneGeometry(600, 600, 300, 300);
groundGeo.rotateX(-Math.PI / 2);
const pos = groundGeo.attributes.position;
const colors = [];
const c = new THREE.Color();
for (let i = 0; i < pos.count; i++) {
  const y = hill(pos.getX(i), pos.getZ(i));
  pos.setY(i, y);
  c.setHSL(0.055, 0.6, 0.30 + y * 0.025 + Math.random() * 0.03); // lighter dune crests
  colors.push(c.r, c.g, c.b);
}
groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

// ---------- Distant mesas / buttes on the horizon ----------
const mesaMat = new THREE.MeshStandardMaterial({ color: 0x6b3620, roughness: 1, flatShading: true });
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
  const r = 180 + Math.random() * 80;
  const h = 15 + Math.random() * 30;
  const mesa = new THREE.Mesh(new THREE.CylinderGeometry(20 + Math.random() * 25, 35 + Math.random() * 30, h, 7), mesaMat);
  mesa.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
  scene.add(mesa);
}

// ---------- Rocks (small, medium and boulders) ----------
const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a2c18, roughness: 1, flatShading: true });
for (let i = 0; i < 400; i++) {
  const big = Math.random() < 0.08;
  const r = big ? Math.random() * 2 + 1 : Math.random() * 0.6 + 0.08;
  const geo = new THREE.DodecahedronGeometry(r, 1);
  const p = geo.attributes.position; // make each rock lumpy
  const seed = Math.random() * 100;
  // same corner -> same bump, so faces stay closed (no torn spikes)
  const bump = (x, y, z) => 0.8 + 0.25 * Math.sin(x * 5 + seed) * Math.cos(z * 4 + y * 3 + seed);
  for (let j = 0; j < p.count; j++) {
    const x = p.getX(j), y = p.getY(j), z = p.getZ(j), k = bump(x / r, y / r, z / r);
    p.setXYZ(j, x * k, y * k * 0.6, z * k);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, rockMat);
  const x = (Math.random() - 0.5) * 300, z = (Math.random() - 0.5) * 300;
  if (Math.hypot(x, z) < 8) continue; // keep the start area clear
  rock.position.set(x, hill(x, z) + r * 0.1, z);
  rock.rotation.y = Math.random() * 6;
  rock.castShadow = rock.receiveShadow = true;
  scene.add(rock);
}

// ---------- Floating dust ----------
const DUST = 3000;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 120;
  dustPos[i * 3 + 1] = Math.random() * 20;
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd9a070, size: 0.12, transparent: true, opacity: 0.5, depthWrite: false }));
scene.add(dust);

// ---------- Perseverance rover: real NASA 3D model at real scale ----------
// Real size: about 3.0 m long, 2.7 m wide, 2.2 m tall.
const REAL_LENGTH = 3.0;
const rover = new THREE.Group();   // moves and turns
scene.add(rover);
const chassis = new THREE.Group(); // tilts with the slope
rover.add(chassis);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(new DRACOLoader().setDecoderPath('/draco/')); // the model is Draco-compressed
gltfLoader.load('/models/perseverance.glb', (gltf) => {
  const model = gltf.scene;
  model.rotation.y = MODEL_YAW;
  // scale so the longest horizontal side is the real length
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(REAL_LENGTH / Math.max(size.x, size.z));
  // center it and put the wheels on the ground (y = 0)
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  chassis.add(model);

  const s = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  console.log(`Perseverance loaded: ${s.x.toFixed(2)} x ${s.y.toFixed(2)} x ${s.z.toFixed(2)} m`);
  // camera pieces, to use later
  const cams = [];
  model.traverse((o) => { if (/cam|watson/i.test(o.name) && !/bracket|cover|wiring/i.test(o.name)) cams.push(o.name); });
  console.log('Rover cameras:', cams.join(', '));
});

// ---------- Wheel tracks left in the sand ----------
let speed = 0, heading = 0;
const MAX_TRACKS = 6000;
const trackGeo = new THREE.PlaneGeometry(0.4, 0.3);
trackGeo.rotateX(-Math.PI / 2);
const tracks = new THREE.InstancedMesh(trackGeo, new THREE.MeshStandardMaterial({
  color: 0x4a1e0c, roughness: 1, transparent: true, opacity: 0.75,
  polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
}), MAX_TRACKS);
tracks.count = 0;
tracks.receiveShadow = true;
scene.add(tracks);
let trackIndex = 0, distSinceTrack = 0;
const tmp = new THREE.Object3D();
// find the real ground height (the mesh), not just the formula
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
function groundY(x, z) {
  ray.set(new THREE.Vector3(x, 50, z), DOWN);
  const hit = ray.intersectObject(ground)[0];
  return hit ? hit.point.y : hill(x, z);
}
function dropTracks() {
  for (const side of [-1, 1]) {
    const x = rover.position.x + Math.cos(heading) * side * 1.1;
    const z = rover.position.z - Math.sin(heading) * side * 1.1;
    tmp.position.set(x, groundY(x, z) + 0.02, z);
    tmp.rotation.set(0, heading, 0);
    tmp.updateMatrix();
    tracks.setMatrixAt(trackIndex, tmp.matrix);
    trackIndex = (trackIndex + 1) % MAX_TRACKS;
    tracks.count = Math.min(tracks.count + 1, MAX_TRACKS);
  }
  tracks.instanceMatrix.needsUpdate = true;
}

// ---------- Keyboard driving ----------
const keys = {};
addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));


const camPos = new THREE.Vector3(0, 4, -10);
const stats = document.getElementById('stats');
const timer = new THREE.Timer();

function animate() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  const fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
  const turn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0);

  speed += (fwd * 6 - speed) * dt * 2;          // smooth acceleration
  heading += turn * dt * 1.2 * (Math.abs(speed) > 0.1 ? Math.sign(speed) : 1);

  rover.rotation.y = heading;
  rover.position.x += Math.sin(heading) * speed * dt;
  rover.position.z += Math.cos(heading) * speed * dt;
  rover.position.y = groundY(rover.position.x, rover.position.z);

  // tilt the rover to follow the slope
  const ahead = groundY(rover.position.x + Math.sin(heading), rover.position.z + Math.cos(heading));
  chassis.rotation.x = -Math.atan(ahead - rover.position.y);

  distSinceTrack += Math.abs(speed) * dt;
  if (distSinceTrack > 0.3) { distSinceTrack = 0; dropTracks(); }

  // follow camera
  const target = new THREE.Vector3(-Math.sin(heading) * 10, 4, -Math.cos(heading) * 10).add(rover.position);
  target.y = Math.max(target.y, hill(target.x, target.z) + 2);
  camPos.lerp(target, dt * 3);
  camera.position.copy(camPos);
  camera.lookAt(rover.position.x, rover.position.y + 3.5, rover.position.z);

  // sky objects follow the camera so they always look far away
  sky.position.copy(camera.position);
  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 800);
  sunDisc.lookAt(camera.position);
  const pa = t * 0.01; // Phobos slowly drifts across the sky
  phobos.position.copy(camera.position).add(new THREE.Vector3(-250 + Math.sin(pa) * 60, 230, 650));
  deimos.position.copy(camera.position).add(new THREE.Vector3(120, 300, 650));

  // sun light follows the rover for sharp-but-soft shadows nearby
  sun.position.copy(rover.position).addScaledVector(SUN_DIR, 100);
  sun.target.position.copy(rover.position);

  // dust drifts with the wind and stays around the rover
  const dp = dust.geometry.attributes.position;
  for (let i = 0; i < DUST; i++) {
    let x = dp.getX(i) + dt * 1.5, y = dp.getY(i) + Math.sin(t + i) * dt * 0.2, z = dp.getZ(i) + dt * 0.8;
    if (x - rover.position.x > 60) x -= 120;
    if (x - rover.position.x < -60) x += 120;
    if (z - rover.position.z > 60) z -= 120;
    if (z - rover.position.z < -60) z += 120;
    dp.setXYZ(i, x, y, z);
  }
  dp.needsUpdate = true;

  stats.textContent = `Speed: ${speed.toFixed(1)} m/s · X: ${rover.position.x.toFixed(0)} Z: ${rover.position.z.toFixed(0)}`;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
