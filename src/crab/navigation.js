const HEURISTIC_WEIGHT = 1.3;
const MAX_EXPANSIONS = 60000;
const NEIGHBORS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export function createNavigation(world) {
  const { columns, cellCount } = world.walkGrid;
  const costSoFar = new Float32Array(cellCount);
  const cameFrom = new Int32Array(cellCount);
  const visitStamp = new Uint32Array(cellCount);
  const closedStamp = new Uint32Array(cellCount);
  let stamp = 0;
  const heapCells = new Int32Array(cellCount);
  const heapScores = new Float32Array(cellCount);
  let heapSize = 0;

  const cellOf = (x, z) => world.walkGrid.rowOf(z) * columns + world.walkGrid.columnOf(x);
  const cellX = (cell) => world.walkGrid.centerX(cell % columns);
  const cellZ = (cell) => world.walkGrid.centerZ(Math.floor(cell / columns));
  const cellWalkable = (column, row) => world.isCellWalkable(column, row);

  function heapPush(cell, score) {
    let position = heapSize++;
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (heapScores[parent] <= score) break;
      heapCells[position] = heapCells[parent];
      heapScores[position] = heapScores[parent];
      position = parent;
    }
    heapCells[position] = cell;
    heapScores[position] = score;
  }

  function heapPop() {
    const top = heapCells[0];
    heapSize--;
    const lastCell = heapCells[heapSize];
    const lastScore = heapScores[heapSize];
    let position = 0;
    while (true) {
      let child = position * 2 + 1;
      if (child >= heapSize) break;
      if (child + 1 < heapSize && heapScores[child + 1] < heapScores[child]) child++;
      if (heapScores[child] >= lastScore) break;
      heapCells[position] = heapCells[child];
      heapScores[position] = heapScores[child];
      position = child;
    }
    heapCells[position] = lastCell;
    heapScores[position] = lastScore;
    return top;
  }

  function nearestWalkable(x, z, searchRadius = 14) {
    if (world.isWalkable(x, z)) return { x, z };
    for (let radius = 1; radius <= searchRadius; radius++) {
      let best = null;
      for (let step = 0; step < radius * 8; step++) {
        const angle = (step / (radius * 8)) * Math.PI * 2;
        const candidateX = x + Math.cos(angle) * radius;
        const candidateZ = z + Math.sin(angle) * radius;
        if (world.isWalkable(candidateX, candidateZ)) {
          best = { x: candidateX, z: candidateZ };
          break;
        }
      }
      if (best) return best;
    }
    return null;
  }

  function clearLine(fromX, fromZ, toX, toZ) {
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    const steps = Math.ceil(distance / 0.45);
    for (let step = 1; step < steps; step++) {
      const share = step / steps;
      if (!world.isWalkable(fromX + (toX - fromX) * share, fromZ + (toZ - fromZ) * share)) return false;
    }
    return true;
  }

  function findPath(fromX, fromZ, toX, toZ) {
    const start = nearestWalkable(fromX, fromZ);
    const goal = nearestWalkable(toX, toZ);
    if (!start || !goal) return [];
    if (clearLine(start.x, start.z, goal.x, goal.z)) return [{ x: goal.x, z: goal.z }];
    const startCell = cellOf(start.x, start.z);
    const goalCell = cellOf(goal.x, goal.z);
    const goalColumn = goalCell % columns;
    const goalRow = Math.floor(goalCell / columns);
    stamp++;
    heapSize = 0;
    costSoFar[startCell] = 0;
    cameFrom[startCell] = -1;
    visitStamp[startCell] = stamp;
    heapPush(startCell, 0);
    let expansions = 0;
    let reached = false;
    while (heapSize > 0 && expansions < MAX_EXPANSIONS) {
      const cell = heapPop();
      if (closedStamp[cell] === stamp) continue;
      closedStamp[cell] = stamp;
      if (cell === goalCell) {
        reached = true;
        break;
      }
      expansions++;
      const column = cell % columns;
      const row = (cell - column) / columns;
      for (const [stepColumn, stepRow, stepCost] of NEIGHBORS) {
        const nextColumn = column + stepColumn;
        const nextRow = row + stepRow;
        if (!cellWalkable(nextColumn, nextRow)) continue;
        if (stepColumn !== 0 && stepRow !== 0 && (!cellWalkable(column + stepColumn, row) || !cellWalkable(column, row + stepRow))) continue;
        const next = nextRow * columns + nextColumn;
        const cost = costSoFar[cell] + stepCost;
        if (visitStamp[next] === stamp && cost >= costSoFar[next]) continue;
        visitStamp[next] = stamp;
        costSoFar[next] = cost;
        cameFrom[next] = cell;
        heapPush(next, cost + Math.hypot(nextColumn - goalColumn, nextRow - goalRow) * HEURISTIC_WEIGHT);
      }
    }
    if (!reached) return [];
    const cells = [];
    for (let cell = goalCell; cell !== -1; cell = cameFrom[cell]) cells.push(cell);
    cells.reverse();
    const waypoints = cells.map((cell) => ({ x: cellX(cell), z: cellZ(cell) }));
    waypoints[waypoints.length - 1] = { x: goal.x, z: goal.z };
    const smoothed = [];
    let anchorX = start.x;
    let anchorZ = start.z;
    let index = 0;
    while (index < waypoints.length) {
      let furthest = index;
      for (let candidate = waypoints.length - 1; candidate > index; candidate--) {
        if (clearLine(anchorX, anchorZ, waypoints[candidate].x, waypoints[candidate].z)) {
          furthest = candidate;
          break;
        }
      }
      smoothed.push(waypoints[furthest]);
      anchorX = waypoints[furthest].x;
      anchorZ = waypoints[furthest].z;
      index = furthest + 1;
    }
    return smoothed;
  }

  return { findPath, nearestWalkable, clearLine };
}
