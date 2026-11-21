import * as THREE from "three";

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb8c4bd, 0.00048);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1800);
const keys = {};
const state = { running: false, speed: 0, distance: 0, lateral: 0, lean: 0 };

function makeNoiseTexture(base, speckle, width = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = width;
  const cx = c.getContext("2d");
  cx.fillStyle = base;
  cx.fillRect(0, 0, width, width);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    cx.fillStyle = v > .5 ? speckle : "rgba(0,0,0,.12)";
    cx.globalAlpha = .10 + Math.random() * .16;
    cx.fillRect(Math.random() * width, Math.random() * width, 1 + Math.random() * 2, 1);
  }
  cx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 70);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const asphaltTexture = makeNoiseTexture("#34393a", "#899090");
const grassTexture = makeNoiseTexture("#557b43", "#86a45c");

scene.add(new THREE.HemisphereLight(0xd8efff, 0x52623e, 2.3));
const sun = new THREE.DirectionalLight(0xffefd2, 4.2);
sun.position.set(-180, 260, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -140;
sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140;
sun.shadow.camera.bottom = -140;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 600;
scene.add(sun);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1400, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(0x4d759e) }, horizon: { value: new THREE.Color(0xe9c69b) } },
    vertexShader: "varying vec3 vPos; void main(){vPos=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){float h=smoothstep(-0.12,.55,vPos.y);gl_FragColor=vec4(mix(horizon,top,h),1.0);}",
  })
);
scene.add(sky);

const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf1f2ed, transparent: true, opacity: 0.62, fog: true });
for (let i = 0; i < 18; i++) {
  const cloud = new THREE.Group();
  for (let j = 0; j < 5; j++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(12 + (j % 3) * 4, 10, 7), cloudMat);
    puff.scale.y = 0.28;
    puff.position.set(j * 16 - 32, (j % 2) * 3, 0);
    cloud.add(puff);
  }
  cloud.position.set(-500 + i * 70, 150 + (i % 4) * 18, -500 - (i % 5) * 110);
  scene.add(cloud);
}

function roadCurve(z) {
  return Math.sin(z * 0.0022) * 22 + Math.sin(z * 0.0065 + 1.1) * 7;
}

function makeStrip(width, y, material) {
  const vertices = [], indices = [];
  const steps = 260;
  for (let i = 0; i <= steps; i++) {
    const z = 220 - (2420 * i / steps);
    const x = roadCurve(z);
    vertices.push(x - width, y, z, x + width, y, z);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 2600), new THREE.MeshStandardMaterial({ color: 0x718b50, map: grassTexture, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.12, -900);
ground.receiveShadow = true;
scene.add(ground);

makeStrip(10.4, 0.006, new THREE.MeshStandardMaterial({ color: 0xc8bfa7, roughness: 1 }));
makeStrip(9.35, 0.018, new THREE.MeshPhysicalMaterial({
  color: 0x454b4c,
  map: asphaltTexture,
  roughness: 0.52,
  metalness: 0.08,
  clearcoat: 0.16,
  clearcoatRoughness: 0.48,
}));

const markMat = new THREE.MeshStandardMaterial({ color: 0xf2eedb, roughness: 0.45 });
for (let z = 180; z > -2200; z -= 18) {
  if (Math.floor(z / 18) % 2) continue;
  for (const lane of [-3.1, 3.1]) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 7), markMat);
    mark.position.set(roadCurve(z) + lane, 0.035, z);
    scene.add(mark);
  }
}

// Guard rails and roadside crash barriers
const railMat = new THREE.MeshStandardMaterial({ color: 0xd9dcda, metalness: 0.75, roughness: 0.28 });
for (const side of [-1, 1]) {
  for (let z = 180; z > -2200; z -= 10) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 9.8), railMat);
    rail.position.set(roadCurve(z) + side * 11.1, 0.72, z - 5);
    rail.rotation.y = -(roadCurve(z - 10) - roadCurve(z)) * 0.028;
    rail.castShadow = true;
    scene.add(rail);
  }
  for (let z = 150; z > -2200; z -= 40) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), railMat);
    post.position.set(roadCurve(z) + side * 11.1, 0.45, z);
    post.castShadow = true;
    scene.add(post);
  }
}

