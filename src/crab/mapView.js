import { element } from './workbench.js';
import { reefShareAt, CAMP, HOLD } from './world.js';

const CANVAS_PIXELS = 768;
const TERRAIN_CELLS = 320;
const FOG_CELLS = 192;
const MIN_EXTENT = 40;
const FOG_EDGE_BLUR_PIXELS = 7;
const CONTOUR_STEP = 1.2;
const WET_BAND = 0.8;
const CRAB_LENGTH = 2;
const SCALE_BAR_CRAB_LENGTHS = 10;
const LABEL_LIFT_PIXELS = 30;

const DEEP_WATER = [34, 86, 116];
const SHALLOW_WATER = [96, 170, 180];
const REEF_WATER = [176, 122, 134];
const DRY_SAND = [226, 202, 154];
const WET_SAND = [186, 162, 120];
const CAMP_GROUND = [198, 168, 120];
const HOLD_PLANKS = [152, 110, 72];
const ROCK = [132, 124, 114];
const SHORE_LINE = [46, 64, 70];
const LIGHT_DIRECTION = normalize([-0.55, 0.75, -0.55]);

const LANDMARKS = [
  { label: 'The reef', x: 0, z: 82 },
  { label: "Ship's hold", x: HOLD.x, z: HOLD.z },
  { label: 'Pirate camp', x: CAMP.x, z: CAMP.z },
];

