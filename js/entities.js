// Animated Micro-Entities: Cars, Buses, Delivery Trucks, Police Cruisers, Commuter Trains, River Boats, Pedestrians & Smoke Plumes
class EntityManager {
  constructor(world) {
    this.world = world;
    this.vehicles = [];
    this.trains = [];
    this.boats = [];
    this.pedestrians = [];
    this.particles = [];
    this.maxVehicles = 110;
    this.maxBoats = 14;
    this.maxTrains = 10;
    this.maxPedestrians = 90;
  }

  reset() {
    this.vehicles = [];
    this.trains = [];
    this.boats = [];
    this.pedestrians = [];
    this.particles = [];
  }

  update(dt, speedMultiplier) {
    const effDt = dt * Math.max(0.35, Math.min(3.5, speedMultiplier || 1));

    this.spawnEntities();
    this.updateVehicles(effDt);
    this.updateTrains(effDt);
    this.updateBoats(effDt);
    this.updatePedestrians(effDt);
    this.updateParticles(effDt);
  }

  spawnEntities() {
    const size = this.world.size;

    // 1. Spawn road vehicles (cars, buses, delivery trucks, police cruisers)
    if (this.vehicles.length < this.maxVehicles && Math.random() < 0.45) {
      const rx = Math.floor(Math.random() * size);
      const ry = Math.floor(Math.random() * size);
      const t = this.world.getTile(rx, ry);
      if (this.world.isRoadSurface(t)) {
        const types = [
          { kind: 'car', color: '#00f5d4', trail: 'rgba(0,245,212,0.45)', speed: 2.3, size: 3.2 },
          { kind: 'car', color: '#e879f9', trail: 'rgba(232,121,249,0.45)', speed: 2.6, size: 3.2 },
          { kind: 'bus', color: '#38bdf8', trail: 'rgba(56,189,248,0.5)', speed: 1.7, size: 4.8 },
          { kind: 'truck', color: '#fbbf24', trail: 'rgba(251,191,36,0.45)', speed: 1.85, size: 4.4 },
          { kind: 'police', color: '#60a5fa', trail: 'rgba(239,68,68,0.6)', speed: 2.9, size: 3.5 }
        ];
        const spec = types[Math.floor(Math.random() * types.length)];
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        this.vehicles.push({
          x: rx + 0.5,
          y: ry + 0.5,
          dx: dir[0],
          dy: dir[1],
          ...spec,
          life: 16 + Math.random() * 16
        });
      }
    }

    // 2. Spawn elevated commuter trains on raised rail & railway station tiles
    if (this.trains.length < this.maxTrains && Math.random() < 0.25) {
      const rx = Math.floor(Math.random() * size);
      const ry = Math.floor(Math.random() * size);
      const t = this.world.getTile(rx, ry);
      if (this.world.hasRail(t)) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const validDirs = dirs.filter(([dx, dy]) => {
          const nt = this.world.getTile(rx + dx, ry + dy);
          return this.world.hasRail(nt);
        });
        if (validDirs.length > 0) {
          const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
          this.trains.push({
            x: rx + 0.5,
            y: ry + 0.5,
            dx: dir[0],
            dy: dir[1],
            speed: 3.4,
            life: 18
          });
        }
      }
    }

    // 3. Spawn river boats on river tiles
    if (this.boats.length < this.maxBoats && Math.random() < 0.2) {
      const rx = Math.floor(Math.random() * size);
      const ry = Math.floor(Math.random() * size);
      const t = this.world.getTile(rx, ry);
      if (t && t.terrain === 'river') {
        const dirY = Math.random() < 0.5 ? 1 : -1;
        this.boats.push({
          x: rx + 0.5,
          y: ry + 0.5,
          dx: 0,
          dy: dirY,
          speed: 0.9 + Math.random() * 0.4,
          color: Math.random() < 0.5 ? '#22d3ee' : '#f472b6',
          life: 26
        });
      }
    }