// Festival signs and distance boards
const signMat = new THREE.MeshStandardMaterial({ color: 0xf4f1df, roughness: 0.5 });
for (let z = -260; z > -1800; z -= 520) {
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 0.18), signMat);
    sign.position.set(roadCurve(z) + side * 17, 3.2, z);
    sign.rotation.y = side * 0.12;
    sign.castShadow = true;
    scene.add(sign);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(4.7, 0.65, 0.22),
      new THREE.MeshStandardMaterial({ color: side > 0 ? 0xff2d87 : 0x168ed1, roughness: 0.38 })
    );
    panel.position.set(sign.position.x, 3.35, sign.position.z + (side > 0 ? .12 : -.12));
    scene.add(panel);
  }
}

// Distant festival buildings and a coastal city
for (let i = 0; i < 22; i++) {
  const w = 12 + (i * 7 % 16);
  const h = 18 + (i * 29 % 52);
  const d = 12 + (i * 11 % 14);
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: [0xa8b3b3,0x8f9da0,0xc4b5a2,0x7e9699][i % 4], roughness: 0.72, metalness: 0.08 })
  );
  building.position.set(-360 + i * 34, h * .5 - 1, -680 - (i % 3) * 20);
  building.receiveShadow = true;
  building.castShadow = true;
  scene.add(building);
}

for (let i = 0; i < 32; i++) {
  const x = -650 + i * 42 + (i % 3) * 12;
  const h = 55 + (i * 31 % 85);
  const mountain = new THREE.Mesh(
    new THREE.ConeGeometry(38 + (i % 4) * 9, h, 5),
    new THREE.MeshStandardMaterial({ color: i % 2 ? 0x71847a : 0x65776d, roughness: 1 })
  );
  mountain.position.set(x, h * 0.5 - 2, -700 - (i % 5) * 35);
  mountain.receiveShadow = true;
  scene.add(mountain);
}

function makeTree(x, z, scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, 2.8 * scale, 7), new THREE.MeshStandardMaterial({ color: 0x58412d, roughness: 1 }));
  trunk.position.y = 1.4 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry((1.7 - i * .25) * scale, 2.2 * scale, 8),
      new THREE.MeshStandardMaterial({ color: [0x315a3a, 0x3e7046, 0x557b46][i], roughness: 1 })
    );
    crown.position.y = (2.4 + i * 1.05) * scale;
    crown.castShadow = true;
    group.add(crown);
  }
  group.position.set(x, 0, z);
  scene.add(group);
}

for (let z = 120; z > -2100; z -= 24) {
  const side = roadCurve(z);
  makeTree(side + 15 + (Math.abs(Math.sin(z * 7.1)) % 1) * 18, z, 0.75 + (Math.abs(Math.sin(z * 2.3)) % 1) * 0.55);
  if (Math.abs(Math.sin(z * 4.7)) > 0.35) makeTree(side - 15 - (Math.abs(Math.cos(z * 3.1)) % 1) * 18, z - 8, 0.8);
}

const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 900), new THREE.MeshStandardMaterial({ color: 0x3f6f78, roughness: 0.22, metalness: 0.12 }));
ocean.rotation.x = -Math.PI / 2;
ocean.position.set(-500, -0.05, -760);
scene.add(ocean);

function makeCar(color) {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.72, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.75, 7.2), paint);
  body.position.y = 0.95;
  body.castShadow = true;
  car.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.35, 2.3), paint);
  hood.position.set(0, 1.48, -1.9);
  hood.rotation.x = -0.08;
  hood.castShadow = true;
  car.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.25, 1.05, 2.75), new THREE.MeshPhysicalMaterial({ color: 0x182229, metalness: 0.35, roughness: 0.12, clearcoat: 1 }));
  cabin.position.set(0, 1.75, 0.45);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.6 });
  for (const x of [-1.95, 1.95]) for (const z of [-2.35, 2.35]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.48, 18), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.72, z);
    wheel.castShadow = true;
    car.add(wheel);
  }
  const rearLightMat = new THREE.MeshBasicMaterial({ color: 0xff2525 });
  for (const x of [-1.25, 1.25]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.18, 0.05), rearLightMat);
    light.position.set(x, 1.05, 3.62);
    car.add(light);
  }
  car.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return car;
}

const player = makeCar(0xb91d32);
player.position.set(roadCurve(0), 0, 7);
scene.add(player);

const headLights = new THREE.SpotLight(0xddeeff, 4, 55, Math.PI / 8, 0.5, 1.5);
headLights.position.set(0, 1.4, 5);
headLights.target.position.set(0, 0, 30);
player.add(headLights);
player.add(headLights.target);

