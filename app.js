import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SelectionHelper } from "three/addons/interactive/SelectionHelper.js";

const REVOLUT_LINK = "https://revolut.me/francelqup";

const GRID_SIZE = 100;
const WORLD_HALF = GRID_SIZE / 2;
const PRICE_PER_VOXEL_EUR = 1;

const selTxt = document.getElementById("selTxt");
const qtyEl = document.getElementById("qty");
const priceEl = document.getElementById("price");
const payBtn = document.getElementById("payBtn");
const clearBtn = document.getElementById("clearBtn");
const depthEl = document.getElementById("depth");
const depthLabel = document.getElementById("depthLabel");

depthLabel.textContent = depthEl.value;
depthEl.addEventListener("input", () => (depthLabel.textContent = depthEl.value));

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(140, 120, 140);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(1, 2, 1);
scene.add(dir);

// Boundary cube
scene.add(
  new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(GRID_SIZE, GRID_SIZE, GRID_SIZE)),
    new THREE.LineBasicMaterial({ color: 0x2e3a48 })
  )
);

// Pick plane (visible + clickable)
const activePlaneZ = 50; // voxel Z slice used for picking
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(activePlaneZ - WORLD_HALF));

const planeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
  new THREE.MeshBasicMaterial({
    color: 0x2b6cb0, transparent: true, opacity: 0.22, side: THREE.DoubleSide
  })
);
planeMesh.position.set(0, 0, activePlaneZ - WORLD_HALF);
scene.add(planeMesh);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function screenToWorldOnPlane(clientX, clientY) {
  mouse.x = (clientX / innerWidth) * 2 - 1;
  mouse.y = -(clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(pickPlane, p) ? p : null;
}

function worldToVoxel(p) {
  const x = clamp(Math.floor(p.x + WORLD_HALF), 0, GRID_SIZE - 1);
  const y = clamp(Math.floor(p.y + WORLD_HALF), 0, GRID_SIZE - 1);
  const z = clamp(Math.floor(p.z + WORLD_HALF), 0, GRID_SIZE - 1);
  return { x, y, z };
}

let current = null;

function setSelection(min, max) {
  const dx = max.x - min.x + 1;
  const dy = max.y - min.y + 1;
  const dz = max.z - min.z + 1;
  const qty = dx * dy * dz;
  const price = qty * PRICE_PER_VOXEL_EUR;

  current = { min, max, qty, price };
  selTxt.textContent = `${min.x},${min.y},${min.z} → ${max.x},${max.y},${max.z}`;
  qtyEl.textContent = String(qty);
  priceEl.textContent = `€${price}`;
  payBtn.disabled = qty <= 0;
}

function clearSelection() {
  current = null;
  selTxt.textContent = "None";
  qtyEl.textContent = "0";
  priceEl.textContent = "€0";
  payBtn.disabled = true;
}
clearBtn.addEventListener("click", clearSelection);

payBtn.addEventListener("click", async () => {
  if (!current) return;

  const note =
    `VoxelDollarPage | ${current.qty} voxel(s) | Block ` +
    `${current.min.x},${current.min.y},${current.min.z}→${current.max.x},${current.max.y},${current.max.z} | €${current.price}`;

  try { await navigator.clipboard.writeText(note); } catch {}

  alert(
    `Revolut will open in a new tab.\n\n` +
    `1) Send €${current.price}\n` +
    `2) Paste the note (already copied)\n` +
    `3) Then submit your logo + link on buy.html`
  );

  window.open(REVOLUT_LINK, "_blank", "noopener,noreferrer");
  window.location.href = "./buy.html";
});

// Drag helper (rectangle only)
const helper = new SelectionHelper(renderer, "selectBox");
let dragging = false;
let dragStart = null;
let dragEnd = null;

renderer.domElement.addEventListener("click", (e) => {
  if (dragging) return;
  const p = screenToWorldOnPlane(e.clientX, e.clientY);
  if (!p) return;
  const v = worldToVoxel(p);
  setSelection(v, v);
});

renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  helper.onSelectStart(e);
  dragStart = { x: e.clientX, y: e.clientY };
  dragEnd = null;
});

renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  helper.onSelectMove(e);
  dragEnd = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  helper.onSelectOver(e);

  if (!dragStart || !dragEnd) { dragging = false; return; }

  const a = screenToWorldOnPlane(dragStart.x, dragStart.y);
  const b = screenToWorldOnPlane(dragEnd.x, dragEnd.y);

  dragging = false;
  dragStart = null;
  dragEnd = null;

  if (!a || !b) return;

  const va = worldToVoxel(a);
  const vb = worldToVoxel(b);

  const minXY = { x: Math.min(va.x, vb.x), y: Math.min(va.y, vb.y) };
  const maxXY = { x: Math.max(va.x, vb.x), y: Math.max(va.y, vb.y) };

  const depth = parseInt(depthEl.value, 10);
  const z0 = clamp(activePlaneZ, 0, GRID_SIZE - 1);
  const z1 = clamp(z0 + depth - 1, 0, GRID_SIZE - 1);

  const min = { x: minXY.x, y: minXY.y, z: Math.min(z0, z1) };
  const max = { x: maxXY.x, y: maxXY.y, z: Math.max(z0, z1) };

  setSelection(min, max);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