    // 4. Spawn tiny pedestrians on developed zones or civic buildings
    if (this.pedestrians.length < this.maxPedestrians && Math.random() < 0.4) {
      const rx = Math.floor(Math.random() * size);
      const ry = Math.floor(Math.random() * size);
      const t = this.world.getTile(rx, ry);
      if (t && t.building && (
        (t.building.category === 'zones' && t.building.level > 0) ||
        t.building.category === 'civic' ||
        t.building.category === 'edu'
      )) {
        this.pedestrians.push({
          tileX: rx,
          tileY: ry,
          progress: Math.random() * 4, // 0..4 around tile perimeter sidewalk
          speed: (0.45 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1),
          color: Math.random() < 0.5 ? '#6ee7b7' : '#38bdf8',
          life: 10 + Math.random() * 10
        });
      }
    }
  }

  updateVehicles(dt) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.life -= dt;
      if (v.life <= 0) {
        this.vehicles.splice(i, 1);
        continue;
      }

      const prevCellX = Math.floor(v.x);
      const prevCellY = Math.floor(v.y);
      v.x += v.dx * v.speed * dt;
      v.y += v.dy * v.speed * dt;
      const curCellX = Math.floor(v.x);
      const curCellY = Math.floor(v.y);

      if (curCellX !== prevCellX || curCellY !== prevCellY) {
        const curTile = this.world.getTile(curCellX, curCellY);
        const isRoad = this.world.isRoadSurface(curTile);
        if (!isRoad) {
          // Try turning onto a valid neighbor road from previous cell
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
            ([dx, dy]) => !(dx === -v.dx && dy === -v.dy)
          );
          const valid = dirs.filter(([dx, dy]) => {
            const nt = this.world.getTile(prevCellX + dx, prevCellY + dy);
            return this.world.isRoadSurface(nt);
          });
          if (valid.length > 0) {
            const pick = valid[Math.floor(Math.random() * valid.length)];
            v.x = prevCellX + 0.5;
            v.y = prevCellY + 0.5;
            v.dx = pick[0];
            v.dy = pick[1];
          } else {
            // Turn around
            v.x = prevCellX + 0.5;
            v.y = prevCellY + 0.5;
            v.dx = -v.dx;
            v.dy = -v.dy;
          }
        } else if (Math.random() < 0.28) {
          // Occasional turn at intersection
          const perp = v.dx !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
          const valid = perp.filter(([dx, dy]) => {
            const nt = this.world.getTile(curCellX + dx, curCellY + dy);
            return this.world.isRoadSurface(nt);
          });
          if (valid.length > 0) {
            const pick = valid[Math.floor(Math.random() * valid.length)];
            v.x = curCellX + 0.5;
            v.y = curCellY + 0.5;
            v.dx = pick[0];
            v.dy = pick[1];
          }
        }
      }
    }
  }

  updateTrains(dt) {
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const tr = this.trains[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.trains.splice(i, 1);
        continue;
      }
      const prevX = Math.floor(tr.x);
      const prevY = Math.floor(tr.y);
      tr.x += tr.dx * tr.speed * dt;
      tr.y += tr.dy * tr.speed * dt;
      const curX = Math.floor(tr.x);
      const curY = Math.floor(tr.y);

      if (curX !== prevX || curY !== prevY) {
        const curTile = this.world.getTile(curX, curY);
        if (!this.world.hasRail(curTile)) {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          const valid = dirs.filter(([dx, dy]) => {
            const nt = this.world.getTile(prevX + dx, prevY + dy);
            return this.world.hasRail(nt);
          });
          if (valid.length > 0) {
            const pick = valid[Math.floor(Math.random() * valid.length)];
            tr.x = prevX + 0.5;
            tr.y = prevY + 0.5;
            tr.dx = pick[0];
            tr.dy = pick[1];
          } else {
            this.trains.splice(i, 1);
          }
        }
      }
    }
  }

  updateBoats(dt) {
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const b = this.boats[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.boats.splice(i, 1);
        continue;
      }
      const nextY = b.y + b.dy * b.speed * dt;
      const targetRow = Math.floor(nextY);
      const curX = Math.floor(b.x);

      // Follow the river channel
      let bestX = curX;
      const tMid = this.world.getTile(curX, targetRow);
      if (!tMid || tMid.terrain !== 'river') {
        const tLeft = this.world.getTile(curX - 1, targetRow);
        const tRight = this.world.getTile(curX + 1, targetRow);
        if (tLeft && tLeft.terrain === 'river') bestX = curX - 1;
        else if (tRight && tRight.terrain === 'river') bestX = curX + 1;
        else {
          b.dy = -b.dy;
          continue;
        }
      }
      b.y = nextY;
      b.x += ((bestX + 0.5) - b.x) * 3 * dt;
    }
  }

  updatePedestrians(dt) {
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const p = this.pedestrians[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pedestrians.splice(i, 1);
        continue;
      }
      p.progress = (p.progress + p.speed * dt + 4) % 4;
    }
  }

  // Emit smoke / vapor particle from tile
  emitSmoke(x, y, heightOffset, color = 'rgba(148, 163, 184, 0.55)') {
    if (this.particles.length > 180) return;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 0.15,
      y: y + (Math.random() - 0.5) * 0.15,
      z: heightOffset,
      vz: 14 + Math.random() * 10,
      vx: (Math.random() - 0.3) * 8,
      radius: 2.5 + Math.random() * 2,
      alpha: 0.75,
      color
    });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.z += pt.vz * dt;
      pt.x += (pt.vx * 0.01) * dt;
      pt.radius += 3.5 * dt;
      pt.alpha -= 0.42 * dt;
      if (pt.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
}

window.EntityManager = EntityManager;