const traffic = [];
for (let i = 0; i < 8; i++) {
  const car = makeCar([0xe7e9e5, 0x243642, 0xd6a82c, 0x5f6a70][i % 4]);
  car.userData = { z: -80 - i * 95 - Math.random() * 50, lane: [-4.5, 4.5][i % 2], speed: 20 + Math.random() * 12 };
  scene.add(car);
  traffic.push(car);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
addEventListener("keydown", e => {
  keys[e.code] = true;
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
  if (e.code === "Enter" && !state.running) start();
});
addEventListener("keyup", e => { keys[e.code] = false; });

function start() {
  state.running = true;
  document.getElementById("startScreen").classList.add("hidden");
}
document.getElementById("startBtn").addEventListener("click", start);

function drawMap() {
  const map = document.getElementById("map");
  const mctx = map.getContext("2d");
  const w = map.width, h = map.height;
  mctx.clearRect(0, 0, w, h);
  mctx.save();
  mctx.translate(w / 2, h / 2);
  mctx.strokeStyle = "rgba(255,255,255,.8)";
  mctx.lineWidth = 7;
  mctx.lineCap = "round";
  mctx.beginPath();
  for (let i = -70; i <= 70; i += 2) {
    const x = Math.sin((i + state.distance * .002) * .025) * 48;
    const y = -i * 1.35;
    if (i === -70) mctx.moveTo(x, y); else mctx.lineTo(x, y);
  }
  mctx.stroke();
  mctx.restore();
}

let last = performance.now();
function animate(now) {
  const dt = Math.min(.033, (now - last) / 1000);
  last = now;
  if (state.running) {
    const throttle = keys.ArrowUp || keys.KeyW;
    const brake = keys.ArrowDown || keys.KeyS || keys.Space;
    const steer = (keys.ArrowLeft || keys.KeyA ? 1 : 0) + (keys.ArrowRight || keys.KeyD ? -1 : 0);
    if (throttle) state.speed += 42 * dt;
    else state.speed -= 7 * dt;
    if (brake) state.speed -= 75 * dt;
    state.speed = THREE.MathUtils.clamp(state.speed, 0, 92);
    state.distance += state.speed * dt;
    state.lateral += steer * dt * (2.4 + state.speed * .018);
    state.lateral = THREE.MathUtils.clamp(state.lateral, -7.2, 7.2);
    state.lean += ((steer * -.075) - state.lean) * Math.min(1, dt * 5);
  }

  const playerZ = -state.distance;
  const playerX = roadCurve(playerZ) + state.lateral;
  player.position.set(playerX, 0.02, 7 + playerZ);
  player.rotation.z = state.lean;
  player.rotation.y = (roadCurve(playerZ - 4) - roadCurve(playerZ)) * .08 - state.lean * .3;

  for (const car of traffic) {
    car.userData.z += state.speed * dt * .55 - car.userData.speed * dt;
    if (car.userData.z > 35) car.userData.z = -1250 - Math.random() * 300;
    if (car.userData.z < -1500) car.userData.z = 35;
    const z = 7 + playerZ + car.userData.z;
    car.position.set(roadCurve(z) + car.userData.lane, 0.02, z);
  }

  const camZ = playerZ + 15;
  const camX = roadCurve(camZ) + state.lateral * .75;
  camera.position.set(camX, 5.6 + state.speed / 92, camZ);
  const lookZ = playerZ - 28;
  camera.lookAt(roadCurve(lookZ) + state.lateral * .3, 1.5, lookZ);

  sun.position.set(playerX - 180, 260, playerZ + 120);
  sun.target.position.set(playerX, 0, playerZ - 100);
  sun.target.updateWorldMatrix();

  document.getElementById("speed").textContent = String(Math.round(state.speed * 3.6)).padStart(3, "0");
  document.getElementById("gear").textContent = Math.max(1, Math.min(6, Math.ceil(state.speed / 15)));
  document.getElementById("gaugeFill").style.strokeDashoffset = 314 - (state.speed / 92) * 314;
  document.getElementById("distance").textContent = (state.distance / 1000).toFixed(1) + " KM";
  document.getElementById("routeProgress").style.width = (12 + (state.distance % 12000) / 120) % 100 + "%";
  drawMap();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

drawMap();
requestAnimationFrame(animate);