function normalize(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

const mix = (from, to, share) => from.map((value, index) => value + (to[index] - value) * share);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function createMapView(root, { world, fog, halfSize, waterLevel, cameraYaw, onClose }) {
  const overlay = element('div', 'workbench map-panel', root);
  const card = element('div', 'workbench-card map-card', overlay);
  const canvas = element('canvas', 'map-canvas', card);
  canvas.width = canvas.height = CANVAS_PIXELS;
  const side = element('div', 'map-side', card);
  const header = element('div', 'workbench-header', side);
  element('div', 'workbench-title', header, 'Map');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close map');
  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });
  const legend = element('div', 'map-legend', side);
  for (const [className, text] of [['you', 'You'], ['door', 'Burrow exits'], ['remains', 'Your remains'], ['looter', 'Stolen gear'], ['rack', 'Drying rack'], ['boss', 'Boss lair']]) {
    const entry = element('span', 'map-legend-entry', legend);
    element('span', `map-key ${className}`, entry);
    element('span', '', entry, text);
  }
  const context = canvas.getContext('2d');
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = terrainCanvas.height = TERRAIN_CELLS;
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = fogCanvas.height = FOG_CELLS;
  const revealedCanvas = document.createElement('canvas');
  revealedCanvas.width = revealedCanvas.height = CANVAS_PIXELS;
  let terrainFrameKey = null;

  let extent = halfSize;
  let center = { x: 0, z: 0 };
  const forward = { x: -Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
  const right = { x: -forward.z, z: forward.x };
  const worldAt = (shareAcross, shareDown) => {
    const across = (shareAcross * 2 - 1) * extent;
    const up = (1 - shareDown * 2) * extent;
    return { x: center.x + across * right.x + up * forward.x, z: center.z + across * right.z + up * forward.z };
  };
  const toPixel = (point) => {
    const across = (point.x - center.x) * right.x + (point.z - center.z) * right.z;
    const up = (point.x - center.x) * forward.x + (point.z - center.z) * forward.z;
    return { x: (across / extent + 1) / 2 * CANVAS_PIXELS, y: (1 - up / extent) / 2 * CANVAS_PIXELS };
  };
  const pixelsPerUnit = () => CANVAS_PIXELS / (extent * 2);
  const insideWorld = (point) => Math.abs(point.x) <= halfSize && Math.abs(point.z) <= halfSize;
  const screenAngleOf = (worldX, worldZ) => Math.atan2(-(worldX * forward.x + worldZ * forward.z), worldX * right.x + worldZ * right.z);

  function sampleTerrain() {
    const size = TERRAIN_CELLS + 2;
    const heights = new Float32Array(size * size);
    const waterLevels = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const point = worldAt((column - 0.5) / TERRAIN_CELLS, (row - 0.5) / TERRAIN_CELLS);
        const index = row * size + column;
        heights[index] = insideWorld(point) ? world.heightAt(point.x, point.z) : -10;
        waterLevels[index] = world.waterLevelAt(point.x, point.z, waterLevel);
      }
    }
    return { size, heights, waterLevels };
  }

  function landColorAt(point, height, waterHeight) {
    if (world.isInHold(point.x, point.z)) {
      return mix(HOLD_PLANKS, [118, 82, 52], Math.abs(Math.sin(point.z * 0.9)) > 0.93 ? 1 : 0);
    }
    if (!world.isWalkable(point.x, point.z)) return ROCK;
    if (world.isInCamp(point.x, point.z)) return CAMP_GROUND;
    return height < waterHeight + WET_BAND ? WET_SAND : DRY_SAND;
  }

  function buildTerrain() {
    const { size, heights, waterLevels } = sampleTerrain();
    const terrainContext = terrainCanvas.getContext('2d');
    const image = terrainContext.createImageData(TERRAIN_CELLS, TERRAIN_CELLS);
    const unitsPerCell = (extent * 2) / TERRAIN_CELLS;
    const isWater = (index) => heights[index] < waterLevels[index];
    for (let row = 0; row < TERRAIN_CELLS; row++) {
      for (let column = 0; column < TERRAIN_CELLS; column++) {
        const index = (row + 1) * size + column + 1;
        const point = worldAt((column + 0.5) / TERRAIN_CELLS, (row + 0.5) / TERRAIN_CELLS);
        const height = heights[index];
        let color;
        if (!insideWorld(point)) color = DEEP_WATER;
        else if (isWater(index)) {
          const depth = waterLevels[index] - height;
          color = mix(SHALLOW_WATER, DEEP_WATER, clamp01(depth / 3.2));
          if (point.z > 40 && reefShareAt(point.x, point.z) > 0.5) color = mix(color, REEF_WATER, 0.42);
          const ripple = Math.abs(((depth + 0.15 * Math.sin(point.x * 0.4 + point.z * 0.3)) % 0.9) - 0.45);
          if (ripple < 0.05 && depth < 2.6) color = mix(color, [235, 245, 245], 0.18);
          const nearShore = [index - 1, index + 1, index - size, index + size].some((neighbour) => !isWater(neighbour));
          if (nearShore) color = SHORE_LINE;
        } else {
          color = landColorAt(point, height, waterLevels[index]);
          const slopeAcross = (heights[index + 1] - heights[index - 1]) / (2 * unitsPerCell);
          const slopeDown = (heights[index + size] - heights[index - size]) / (2 * unitsPerCell);
          const normal = normalize([-slopeAcross, 1, slopeDown]);
          const light = normal[0] * LIGHT_DIRECTION[0] + normal[1] * LIGHT_DIRECTION[1] + normal[2] * LIGHT_DIRECTION[2];
          color = color.map((value) => value * (0.62 + 0.5 * clamp01(light)));
          const band = Math.floor(height / CONTOUR_STEP);
          if (band !== Math.floor(heights[index + 1] / CONTOUR_STEP) || band !== Math.floor(heights[index + size] / CONTOUR_STEP)) color = color.map((value) => value * 0.84);
        }
        const grain = ((column * 7919 + row * 104729) % 17) / 17 - 0.5;
        image.data.set([...color.map((value) => value + grain * 7), 255], (row * TERRAIN_CELLS + column) * 4);
      }
    }
    terrainContext.putImageData(image, 0, 0);
  }

  function buildFogMask() {
    const fogContext = fogCanvas.getContext('2d');
    const image = fogContext.createImageData(FOG_CELLS, FOG_CELLS);
    for (let row = 0; row < FOG_CELLS; row++) {
      for (let column = 0; column < FOG_CELLS; column++) {
        const point = worldAt((column + 0.5) / FOG_CELLS, (row + 0.5) / FOG_CELLS);
        image.data[(row * FOG_CELLS + column) * 4 + 3] = fog.isRevealed(point.x, point.z) ? 255 : 0;
      }
    }
    fogContext.putImageData(image, 0, 0);
  }

  const revealed = (point) => fog.isRevealed(point.x, point.z);

  function blob(point, radius, fill, stroke, wobbleSeed = 0) {
    const pixel = toPixel(point);
    const pixelRadius = Math.max(2.5, radius * pixelsPerUnit());
    context.beginPath();
    for (let step = 0; step <= 12; step++) {
      const angle = (step / 12) * Math.PI * 2;
      const wobble = 1 + 0.12 * Math.sin(angle * 3 + wobbleSeed);
      const x = pixel.x + Math.cos(angle) * pixelRadius * wobble;
      const y = pixel.y + Math.sin(angle) * pixelRadius * wobble * 0.86;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 1.5;
      context.stroke();
    }
  }

  function box(point, width, depth, heading, fill, stroke) {
    const pixel = toPixel(point);
    const scale = pixelsPerUnit();
    context.save();
    context.translate(pixel.x, pixel.y);
    context.rotate(screenAngleOf(Math.sin(heading), Math.cos(heading)) + Math.PI / 2);
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = 1.5;
    const pixelWidth = Math.max(4, width * scale);
    const pixelDepth = Math.max(4, depth * scale);
    context.fillRect(-pixelWidth / 2, -pixelDepth / 2, pixelWidth, pixelDepth);
    context.strokeRect(-pixelWidth / 2, -pixelDepth / 2, pixelWidth, pixelDepth);
    context.restore();
  }

  function drawRocksAndLogs() {
    for (const boulder of world.boulders) {
      if (!revealed(boulder)) continue;
      blob({ x: boulder.x + 0.8, z: boulder.z - 0.8 }, boulder.radius, 'rgba(40, 34, 28, 0.35)', null, boulder.seed);
      blob(boulder, boulder.radius, '#8f877c', '#4b4540', boulder.seed);
      blob({ x: boulder.x - boulder.radius * 0.25, z: boulder.z + boulder.radius * 0.25 }, boulder.radius * 0.45, 'rgba(255, 255, 255, 0.16)', null, boulder.seed + 1);
    }
    for (const log of world.logs) {
      if (!revealed(log)) continue;
      const half = log.length / 2;
      const from = toPixel({ x: log.x - Math.sin(log.heading) * half, z: log.z - Math.cos(log.heading) * half });
      const to = toPixel({ x: log.x + Math.sin(log.heading) * half, z: log.z + Math.cos(log.heading) * half });
      context.lineCap = 'round';
      context.strokeStyle = '#4a3220';
      context.lineWidth = Math.max(5, log.radius * 2 * pixelsPerUnit() + 3);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.strokeStyle = '#8a6440';
      context.lineWidth = Math.max(3, log.radius * 2 * pixelsPerUnit());
      context.stroke();
    }
  }

  function drawReefLife() {
    const colours = ['#e58aa0', '#f2a86b', '#9ad0c2', '#c9a0e0', '#7fb46a'];
    const groups = Array.isArray(world.reefProps) ? [world.reefProps] : Object.values(world.reefProps || {});
    for (const [groupIndex, group] of groups.entries()) {
      for (const prop of group) {
        if (!revealed(prop)) continue;
        blob(prop, Math.min(prop.radius || 1, 3), colours[groupIndex % colours.length], 'rgba(30, 40, 50, 0.5)', prop.seed || 0);
      }
    }
  }

  function drawCampAndHold() {
    for (const prop of [...world.campProps, ...world.holdProps]) {
      if (!revealed(prop)) continue;
      const heading = prop.heading || 0;
      switch (prop.kind) {
        case 'tent':
          box(prop, prop.width, prop.width * 0.7, heading, '#c9b48a', '#5a4630');
          break;
        case 'crate':
        case 'chest':
          box(prop, prop.size || prop.width, prop.size || prop.depth, heading, '#9a7046', '#3e2a18');
          break;
        case 'campfire':
        case 'hearth':
          blob(prop, prop.radius, '#e8743a', '#5a2410');
          blob(prop, prop.radius * 0.45, '#ffd06a', null);
          break;
        case 'barrel':
        case 'barrelLying':
          blob(prop, prop.radius, '#8a5a34', '#3a2414');
          break;
        default:
          blob(prop, Math.min(prop.radius || (prop.length || 4) / 3, 4), '#b8a888', '#4a4030');
      }
    }
  }

  function drawLabels() {
    context.font = `italic 600 ${Math.round(CANVAS_PIXELS / 30)}px Georgia, 'Times New Roman', serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const landmark of LANDMARKS) {
      if (!revealed(landmark)) continue;
      const pixel = toPixel(landmark);
      pixel.y -= LABEL_LIFT_PIXELS;
      context.lineWidth = 4;
      context.strokeStyle = 'rgba(250, 238, 210, 0.85)';
      context.strokeText(landmark.label, pixel.x, pixel.y);
      context.fillStyle = '#4a3420';
      context.fillText(landmark.label, pixel.x, pixel.y);
    }
  }

  function marker(point, radius, fill, stroke) {
    const pixel = toPixel(point);
    context.beginPath();
    context.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 3;
    context.stroke();
  }

  function drawBoss(point) {
    const pixel = toPixel(point);
    marker(point, 13, '#2a1a1a', '#e2533c');
    context.fillStyle = '#f4ead8';
    context.beginPath();
    context.arc(pixel.x, pixel.y - 2, 7, 0, Math.PI * 2);
    context.fill();
    context.fillRect(pixel.x - 4, pixel.y + 3, 8, 5);
    context.fillStyle = '#2a1a1a';
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(pixel.x + side * 3, pixel.y - 2, 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRemains(point) {
    const pixel = toPixel(point);
    marker(point, 11, '#e8e2d4', '#3a1010');
    context.strokeStyle = '#3a1010';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(pixel.x - 5, pixel.y - 5);
    context.lineTo(pixel.x + 5, pixel.y + 5);
    context.moveTo(pixel.x + 5, pixel.y - 5);
    context.lineTo(pixel.x - 5, pixel.y + 5);
    context.stroke();
  }

  function drawLooter(point) {
    const pixel = toPixel(point);
    marker(point, 11, '#2a1a1a', '#f2c94c');
    context.fillStyle = '#f2c94c';
    context.beginPath();
    for (let corner = 0; corner < 10; corner++) {
      const radius = corner % 2 ? 3 : 7;
      const angle = -Math.PI / 2 + (corner * Math.PI) / 5;
      context.lineTo(pixel.x + Math.cos(angle) * radius, pixel.y + Math.sin(angle) * radius);
    }
    context.closePath();
    context.fill();
  }

  function drawEntrance(point) {
    marker(point, 11, '#ffd23c', '#3a2410');
    marker(point, 5, '#2a1a10', '#2a1a10');
  }

  function drawPlayer(point, heading) {
    const pixel = toPixel(point);
    const angle = screenAngleOf(Math.sin(heading), Math.cos(heading));
    context.save();
    context.translate(pixel.x, pixel.y);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(17, 0);
    context.lineTo(-10, 11);
    context.lineTo(-5, 0);
    context.lineTo(-10, -11);
    context.closePath();
    context.fillStyle = '#ff6a3c';
    context.fill();
    context.strokeStyle = '#fff3d6';
    context.lineWidth = 3;
    context.stroke();
    context.restore();
  }

  function drawCompass() {
    const size = CANVAS_PIXELS * 0.06;
    const x = CANVAS_PIXELS - size * 1.6;
    const y = size * 2;
    const angle = screenAngleOf(0, 1);
    context.save();
    context.translate(x, y);
    context.beginPath();
    context.arc(0, 0, size, 0, Math.PI * 2);
    context.fillStyle = 'rgba(250, 238, 210, 0.85)';
    context.fill();
    context.strokeStyle = '#4a3420';
    context.lineWidth = 2;
    context.stroke();
    context.rotate(angle + Math.PI / 2);
    context.beginPath();
    context.moveTo(0, -size * 0.8);
    context.lineTo(size * 0.22, 0);
    context.lineTo(-size * 0.22, 0);
    context.closePath();
    context.fillStyle = '#b8402c';
    context.fill();
    context.beginPath();
    context.moveTo(0, size * 0.8);
    context.lineTo(size * 0.22, 0);
    context.lineTo(-size * 0.22, 0);
    context.closePath();
    context.fillStyle = '#4a3420';
    context.fill();
    context.fillStyle = '#4a3420';
    context.font = `700 ${Math.round(size * 0.5)}px Georgia, serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Sea', 0, -size * 1.25);
    context.restore();
  }

  function drawScaleBar() {
    const units = CRAB_LENGTH * SCALE_BAR_CRAB_LENGTHS;
    const length = units * pixelsPerUnit();
    const x = CANVAS_PIXELS * 0.05;
    const y = CANVAS_PIXELS * 0.95;
    const text = `${SCALE_BAR_CRAB_LENGTHS} crab lengths`;
    context.font = `600 ${Math.round(CANVAS_PIXELS / 42)}px Georgia, serif`;
    const boxWidth = Math.max(length, context.measureText(text).width) + 20;
    context.fillStyle = 'rgba(250, 238, 210, 0.85)';
    context.fillRect(x - 10, y - 30, boxWidth, 42);
    context.fillStyle = '#4a3420';
    context.fillRect(x, y, length, 5);
    context.fillRect(x, y - 6, 3, 11);
    context.fillRect(x + length - 3, y - 6, 3, 11);
    context.textAlign = 'left';
    context.textBaseline = 'bottom';
    context.fillText(text, x, y - 4);
  }

  function frameExplored(points) {
    let low = { x: Infinity, z: Infinity };
    let high = { x: -Infinity, z: -Infinity };
    const include = (x, z) => {
      low = { x: Math.min(low.x, x), z: Math.min(low.z, z) };
      high = { x: Math.max(high.x, x), z: Math.max(high.z, z) };
    };
    const step = halfSize / 40;
    for (let x = -halfSize; x <= halfSize; x += step) for (let z = -halfSize; z <= halfSize; z += step) if (fog.isRevealed(x, z)) include(x, z);
    for (const point of points) include(point.x, point.z);
    if (!Number.isFinite(low.x)) return { center: { x: 0, z: 0 }, extent: halfSize };
    const size = Math.max(high.x - low.x, high.z - low.z) / 2;
    return { center: { x: (low.x + high.x) / 2, z: (low.z + high.z) / 2 }, extent: Math.min(halfSize * 1.05, Math.max(MIN_EXTENT, size * 1.25 + 8)) };
  }

  function draw({ player = null, playerHeading = 0, entrances = [], remains = [], looters = [], rack = null, bosses = [] }) {
    const frame = frameExplored([player, ...entrances, ...remains, rack].filter(Boolean));
    center = frame.center;
    extent = frame.extent;
    const frameKey = `${center.x.toFixed(1)}|${center.z.toFixed(1)}|${extent.toFixed(1)}`;
    if (frameKey !== terrainFrameKey) {
      buildTerrain();
      terrainFrameKey = frameKey;
    }
    buildFogMask();

    context.save();
    context.imageSmoothingEnabled = true;
    context.drawImage(terrainCanvas, 0, 0, CANVAS_PIXELS, CANVAS_PIXELS);
    drawReefLife();
    drawRocksAndLogs();
    drawCampAndHold();
    drawLabels();
    if (rack && revealed(rack)) box(rack, 5, 5, 0, '#7bd36a', '#1d3b16');
    for (const boss of bosses) if (revealed(boss)) drawBoss(boss);
    context.restore();

    const revealedContext = revealedCanvas.getContext('2d');
    revealedContext.clearRect(0, 0, CANVAS_PIXELS, CANVAS_PIXELS);
    revealedContext.drawImage(canvas, 0, 0);
    revealedContext.globalCompositeOperation = 'destination-in';
    revealedContext.filter = `blur(${FOG_EDGE_BLUR_PIXELS}px)`;
    revealedContext.imageSmoothingEnabled = true;
    revealedContext.drawImage(fogCanvas, 0, 0, CANVAS_PIXELS, CANVAS_PIXELS);
    revealedContext.filter = 'none';
    revealedContext.globalCompositeOperation = 'source-over';

    context.fillStyle = '#000';
    context.fillRect(0, 0, CANVAS_PIXELS, CANVAS_PIXELS);
    context.drawImage(revealedCanvas, 0, 0);
    for (const point of remains) drawRemains(point);
    for (const point of looters) if (revealed(point)) drawLooter(point);
    for (const point of entrances) drawEntrance(point);
    if (player) drawPlayer(player, playerHeading);
    drawCompass();
    drawScaleBar();
  }

  return {
    open(markers) {
      draw(markers);
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    get isOpen() {
      return overlay.classList.contains('visible');
    },
  };
}
