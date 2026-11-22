// 2D Side-Scrolling Street Exploration Mode (PNG Blitting + Procedural Fallbacks + 2.5D Corner Rotation)
class StreetExplorationView {
  constructor(canvas, world, onEnterCityHall) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.onEnterCityHall = onEnterCityHall;

    this.active = true;
    this.daylightMode = false;
    this.time = 0;

    // Mayor's position in the 2D City Grid & Street Corridor
    this.streetOrigin = { x: 22, y: 24 };
    this.heading = 0; // 0 = East (+x), 1 = South (+y), 2 = West (-x), 3 = North (-y)
    this.headingNames = ['EASTBOUND AVE', 'SOUTHBOUND ST', 'WESTBOUND AVE', 'NORTHBOUND ST'];

    // Side-scroller world coordinates (1 slot = 250px wide)
    this.slotWidth = 250;
    this.mayorX = 0;
    this.mayorDir = 1;
    this.mayorWalking = false;
    this.walkCycle = 0;
    this.mayorActivity = 'Inspecting the Town';

    // Mr. Mayor 18 FPS sprite animation state machine
    this.mayorFrame = 'R';
    this.mayorLastDir = 'R';
    this.mayorWalkIndex = 0;
    this.mayorAnimTimer = 0;
    this.mayorTransitionQueue = [];
    this.prevMoveDir = 0;
    this.lastWalkDir = 1;
    this.lastKeyPressed = 'R';
    this.idleTime = 1.0;
    this.moonwalkMode = false;

    // Camera horizontal scroll
    this.cameraX = 0;

    // 90-Degree 2.5D Corner Rotation Animation state
    this.turning90 = false;
    this.turnProgress = 0;
    this.turnDir = 1;
    this.pendingTurnTarget = null;

    // Street Side (1 = default sidewalk side, -1 = opposite sidewalk across the street) & Crosswalk Crossing state
    this.streetSide = 1;
    this.crosswalkSlots = [-9, -6, -3, 0, 3, 6, 9];
    this.crossingStreet = false;
    this.crossProgress = 0;
    this.crossSwapped = false;
    this.crossFromSide = 1;
    this.hoveredCrosswalkSlot = null;

    // Active Street Slots
    this.slots = [];
    this.crossStreets = [];

    // Ambient street entities
    this.pedestrians = [];
    this.streetVehicles = [];
    this.trainX = -400;

    // Input & Hover state
    this.keys = { left: false, right: false };
    this.hoveredDoorSlot = null;
    this.hoveredCorner = null;
    this.inspectedBuildingModal = null;

    // Indoor Location state (e.g. 'mayor_office' between City Map and Street View)
    this.indoorLocation = null; // null = outdoors on street, 'mayor_office' = inside Mayor's Office
    this.indoorMayorX = 0.50;   // Normalized X position across the bottom floor (0.09 .. 0.90)
    this.indoorHoveredTarget = null; // 'wall_map' | 'advisor' | 'exit_door' | null
    this.advisorActiveTab = 'happiness'; // 'happiness' (Tab 1) | 'campaign' (Tab 2)
    this.onOpenCityMap = null;
    this.onExitToStreet = null;

    this.bindEvents();
    this.syncFromCityHall();
    this.initAmbientEntities();
  }

  syncFromCityHall() {
    const ch = this.world.findCityHall();
    const chTile = this.world.getTile(ch.x, ch.y);
    const chSize = chTile?.building?.size || 2;
    const ox = chTile?.building?.originX ?? (chSize === 2 ? ch.x - 1 : ch.x);
    const oy = chTile?.building?.originY ?? (chSize === 2 ? ch.y - 1 : ch.y);

    let roadX = ox + (chSize > 1 ? 1 : 0);
    let roadY = oy + chSize;
    let foundRoad = false;
    this.heading = 0;
    this.streetSide = 1;

    // Check all border tiles around the 2x2 (or 1x1) City Hall footprint using its true top-left origin (ox, oy)
    const candidates = [
      // South border (walk East/West on road at y = oy + chSize, looking North at City Hall)
      { rx: ox + 1, ry: oy + chSize, heading: 0, side: 1 },
      { rx: ox, ry: oy + chSize, heading: 0, side: 1 },
      // East border (walk North/South on road at x = ox + chSize, looking West at City Hall)
      { rx: ox + chSize, ry: oy + 1, heading: 3, side: 1 },
      { rx: ox + chSize, ry: oy, heading: 3, side: 1 },
      // North border (walk West/East on road at y = oy - 1, looking South at City Hall)
      { rx: ox, ry: oy - 1, heading: 2, side: 1 },
      { rx: ox + 1, ry: oy - 1, heading: 2, side: 1 },
      // West border (walk South/North on road at x = ox - 1, looking East at City Hall)
      { rx: ox - 1, ry: oy, heading: 1, side: 1 },
      { rx: ox - 1, ry: oy + 1, heading: 1, side: 1 }
    ];

    for (const c of candidates) {
      const nt = this.world.getTile(c.rx, c.ry);
      if (this.world.isRoadSurface(nt)) {
        roadX = c.rx;
        roadY = c.ry;
        this.heading = c.heading;
        this.streetSide = c.side;
        foundRoad = true;
        break;
      }
    }

    // If no road directly touches City Hall yet, search outward for the nearest player-built road on the map
    if (!foundRoad) {
      let bestDist = Infinity;
      for (let y = 0; y < this.world.size; y++) {
        for (let x = 0; x < this.world.size; x++) {
          const t = this.world.getTile(x, y);
          if (t && t.building && t.building.category === 'roads') {
            const d = Math.hypot(x - ch.x, y - ch.y);
            if (d < bestDist) {
              bestDist = d;
              roadX = x;
              roadY = y;
              const hasHorizontal =
                this.world.getTile(x + 1, y)?.building?.category === 'roads' ||
                this.world.getTile(x - 1, y)?.building?.category === 'roads';
              this.heading = hasHorizontal ? 0 : 1;
              this.streetSide = 1;
            }
          }
        }
      }
    }

    this.streetOrigin = { x: roadX, y: roadY };
    this.crossingStreet = false;
    this.crossProgress = 0;
    this.mayorX = 0;
    this.cameraX = 0;
    this.mayorFrame = 'R';
    this.mayorLastDir = 'R';
    this.mayorWalkIndex = 0;
    this.mayorAnimTimer = 0;
    this.mayorTransitionQueue = [];
    this.prevMoveDir = 0;
    this.lastWalkDir = 1;
    this.lastKeyPressed = 'R';
    this.idleTime = 1.0;
    this.rebuildStreetCorridor();
    this.initAmbientEntities();
  }

  syncFromHomeResidence() {
    const home = this.world.findHomeResidence();
    this.syncOutsideTile(home.x, home.y);
  }

  syncOutsideTile(gx, gy) {
    let roadX = gx;
    let roadY = gy - 1;
    this.heading = 0;
    this.streetSide = -1;
    let foundRoad = false;

    const candidates = [
      // Road immediately North of tile (walk East/West with heading=0, looking South at tile via side=-1)
      { rx: gx, ry: gy - 1, heading: 0, side: -1 },
      // Road immediately South of tile (walk East/West with heading=0, looking North at tile via side=1)
      { rx: gx, ry: gy + 1, heading: 0, side: 1 },
      // Road immediately West of tile (walk South/North with heading=1, looking East at tile via side=1)
      { rx: gx - 1, ry: gy, heading: 1, side: 1 },
      // Road immediately East of tile (walk North/South with heading=3, looking West at tile via side=1)
      { rx: gx + 1, ry: gy, heading: 3, side: 1 }
    ];

    for (const c of candidates) {
      const nt = this.world.getTile(c.rx, c.ry);
      if (this.world.isRoadSurface(nt)) {
        roadX = c.rx;
        roadY = c.ry;
        this.heading = c.heading;
        this.streetSide = c.side;
        foundRoad = true;
        break;
      }
    }

    if (!foundRoad) {
      this.syncFromCityHall();
      return;
    }

    this.streetOrigin = { x: roadX, y: roadY };
    this.crossingStreet = false;
    this.crossProgress = 0;
    this.mayorX = 0;
    this.cameraX = 0;
    this.mayorFrame = 'R';
    this.mayorLastDir = 'R';
    this.mayorWalkIndex = 0;
    this.mayorAnimTimer = 0;
    this.mayorTransitionQueue = [];
    this.prevMoveDir = 0;
    this.lastWalkDir = 1;
    this.lastKeyPressed = 'R';
    this.idleTime = 1.0;
    this.rebuildStreetCorridor();
    this.initAmbientEntities();
  }

  // Returns the active horizontal world-space render window:
  // Visible viewport [cameraX - 0.5*W, cameraX + 0.5*W] plus half the visible width (0.5*W) off-screen on either side
  getActiveRenderBounds(W = this.canvas.width) {
    const visibleHalf = W * 0.5;
    const offscreenHalf = W * 0.5; // Half of what the player can see on either side off-screen
    const radius = visibleHalf + offscreenHalf; // Total 1.0 * W on each side of cameraX
    const corridorLeft = (this.corridorMinX ?? -this.slotWidth * 12) - this.slotWidth * 0.65;
    const corridorRight = (this.corridorMaxX ?? this.slotWidth * 12) + this.slotWidth * 0.65;
    return {
      minX: Math.max(corridorLeft, this.cameraX - radius),
      maxX: Math.min(corridorRight, this.cameraX + radius),
      rawMinX: this.cameraX - radius,
      rawMaxX: this.cameraX + radius,
      radius
    };
  }

  rebuildStreetCorridor() {
    this.slots = [];
    this.crossStreets = [];
    this.crosswalkSlots = [];

    const fwdVecs = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    const facadeVecs = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }
    ];

    const fwd = fwdVecs[this.heading];
    const baseFac = facadeVecs[this.heading];
    const side = this.streetSide || 1;
    const fac = { dx: baseFac.dx * side, dy: baseFac.dy * side };

    // Trace the full continuous street in both directions (-s and +s) so the player can walk as long as the street is
    let minS = 0;
    for (let s = -1; s >= -this.world.size; s--) {
      const rx = this.streetOrigin.x + fwd.dx * s;
      const ry = this.streetOrigin.y + fwd.dy * s;
      const t = this.world.getTile(rx, ry);
      if (!t) break;
      if (this.world.isRoadSurface(t)) {
        minS = s;
      } else {
        break;
      }
    }

    let maxS = 0;
    for (let s = 1; s <= this.world.size; s++) {
      const rx = this.streetOrigin.x + fwd.dx * s;
      const ry = this.streetOrigin.y + fwd.dy * s;
      const t = this.world.getTile(rx, ry);
      if (!t) break;
      if (this.world.isRoadSurface(t)) {
        maxS = s;
      } else {
        break;
      }
    }

    // Fallback walkable block if the player hasn't built roads yet in a brand-new city
    if (maxS - minS < 4) {
      for (let s = -4; s <= 4; s++) {
        const rx = this.streetOrigin.x + fwd.dx * s;
        const ry = this.streetOrigin.y + fwd.dy * s;
        if (this.world.getTile(rx, ry)) {
          minS = Math.min(minS, s);
          maxS = Math.max(maxS, s);
        }
      }
    }

    this.minSlot = minS;
    this.maxSlot = maxS;
    this.corridorMinX = minS * this.slotWidth;
    this.corridorMaxX = maxS * this.slotWidth;

    for (let s = minS; s <= maxS; s++) {
      const rx = this.streetOrigin.x + fwd.dx * s;
      const ry = this.streetOrigin.y + fwd.dy * s;
      const roadTile = this.world.getTile(rx, ry);

      const bx = rx + fac.dx;
      const by = ry + fac.dy;
      const bTile = this.world.getTile(bx, by);

      const crossTile1 = this.world.getTile(rx + fac.dx, ry + fac.dy);
      const isCrossRoad = this.world.isRoadSurface(crossTile1);

      this.slots.push({
        slotIndex: s,
        worldX: s * this.slotWidth,
        gridX: bx,
        gridY: by,
        roadGridX: rx,
        roadGridY: ry,
        roadTile,
        tile: bTile,
        building: bTile ? bTile.building : null,
        isCrossStreet: isCrossRoad
      });

      if (isCrossRoad) {
        this.crossStreets.push(s);
      }

      // Periodic crosswalks every 3 blocks along the entire street across the whole map
      if (s % 3 === 0) {
        this.crosswalkSlots.push(s);
      }
    }

    if (this.crosswalkSlots.length === 0) {
      this.crosswalkSlots.push(0);
    }

    // Pair consecutive slots belonging to the same multi-tile building (2x2 or 5x5) so it spans seamlessly
    for (let i = 0; i < this.slots.length - 1; i++) {
      const slot = this.slots[i];
      if (slot.isCrossStreet || slot.skipFacade) continue;
      const b = slot.building;
      if (b && ((b.size && b.size > 1) || ['city_hall', 'school', 'university', 'stadium'].includes(b.id))) {
        let span = 1;
        while (i + span < this.slots.length) {
          const nextSlot = this.slots[i + span];
          if (nextSlot.isCrossStreet || nextSlot.skipFacade) break;
          const nextB = nextSlot.building;
          const sameFootprint =
            nextB &&
            b.id === nextB.id &&
            b.originX !== undefined &&
            b.originX === nextB.originX &&
            b.originY === nextB.originY;
          if (!sameFootprint) break;
          nextSlot.skipFacade = true;
          nextSlot.masterSlot = slot;
          span++;
          if (span >= 2) break; // Group in 2-block facade spans
        }
        if (span > 1) {
          slot.spanSlots = span;
          slot.facadeCenterX = slot.worldX + this.slotWidth * 0.5 * (span - 1);
        }
      }
    }
  }

  initAmbientEntities() {
    this.pedestrians = [];
    for (let i = -6; i <= 6; i++) {
      this.pedestrians.push({
        x: i * 190 + Math.random() * 80,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: 44 + Math.random() * 12, // ~44-56 px/s natural sidewalk walking pace
        phase: Math.random() * Math.PI * 2,
        frameIndex: Math.floor(Math.random() * 8),
        distAccumulator: Math.random() * 6.9,
        type: Math.abs(i) % 3
      });
    }

    this.streetVehicles = [
      { x: -350, dir: 1, speed: 150, kind: 'car', frameIndex: 0, animTimer: 0 },
      { x: 420, dir: -1, speed: 120, kind: 'bus', frameIndex: 0, animTimer: 0.02 },
      { x: 950, dir: -1, speed: 165, kind: 'car', frameIndex: 2, animTimer: 0.04 },
      { x: -1150, dir: 1, speed: 125, kind: 'bus', frameIndex: 2, animTimer: 0.06 }
    ];

    // Computer AI Mayor NPC walking the city streets when the player plays as Business Man
    this.aiMayorNPC = {
      x: 420,
      dir: -1,
      speed: 92,
      walkIndex: 1,
      animTimer: 0
    };
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target.tagName === 'INPUT') return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.keys.left = true;
        this.lastKeyPressed = 'L';
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.keys.right = true;
        this.lastKeyPressed = 'R';
      } else if (
        e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' ||
        e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' ||
        e.key === 'c' || e.key === 'C'
      ) {
        if (!this.indoorLocation) {
          const nearCw = this.getNearestCrosswalk(115);
          this.triggerStreetCrossing(nearCw);
        }
      } else if (e.key === 'e' || e.key === 'E') {
        this.handleInteractKey();
      } else if (e.key === 'q' || e.key === 'Q') {
        if (!this.indoorLocation) {
          this.trigger90DegreeRotation(-1, this.getNearestCrossStreet(160));
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (!this.indoorLocation) {
          this.trigger90DegreeRotation(1, this.getNearestCrossStreet(160));
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        this.keys.left = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        this.keys.right = false;
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.updateHoverState(mx, my);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.active || e.button !== 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.updateHoverState(mx, my);

      if (this.indoorLocation === 'mayor_office') {
        if (this.indoorHoveredTarget === 'wall_map') {
          this.openWallMapOptionModal();
          return;
        }
        if (this.indoorHoveredTarget === 'advisor') {
          this.openElectionDetailsModal();
          return;
        }
        if (this.indoorHoveredTarget === 'exit_door') {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          if (this.onExitToStreet) this.onExitToStreet();
          return;
        }
        const clickNormX = mx / (this.canvas.width || 1);
        if (Math.abs(clickNormX - this.indoorMayorX) > 0.02) {
          this.mayorDir = clickNormX > this.indoorMayorX ? 1 : -1;
          this.mayorFrame = this.mayorDir > 0 ? 'R' : 'L';
        }
        return;
      }

      if (this.hoveredCrosswalkSlot !== null) {
        this.triggerStreetCrossing(this.hoveredCrosswalkSlot);
        return;
      }

      if (this.hoveredCorner) {
        if (window.cyberAudio) window.cyberAudio.playUpgrade();
        this.trigger90DegreeRotation(this.hoveredCorner.dir, this.hoveredCorner.slot);
        return;
      }

      if (this.hoveredDoorSlot) {
        this.enterBuildingAtSlot(this.hoveredDoorSlot);
        return;
      }

      const worldClickX = mx - this.canvas.width * 0.5 + this.cameraX;
      if (Math.abs(worldClickX - this.mayorX) > 25) {
        this.mayorDir = worldClickX > this.mayorX ? 1 : -1;
      }
    });
  }

  updateHoverState(mx, my) {
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (this.indoorLocation === 'mayor_office') {
      const nx = mx / (W || 1);
      const ny = my / (H || 1);
      this.indoorHoveredTarget = null;
      // Left Wall Map ("MAP OF THE CITY" + callout tag)
      if (nx >= 0.012 && nx <= 0.245 && ny >= 0.045 && ny <= 0.650) {
        this.indoorHoveredTarget = 'wall_map';
        this.canvas.style.cursor = 'pointer';
        return;
      }
      // Man on the Right (Election & Campaign Advisor with Tablet + floating callout tag)
      if (nx >= 0.660 && nx <= 0.890 && ny >= 0.320 && ny <= 0.960) {
        this.indoorHoveredTarget = 'advisor';
        this.canvas.style.cursor = 'pointer';
        return;
      }
      // Far Right Office Door (Exit to Street View)
      if (nx >= 0.895 && nx <= 0.998 && ny >= 0.220 && ny <= 0.970) {
        this.indoorHoveredTarget = 'exit_door';
        this.canvas.style.cursor = 'pointer';
        return;
      }
      this.canvas.style.cursor = 'default';
      return;
    }

    const groundY = H * 0.77;
    const worldMouseX = mx - W * 0.5 + this.cameraX;

    this.hoveredDoorSlot = null;
    this.hoveredCorner = null;
    this.hoveredCrosswalkSlot = null;

    // Check hover over crosswalk ground stripes (synced with crosswalk.png positions)
    for (const cwSlot of this.crosswalkSlots) {
      const cwx = cwSlot * this.slotWidth;
      if (Math.abs(worldMouseX - cwx) < 68 && my >= groundY + 12 && my <= H) {
        this.hoveredCrosswalkSlot = cwSlot;
        this.canvas.style.cursor = 'pointer';
        return;
      }
    }

    for (const slot of this.slots) {
      if (slot.isCrossStreet) {
        const cornerX = slot.worldX + this.slotWidth * 0.5;
        if (Math.abs(worldMouseX - cornerX) < 85 && my > groundY - 260 && my < groundY + 60) {
          this.hoveredCorner = { slot, dir: slot.slotIndex >= 0 ? 1 : -1 };
          this.canvas.style.cursor = 'pointer';
          return;
        }
      }

      if (slot.building && slot.building.category !== 'roads') {
        const targetSlot = slot.masterSlot || slot;
        const doorX = targetSlot.doorWorldX ?? targetSlot.facadeCenterX ?? targetSlot.worldX;
        if (Math.abs(worldMouseX - doorX) < 60 && my > groundY - 140 && my < groundY) {
          this.hoveredDoorSlot = targetSlot;
          this.canvas.style.cursor = 'pointer';
          return;
        }
      }
    }
    this.canvas.style.cursor = 'default';
  }

  handleInteractKey() {
    if (this.indoorLocation === 'mayor_office') {
      if (this.indoorMayorX <= 0.28) {
        this.openWallMapOptionModal();
      } else if (this.indoorMayorX > 0.88) {
        if (window.cyberAudio) window.cyberAudio.playUpgrade();
        if (this.onExitToStreet) this.onExitToStreet();
      } else {
        this.openElectionDetailsModal();
      }
      return;
    }

    const nearCorner = this.getNearestCrossStreet(95);
    const nearBuilding = this.getNearestBuildingSlot(85);

    if (nearBuilding && nearBuilding.building) {
      this.enterBuildingAtSlot(nearBuilding);
    } else if (nearCorner) {
      this.trigger90DegreeRotation(nearCorner.slotIndex >= 0 ? 1 : -1, nearCorner);
    }
  }

  openWallMapOptionModal() {
    const modal = document.getElementById('indoor-wall-map-modal');
    const summaryEl = document.getElementById('indoor-wall-map-summary');
    if (!modal || !summaryEl) return;
    if (window.cyberAudio) window.cyberAudio.playClick();

    this.world.recalculateTotals();
    const waterPct = this.world.stats.waterCoverage ?? this.world.stats.wateredPct ?? 100;
    const moralePct = this.world.stats.avgMorale ?? this.world.stats.morale ?? 85;
    summaryEl.innerHTML = `
      <div class="insp-row"><span>City Name:</span> <strong style="color:#7dd3fc;">${this.world.cityName}</strong></div>
      <div class="insp-row"><span>Population:</span> <strong>${this.world.population.toLocaleString()} Citizens</strong></div>
      <div class="insp-row"><span>City Treasury:</span> <strong style="color:#4ade80;">$${this.world.money.toLocaleString()}</strong></div>
      <div class="insp-row"><span>Electrical Grid:</span> <strong style="color:#facc15;">${this.world.stats.powerGenerated} / ${this.world.stats.powerConsumed} MW</strong></div>
      <div class="insp-row"><span>Piped Water Coverage:</span> <strong style="color:#38bdf8;">${waterPct}% 💧</strong></div>
      <div class="insp-row"><span>Public Happiness:</span> <strong style="color:#e879f9;">${moralePct}%</strong></div>
    `;
    modal.classList.remove('hidden');
  }

  openElectionDetailsModal(isOddYearPrompt = false, forceTab = null) {
    const modal = document.getElementById('election-details-modal');
    const body = document.getElementById('election-modal-body');
    if (!modal || !body) return;
    if (window.cyberAudio) window.cyberAudio.playClick();

    const isElectionYear = (this.world.year % 2 === 1);

    if (forceTab === 'happiness' || forceTab === 'campaign') {
      this.advisorActiveTab = forceTab;
    } else if (!isElectionYear) {
      this.advisorActiveTab = 'happiness';
    } else if (!this.advisorActiveTab) {
      this.advisorActiveTab = 'happiness';
    }

    this.world.recalculateTotals();
    const hb = this.world.getHappinessBreakdown();
    const options = this.world.getCampaignOptions();
    const approvalColor = hb.overallHappiness >= 70 ? '#4ade80' : (hb.overallHappiness >= 45 ? '#fbbf24' : '#f43f5e');

    const activeCat = this.world.getActiveCampaignCategory();
    const nextElectionYear = this.world.year % 2 === 1 ? this.world.year + 1 : this.world.year + 2;

    let monthlyCampaignCost = 0;
    for (const opt of options) {
      if (this.world.activeCampaignOptions?.[opt.id]) {
        monthlyCampaignCost += opt.cost;
      }
    }
    const totalSpent = this.world.totalCampaignSpent || 0;

    const happyRows = hb.topHappy.map((item, idx) => `
      <div class="election-factor-item">
        <div class="election-factor-top">
          <span><strong>#${idx + 1}.</strong> ${item.title}</span>
          <span style="color:#4ade80;font-size:10.5px;white-space:nowrap;">${item.impact}</span>
        </div>
        <div class="election-factor-desc">${item.detail}</div>
      </div>
    `).join('');

    const unhappyRows = hb.topUnhappy.map((item, idx) => `
      <div class="election-factor-item">
        <div class="election-factor-top">
          <span><strong>#${idx + 1}.</strong> ${item.title}</span>
          <span style="color:#f43f5e;font-size:10.5px;white-space:nowrap;">${item.impact}</span>
        </div>
        <div class="election-factor-desc">${item.detail}</div>
      </div>
    `).join('');

    const renderOptionCheckboxRow = (opt) => {
      const isChecked = Boolean(this.world.activeCampaignOptions?.[opt.id]);
      const isLockedByOpposite = Boolean(activeCat && activeCat !== opt.category);
      const borderCol = isChecked
        ? (opt.category === 'moral' ? '#4ade80' : '#f43f5e')
        : 'rgba(56, 189, 248, 0.3)';
      return `
        <label
          class="campaign-option-card"
          style="cursor:${isLockedByOpposite ? 'not-allowed' : 'pointer'};opacity:${isLockedByOpposite ? '0.45' : '1'};border-color:${borderCol};"
        >
          <div style="display:flex;align-items:center;gap:10px;flex:1;">
            <input
              type="checkbox"
              class="campaign-chk"
              data-campaign-id="${opt.id}"
              ${isChecked ? 'checked' : ''}
              ${isLockedByOpposite ? 'disabled' : ''}
              style="width:17px;height:17px;accent-color:${opt.category === 'moral' ? '#4ade80' : '#f43f5e'};cursor:${isLockedByOpposite ? 'not-allowed' : 'pointer'};"
            />
            <span style="font-size:12.5px;font-weight:700;color:#ffffff;">${opt.name}</span>
          </div>
          <div style="font-size:12px;font-weight:800;color:#fde047;white-space:nowrap;">
            $${opt.cost.toLocaleString()} / month
          </div>
        </label>
      `;
    };

    const moralOptionsHtml = options
      .filter(o => o.category === 'moral')
      .map(renderOptionCheckboxRow)
      .join('');

    const corruptOptionsHtml = options
      .filter(o => o.category === 'corrupt')
      .map(renderOptionCheckboxRow)
      .join('');

    const oddYearBanner = (isOddYearPrompt || (this.world.month === 1 && this.world.day === 1 && this.world.year % 2 === 1))
      ? `<div style="background:rgba(56,189,248,0.16);border:1.5px solid #38bdf8;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11.5px;color:#e0f2fe;">
          📅 <strong>JAN 1, ${this.world.year} — ELECTION YEAR ADVISORY:</strong> Review citizen happiness in Tab 1 and select your monthly campaign options in Tab 2. Next Municipal Election: <strong>Jan 1, ${nextElectionYear}</strong>!
        </div>`
      : '';

    const isTab1 = this.advisorActiveTab === 'happiness';

    const campaignTabContentHtml = isElectionYear
      ? `
        <div class="election-summary-banner three-cols">
          <div class="bm-stat-box">
            <div class="bm-stat-label">AVAILABLE CITY FUNDS</div>
            <div class="bm-stat-val" style="color:#4ade80;">$${this.world.money.toLocaleString()}</div>
          </div>
          <div class="bm-stat-box">
            <div class="bm-stat-label">MONTHLY CAMPAIGN SPENDING</div>
            <div class="bm-stat-val" style="color:#38bdf8;">$${monthlyCampaignCost.toLocaleString()} / mo</div>
          </div>
          <div class="bm-stat-box">
            <div class="bm-stat-label">TOTAL CAMPAIGN FUNDS SPENT</div>
            <div class="bm-stat-val" style="color:#fde047;">$${totalSpent.toLocaleString()}</div>
          </div>
        </div>

        <div class="election-campaign-section">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
            <div style="font-size:11.5px;font-weight:800;color:#7dd3fc;letter-spacing:0.7px;">
              💵 CAMPAIGN SPENDING OPTIONS
            </div>
            <div style="font-size:10.5px;color:#94a3b8;">
              Selecting any Moral option locks Corrupt options and vice versa • Billed monthly from City Funds
            </div>
          </div>

          <div class="election-happiness-cols" style="margin-bottom:0;">
            <div class="election-col-box happy">
              <div class="election-col-header" style="color:#4ade80;">
                <span>🟢 MORAL OPTIONS</span>
                <span>${activeCat === 'corrupt' ? '🔒 LOCKED' : 'MONTHLY'}</span>
              </div>
              <div class="campaign-options-list">${moralOptionsHtml}</div>
            </div>

            <div class="election-col-box unhappy">
              <div class="election-col-header" style="color:#f43f5e;">
                <span>🔴 CORRUPT OPTIONS</span>
                <span>${activeCat === 'moral' ? '🔒 LOCKED' : 'MONTHLY'}</span>
              </div>
              <div class="campaign-options-list">${corruptOptionsHtml}</div>
            </div>
          </div>
        </div>
      `
      : `
        <div class="advisor-non-election-panel">
          <div class="advisor-non-election-pill">not an election year</div>
        </div>
      `;

    body.innerHTML = `
      ${oddYearBanner}

      <!-- TOP 2-TAB NAVIGATION BAR -->
      <div class="advisor-top-tabs">
        <button type="button" class="advisor-tab-btn ${isTab1 ? 'active' : ''}" data-advisor-tab="happiness">
          📊 CITIZEN HAPPINESS & TOP 5
        </button>
        <div class="advisor-tab-btn-wrap">
          <button
            type="button"
            class="advisor-tab-btn ${!isTab1 ? 'active' : ''} ${!isElectionYear ? 'greyed-out' : ''}"
            data-advisor-tab="campaign"
          >
            💵 CAMPAIGN SPENDING OPTIONS
          </button>
          ${!isElectionYear ? `<div class="advisor-tab-hover-pill">not an election year</div>` : ''}
        </div>
      </div>

      <!-- TAB 1: OVERALL CITIZEN HAPPINESS + TOP 5 HAPPY & TOP 5 UNHAPPY -->
      <div id="advisor-tab-panel-happiness" class="${isTab1 ? '' : 'hidden'}">
        <div class="election-summary-banner three-cols">
          <div class="bm-stat-box">
            <div class="bm-stat-label">OVERALL CITIZEN HAPPINESS</div>
            <div class="bm-stat-val" style="color:${approvalColor};">${hb.overallHappiness}%</div>
          </div>
          <div class="bm-stat-box">
            <div class="bm-stat-label">AVAILABLE CITY FUNDS</div>
            <div class="bm-stat-val" style="color:#4ade80;">$${this.world.money.toLocaleString()}</div>
          </div>
          <div class="bm-stat-box">
            <div class="bm-stat-label">TOTAL CAMPAIGN FUNDS SPENT</div>
            <div class="bm-stat-val" style="color:#fde047;">$${totalSpent.toLocaleString()}</div>
          </div>
        </div>

        <div class="election-happiness-cols" style="margin-bottom:4px;">
          <div class="election-col-box happy">
            <div class="election-col-header" style="color:#4ade80;">
              <span>🟢 TOP 5 THINGS THE CITY IS HAPPY ABOUT</span>
              <span>PRAISE</span>
            </div>
            <div class="election-factor-list">${happyRows}</div>
          </div>

          <div class="election-col-box unhappy">
            <div class="election-col-header" style="color:#f43f5e;">
              <span>🔴 TOP 5 THINGS THE CITY IS UNHAPPY ABOUT</span>
              <span>CONCERNS</span>
            </div>
            <div class="election-factor-list">${unhappyRows}</div>
          </div>
        </div>
      </div>

      <!-- TAB 2: CAMPAIGN SPENDING OPTIONS (OR "not an election year" IN EVEN YEARS) -->
      <div id="advisor-tab-panel-campaign" class="${!isTab1 ? '' : 'hidden'}">
        ${campaignTabContentHtml}
      </div>
    `;

    body.querySelectorAll('button[data-advisor-tab]').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const nextTab = tabBtn.getAttribute('data-advisor-tab');
        if (window.cyberAudio) window.cyberAudio.playClick();
        this.openElectionDetailsModal(isOddYearPrompt, nextTab);
      });
    });

    body.querySelectorAll('input.campaign-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const optId = chk.getAttribute('data-campaign-id');
        const res = this.world.toggleCampaignOption(optId, chk.checked);
        if (res.ok) {
          if (window.cyberAudio) window.cyberAudio.playClick();
          this.updateStreetHUD();
          this.openElectionDetailsModal(isOddYearPrompt, 'campaign');
        } else {
          chk.checked = !chk.checked;
          if (window.cyberAudio) window.cyberAudio.playError();
          alert(res.reason);
        }
      });
    });

    modal.classList.remove('hidden');
  }

  enterBuildingAtSlot(slot) {
    if (!slot || !slot.building) return;
    if (window.cyberAudio) window.cyberAudio.playClick();

    const b = slot.building;
    if (this.world.playerRole === 'businessman') {
      if (b.isHomeResidence) {
        this.openPortfolioModal();
        return;
      }
      if (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
        this.openBusinessPropertyPopup(slot);
        return;
      }
    }

    if (b.id === 'city_hall') {
      if (this.onEnterCityHall) this.onEnterCityHall();
      return;
    }

    const def = CONFIG.TOOLS[b.id];
    let title = def ? def.name : 'City Structure';
    let sign = def?.sideSign || 'BUILDING';
    if (b.category === 'zones') {
      const zDef = CONFIG.ZONE_LEVELS[b.zoneType][b.level];
      title = zDef ? zDef.name : title;
      sign = this.getCommercialShopTitle(slot);
    }

    this.inspectedBuildingModal = { title, sign, slot, tile: slot.tile, building: b };
    this.renderInteriorModal();
  }

  openBusinessPropertyPopup(slot) {
    const popup = document.getElementById('bm-property-popup');
    const badgeEl = document.getElementById('bm-popup-badge');
    const titleEl = document.getElementById('bm-popup-title');
    const bodyEl = document.getElementById('bm-popup-body');
    const hoverBox = document.getElementById('bm-choice-hover-popup');
    if (!popup || !bodyEl || !slot || !slot.tile) return;

    const tile = slot.tile;
    const b = tile.building;
    const info = this.world.getBusinessPropertyInfo(tile);
    if (!info) return;

    const isComm = b.zoneType === 'comm';
    const zoneLabel = isComm ? 'COMMERCIAL' : 'INDUSTRIAL';
    const shopTitle = this.getCommercialShopTitle(slot);

    if (badgeEl) {
      badgeEl.textContent = `${zoneLabel} PROPERTY • ${info.scale === 4 ? 'MAX LEVEL 4' : `LEVEL ${info.scale}`}`;
    }
    if (titleEl) {
      titleEl.textContent = shopTitle;
    }
    if (hoverBox) {
      hoverBox.classList.add('hidden');
      hoverBox.innerHTML = '';
    }

    const showHoverEffects = (mode) => {
      if (!hoverBox) return;
      hoverBox.classList.remove('hidden');
      if (mode === 'good') {
        hoverBox.classList.remove('corrupt-theme');
        if (isComm) {
          hoverBox.innerHTML = `
            <div style="font-weight:800;color:#4ade80;margin-bottom:4px;">🟢 GOOD COMMERCIAL CHOICE</div>
            <div>• <strong>Monthly Income:</strong> +$${info.goodIncome.toLocaleString()} / mo</div>
            <div>• <strong>Staff & Morale:</strong> Pays staff well (+14 City Morale)</div>
            <div>• <strong>Mayor Reaction:</strong> Good Mayor raises Commercial Subsidies; Corrupt Mayor lowers them.</div>
          `;
        } else {
          hoverBox.innerHTML = `
            <div style="font-weight:800;color:#4ade80;margin-bottom:4px;">🟢 GOOD INDUSTRIAL CHOICE</div>
            <div>• <strong>Monthly Income:</strong> +$${info.goodIncome.toLocaleString()} / mo</div>
            <div>• <strong>Pollution:</strong> Clean filters (only <strong>80%</strong> of normal pollution)</div>
            <div>• <strong>Worker Morale:</strong> Improves City Morale (+12)</div>
            <div>• <strong>Mayor Reaction:</strong> Good Mayor raises Industrial Subsidies; Corrupt Mayor lowers them.</div>
          `;
        }
      } else {
        hoverBox.classList.add('corrupt-theme');
        if (isComm) {
          hoverBox.innerHTML = `
            <div style="font-weight:800;color:#f43f5e;margin-bottom:4px;">🔴 CORRUPT COMMERCIAL CHOICE</div>
            <div>• <strong>Monthly Income:</strong> <span style="color:#fde047;">2x Money!</span> (+$${info.corruptIncome.toLocaleString()} / mo)</div>
            <div>• <strong>Work Conditions:</strong> Poor conditions harm Worker & City Morale (-14)</div>
            <div>• <strong>Mayor Reaction:</strong> Corrupt Mayor raises Subsidies; Good Mayor cuts them.</div>
          `;
        } else {
          hoverBox.innerHTML = `
            <div style="font-weight:800;color:#f43f5e;margin-bottom:4px;">🔴 CORRUPT INDUSTRIAL CHOICE</div>
            <div>• <strong>Monthly Income:</strong> <span style="color:#fde047;">2x Money!</span> (+$${info.corruptIncome.toLocaleString()} / mo)</div>
            <div>• <strong>Pollution:</strong> Rises to <strong>120%</strong> of current pollution</div>
            <div>• <strong>Worker Morale:</strong> Harms Worker & City Morale (-18)</div>
            <div>• <strong>Mayor Reaction:</strong> Corrupt Mayor raises Subsidies; Good Mayor cuts them.</div>
          `;
        }
      }
    };

    const hideHoverEffects = () => {
      if (hoverBox) hoverBox.classList.add('hidden');
    };

    if (!info.owned) {
      const netGoodLoan = info.goodIncome - info.estMonthlyLoanPayment;
      const netCorruptLoan = info.corruptIncome - info.estMonthlyLoanPayment;
      bodyEl.innerHTML = `
        <div class="bm-compact-metrics">
          <div class="bm-metric-line">
            <span>Cash / Available Credit:</span>
            <span><strong style="color:#4ade80;">$${this.world.businessMoney.toLocaleString()}</strong> / <strong style="color:#fde047;">$${Math.round((this.world.businessStats?.availableCredit || 0) / 1000).toLocaleString()}K</strong></span>
          </div>
          <div class="bm-metric-line">
            <span>Market Value (10x Annual):</span>
            <strong style="color:#fde047;">$${info.buyCost.toLocaleString()}</strong>
          </div>
          <div class="bm-metric-line">
            <span>20% Down Payment:</span>
            <strong style="color:#38bdf8;font-size:14px;">$${info.downPayment.toLocaleString()}</strong>
          </div>
          <div class="bm-metric-line">
            <span>Monthly Loan Payment (80%):</span>
            <strong style="color:#f87171;">-$${info.estMonthlyLoanPayment.toLocaleString()} / mo</strong>
          </div>
          <div class="bm-metric-line">
            <span>Good Gross / Net Cash Flow:</span>
            <strong style="color:#4ade80;">+$${info.goodIncome.toLocaleString()} (${netGoodLoan >= 0 ? '+' : ''}$${netGoodLoan.toLocaleString()}/mo)</strong>
          </div>
          <div class="bm-metric-line">
            <span>Corrupt Gross / Net Cash Flow:</span>
            <strong style="color:#f43f5e;">+$${info.corruptIncome.toLocaleString()} (+$${netCorruptLoan.toLocaleString()}/mo)</strong>
          </div>
        </div>
        <div style="font-size:10.5px;color:#94a3b8;text-align:center;margin-bottom:6px;">
          Finance with 20% Down ($${info.downPayment.toLocaleString()}) — hover to preview city effects:
        </div>
        <div class="bm-choice-row">
          <button id="btn-popup-buy-good" class="bm-choice-btn good">
            <span class="bm-btn-title">🏦 GOOD (20% DOWN)</span>
            <span class="bm-btn-sub">Net ${netGoodLoan >= 0 ? '+' : ''}$${netGoodLoan.toLocaleString()}/mo</span>
          </button>
          <button id="btn-popup-buy-corrupt" class="bm-choice-btn corrupt">
            <span class="bm-btn-title">🏦 CORRUPT (20% DOWN)</span>
            <span class="bm-btn-sub">Net +$${netCorruptLoan.toLocaleString()}/mo</span>
          </button>
        </div>
        ${this.world.businessMoney >= info.buyCost
          ? `<div class="bm-choice-row" style="margin-top:6px;">
              <button id="btn-popup-cash-good" class="bm-choice-btn good">
                <span class="bm-btn-title">💵 BUY CASH (GOOD)</span>
                <span class="bm-btn-sub">+$${info.goodIncome.toLocaleString()}/mo (No Debt)</span>
              </button>
              <button id="btn-popup-cash-corrupt" class="bm-choice-btn corrupt">
                <span class="bm-btn-title">💵 BUY CASH (CORRUPT)</span>
                <span class="bm-btn-sub">+$${info.corruptIncome.toLocaleString()}/mo (No Debt)</span>
              </button>
            </div>`
          : ''
        }
      `;

      const btnGood = document.getElementById('btn-popup-buy-good');
      const btnCorrupt = document.getElementById('btn-popup-buy-corrupt');
      const btnCashGood = document.getElementById('btn-popup-cash-good');
      const btnCashCorrupt = document.getElementById('btn-popup-cash-corrupt');
      btnGood?.addEventListener('mouseenter', () => showHoverEffects('good'));
      btnGood?.addEventListener('mouseleave', hideHoverEffects);
      btnCorrupt?.addEventListener('mouseenter', () => showHoverEffects('corrupt'));
      btnCorrupt?.addEventListener('mouseleave', hideHoverEffects);
      btnCashGood?.addEventListener('mouseenter', () => showHoverEffects('good'));
      btnCashGood?.addEventListener('mouseleave', hideHoverEffects);
      btnCashCorrupt?.addEventListener('mouseenter', () => showHoverEffects('corrupt'));
      btnCashCorrupt?.addEventListener('mouseleave', hideHoverEffects);

      const handlePopupBuy = (ethics, useLoan) => {
        const res = this.world.buyBusinessAt(tile.x, tile.y, ethics, useLoan);
        if (res.ok) {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          this.rebuildStreetCorridor();
          this.updateStreetHUD();
          this.openBusinessPropertyPopup(slot);
        } else {
          if (window.cyberAudio) window.cyberAudio.playError();
          alert(res.reason);
        }
      };

      btnGood?.addEventListener('click', () => handlePopupBuy('good', true));
      btnCorrupt?.addEventListener('click', () => handlePopupBuy('corrupt', true));
      btnCashGood?.addEventListener('click', () => handlePopupBuy('good', false));
      btnCashCorrupt?.addEventListener('click', () => handlePopupBuy('corrupt', false));
    } else {
      const netNow = info.netCurrentIncome;
      bodyEl.innerHTML = `
        <div class="bm-compact-metrics">
          <div class="bm-metric-line">
            <span>Cash On Hand:</span>
            <strong style="color:#4ade80;">$${this.world.businessMoney.toLocaleString()}</strong>
          </div>
          <div class="bm-metric-line">
            <span>Gross Revenue / Month:</span>
            <strong style="color:#38bdf8;">+$${info.currentIncome.toLocaleString()} / mo</strong>
          </div>
          ${info.loanBalance > 0
            ? `<div class="bm-metric-line">
                <span>Remaining Mortgage:</span>
                <strong style="color:#f87171;">$${info.loanBalance.toLocaleString()} (-$${info.loanMonthlyPayment.toLocaleString()}/mo)</strong>
              </div>`
            : `<div class="bm-metric-line">
                <span>Mortgage Status:</span>
                <strong style="color:#4ade80;">PAID OFF (DEBT-FREE) ✓</strong>
              </div>`
          }
          <div class="bm-metric-line">
            <span>Net Monthly Cash Flow:</span>
            <strong style="color:${netNow >= 0 ? '#4ade80' : '#f43f5e'};font-size:14px;">${netNow >= 0 ? '+' : ''}$${netNow.toLocaleString()} / mo</strong>
          </div>
          ${info.canUpgrade
            ? `<div class="bm-metric-line">
                <span>Upgrade to Level ${info.scale + 1}:</span>
                <strong style="color:#fde047;">$${info.upgradeDownPayment.toLocaleString()} Down ($${info.upgradeCost.toLocaleString()} Total)</strong>
              </div>`
            : `<div class="bm-metric-line">
                <span>Size Scale:</span>
                <strong style="color:#fde047;">★ MAX LEVEL 4</strong>
              </div>`
          }
        </div>
        <div style="font-size:10.5px;color:#94a3b8;text-align:center;margin-bottom:6px;">
          Hover over an operating mode to view its effects:
        </div>
        <div class="bm-choice-row">
          <button id="btn-popup-set-good" class="bm-choice-btn good ${info.ethics === 'good' ? 'selected' : ''}">
            <span class="bm-btn-title">🟢 GOOD ${info.ethics === 'good' ? '[ON]' : ''}</span>
            <span class="bm-btn-sub">+$${info.goodIncome.toLocaleString()}/mo</span>
          </button>
          <button id="btn-popup-set-corrupt" class="bm-choice-btn corrupt ${info.ethics === 'corrupt' ? 'selected' : ''}">
            <span class="bm-btn-title">🔴 CORRUPT ${info.ethics === 'corrupt' ? '[ON]' : ''}</span>
            <span class="bm-btn-sub">+$${info.corruptIncome.toLocaleString()}/mo</span>
          </button>
        </div>
        ${info.canUpgrade
          ? `<button id="btn-popup-upgrade" class="cyber-btn primary small full-w" style="margin-top:8px;">
              ⬆ FINANCE UPGRADE TO LEVEL ${info.scale + 1} ($${info.upgradeDownPayment.toLocaleString()} DOWN)
            </button>`
          : ''
        }
        ${info.loanBalance > 0
          ? `<button id="btn-popup-payoff" class="cyber-btn small full-w" style="margin-top:6px;">
              💰 PAY OFF MORTGAGE BALANCE ($${info.loanBalance.toLocaleString()})
            </button>`
          : ''
        }
      `;

      const btnGood = document.getElementById('btn-popup-set-good');
      const btnCorrupt = document.getElementById('btn-popup-set-corrupt');
      btnGood?.addEventListener('mouseenter', () => showHoverEffects('good'));
      btnGood?.addEventListener('mouseleave', hideHoverEffects);
      btnCorrupt?.addEventListener('mouseenter', () => showHoverEffects('corrupt'));
      btnCorrupt?.addEventListener('mouseleave', hideHoverEffects);

      btnGood?.addEventListener('click', () => {
        if (this.world.setBusinessEthicsAt(tile.x, tile.y, 'good').ok) {
          if (window.cyberAudio) window.cyberAudio.playClick();
          this.updateStreetHUD();
          this.openBusinessPropertyPopup(slot);
        }
      });

      btnCorrupt?.addEventListener('click', () => {
        if (this.world.setBusinessEthicsAt(tile.x, tile.y, 'corrupt').ok) {
          if (window.cyberAudio) window.cyberAudio.playClick();
          this.updateStreetHUD();
          this.openBusinessPropertyPopup(slot);
        }
      });

      document.getElementById('btn-popup-upgrade')?.addEventListener('click', () => {
        const res = this.world.upgradeBusinessAt(tile.x, tile.y, true);
        if (res.ok) {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          this.rebuildStreetCorridor();
          this.updateStreetHUD();
          this.openBusinessPropertyPopup(slot);
        } else {
          if (window.cyberAudio) window.cyberAudio.playError();
          alert(res.reason);
        }
      });

      document.getElementById('btn-popup-payoff')?.addEventListener('click', () => {
        const res = this.world.payOffBusinessLoanAt(tile.x, tile.y);
        if (res.ok) {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          this.updateStreetHUD();
          this.openBusinessPropertyPopup(slot);
        } else {
          if (window.cyberAudio) window.cyberAudio.playError();
          alert(res.reason);
        }
      });
    }

    popup.classList.remove('hidden');
  }

  renderInteriorModal() {
    const modal = document.getElementById('street-interior-modal');
    if (!modal || !this.inspectedBuildingModal) return;
    const { title, sign, tile, building } = this.inspectedBuildingModal;

    document.getElementById('interior-modal-sign').textContent = sign;
    document.getElementById('interior-modal-title').textContent = title;
    document.getElementById('interior-modal-coords').textContent =
      `GRID SQUARE ${this.world.formatSquare(tile.x, tile.y)} // ${this.headingNames[this.heading]}`;

    const body = document.getElementById('interior-modal-body');
    const isBM = this.world.playerRole === 'businessman';
    const isBizZone = building.category === 'zones' && (building.zoneType === 'comm' || building.zoneType === 'ind');

    let ownershipRow = '';
    if (isBizZone) {
      const ownerText = building.ownedByPlayer
        ? `<span style="color:#4ade80">★ OWNED BY ${(this.world.businessmanName || 'VANCE').toUpperCase()} (${building.businessEthics === 'corrupt' ? 'CORRUPT 2X' : 'GOOD / HONEST'})</span>`
        : `<span style="color:#fbbf24">AVAILABLE FOR ACQUISITION</span>`;
      ownershipRow = `<div class="insp-row"><span>Ownership Status:</span> <strong>${ownerText}</strong></div>`;
    } else if (building.isHomeResidence) {
      ownershipRow = `<div class="insp-row"><span>Residence Status:</span> <strong style="color:#38bdf8">🏠 EXECUTIVE HOME RESIDENCE HQ</strong></div>`;
    }

    body.innerHTML = `
      ${ownershipRow}
      <div class="insp-row"><span>Building Scale:</span> <strong>Scale L${Math.max(1, building.level || 1)} / 4</strong></div>
      <div class="insp-row"><span>Power Grid:</span> <strong style="color:${tile.powered ? '#38bdf8' : '#f87171'}">${tile.powered ? 'CONNECTED' : 'UNPOWERED'}</strong></div>
      <div class="insp-row"><span>Occupants / Jobs:</span> <strong>${building.pop || 0} / ${building.maxPop || 'Service'}</strong></div>
      <div class="insp-row"><span>Neighborhood Morale:</span> <strong>${tile.morale}%</strong></div>
      <div class="insp-row"><span>Healthcare Rating:</span> <strong>${tile.health}%</strong></div>
      <div class="insp-row"><span>Local Crime Rate:</span> <strong>${tile.crime}%</strong></div>
      <div class="insp-row"><span>Air Pollution:</span> <strong>${tile.pollution}%</strong></div>
    `;

    const bizPanel = document.getElementById('interior-modal-business-actions');
    if (bizPanel) {
      if (isBM && isBizZone) {
        bizPanel.classList.remove('hidden');
        const info = this.world.getBusinessPropertyInfo(tile);
        const isComm = building.zoneType === 'comm';
        const goodDesc = isComm
          ? 'Pay staff well (+14 Neighborhood Morale)'
          : 'Clean filters (80% of normal pollution & +12 Morale)';
        const corruptDesc = isComm
          ? 'Bad working conditions (2x Money, -14 Morale)'
          : '120% Pollution & harms worker morale (2x Money)';

        const allScalesHtml = [1, 2, 3, 4].map(sc => {
          const sCfg = CONFIG.BUSINESS_SCALES[sc];
          const active = sc === info.scale;
          return `<div class="bm-scale-pill ${active ? 'active' : ''}">
            <div>SCALE L${sc}</div>
            <div>Buy: $${sCfg.buyCost.toLocaleString()}</div>
            <div>Base: +$${sCfg.baseIncome}/mo</div>
          </div>`;
        }).join('');

        if (!info.owned) {
          bizPanel.innerHTML = `
            <div class="bm-action-header">
              <span>💼 ACQUIRE ${isComm ? 'COMMERCIAL' : 'INDUSTRIAL'} ZONE (SCALE L${info.scale})</span>
              <span class="bm-cash-tag">YOUR FUNDS: $${this.world.businessMoney.toLocaleString()}</span>
            </div>
            <div class="bm-scale-strip">${allScalesHtml}</div>
            <div class="bm-sub-note">
              Active ${isComm ? 'Commercial' : 'Industrial'} City Subsidy: <strong>+${info.subsidyPct}%</strong>
              (AI Mayor ${this.world.mayorName}: <strong>${this.world.aiMayorAlignment.toUpperCase()}</strong>)
            </div>
            <div class="bm-action-grid">
              <button id="btn-bm-buy-good" class="cyber-btn bm-choice-btn good">
                <div class="bm-btn-title">🟢 BUY & RUN AS GOOD ($${info.buyCost.toLocaleString()})</div>
                <div class="bm-btn-sub">Income: +$${info.goodProfit}/mo • ${goodDesc}</div>
              </button>
              <button id="btn-bm-buy-corrupt" class="cyber-btn bm-choice-btn corrupt">
                <div class="bm-btn-title">🔴 BUY & RUN AS CORRUPT ($${info.buyCost.toLocaleString()})</div>
                <div class="bm-btn-sub">Income: +$${info.corruptProfit}/mo (2x!) • ${corruptDesc}</div>
              </button>
            </div>
          `;

          document.getElementById('btn-bm-buy-good')?.addEventListener('click', () => {
            const res = this.world.buyBusinessAt(tile.x, tile.y, 'good');
            if (res.ok) {
              if (window.cyberAudio) window.cyberAudio.playUpgrade();
              this.rebuildStreetCorridor();
              this.inspectedBuildingModal.building = tile.building;
              const zDef = CONFIG.ZONE_LEVELS[tile.building.zoneType][tile.building.level];
              this.inspectedBuildingModal.title = zDef ? zDef.name : this.inspectedBuildingModal.title;
              this.renderInteriorModal();
              this.updateStreetHUD();
            } else {
              if (window.cyberAudio) window.cyberAudio.playError();
              alert(res.reason);
            }
          });

          document.getElementById('btn-bm-buy-corrupt')?.addEventListener('click', () => {
            const res = this.world.buyBusinessAt(tile.x, tile.y, 'corrupt');
            if (res.ok) {
              if (window.cyberAudio) window.cyberAudio.playUpgrade();
              this.rebuildStreetCorridor();
              this.inspectedBuildingModal.building = tile.building;
              const zDef = CONFIG.ZONE_LEVELS[tile.building.zoneType][tile.building.level];
              this.inspectedBuildingModal.title = zDef ? zDef.name : this.inspectedBuildingModal.title;
              this.renderInteriorModal();
              this.updateStreetHUD();
            } else {
              if (window.cyberAudio) window.cyberAudio.playError();
              alert(res.reason);
            }
          });
        } else {
          const curProfit = info.ethics === 'corrupt' ? info.corruptProfit : info.goodProfit;
          bizPanel.innerHTML = `
            <div class="bm-action-header">
              <span>★ MANAGING OWNED ${isComm ? 'COMMERCIAL' : 'INDUSTRIAL'} BUSINESS (SCALE L${info.scale})</span>
              <span class="bm-cash-tag">YOUR FUNDS: $${this.world.businessMoney.toLocaleString()}</span>
            </div>
            <div class="bm-scale-strip">${allScalesHtml}</div>
            <div class="bm-sub-note">
              Current Profit: <strong style="color:#4ade80">+$${curProfit}/mo</strong> (Includes +${info.subsidyPct}% Subsidy)
            </div>
            <div class="bm-action-grid">
              <button id="btn-bm-set-good" class="cyber-btn bm-choice-btn good ${info.ethics === 'good' ? 'selected' : ''}">
                <div class="bm-btn-title">🟢 RUN AS GOOD ${info.ethics === 'good' ? '[ACTIVE]' : ''}</div>
                <div class="bm-btn-sub">+$${info.goodProfit}/mo • ${goodDesc}</div>
              </button>
              <button id="btn-bm-set-corrupt" class="cyber-btn bm-choice-btn corrupt ${info.ethics === 'corrupt' ? 'selected' : ''}">
                <div class="bm-btn-title">🔴 RUN AS CORRUPT ${info.ethics === 'corrupt' ? '[ACTIVE]' : ''}</div>
                <div class="bm-btn-sub">+$${info.corruptProfit}/mo (2x!) • ${corruptDesc}</div>
              </button>
            </div>
            <div style="margin-top:8px;">
              ${info.canUpgrade
                ? `<button id="btn-bm-upgrade-scale" class="cyber-btn primary full-w">
                    ⬆ UPGRADE BUILDING TO SCALE L${info.scale + 1} ($${info.upgradeCost.toLocaleString()}) — GROWS BUILDING SIZE & OUTPUT!
                  </button>`
                : `<div class="bm-max-scale-tag">★ MAXIMUM BUILDING SCALE (L4) ACHIEVED</div>`
              }
            </div>
          `;

          document.getElementById('btn-bm-set-good')?.addEventListener('click', () => {
            if (this.world.setBusinessEthicsAt(tile.x, tile.y, 'good').ok) {
              if (window.cyberAudio) window.cyberAudio.playClick();
              this.renderInteriorModal();
              this.updateStreetHUD();
            }
          });

          document.getElementById('btn-bm-set-corrupt')?.addEventListener('click', () => {
            if (this.world.setBusinessEthicsAt(tile.x, tile.y, 'corrupt').ok) {
              if (window.cyberAudio) window.cyberAudio.playClick();
              this.renderInteriorModal();
              this.updateStreetHUD();
            }
          });

          document.getElementById('btn-bm-upgrade-scale')?.addEventListener('click', () => {
            const res = this.world.upgradeBusinessAt(tile.x, tile.y);
            if (res.ok) {
              if (window.cyberAudio) window.cyberAudio.playUpgrade();
              this.rebuildStreetCorridor();
              const zDef = CONFIG.ZONE_LEVELS[tile.building.zoneType][tile.building.level];
              this.inspectedBuildingModal.title = zDef ? zDef.name : this.inspectedBuildingModal.title;
              this.renderInteriorModal();
              this.updateStreetHUD();
            } else {
              if (window.cyberAudio) window.cyberAudio.playError();
              alert(res.reason);
            }
          });
        }
      } else {
        bizPanel.classList.add('hidden');
        bizPanel.innerHTML = '';
      }
    }

    modal.classList.remove('hidden');
  }

  openPortfolioModal() {
    const modal = document.getElementById('business-portfolio-modal');
    const body = document.getElementById('portfolio-modal-body');
    if (!modal || !body) return;

    this.world.recalculateTotals();
    const bs = this.world.businessStats;
    const netFlow = bs.netMonthlyCashFlow ?? ((bs.monthlyIncome || 0) - (bs.monthlyLoanPayments || 0));
    const mayorAlign = this.world.aiMayorAlignment === 'corrupt' ? 'CORRUPT MAYOR' : 'GOOD / HONEST MAYOR';
    const alignColor = this.world.aiMayorAlignment === 'corrupt' ? '#f43f5e' : '#4ade80';
    const alignHint = this.world.aiMayorAlignment === 'good'
      ? 'Rewards GOOD businesses with higher subsidies; cuts subsidies if you run CORRUPT operations.'
      : 'Rewards CORRUPT businesses with higher subsidies; cuts subsidies if you run GOOD operations.';

    const ownedRows = bs.ownedList.length === 0
      ? `<div class="bm-empty-portfolio">You do not own any Commercial or Industrial businesses yet. Walk down the street and press <strong>[E]</strong> (or click any property on the City Map) to finance one with <strong>20% down</strong>!</div>`
      : bs.ownedList.map(item => `
          <div class="bm-portfolio-item">
            <div class="bm-port-info">
              <div class="bm-port-title">
                <strong>${item.name}</strong>
                <span class="bm-ethics-badge ${item.ethics}">${item.ethics === 'corrupt' ? 'CORRUPT (2x)' : 'GOOD'}</span>
              </div>
              <div class="bm-port-meta">
                Square ${this.world.formatSquare(item.x, item.y)} • ${item.zoneType === 'comm' ? 'Commercial' : 'Industrial'} • Scale L${item.level} •
                Gross: <strong style="color:#38bdf8">+$${item.monthlyProfit.toLocaleString()}/mo</strong>
                ${item.loanBalance > 0
                  ? `• Loan: <strong style="color:#f87171">$${item.loanBalance.toLocaleString()} (-$${item.loanPayment.toLocaleString()}/mo)</strong> • Net: <strong style="color:${item.netProfit >= 0 ? '#4ade80' : '#f43f5e'}">${item.netProfit >= 0 ? '+' : ''}$${item.netProfit.toLocaleString()}/mo</strong>`
                  : `• <strong style="color:#4ade80">DEBT-FREE ✓</strong>`
                }
              </div>
            </div>
            <div class="bm-port-actions">
              <button class="cyber-btn small" data-port-act="toggle" data-x="${item.x}" data-y="${item.y}" data-next="${item.ethics === 'good' ? 'corrupt' : 'good'}">
                Switch to ${item.ethics === 'good' ? 'Corrupt' : 'Good'}
              </button>
              ${item.level < 4
                ? `<button class="cyber-btn small primary" data-port-act="upgrade" data-x="${item.x}" data-y="${item.y}">
                    Upg L${item.level + 1} ($${(item.upgradeDownPayment || 0).toLocaleString()} Dn)
                  </button>`
                : `<span class="slot-empty-tag">MAX L4</span>`
              }
              ${item.loanBalance > 0
                ? `<button class="cyber-btn small" data-port-act="payoff" data-x="${item.x}" data-y="${item.y}">
                    Pay Loan ($${item.loanBalance.toLocaleString()})
                  </button>`
                : ''
              }
              <button class="cyber-btn small accent" data-port-act="visit" data-x="${item.x}" data-y="${item.y}">
                🚶 Visit
              </button>
            </div>
          </div>
        `).join('');

    body.innerHTML = `
      <div class="bm-portfolio-summary-grid">
        <div class="bm-stat-box">
          <div class="bm-stat-label">CASH ON HAND</div>
          <div class="bm-stat-val" style="color:#4ade80">$${this.world.businessMoney.toLocaleString()}</div>
        </div>
        <div class="bm-stat-box">
          <div class="bm-stat-label">GROSS / LOAN PAYMENTS</div>
          <div class="bm-stat-val" style="color:#38bdf8;font-size:13px;">+$${bs.monthlyIncome.toLocaleString()} / <span style="color:#f87171">-$${(bs.monthlyLoanPayments || 0).toLocaleString()}</span></div>
        </div>
        <div class="bm-stat-box">
          <div class="bm-stat-label">NET MONTHLY CASH FLOW</div>
          <div class="bm-stat-val" style="color:${netFlow >= 0 ? '#4ade80' : '#f43f5e'}">${netFlow >= 0 ? '+' : ''}$${netFlow.toLocaleString()}/mo</div>
        </div>
        <div class="bm-stat-box">
          <div class="bm-stat-label">TOTAL DEBT / AVAIL CREDIT</div>
          <div class="bm-stat-val" style="color:#fde047;font-size:13px;">$${(bs.totalDebt || 0).toLocaleString()} / $${Math.round((bs.availableCredit || 0) / 1000).toLocaleString()}K</div>
        </div>
      </div>

      <div class="bm-mayor-relation-box">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <span>🏛 <strong>AI Mayor ${this.world.mayorName || 'Charles'}</strong>: <strong style="color:${alignColor}">${mayorAlign}</strong></span>
          <span>Comm Subsidy: <strong>+${this.world.commSubsidy}%</strong> | Ind Subsidy: <strong>+${this.world.indSubsidy}%</strong></span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${alignHint}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(56,189,248,0.25);display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11.5px;font-weight:700;color:#fde047;">
            <input type="checkbox" id="chk-bm-run-for-mayor" ${this.world.playerRunningForMayor ? 'checked' : ''} style="width:16px;height:16px;accent-color:#fde047;cursor:pointer;" />
            <span>🗳 Run for Mayor in Next Municipal Election (Jan 1, ${this.world.year % 2 === 1 ? this.world.year + 1 : this.world.year + 2})</span>
          </label>
          <span style="font-size:10px;color:#94a3b8;">If AI Mayor loses, you take office as Mayor!</span>
        </div>
      </div>

      <div class="bm-portfolio-list-header">OWNED COMMERCIAL & INDUSTRIAL ENTERPRISES (${bs.ownedCount}) • NET WORTH: $${(bs.netWorth || this.world.businessMoney).toLocaleString()}</div>
      <div class="bm-portfolio-list">${ownedRows}</div>
    `;

    body.querySelectorAll('button[data-port-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-port-act');
        const gx = Number(btn.getAttribute('data-x'));
        const gy = Number(btn.getAttribute('data-y'));
        if (act === 'toggle') {
          const nextEthics = btn.getAttribute('data-next');
          this.world.setBusinessEthicsAt(gx, gy, nextEthics);
          if (window.cyberAudio) window.cyberAudio.playClick();
          this.openPortfolioModal();
          this.updateStreetHUD();
        } else if (act === 'upgrade') {
          const res = this.world.upgradeBusinessAt(gx, gy, true);
          if (res.ok) {
            if (window.cyberAudio) window.cyberAudio.playUpgrade();
            this.rebuildStreetCorridor();
            this.openPortfolioModal();
            this.updateStreetHUD();
          } else {
            if (window.cyberAudio) window.cyberAudio.playError();
            alert(res.reason);
          }
        } else if (act === 'payoff') {
          const res = this.world.payOffBusinessLoanAt(gx, gy);
          if (res.ok) {
            if (window.cyberAudio) window.cyberAudio.playUpgrade();
            this.openPortfolioModal();
            this.updateStreetHUD();
          } else {
            if (window.cyberAudio) window.cyberAudio.playError();
            alert(res.reason);
          }
        } else if (act === 'visit') {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          modal.classList.add('hidden');
          this.syncOutsideTile(gx, gy);
          this.updateStreetHUD();
        }
      });
    });

    const chkRunMayor = document.getElementById('chk-bm-run-for-mayor');
    if (chkRunMayor) {
      chkRunMayor.addEventListener('change', () => {
        if (window.cyberAudio) window.cyberAudio.playClick();
        this.world.playerRunningForMayor = chkRunMayor.checked;
      });
    }

    modal.classList.remove('hidden');
  }

  trigger90DegreeRotation(dir = 1, cornerSlot = null) {
    if (this.turning90 || this.crossingStreet) return;
    this.turning90 = true;
    this.turnProgress = 0;
    this.turnDir = dir;
    this.pendingTurnTarget = cornerSlot;
    if (window.cyberAudio) window.cyberAudio.playUpgrade();
  }

  getNearestCrosswalk(maxDist = 115) {
    let bestSlot = null;
    let bestDist = maxDist;
    for (const cwSlot of this.crosswalkSlots) {
      const cwx = cwSlot * this.slotWidth;
      const d = Math.abs(this.mayorX - cwx);
      if (d < bestDist) {
        bestDist = d;
        bestSlot = cwSlot;
      }
    }
    return bestSlot;
  }

  triggerStreetCrossing(cwSlot = null) {
    if (this.crossingStreet || this.turning90) return;
    const targetCwSlot = cwSlot !== null ? cwSlot : this.getNearestCrosswalk(135);
    if (targetCwSlot === null) return;

    this.mayorX = targetCwSlot * this.slotWidth;
    this.crossingStreet = true;
    this.crossProgress = 0;
    this.crossSwapped = false;
    this.crossFromSide = this.streetSide;
    if (window.cyberAudio) window.cyberAudio.playClick();
  }

  getNearestCrossStreet(maxDist = 110) {
    let best = null;
    let bestDist = maxDist;
    for (const slot of this.slots) {
      if (!slot.isCrossStreet) continue;
      const cornerX = slot.worldX + this.slotWidth * 0.5;
      const d = Math.abs(this.mayorX - cornerX);
      if (d < bestDist) {
        bestDist = d;
        best = slot;
      }
    }
    return best;
  }

  getNearestBuildingSlot(maxDist = 85) {
    let best = null;
    let bestDist = maxDist;
    for (const slot of this.slots) {
      if (slot.skipFacade || !slot.building || this.world.isRoadSurface(slot.tile)) continue;
      const anchorX = slot.doorWorldX ?? slot.facadeCenterX ?? slot.worldX;
      const reach = slot.spanSlots === 2 ? Math.max(maxDist, 145) : maxDist;
      const d = Math.abs(this.mayorX - anchorX);
      if (d < reach && d < bestDist + (slot.spanSlots === 2 ? 60 : 0)) {
        bestDist = d;
        best = slot;
      }
    }
    return best;
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;

    // Indoor Location Mode (Mayor's Office between City Map and Street View)
    if (this.indoorLocation === 'mayor_office') {
      let moveDir = 0;
      if (this.keys.left && this.keys.right) {
        moveDir = this.lastKeyPressed === 'L' ? -1 : 1;
      } else if (this.keys.left) {
        moveDir = -1;
      } else if (this.keys.right) {
        moveDir = 1;
      }

      if (moveDir !== 0) {
        const indoorSpeed = 0.24;
        this.indoorMayorX = Math.max(0.08, Math.min(0.91, this.indoorMayorX + moveDir * indoorSpeed * dt));
      }

      const animDir = this.moonwalkMode ? -moveDir : moveDir;
      this.updateMayorAnimation(dt, animDir);
      if (this.mayorWalking) {
        this.walkCycle += dt * 9;
      } else {
        this.walkCycle = 0;
      }

      if (this.indoorMayorX <= 0.28) {
        this.mayorActivity = 'At Wall Map [Click Map or Press E for City Map]';
      } else if (this.indoorMayorX >= 0.56 && this.indoorMayorX <= 0.88) {
        this.mayorActivity = 'With Advisor [Click or Press E for Election Details]';
      } else if (this.indoorMayorX > 0.88) {
        this.mayorActivity = 'At Office Door [Click or Press E for Street View]';
      } else {
        this.mayorActivity = "Inside the Mayor's Office [Press E for Advisor]";
      }

      this.updateStreetHUD();
      return;
    }

    if (this.turning90) {
      this.turnProgress += dt * 1.65;
      if (this.turnProgress >= 1) {
        this.turning90 = false;
        this.turnProgress = 0;

        // Snap streetOrigin to the target intersection road tile (or the road tile currently under the Mayor)
        const currentSlotIdx = Math.round(this.mayorX / this.slotWidth);
        const fallbackSlot = this.slots.find(s => s.slotIndex === currentSlotIdx);
        const targetSlot = this.pendingTurnTarget || this.getNearestCrossStreet(180) || fallbackSlot;
        if (targetSlot) {
          this.streetOrigin = {
            x: targetSlot.roadGridX,
            y: targetSlot.roadGridY
          };
        }

        // Turn onto the intersecting perpendicular street
        const fwdVecs = [
          { dx: 1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: -1 }
        ];
        const facingHeading = (this.heading + (this.streetSide > 0 ? 3 : 1)) % 4;
        const oppositeHeading = (facingHeading + 2) % 4;
        const fVec = fwdVecs[facingHeading];
        const oVec = fwdVecs[oppositeHeading];
        const hasFacingRoad =
          this.world.getTile(this.streetOrigin.x + fVec.dx, this.streetOrigin.y + fVec.dy)?.building?.category === 'roads';
        const hasOppositeRoad =
          this.world.getTile(this.streetOrigin.x + oVec.dx, this.streetOrigin.y + oVec.dy)?.building?.category === 'roads';

        if (this.pendingTurnTarget && hasFacingRoad) {
          this.heading = facingHeading;
        } else if (this.turnDir < 0) {
          this.heading = hasFacingRoad ? facingHeading : (hasOppositeRoad ? oppositeHeading : (this.heading + 3) % 4);
        } else {
          this.heading = hasFacingRoad ? facingHeading : (hasOppositeRoad ? oppositeHeading : (this.heading + 1) % 4);
        }

        this.streetSide = 1;
        this.mayorX = 0;
        this.cameraX = 0;
        this.rebuildStreetCorridor();
        this.initAmbientEntities();
        this.updateStreetHUD();
      }
      return;
    }

    if (this.crossingStreet) {
      this.crossProgress += dt * 1.85;
      this.cameraX += (this.mayorX - this.cameraX) * Math.min(1, dt * 10);
      this.updateMayorAnimation(dt, this.mayorLastDir === 'L' ? -1 : 1);
      if (!this.crossSwapped && this.crossProgress >= 0.5) {
        this.crossSwapped = true;
        this.streetSide = -this.streetSide;
        this.rebuildStreetCorridor();
      }
      if (this.crossProgress >= 1) {
        this.crossingStreet = false;
        this.crossProgress = 0;
        this.updateMayorAnimation(dt, 0);
      }
      this.mayorActivity = 'Crossing Street at Crosswalk';
      this.updateStreetHUD();
      return;
    }

    const moveSpeed = 230;
    let moveDir = 0;
    if (this.keys.left && this.keys.right) {
      moveDir = this.lastKeyPressed === 'L' ? -1 : 1;
    } else if (this.keys.left) {
      moveDir = -1;
    } else if (this.keys.right) {
      moveDir = 1;
    }

    if (moveDir !== 0) {
      this.mayorX += moveDir * moveSpeed * dt;
    }

    const minBound = this.corridorMinX ?? (-11 * this.slotWidth);
    const maxBound = this.corridorMaxX ?? (11 * this.slotWidth);
    this.mayorX = Math.max(minBound, Math.min(maxBound, this.mayorX));

    // When Moonwalk Mode is enabled, invert the walking animation rules (holding right plays left animation and vice versa)
    const animDir = this.moonwalkMode ? -moveDir : moveDir;
    this.updateMayorAnimation(dt, animDir);

    if (this.mayorWalking) {
      this.walkCycle += dt * 9;
    } else {
      this.walkCycle = 0;
    }

    this.cameraX += (this.mayorX - this.cameraX) * Math.min(1, dt * 6);

    const nearCorner = this.getNearestCrossStreet(135);
    const nearBuilding = this.getNearestBuildingSlot(75);
    const nearCrosswalk = this.getNearestCrosswalk(65);
    const isBM = this.world.playerRole === 'businessman';
    if (nearCorner) {
      this.mayorActivity = 'Approaching Cross Street';
    } else if (nearBuilding && nearBuilding.building) {
      const nb = nearBuilding.building;
      if (isBM && nb.isHomeResidence) {
        this.mayorActivity = 'Outside Residence HQ [Press E for Portfolio]';
      } else if (nb.id === 'city_hall') {
        this.mayorActivity = isBM ? 'Outside City Hall [Press E for Map]' : 'Outside City Hall [Press E]';
      } else if (isBM && nb.category === 'zones' && (nb.zoneType === 'comm' || nb.zoneType === 'ind')) {
        const shopName = this.getCommercialShopTitle(nearBuilding);
        this.mayorActivity = nb.ownedByPlayer
          ? `Managing ${shopName} (L${nb.level}) [Press E]`
          : `For Sale: ${shopName} (L${Math.max(1, nb.level)}) [Press E]`;
      } else {
        const shopName = this.getCommercialShopTitle(nearBuilding);
        this.mayorActivity = `Inspecting ${shopName}`;
      }
    } else if (nearCrosswalk !== null) {
      this.mayorActivity = 'At Crosswalk [W / S to Cross]';
    } else {
      this.mayorActivity = isBM ? 'Scouting Business Properties' : 'Inspecting the Town';
    }

    this.trainX += 190 * dt;
    if (this.trainX > 2200) this.trainX = -1400;

    const bounds = this.getActiveRenderBounds(this.canvas.width || 1280);

    // Animate Computer AI Mayor NPC walking around the street when playing as Business Man
    if (this.aiMayorNPC) {
      const npc = this.aiMayorNPC;
      npc.x += npc.dir * npc.speed * dt;
      if (npc.x > maxBound - 80) {
        npc.x = maxBound - 80;
        npc.dir = -1;
      } else if (npc.x < minBound + 80) {
        npc.x = minBound + 80;
        npc.dir = 1;
      }
      npc.animTimer = (npc.animTimer || 0) + dt;
      const npcFrameDur = 1 / 18;
      while (npc.animTimer >= npcFrameDur) {
        npc.animTimer -= npcFrameDur;
        npc.walkIndex = ((npc.walkIndex || 1) % 36) + 1;
      }
    }

    // Each 4-frame step covers ~27.6px on screen (6.9px per frame), locking foot plant to sidewalk travel (~6.5-8 FPS)
    const stridePixelsPerFrame = 6.9;
    for (const p of this.pedestrians) {
      const moveDist = p.speed * dt;
      p.x += p.dir * moveDist;
      p.phase += dt * 5;
      p.distAccumulator = (p.distAccumulator || 0) + moveDist;
      while (p.distAccumulator >= stridePixelsPerFrame) {
        p.distAccumulator -= stridePixelsPerFrame;
        p.frameIndex = ((p.frameIndex || 0) + 1) % 8;
      }
      if (p.x > bounds.rawMaxX) p.x = bounds.rawMinX + Math.random() * 60;
      if (p.x < bounds.rawMinX) p.x = bounds.rawMaxX - Math.random() * 60;
    }

    const vehFrameDuration = 1 / 12; // 12 FPS for car (6 frames) and bus (4 frames: bus3..bus6)
    for (const v of this.streetVehicles) {
      v.x += v.dir * v.speed * dt;
      if (v.dir > 0 && v.x > bounds.rawMaxX + 180) v.x = bounds.rawMinX - 160;
      if (v.dir < 0 && v.x < bounds.rawMinX - 180) v.x = bounds.rawMaxX + 160;

      const frameCount = v.kind === 'bus' ? 4 : 6;
      v.animTimer = (v.animTimer || 0) + dt;
      while (v.animTimer >= vehFrameDuration) {
        v.animTimer -= vehFrameDuration;
        v.frameIndex = ((v.frameIndex || 0) + 1) % frameCount;
      }
    }

    this.updateStreetHUD();
  }

  updateMayorAnimation(dt, moveDir) {
    const frameDuration = 1 / 18; // 18 FPS

    if (moveDir === 0) {
      this.mayorWalking = false;
      this.mayorTransitionQueue = [];
      this.mayorWalkIndex = 0;
      this.mayorAnimTimer = 0;
      this.mayorFrame = this.mayorLastDir === 'L' ? 'L' : 'R';
      this.idleTime += dt;
      this.prevMoveDir = 0;
      return;
    }

    this.mayorWalking = true;
    const targetDirChar = moveDir > 0 ? 'R' : 'L';

    if (moveDir !== this.prevMoveDir) {
      const switchedQuicklyFromOpposite =
        this.prevMoveDir === -moveDir ||
        (this.lastWalkDir === -moveDir && this.idleTime < frameDuration);

      this.mayorWalkIndex = 0;
      this.mayorAnimTimer = 0;
      this.mayorTransitionQueue = [];

      if (moveDir === 1) {
        if (switchedQuicklyFromOpposite) {
          // Quickly switching from Left to Right: L -> R -> 1R..36R
          this.mayorFrame = 'L';
          this.mayorTransitionQueue = ['R'];
        } else if (this.mayorFrame === 'L') {
          // Starting Right from position L: R -> 1R..36R
          this.mayorFrame = 'R';
        } else {
          // Starting Right from position R: 1R -> 2R..36R
          this.mayorWalkIndex = 1;
          this.mayorFrame = '1R';
        }
      } else {
        if (switchedQuicklyFromOpposite) {
          // Quickly switching from Right to Left: R -> L -> L1..L36
          this.mayorFrame = 'R';
          this.mayorTransitionQueue = ['L'];
        } else if (this.mayorFrame === 'R') {
          // Starting Left from position R: L -> L1..L36
          this.mayorFrame = 'L';
        } else {
          // Starting Left from position L: L1 -> L2..L36
          this.mayorWalkIndex = 1;
          this.mayorFrame = 'L1';
        }
      }
    } else {
      this.mayorAnimTimer += dt;
      while (this.mayorAnimTimer >= frameDuration) {
        this.mayorAnimTimer -= frameDuration;
        if (this.mayorTransitionQueue.length > 0) {
          this.mayorFrame = this.mayorTransitionQueue.shift();
        } else {
          this.mayorWalkIndex = (this.mayorWalkIndex % 36) + 1;
          this.mayorFrame = moveDir > 0 ? `${this.mayorWalkIndex}R` : `L${this.mayorWalkIndex}`;
        }
      }
    }

    this.mayorLastDir = targetDirChar;
    this.mayorDir = moveDir;
    this.lastWalkDir = moveDir;
    this.idleTime = 0;
    this.prevMoveDir = moveDir;
  }

  getCommercialShopTitle(slot) {
    const b = slot.building;
    if (!b) return 'EMPTY LOT';
    if (b.category !== 'zones') {
      return CONFIG.TOOLS[b.id]?.sideSign || CONFIG.TOOLS[b.id]?.name.toUpperCase() || 'BUILDING';
    }
    if (b.level === 0) return 'CONSTRUCTION SITE';
    if (b.zoneType === 'comm') {
      if (b.level === 1) {
        const names = ['BAKERY', 'GROCERY STORE', 'CAFE'];
        const idx = Math.abs(slot.gridX + slot.gridY) % 3;
        return names[idx];
      }
      if (b.level === 2) {
        const names = ['GROCERY STORE', 'MARKET PLAZA', 'CAFE & BISTRO'];
        return names[Math.abs(slot.gridX) % 3];
      }
      if (b.level === 3) return 'COMMERCE OFFICES';
      if (b.level === 4) return 'CENTRAL TOWER';
    }
    if (b.zoneType === 'res') {
      if (b.level === 1) return 'TOWNHOUSES';
      if (b.level === 2) return 'APARTMENTS';
      if (b.level === 3) return 'RESIDENCE TOWER';
      return 'GRAND CONDOS';
    }
    if (b.zoneType === 'ind') {
      if (b.level === 1) return 'WAREHOUSE';
      if (b.level === 2) return 'FACTORY WORKS';
      return 'STEEL FOUNDRY';
    }
    return 'BUILDING';
  }

  getSidewalkCompassLabel(side = this.streetSide) {
    const labelsByHeading = [
      { '1': 'NORTH SIDE', '-1': 'SOUTH SIDE' },
      { '1': 'EAST SIDE', '-1': 'WEST SIDE' },
      { '1': 'SOUTH SIDE', '-1': 'NORTH SIDE' },
      { '1': 'WEST SIDE', '-1': 'EAST SIDE' }
    ];
    return labelsByHeading[this.heading]?.[String(side)] || 'NORTH SIDE';
  }

  getMayorGridPos() {
    const fwdVecs = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    const facadeVecs = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }
    ];
    const fwd = fwdVecs[this.heading];
    const baseFac = facadeVecs[this.heading];
    const slotFloat = this.mayorX / this.slotWidth;

    let sideFactor = this.streetSide;
    if (this.crossingStreet) {
      const fromSide = this.crossFromSide;
      const toSide = -fromSide;
      sideFactor = fromSide + (toSide - fromSide) * Math.min(1, Math.max(0, this.crossProgress));
    }

    const roadX = this.streetOrigin.x + fwd.dx * slotFloat;
    const roadY = this.streetOrigin.y + fwd.dy * slotFloat;
    return {
      x: roadX + baseFac.dx * (0.42 * sideFactor),
      y: roadY + baseFac.dy * (0.42 * sideFactor),
      roadX,
      roadY
    };
  }

  updateStreetHUD() {
    const moneyEl = document.getElementById('street-hud-money');
    const popEl = document.getElementById('street-hud-pop');
    const mayorNameEl = document.getElementById('street-mayor-name');
    const statusEl = document.getElementById('street-mayor-status');
    const streetNameEl = document.getElementById('street-heading-label');
    const sideTagEl = document.getElementById('street-minimap-side-tag');
    const btnHomeHq = document.getElementById('btn-street-home-hq');
    const btnEnterHall = document.getElementById('btn-street-enter-hall');
    const btnHammer = document.getElementById('btn-street-hammer');

    const isBM = this.world.playerRole === 'businessman';
    const mayorName = this.world.mayorName || 'Charles';
    const bmName = this.world.businessmanName || 'Vance';
    const sideLabel = this.getSidewalkCompassLabel(this.streetSide);

    if (isBM) {
      if (moneyEl) moneyEl.textContent = `$${this.world.businessMoney.toLocaleString()}`;
      if (popEl) {
        const bs = this.world.businessStats;
        const netMo = bs.netMonthlyCashFlow ?? bs.monthlyIncome;
        popEl.textContent = `${bs.ownedCount} Owned (${netMo >= 0 ? '+' : ''}$${netMo.toLocaleString()}/mo net)`;
      }
      if (mayorNameEl) mayorNameEl.textContent = `Executive ${bmName}:`;
      if (btnHomeHq) btnHomeHq.classList.remove('hidden');
      if (btnEnterHall) btnEnterHall.textContent = '🗺 OWNERSHIP MAP';
      if (btnHammer) btnHammer.classList.add('hidden');
    } else {
      if (moneyEl) moneyEl.textContent = `$${this.world.money.toLocaleString()}`;
      if (popEl) popEl.textContent = this.world.population.toLocaleString();
      if (mayorNameEl) mayorNameEl.textContent = `Mayor ${mayorName}:`;
      if (btnHomeHq) btnHomeHq.classList.add('hidden');
      if (btnEnterHall) btnEnterHall.textContent = "🏛 MAYOR'S OFFICE";
      if (btnHammer) btnHammer.classList.remove('hidden');
    }

    if (statusEl) statusEl.textContent = this.mayorActivity;
    if (sideTagEl) sideTagEl.textContent = sideLabel;
    if (streetNameEl) {
      if (this.indoorLocation === 'mayor_office') {
        streetNameEl.textContent = `🏛 INDOORS // MAYOR'S OFFICE (CITY HALL HQ)`;
      } else {
        streetNameEl.textContent = `${this.headingNames[this.heading]} (${sideLabel}) // SQUARE ${this.world.formatSquare(this.streetOrigin.x, this.streetOrigin.y)}`;
      }
    }
  }

  // ==================== MAIN RENDER PIPELINE ====================
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (this.indoorLocation === 'mayor_office') {
      this.renderIndoorMayorOffice(ctx, W, H);
      return;
    }

    const groundY = Math.floor(H * 0.77);

    ctx.save();

    if (this.turning90) {
      const p = this.turnProgress;
      const anglePhase = Math.sin(p * Math.PI);
      ctx.translate(W * 0.5, H * 0.5);
      ctx.scale(1 - anglePhase * 0.35, 1);
      ctx.transform(1, anglePhase * 0.12 * this.turnDir, 0, 1, -anglePhase * 120 * this.turnDir, 0);
      ctx.translate(-W * 0.5, -H * 0.5);
    }

    // 1. Layer 4: Sky Gradient & Blueprint Grid
    this.drawSkyAndBlueprintGrid(ctx, W, H, groundY);

    // 2. Layer 3 & Layer 2: Parallax Skyline, Train Viaduct & Pylons
    this.drawFarSkylineParallax(ctx, W, H, groundY);
    this.drawElevatedTrainParallax(ctx, W, H, groundY);
    this.drawBackgroundPowerPylons(ctx, W, H, groundY);

    // 3. Foreground World-Space
    ctx.save();
    ctx.translate(W * 0.5 - this.cameraX, 0);

    // Layer 1: Render Sidewalk and Road (culled to visible screen + half-screen off-screen on each side)
    const renderBounds = this.getActiveRenderBounds(W);
    this.drawSidewalkAndRoad(ctx, W, H, groundY);

    // Layer 1.5: Render Building Facades (only within visible screen + half-screen off-screen buffer on either side)
    for (const slot of this.slots) {
      if (slot.skipFacade && !slot.isCrossStreet) continue;
      const slotCenter = slot.facadeCenterX ?? slot.worldX;
      const halfSpan = slot.spanSlots === 2 ? this.slotWidth : this.slotWidth * 0.5;
      if (slotCenter + halfSpan < renderBounds.rawMinX || slotCenter - halfSpan > renderBounds.rawMaxX) continue;

      if (slot.isCrossStreet) {
        this.draw90DegreeCornerIntersection(ctx, slot, groundY);
      } else {
        this.drawBuildingFacadeSlot(ctx, slot, groundY);
      }
    }

    // Layer 1.5: Sidewalk Props, AI Mayor NPC (when playing as Business Man), Player Character, and Foreground Vehicles
    this.drawSidewalkPropsAndPedestrians(ctx, groundY);
    if (this.world.playerRole === 'businessman') {
      this.drawAIMayorNPC(ctx, groundY);
    }
    this.drawColoringBookMayor(ctx, this.mayorX, groundY);
    this.drawForegroundVehicles(ctx, groundY);

    ctx.restore();
    ctx.restore();

    // Render perfectly top-down City Minimap with Mayor's glowing #38bdf8 blue dot
    this.renderTopDownMinimap();
  }

  renderIndoorMayorOffice(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = '#061224';
    ctx.fillRect(0, 0, W, H);

    // 1. Draw Full-Screen Mayor's Office Background PNG
    const officeImg = window.SPRITES?.buildings?.['indoor_mayor_office'];
    if (officeImg && officeImg.complete && officeImg.naturalWidth > 0) {
      ctx.drawImage(officeImg, 0, 0, W, H);
    }

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);

    // 2. Interactive Hotspot 1: Left Wall Map ("MAP OF THE CITY")
    const mapNear = this.indoorMayorX <= 0.28;
    const mapHover = this.indoorHoveredTarget === 'wall_map';
    const mapActive = mapNear || mapHover;
    const mapX = Math.round(W * 0.020);
    const mapY = Math.round(H * 0.058);
    const mapW = Math.round(W * 0.188);
    const mapH = Math.round(H * 0.505);

    ctx.save();
    if (mapActive) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = mapHover ? 3 : 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = mapHover ? 18 : 10;
      ctx.strokeRect(mapX, mapY, mapW, mapH);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
      ctx.fillRect(mapX, mapY, mapW, mapH);
    } else {
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.22 + pulse * 0.18})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mapX, mapY, mapW, mapH);
    }

    // Floating callout pill below Left Wall Map
    const mapLabel = mapActive ? '🗺 CLICK MAP OR PRESS [E]: CITY MAP OPTIONS' : '🗺 MAP OF THE CITY [Click]';
    ctx.font = 'bold 11.5px "Segoe UI", sans-serif';
    const mapTagW = Math.max(175, Math.ceil(ctx.measureText(mapLabel).width) + 18);
    const mapTagX = mapX + Math.round((mapW - mapTagW) * 0.5);
    const mapTagY = mapY + mapH + 8;
    ctx.fillStyle = mapActive ? 'rgba(8, 28, 56, 0.94)' : 'rgba(10, 22, 42, 0.82)';
    ctx.strokeStyle = mapActive ? '#7dd3fc' : 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(mapTagX, mapTagY, mapTagW, 24);
    ctx.strokeRect(mapTagX, mapTagY, mapTagW, 24);
    ctx.fillStyle = mapActive ? '#ffffff' : '#bae6fd';
    ctx.textAlign = 'center';
    ctx.fillText(mapLabel, mapTagX + mapTagW * 0.5, mapTagY + 16);
    ctx.restore();

    // 3. Interactive Hotspot 2: Man on the Right (Election & Happiness Advisor)
    const advNear = this.indoorMayorX >= 0.56 && this.indoorMayorX <= 0.88;
    const advHover = this.indoorHoveredTarget === 'advisor';
    const advActive = advNear || advHover;
    const advX = Math.round(W * 0.752);
    const advY = Math.round(H * 0.410);
    const advW = Math.round(W * 0.102);
    const advH = Math.round(H * 0.520);

    ctx.save();
    if (advActive) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = advHover ? 2.5 : 1.8;
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 14;
      ctx.strokeRect(advX, advY, advW, advH);
    }

    const advLabel = advActive
      ? '📊 CLICK ADVISOR OR PRESS [E]: ELECTION & HAPPINESS MENU'
      : '📊 Campaign Advisor [Click for Election Details]';
    ctx.font = 'bold 11.5px "Segoe UI", sans-serif';
    const advTagW = Math.max(190, Math.ceil(ctx.measureText(advLabel).width) + 18);
    const advTagX = Math.min(W - advTagW - 14, Math.max(14, Math.round(advX + advW * 0.5 - advTagW * 0.5)));
    const advTagY = advY - 32;
    ctx.fillStyle = advActive ? 'rgba(30, 24, 10, 0.94)' : 'rgba(10, 22, 42, 0.86)';
    ctx.strokeStyle = advActive ? '#fde047' : '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.fillRect(advTagX, advTagY, advTagW, 24);
    ctx.strokeRect(advTagX, advTagY, advTagW, 24);
    ctx.fillStyle = advActive ? '#fef08a' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(advLabel, advTagX + advTagW * 0.5, advTagY + 16);
    ctx.restore();

    // 4. Interactive Hotspot 3: Far Right Office Door (Exit to Street View)
    const doorNear = this.indoorMayorX > 0.88;
    const doorHover = this.indoorHoveredTarget === 'exit_door';
    const doorActive = doorNear || doorHover;
    if (doorActive) {
      const doorX = Math.round(W * 0.908);
      const doorY = Math.round(H * 0.250);
      const doorW = Math.round(W * 0.084);
      const doorH = Math.round(H * 0.690);
      ctx.save();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 14;
      ctx.strokeRect(doorX, doorY, doorW, doorH);
      const doorLabel = '🚶 EXIT TO STREET [Click / E]';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      const dw = Math.ceil(ctx.measureText(doorLabel).width) + 16;
      const dx = Math.min(W - dw - 10, doorX + doorW * 0.5 - dw * 0.5);
      ctx.fillStyle = 'rgba(10, 28, 42, 0.94)';
      ctx.fillRect(dx, doorY - 28, dw, 22);
      ctx.strokeRect(dx, doorY - 28, dw, 22);
      ctx.fillStyle = '#4ade80';
      ctx.textAlign = 'center';
      ctx.fillText(doorLabel, dx + dw * 0.5, doorY - 13);
      ctx.restore();
    }

    // 5. Draw Mayor Charles Running Back and Forth Across the Bottom Floor (lowered slightly on Y axis to sit nicely on the office floor)
    const mayorPx = Math.round(this.indoorMayorX * W);
    const mayorFootY = Math.round(H * 0.975);
    this.drawIndoorMayor(ctx, mayorPx, mayorFootY, H);

    ctx.restore();
  }

  drawIndoorMayor(ctx, x, footY, H) {
    const frameKey = this.mayorFrame || 'R';
    const frameImg = window.SPRITES?.mayor?.[frameKey];
    const isIdleOrTransition = frameKey === 'R' || frameKey === 'L';
    // Advisor spans ~0.515 * H (from y=0.415*H to y=0.930*H).
    // At base 1.0x street scale, the visible Mayor character is 90px tall, so (H * 0.51) / 90 (~2.45x larger than H/430) matches the Advisor's height!
    const scaleFactor = (H * 0.51) / 90;

    ctx.save();
    ctx.translate(x, footY);

    if (!frameImg || !frameImg.complete || !frameImg.naturalWidth || isIdleOrTransition) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(0, 2, 26 * (scaleFactor * 0.45), 7 * (scaleFactor * 0.45), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(56, 189, 248, 0.55)';
      ctx.shadowBlur = 8;
      this.drawMayorSpriteNormalized(ctx, frameImg, frameKey, scaleFactor);
      ctx.restore();
    }

    // Status tag beside Mayor's feet
    const mayorLabel = `Mayor ${this.world.mayorName || 'Charles'}: ${this.mayorActivity}`;
    ctx.font = 'bold 11.5px "Segoe UI", sans-serif';
    const tagW = Math.max(155, Math.ceil(ctx.measureText(mayorLabel).width) + 16);
    const tagX = x > (this.canvas.width * 0.72) ? -tagW - 36 : 36;
    ctx.fillStyle = 'rgba(10, 22, 44, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(tagX, -24, tagW, 22);
    ctx.strokeRect(tagX, -24, tagW, 22);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(mayorLabel, tagX + 8, -9);

    ctx.restore();
  }

  renderTopDownMinimap() {
    const miniCanvas = document.getElementById('street-minimap-canvas');
    if (!miniCanvas) return;
    const mCtx = miniCanvas.getContext('2d');
    const W = miniCanvas.width;
    const H = miniCanvas.height;

    const mayorPos = this.getMayorGridPos();
    const viewSpan = 22; // 22x22 city tiles centered on the Mayor for crisp top-down clarity
    const cellW = W / viewSpan;
    const cellH = H / viewSpan;
    const startX = mayorPos.roadX - viewSpan * 0.5;
    const startY = mayorPos.roadY - viewSpan * 0.5;

    mCtx.fillStyle = '#030814';
    mCtx.fillRect(0, 0, W, H);

    const minGX = Math.floor(startX) - 1;
    const maxGX = Math.ceil(startX + viewSpan) + 1;
    const minGY = Math.floor(startY) - 1;
    const maxGY = Math.ceil(startY + viewSpan) + 1;

    // 1. Draw Top-Down Terrain, Roads & Building Footprints
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const t = this.world.getTile(gx, gy);
        const px = (gx - startX) * cellW;
        const py = (gy - startY) * cellH;
        if (!t) continue;

        let col = '#071b24';
        if (t.terrain === 'river' || t.terrain === 'lake') col = '#0284c7';
        else if (t.terrain === 'forest') col = '#064e3b';

        if (t.building) {
          const b = t.building;
          if (this.world.hasRail(t)) col = '#a855f7'; // Purple for raised rail on the minimap
          else if (b.category === 'roads') col = '#475569';
          else if (b.category === 'zones') {
            if (b.zoneType === 'res') col = b.level === 4 ? '#fef08a' : '#4ade80';
            else if (b.zoneType === 'comm') col = b.level === 4 ? '#f0abfc' : '#2563eb';
            else col = '#fbbf24';
          } else if (b.id === 'city_hall') col = '#e879f9';
          else if (b.id === 'school' || b.id === 'university') col = '#fb7185';
          else if (b.id === 'fire') col = '#ef4444';
          else if (b.id === 'police') col = '#60a5fa';
          else if (b.id === 'park') col = '#22c55e';
          else if (b.category === 'power') col = '#facc15';
          else col = '#c084fc';
        } else if (this.world.hasRail(t)) {
          col = '#a855f7';
        }

        mCtx.fillStyle = col;
        mCtx.fillRect(px, py, Math.ceil(cellW), Math.ceil(cellH));

        // Highlight Player-Owned Businesses and Home Residence on top-down minimap
        if (t.building && t.building.ownedByPlayer) {
          mCtx.strokeStyle = t.building.businessEthics === 'corrupt' ? '#f43f5e' : '#10b981';
          mCtx.lineWidth = 1.8;
          mCtx.strokeRect(px + 0.5, py + 0.5, cellW - 1, cellH - 1);
        } else if (t.building && t.building.isHomeResidence && this.world.playerRole === 'businessman') {
          mCtx.strokeStyle = '#facc15';
          mCtx.lineWidth = 1.8;
          mCtx.strokeRect(px + 0.5, py + 0.5, cellW - 1, cellH - 1);
        } else if (t.building && t.building.category !== 'roads') {
          mCtx.strokeStyle = 'rgba(2, 6, 23, 0.55)';
          mCtx.lineWidth = 0.7;
          mCtx.strokeRect(px, py, cellW, cellH);
        }
      }
    }

    // 2. Highlight Crosswalk Stripes on the active street corridor in top-down view
    const fwdVecs = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    const fwd = fwdVecs[this.heading];
    mCtx.fillStyle = 'rgba(224, 242, 254, 0.85)';
    for (const cwSlot of this.crosswalkSlots) {
      const cwgx = this.streetOrigin.x + fwd.dx * cwSlot;
      const cwgy = this.streetOrigin.y + fwd.dy * cwSlot;
      const cwPx = (cwgx - startX) * cellW;
      const cwPy = (cwgy - startY) * cellH;
      mCtx.fillRect(cwPx + cellW * 0.2, cwPy + cellH * 0.2, cellW * 0.6, cellH * 0.6);
    }

    // 2.5 When playing as Business Man, draw AI Mayor NPC dot on the top-down minimap
    if (this.world.playerRole === 'businessman' && this.aiMayorNPC) {
      const npcSlotFloat = this.aiMayorNPC.x / this.slotWidth;
      const npcGX = this.streetOrigin.x + fwd.dx * npcSlotFloat;
      const npcGY = this.streetOrigin.y + fwd.dy * npcSlotFloat;
      const npcPx = (npcGX + 0.5 - startX) * cellW;
      const npcPy = (npcGY + 0.5 - startY) * cellH;
      mCtx.save();
      mCtx.fillStyle = this.world.aiMayorAlignment === 'corrupt' ? '#f43f5e' : '#facc15';
      mCtx.strokeStyle = '#ffffff';
      mCtx.lineWidth = 1.2;
      mCtx.beginPath();
      mCtx.arc(npcPx, npcPy, 3.3, 0, Math.PI * 2);
      mCtx.fill();
      mCtx.stroke();
      mCtx.restore();
    }

    // 3. Draw Mayor's Moving Blue Dot (matching the #38bdf8 glowing ring under his feet when standing still)
    const dotX = (mayorPos.x + 0.5 - startX) * cellW;
    const dotY = (mayorPos.y + 0.5 - startY) * cellH;

    mCtx.save();
    // Outer pulsing cyan-blue ring & glow (matches drawColoringBookMayor idle foot ring: #38bdf8 / rgba(56, 189, 248, 0.22))
    mCtx.shadowColor = '#38bdf8';
    mCtx.shadowBlur = 10;
    mCtx.fillStyle = 'rgba(56, 189, 248, 0.28)';
    mCtx.strokeStyle = '#38bdf8';
    mCtx.lineWidth = 1.6;
    mCtx.beginPath();
    mCtx.arc(dotX, dotY, 6.2, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.stroke();

    // Inner bright #38bdf8 blue dot with #bae6fd highlight
    mCtx.fillStyle = '#38bdf8';
    mCtx.beginPath();
    mCtx.arc(dotX, dotY, 3.6, 0, Math.PI * 2);
    mCtx.fill();

    mCtx.fillStyle = '#e0f2fe';
    mCtx.beginPath();
    mCtx.arc(dotX - 0.8, dotY - 0.8, 1.3, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
  }

  // Helper: positive modulo for seamless infinite horizontal parallax wrapping
  wrapOffset(val, span) {
    if (!span || span <= 0) return 0;
    return ((val % span) + span) % span;
  }

  // ==================== LAYER 4: SKY BACKDROP (Parallax: 0.05x) ====================
  drawSkyAndBlueprintGrid(ctx, W, H, groundY) {
    const skyKey = this.daylightMode && window.SPRITES?.buildings['bg_sky_day']?.complete
      ? 'bg_sky_day'
      : 'bg_sky';
    const bgSky = window.SPRITES?.buildings[skyKey];

    if (bgSky && bgSky.complete && bgSky.naturalWidth > 0) {
      const crop = window.SPRITES.crops?.[skyKey] || { sx: 0, sy: 0, sw: bgSky.naturalWidth, sh: bgSky.naturalHeight };
      const drawH = Math.max(groundY + 80, Math.round(H * 0.85));
      const drawW = Math.round((drawH / crop.sh) * crop.sw);
      const offsetX = this.wrapOffset(-(this.cameraX * 0.05), drawW);

      for (let x = offsetX - drawW; x < W + drawW; x += drawW - 1) {
        ctx.drawImage(bgSky, crop.sx, crop.sy, crop.sw, crop.sh, Math.floor(x), 0, drawW, drawH);
      }
      return;
    }
  }

  // ==================== LAYER 3: DISTANT SKYLINE (Parallax: 0.18x) ====================
  drawFarSkylineParallax(ctx, W, H, groundY) {
    const skylineKey = this.daylightMode && window.SPRITES?.buildings['bg_skyline_far_day']?.complete
      ? 'bg_skyline_far_day'
      : 'bg_skyline_far';
    const bgSkyline = window.SPRITES?.buildings[skylineKey];
    const parallaxFactor = 0.18;

    if (bgSkyline && bgSkyline.complete && bgSkyline.naturalWidth > 0) {
      const crop = window.SPRITES.crops?.[skylineKey] || {
        sx: 0,
        sy: 0,
        sw: bgSkyline.naturalWidth,
        sh: bgSkyline.naturalHeight
      };
      // Scale distant skyline so tall towers reach high into the upper sky and base sits flush at groundY + 12
      const drawH = Math.round(groundY * 0.94);
      const drawW = Math.round((drawH / crop.sh) * crop.sw);
      const drawY = groundY + 12 - drawH;
      const offsetX = this.wrapOffset(-(this.cameraX * parallaxFactor), drawW);

      for (let x = offsetX - drawW; x < W + drawW; x += drawW - 1) {
        ctx.drawImage(
          bgSkyline,
          crop.sx,
          crop.sy,
          crop.sw,
          crop.sh,
          Math.floor(x),
          drawY,
          drawW,
          drawH
        );
      }
    }
  }

  // ==================== LAYER 2A: ELEVATED TRAIN VIADUCT (Parallax: 0.35x) ====================
  drawElevatedTrainParallax(ctx, W, H, groundY) {
    const viaductKey = this.daylightMode && window.SPRITES?.buildings['bg_train_day']?.complete
      ? 'bg_train_day'
      : (window.SPRITES?.buildings['bg_train_viaduct']?.complete ? 'bg_train_viaduct' : 'bg_train');
    const bgTrain = window.SPRITES?.buildings[viaductKey];
    const parallaxFactor = 0.35;
    const parallaxX = -(this.cameraX * parallaxFactor);

    if (bgTrain && bgTrain.complete && bgTrain.naturalWidth > 0) {
      const crop = window.SPRITES.crops?.[viaductKey] || {
        sx: 0,
        sy: 230,
        sw: bgTrain.naturalWidth,
        sh: bgTrain.naturalHeight - 230
      };
      // Scale viaduct & piers so the piers rest on groundY + 8 and the elevated rail deck sits right above 2-story storefronts
      const drawH = Math.round(groundY * 0.74);
      const drawW = Math.round((drawH / crop.sh) * crop.sw);
      const drawY = groundY + 8 - drawH;
      const offsetX = this.wrapOffset(parallaxX, drawW);

      for (let x = offsetX - drawW; x < W + drawW; x += drawW - 1) {
        ctx.drawImage(
          bgTrain,
          crop.sx,
          crop.sy,
          crop.sw,
          crop.sh,
          Math.floor(x),
          drawY,
          drawW,
          drawH
        );
      }
    }
  }

  // ==================== LAYER 2B: POWER LINES & PYLONS (Parallax: 0.44x) ====================
  drawBackgroundPowerPylons(ctx, W, H, groundY) {
    const powerImg = window.SPRITES?.buildings['bg_power_lines'];
    if (!powerImg || !powerImg.complete || powerImg.naturalWidth === 0) return;

    const crop = window.SPRITES.crops?.['bg_power_lines'] || {
      sx: 1360,
      sy: 230,
      sw: 1390,
      sh: 1208
    };
    const parallaxFactor = 0.44;
    const drawH = Math.round(groundY * 0.74);
    const drawW = Math.round((drawH / crop.sh) * crop.sw);
    const drawY = groundY + 8 - drawH;
    const span = drawW * 2.4;
    const offsetX = this.wrapOffset(-(this.cameraX * parallaxFactor) + 520, span);

    for (let x = offsetX - span; x < W + span; x += span) {
      ctx.drawImage(
        powerImg,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        Math.floor(x),
        drawY,
        drawW,
        drawH
      );
    }
  }

  // ==================== LAYER 1: SIDEWALK & STREET DECK (SPRITE-BLITTED) ====================
  drawSidewalkAndRoad(ctx, W, H, groundY) {
    const curbMid = window.SPRITES?.buildings['curb_mid'];
    const curbLeft = window.SPRITES?.buildings['curb_left'];
    const curbRight = window.SPRITES?.buildings['curb_right'];
    const roadAsphalt = window.SPRITES?.buildings['road_asphalt'];
    const crosswalkImg = window.SPRITES?.buildings['crosswalk'];

    // Baseline Street Deck Geometry
    const sidewalkH = 54;
    const curbH = 12;
    const sidewalkAndCurbH = sidewalkH + curbH; // 66px
    const roadTop = groundY + sidewalkAndCurbH;
    const roadH = Math.max(140, H - roadTop + 40);

    const bounds = this.getActiveRenderBounds(W);
    const startX = bounds.minX;
    const endX = bounds.maxX;

    // 1. Tile `road_asphalt` seamlessly across the active street render window (aligned to tileW grid)
    if (roadAsphalt && roadAsphalt.complete && roadAsphalt.naturalWidth > 0) {
      const rCrop = window.SPRITES.crops?.['road_asphalt'] || {
        sx: 463,
        sy: 123,
        sw: 84,
        sh: 264
      };
      const tileW = 140;
      const firstRoadX = Math.floor(startX / tileW) * tileW;
      for (let x = firstRoadX; x < endX; x += tileW) {
        ctx.drawImage(
          roadAsphalt,
          rCrop.sx,
          rCrop.sy,
          rCrop.sw,
          rCrop.sh,
          Math.floor(x),
          roadTop - 2,
          tileW + 2,
          roadH
        );
      }
    }

    // 2. Tile `curb_mid` (sidewalk slabs + curb lip) seamlessly along the active sidewalk render window
    if (curbMid && curbMid.complete && curbMid.naturalWidth > 0) {
      const cCrop = window.SPRITES.crops?.['curb_mid'] || {
        sx: 232,
        sy: 63,
        sw: 280,
        sidewalkH: 85
      };
      const curbTileW = 220;
      const firstCurbX = Math.floor(startX / curbTileW) * curbTileW;
      for (let x = firstCurbX; x < endX; x += curbTileW) {
        ctx.drawImage(
          curbMid,
          cCrop.sx,
          cCrop.sy,
          cCrop.sw,
          cCrop.sidewalkH,
          Math.floor(x),
          groundY - 2,
          curbTileW + 2,
          sidewalkAndCurbH + 4
        );
      }
    }

    // 3. Stamp `crosswalk` and `curb_left` / `curb_right` corners at periodic street crossings within the render window
    if (crosswalkImg && crosswalkImg.complete && crosswalkImg.naturalWidth > 0) {
      const cwCrop = window.SPRITES.crops?.['crosswalk'] || {
        sx: 458,
        sy: 112,
        sw: 120,
        sh: 258
      };
      const clCrop = window.SPRITES.crops?.['curb_left'];
      const crCrop = window.SPRITES.crops?.['curb_right'];

      for (const cwSlot of this.crosswalkSlots) {
        const cwx = cwSlot * this.slotWidth;
        const cwW = 116;
        if (cwx + cwW < startX || cwx - cwW > endX) continue;

        // Crosswalk curb end caps
        if (curbLeft && curbLeft.complete && clCrop) {
          ctx.drawImage(
            curbLeft,
            clCrop.sx,
            clCrop.sy,
            clCrop.sw,
            clCrop.sidewalkH,
            Math.floor(cwx - cwW * 0.5 - 38),
            groundY - 2,
            42,
            sidewalkAndCurbH + 4
          );
        }
        if (curbRight && curbRight.complete && crCrop) {
          ctx.drawImage(
            curbRight,
            crCrop.sx,
            crCrop.sy,
            crCrop.sw,
            crCrop.sidewalkH,
            Math.floor(cwx + cwW * 0.5 - 4),
            groundY - 2,
            42,
            sidewalkAndCurbH + 4
          );
        }

        // Zebra crosswalk across asphalt road
        ctx.drawImage(
          crosswalkImg,
          cwCrop.sx,
          cwCrop.sy,
          cwCrop.sw,
          cwCrop.sh,
          Math.floor(cwx - cwW * 0.5),
          roadTop - 2,
          cwW,
          roadH
        );

        // Highlight & interactive prompt when Mayor is near or hovering over this crosswalk
        const isNearCw = Math.abs(this.mayorX - cwx) < 75;
        const isHoveredCw = this.hoveredCrosswalkSlot === cwSlot;
        if (isNearCw || isHoveredCw) {
          const targetSideLabel = this.getSidewalkCompassLabel(-this.streetSide);
          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 12;
          ctx.strokeRect(Math.floor(cwx - cwW * 0.5 + 4), roadTop + 2, cwW - 8, Math.min(roadH - 12, 118));

          const bounce = Math.sin(this.time * 5) * 3;
          const badgeY = roadTop + 34 + bounce;
          ctx.fillStyle = 'rgba(10, 25, 47, 0.92)';
          ctx.fillRect(cwx - 82, badgeY - 16, 164, 24);
          ctx.strokeRect(cwx - 82, badgeY - 16, 164, 24);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10.5px "Segoe UI", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`CROSS TO ${targetSideLabel} [W/S]`, cwx, badgeY);
          ctx.restore();
        }
      }
    }
  }

  // ==================== LAYER 1.5: BUILDING FACADES ====================
  drawBuildingFacadeSlot(ctx, slot, groundY) {
    if (slot.skipFacade) return;
    const cx = slot.facadeCenterX ?? slot.worldX;
    const b = slot.building;

    // Do not render anything when Raised Rail Track is placed next to a road
    if (b && b.id === 'monorail') {
      return;
    }

    if (!b) {
      this.drawUndevelopedLotFacade(ctx, slot, cx, groundY);
      return;
    }

    // Civic, Emergency & Education Sprites (City Hall, School, University = 2-block; Fire, Police = 1-block)
    if (['city_hall', 'fire', 'police', 'school', 'university'].includes(b.id)) {
      const img = window.SPRITES?.buildings[b.id];
      if (img && img.complete && img.naturalWidth > 0) {
        this.drawSpriteFacade(ctx, img, b.id, slot, cx, groundY);
        return;
      }
      if (b.id === 'city_hall') {
        this.drawCityHallFacade(ctx, slot, cx, groundY);
        return;
      }
      if (b.id === 'fire') {
        this.drawFireStationFacade(ctx, slot, cx, groundY);
        return;
      }
    }

    if (b.category === 'zones' && b.level === 0) {
      const img = window.SPRITES?.buildings['comm_0'];
      if (img && img.complete && img.naturalWidth > 0) {
        this.drawSpriteFacade(ctx, img, 'comm_0', slot, cx, groundY);
        return;
      }
      this.drawConstructionSiteFacade(ctx, slot, cx, groundY);
      return;
    }

    // Commercial Growth Levels
    let spriteKey = null;
    if (b.category === 'zones' && b.zoneType === 'comm') {
      const variants = ['comm_1_bakery', 'comm_1_grocery', 'comm_1_cafe'];
      spriteKey = variants[Math.abs(slot.gridX + slot.gridY) % 3];
    }

    const spriteImg = spriteKey ? window.SPRITES?.buildings[spriteKey] : null;

    if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
      this.drawSpriteFacade(ctx, spriteImg, spriteKey, slot, cx, groundY);
      return;
    }

    // Default procedural fallback for other civic types/unloaded assets
    this.drawProceduralBuildingFacade(ctx, slot, cx, groundY);
  }

  drawSpriteFacade(ctx, img, spriteKey, slot, cx, groundY) {
    const b = slot.building;
    const isZone = Boolean(b && b.category === 'zones');
    const level = (isZone && typeof b.level === 'number') ? b.level : 1;
    const crop = window.SPRITES?.crops?.[spriteKey] || {
      sx: 0,
      sy: 0,
      sw: img.naturalWidth,
      sh: img.naturalHeight,
      baseH: 250,
      doorRatio: 0.68
    };

    let heightMultiplier = 1.0;
    if (isZone) {
      if (level === 2) heightMultiplier = 1.18;
      else if (level === 3) heightMultiplier = 1.36;
      else if (level >= 4) heightMultiplier = 1.56;
    }

    const aspect = crop.sw / crop.sh;
    let drawW;
    let drawH;
    if (crop.targetW && crop.targetH) {
      drawW = Math.round(crop.targetW * heightMultiplier);
      drawH = Math.round(crop.targetH * heightMultiplier);
    } else if (crop.targetW) {
      drawW = Math.round(crop.targetW * heightMultiplier);
      drawH = Math.round(drawW / aspect);
    } else {
      drawH = Math.round((crop.baseH || 250) * heightMultiplier);
      drawW = Math.round(drawH * aspect);
    }

    const left = Math.round(cx - drawW * 0.5);
    // Anchor bottom of cropped building directly onto the back edge of the sidewalk
    const yOff = crop.yOffset ?? 6;
    const top = Math.round(groundY + yOff - drawH);

    ctx.drawImage(
      img,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      left,
      top,
      drawW,
      drawH
    );

    this.drawBusinessPropertyBadge(ctx, slot, cx, top, groundY);

    if (!crop.noDoor) {
      const doorW = 40;
      const doorH = 58;
      const doorRatio = crop.doorRatio ?? 0.68;
      const doorX = Math.round(left + drawW * doorRatio - doorW * 0.5);
      const doorY = groundY - doorH + 4;
      slot.doorWorldX = doorX + doorW * 0.5;
      const doorLabel = this.getDoorPromptLabel(slot);
      this.drawInteractiveDoor(ctx, slot, doorX, doorY, doorW, doorH, doorLabel, true);
    }
  }

  getDoorPromptLabel(slot) {
    const b = slot.building;
    if (!b) return 'ENTER [E]';
    if (b.id === 'city_hall') return "MAYOR'S OFFICE [E]";
    if (this.world.playerRole === 'businessman') {
      if (b.isHomeResidence) return 'PORTFOLIO HQ [E]';
      if (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
        return b.ownedByPlayer ? 'MANAGE BIZ [E]' : 'BUY ZONE [E]';
      }
    }
    return 'ENTER [E]';
  }

  drawBusinessPropertyBadge(ctx, slot, cx, topY, groundY) {
    if (this.world.playerRole !== 'businessman') return;
    const b = slot.building;
    if (!b) return;

    let badgeText = null;
    let borderCol = '#38bdf8';
    let bgCol = 'rgba(10, 22, 42, 0.92)';

    if (b.isHomeResidence) {
      badgeText = `🏠 ${(this.world.businessmanName || 'VANCE').toUpperCase()}'S RESIDENCE HQ [E]`;
      borderCol = '#facc15';
    } else if (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
      const info = this.world.getBusinessPropertyInfo(slot.tile);
      if (!info) return;
      if (b.ownedByPlayer) {
        const profit = b.businessEthics === 'corrupt' ? info.corruptProfit : info.goodProfit;
        const modeTag = b.businessEthics === 'corrupt' ? 'CORRUPT 2X' : 'GOOD';
        badgeText = `★ OWNED L${info.scale} (${modeTag}) • +$${profit}/MO`;
        borderCol = b.businessEthics === 'corrupt' ? '#f43f5e' : '#4ade80';
      } else {
        badgeText = `FOR SALE: $${info.buyCost.toLocaleString()} (SCALE L${info.scale}) [E]`;
        borderCol = '#fbbf24';
      }
    }

    if (!badgeText) return;

    const by = Math.max(46, topY - 18);
    ctx.save();
    ctx.font = 'bold 10.5px "Segoe UI", monospace';
    const tw = Math.max(150, Math.ceil(ctx.measureText(badgeText).width) + 18);
    ctx.fillStyle = bgCol;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 2;
    ctx.shadowColor = borderCol;
    ctx.shadowBlur = 10;
    ctx.fillRect(cx - tw * 0.5, by - 14, tw, 22);
    ctx.strokeRect(cx - tw * 0.5, by - 14, tw, 22);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, cx, by + 1);
    ctx.restore();
  }

  drawProceduralBuildingFacade(ctx, slot, cx, groundY) {
    const b = slot.building;
    const w = b.category === 'zones' ? (176 + Math.max(1, b.level || 1) * 14) : 196;
    const left = cx - w * 0.5;
    let h = 185;
    const signText = this.getCommercialShopTitle(slot);

    if (b.category === 'zones') {
      if (b.level === 1) h = 155 + (slot.slotIndex % 2) * 35;
      else if (b.level === 2) h = 225;
      else if (b.level === 3) h = 310;
      else if (b.level === 4) h = 395;
    } else if (['nuclear_plant', 'coal_plant', 'stadium', 'hospital', 'university'].includes(b.id)) {
      h = 250;
    } else if (b.id === 'park') {
      this.drawParkFacade(ctx, slot, cx, groundY);
      return;
    }

    const top = groundY - h;

    const depthW = 22;
    ctx.fillStyle = this.daylightMode ? '#64748b' : '#1d3557';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left + w, top);
    ctx.lineTo(left + w + depthW, top + 12);
    ctx.lineTo(left + w + depthW, groundY - 4);
    ctx.lineTo(left + w, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.daylightMode ? '#94a3b8' : '#355685';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3.2;
    ctx.fillRect(left, top, w, h);
    ctx.strokeRect(left, top, w, h);

    ctx.fillStyle = this.daylightMode ? '#e2e8f0' : '#5882b8';
    ctx.fillRect(left - 5, top - 10, w + 10, 12);
    ctx.strokeRect(left - 5, top - 10, w + 10, 12);

    this.drawRooftopDetails(ctx, b, left, top, w);

    const floors = Math.max(1, Math.floor((h - 95) / 58));
    for (let f = 0; f < floors; f++) {
      const wy = top + 20 + f * 56;
      for (let col = 0; col < 3; col++) {
        const wx = left + 20 + col * 58;
        ctx.fillStyle = this.daylightMode ? '#334155' : '#1a2e4c';
        ctx.fillRect(wx, wy, 36, 40);
        ctx.strokeRect(wx, wy, 36, 40);
        ctx.fillStyle = (f + col + slot.slotIndex) % 3 === 0 ? '#bae6fd' : '#3b5d8a';
        ctx.fillRect(wx + 4, wy + 4, 28, 32);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wx - 3, wy + 38, 42, 5);
        ctx.strokeRect(wx - 3, wy + 38, 42, 5);
      }
    }

    const signY = groundY - 106;
    ctx.fillStyle = '#102542';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(left + 14, signY, w - 28, 30);
    ctx.strokeRect(left + 14, signY, w - 28, 30);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(signText, cx, signY + 21);
    ctx.restore();

    if (b.category === 'zones' && b.zoneType === 'comm') {
      const awnY = groundY - 74;
      const stripes = 7;
      const sw = (w - 16) / stripes;
      for (let s = 0; s < stripes; s++) {
        ctx.fillStyle = s % 2 === 0 ? '#e0f2fe' : '#3b82f6';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(left + 8 + s * sw, awnY);
        ctx.lineTo(left + 8 + (s + 1) * sw, awnY);
        ctx.lineTo(left + 4 + (s + 1) * sw, awnY + 18);
        ctx.lineTo(left + 4 + s * sw, awnY + 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    const winX = left + 18;
    const winY = groundY - 52;
    ctx.fillStyle = '#bae6fd';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.8;
    ctx.fillRect(winX, winY, 92, 38);
    ctx.strokeRect(winX, winY, 92, 38);

    ctx.fillStyle = 'rgba(30, 58, 138, 0.35)';
    ctx.fillRect(winX + 8, winY + 10, 24, 28);
    ctx.fillRect(winX + 42, winY + 6, 36, 32);

    const doorX = left + w - 58;
    const doorY = groundY - 56;
    slot.doorWorldX = doorX + 19;
    this.drawBusinessPropertyBadge(ctx, slot, cx, top, groundY);
    const doorLabel = this.getDoorPromptLabel(slot);
    this.drawInteractiveDoor(ctx, slot, doorX, doorY, 38, 56, doorLabel);
  }

  drawCityHallFacade(ctx, slot, cx, groundY) {
    const w = 228;
    const h = 255;
    const left = cx - w * 0.5;
    const top = groundY - h;

    ctx.fillStyle = '#1e3a63';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left + w, top + 28);
    ctx.lineTo(left + w + 22, top + 40);
    ctx.lineTo(left + w + 22, groundY - 4);
    ctx.lineTo(left + w, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.daylightMode ? '#cbd5e1' : '#3b6296';
    ctx.fillRect(left, top + 28, w, h - 28);
    ctx.strokeRect(left, top + 28, w, h - 28);

    ctx.fillStyle = this.daylightMode ? '#e2e8f0' : '#5882b8';
    ctx.beginPath();
    ctx.moveTo(left - 8, top + 28);
    ctx.lineTo(cx, top - 16);
    ctx.lineTo(left + w + 8, top + 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(cx, top + 12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.daylightMode ? '#f1f5f9' : '#6495c7';
    for (const px of [left + 16, left + 52, left + w - 68, left + w - 32]) {
      ctx.fillRect(px, top + 68, 16, h - 68);
      ctx.strokeRect(px, top + 68, 16, h - 68);
    }

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(cx - 72, top + 34, 144, 28);
    ctx.strokeRect(cx - 72, top + 34, 144, 28);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CITY HALL', cx, top + 54);
    ctx.restore();

    this.drawInteractiveDoor(ctx, slot, cx - 26, groundY - 68, 52, 68, "MAYOR'S OFFICE [E]");
  }

  drawFireStationFacade(ctx, slot, cx, groundY) {
    const w = 216;
    const h = 175;
    const left = cx - w * 0.5;
    const top = groundY - h;

    ctx.fillStyle = this.daylightMode ? '#94a3b8' : '#2d4b75';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3.2;
    ctx.fillRect(left, top, w, h);
    ctx.strokeRect(left, top, w, h);

    this.drawRooftopDetails(ctx, { id: 'fire' }, left, top, w);

    ctx.fillStyle = '#102542';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(left + 18, top + 20, w - 36, 30);
    ctx.strokeRect(left + 18, top + 20, w - 36, 30);

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE & RESCUE', cx, top + 41);
    ctx.restore();

    const bayX = left + 24;
    const bayY = top + 60;
    const bayW = 120;
    const bayH = groundY - bayY;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bayX, bayY, bayW, bayH);
    ctx.strokeRect(bayX, bayY, bayW, bayH);

    ctx.fillStyle = '#475569';
    for (let sy = bayY; sy < bayY + 48; sy += 8) {
      ctx.fillRect(bayX, sy, bayW, 7);
      ctx.strokeRect(bayX, sy, bayW, 7);
    }

    ctx.fillStyle = this.daylightMode ? '#cbd5e1' : '#5882b8';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.5;
    ctx.fillRect(bayX + 46, groundY - 54, 88, 54);
    ctx.strokeRect(bayX + 46, groundY - 54, 88, 54);

    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(bayX + 54, groundY - 46, 34, 20);
    ctx.strokeRect(bayX + 54, groundY - 46, 34, 20);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(bayX + 68, groundY - 62, 26, 7);

    this.drawInteractiveDoor(ctx, slot, left + w - 52, groundY - 58, 36, 58, 'ENTER [E]');
  }

  drawConstructionSiteFacade(ctx, slot, cx, groundY) {
    const w = 180;
    const left = cx - w * 0.5;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3;
    ctx.strokeRect(left, groundY - 120, w, 120);
    ctx.beginPath();
    ctx.moveTo(left, groundY - 60);
    ctx.lineTo(left + w, groundY - 60);
    ctx.moveTo(left, groundY - 120);
    ctx.lineTo(left + w, groundY);
    ctx.moveTo(left + w, groundY - 120);
    ctx.lineTo(left, groundY);
    ctx.stroke();

    ctx.fillStyle = '#102542';
    ctx.strokeStyle = '#38bdf8';
    ctx.fillRect(cx - 65, groundY - 45, 130, 26);
    ctx.strokeRect(cx - 65, groundY - 45, 130, 26);
    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UNDER CONSTRUCTION', cx, groundY - 28);
  }

  drawParkFacade(ctx, slot, cx, groundY) {
    const w = 190;
    const left = cx - w * 0.5;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.5;
    for (let x = left; x <= left + w; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x, groundY - 32);
      ctx.stroke();
    }
    for (const ox of [-50, 0, 50]) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx + ox - 5, groundY - 55, 10, 55);
      ctx.fillStyle = this.daylightMode ? '#bae6fd' : '#3b6296';
      ctx.beginPath();
      ctx.arc(cx + ox, groundY - 75, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawUndevelopedLotFacade(ctx, slot, cx, groundY) {
    const w = 210;
    const left = cx - w * 0.5;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2;
    ctx.strokeRect(left + 10, groundY - 38, w - 20, 38);
  }

  drawRooftopDetails(ctx, b, left, top, w) {
    ctx.fillStyle = this.daylightMode ? '#94a3b8' : '#26436c';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.5;

    ctx.fillRect(left + 22, top - 48, 38, 38);
    ctx.strokeRect(left + 22, top - 48, 38, 38);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(left + 28, top - 42, 22, 24);

    if (b.id === 'fire' || b.id === 'coal_plant' || (b.category === 'zones' && b.zoneType === 'ind')) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(left + w - 58, top - 42, 16, 32);
      ctx.strokeRect(left + w - 58, top - 42, 16, 32);
      ctx.fillRect(left + w - 34, top - 56, 16, 46);
      ctx.strokeRect(left + w - 34, top - 56, 16, 46);
    }
  }

  drawInteractiveDoor(ctx, slot, x, y, w, h, promptLabel, overlayOnly = false) {
    const doorCenterX = x + w * 0.5;
    const isNear = Math.abs(this.mayorX - doorCenterX) < (slot.spanSlots === 2 ? 115 : 88);
    const isHovered = this.hoveredDoorSlot && this.hoveredDoorSlot.slotIndex === slot.slotIndex;
    const activeGlow = isNear || isHovered;

    if (!overlayOnly) {
      ctx.fillStyle = '#1e3a5f';
      ctx.strokeStyle = activeGlow ? '#38bdf8' : '#090d16';
      ctx.lineWidth = activeGlow ? 3.5 : 3;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      const glassGrad = ctx.createLinearGradient(x, y, x, y + h);
      glassGrad.addColorStop(0, '#e0f2fe');
      glassGrad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(x + 5, y + 6, w - 10, h - 18);
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 5, y + 6, w - 10, h - 18);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w * 0.5 - 8, y + 16, 16, 9);
      ctx.strokeRect(x + w * 0.5 - 8, y + 16, 16, 9);
    } else if (activeGlow) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    if (activeGlow) {
      const bounce = Math.sin(this.time * 5) * 4;
      const py = y - 26 + bounce;
      const cx = x + w * 0.5;

      ctx.save();
      ctx.fillStyle = 'rgba(10, 25, 47, 0.92)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;

      ctx.fillRect(cx - 46, py - 18, 92, 22);
      ctx.strokeRect(cx - 46, py - 18, 92, 22);

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(cx - 6, py + 4);
      ctx.lineTo(cx + 6, py + 4);
      ctx.lineTo(cx, py + 11);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "Segoe UI", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(promptLabel, cx, py - 3);
      ctx.restore();
    }
  }

  draw90DegreeCornerIntersection(ctx, slot, groundY) {
    const cx = slot.worldX;
    const isNear = Math.abs(this.mayorX - (cx + this.slotWidth * 0.5)) < 140;
    const isHovered = this.hoveredCorner && this.hoveredCorner.slot.slotIndex === slot.slotIndex;
    const highlight = isNear || isHovered;

    const roadLeft = cx - 45;
    const vpX = cx + 65;
    const vpY = groundY - 95;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.strokeStyle = highlight ? '#00f5d4' : '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(roadLeft, groundY);
    ctx.quadraticCurveTo(cx + 15, groundY - 10, vpX - 25, vpY);
    ctx.lineTo(vpX + 55, vpY);
    ctx.quadraticCurveTo(cx + 85, groundY + 15, cx + 105, groundY + 54);
    ctx.lineTo(roadLeft, groundY + 54);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.2;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const gx = roadLeft * (1 - t) + (vpX + 15) * t;
      ctx.beginPath();
      ctx.moveTo(gx, groundY + 50 * (1 - t));
      ctx.lineTo(vpX - 10 + i * 12, vpY);
      ctx.stroke();
    }

    const pulse = Math.sin(this.time * 4) * 0.2 + 0.8;
    ctx.strokeStyle = `rgba(56, 189, 248, ${pulse * 0.75})`;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 35, groundY - 175, 95, 115);
    ctx.strokeRect(cx + 52, groundY - 160, 75, 90);
    ctx.setLineDash([]);

    ctx.strokeStyle = highlight ? '#ffffff' : '#38bdf8';
    ctx.lineWidth = 3.2;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx + 42, groundY - 45, 46, Math.PI * 0.85, Math.PI * 0.1, true);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + 88, groundY - 32);
    ctx.lineTo(cx + 76, groundY - 44);
    ctx.lineTo(cx + 94, groundY - 48);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(10, 25, 47, 0.92)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - 10, groundY - 126, 152, 38);
    ctx.strokeRect(cx - 10, groundY - 126, 152, 38);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`GRID [${slot.roadGridX}, ${slot.roadGridY}] // 90°`, cx + 66, groundY - 111);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Segoe UI", sans-serif';
    ctx.fillText('TURN CORNER [Q / E / CLICK]', cx + 66, groundY - 95);
    ctx.restore();
  }

  drawAIMayorNPC(ctx, groundY) {
    if (!this.aiMayorNPC) return;
    const bounds = this.getActiveRenderBounds(this.canvas.width || 1280);
    const npc = this.aiMayorNPC;
    if (npc.x < bounds.minX - 90 || npc.x > bounds.maxX + 90) return;

    const footY = groundY + 21;
    const idx = Math.max(1, Math.min(36, npc.walkIndex || 1));
    const frameKey = npc.dir > 0 ? `${idx}R` : `L${idx}`;
    const frameImg = window.SPRITES?.mayor?.[frameKey] || window.SPRITES?.mayor?.['R'];

    ctx.save();
    ctx.translate(npc.x, footY);

    const alignColor = this.world.aiMayorAlignment === 'corrupt' ? '#f43f5e' : '#facc15';
    ctx.save();
    ctx.strokeStyle = alignColor;
    ctx.fillStyle = this.world.aiMayorAlignment === 'corrupt'
      ? 'rgba(244, 63, 94, 0.25)'
      : 'rgba(250, 204, 21, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 1, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
      this.drawMayorSpriteNormalized(ctx, frameImg, frameKey, 1.0);
    }

    const alignTag = this.world.aiMayorAlignment === 'corrupt' ? 'Corrupt' : 'Good';
    const npcLabel = `AI Mayor ${this.world.mayorName || 'Charles'} (${alignTag}): Running the City`;
    ctx.font = 'bold 10.5px "Segoe UI", sans-serif';
    const tw = Math.max(150, Math.ceil(ctx.measureText(npcLabel).width) + 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = alignColor;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-tw * 0.5, -138, tw, 20);
    ctx.strokeRect(-tw * 0.5, -138, tw, 20);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(npcLabel, 0, -124);
    ctx.restore();
  }

  drawMayorSpriteNormalized(ctx, frameImg, frameKey, baseScale = 1.0) {
    const meta = window.SPRITES?.mayorFrames?.[frameKey] || {
      cMinY: 164,
      cMaxY: 619,
      charH: 456,
      cx: 200.0,
      scale: 1.0,
      yOffset: 0,
      xOffset: 0
    };
    const frameScale = (meta.scale || (456 / meta.charH)) * baseScale;
    const drawW = 78 * frameScale;
    const drawH = 124 * frameScale;
    // Anchor bottom of shoe sole (cMaxY on 634px source canvas) to +3.5 * baseScale (inside the glowing foot ring)
    // and horizontal silhouette center (cx on 400px source canvas) to x = 0.
    const drawX = ((meta.xOffset || 0) * baseScale) - (meta.cx / 400) * drawW;
    const drawY = (3.5 + (meta.yOffset || 0)) * baseScale - (meta.cMaxY / 634) * drawH;
    ctx.drawImage(frameImg, drawX, drawY, drawW, drawH);
  }

  drawColoringBookMayor(ctx, x, groundY) {
    // When crossing the street at a crosswalk, walk down onto the zebra stripes and back up onto the opposite sidewalk
    const crossOffsetY = this.crossingStreet ? Math.sin(this.crossProgress * Math.PI) * 76 : 0;
    const footY = groundY + 30 + crossOffsetY;
    const frameKey = this.mayorFrame || 'R';
    const frameImg = window.SPRITES?.mayor?.[frameKey];
    const isIdleOrTransition = frameKey === 'R' || frameKey === 'L';

    ctx.save();
    ctx.translate(x, footY);

    // Draw glowing foot ring for idle/transition states (R and L) or fallback;
    // walk frames (1R..36R and L1..L36) already have the glowing ring in their sprite.
    if (!frameImg || !frameImg.complete || !frameImg.naturalWidth || isIdleOrTransition) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(0, 1, 28, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 1, 19, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Status tag beside Player's feet
    const isBM = this.world.playerRole === 'businessman';
    const rolePrefix = isBM
      ? `Executive ${this.world.businessmanName || 'Vance'}`
      : `Mayor ${this.world.mayorName || 'Charles'}`;
    const mayorLabel = `${rolePrefix}: ${this.mayorActivity.replace('Outside ', '')}`;
    ctx.font = '11px "Segoe UI", sans-serif';
    const tagW = Math.max(145, Math.ceil(ctx.measureText(mayorLabel).width) + 14);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(30, -14, tagW, 22);
    ctx.strokeRect(30, -14, tagW, 22);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(mayorLabel, 36, 1);

    if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
      ctx.shadowBlur = 6;
      this.drawMayorSpriteNormalized(ctx, frameImg, frameKey, 1.0);
      ctx.restore();
      ctx.restore();
      return;
    }

    const bob = this.mayorWalking ? Math.abs(Math.sin(this.walkCycle)) * 4 : 0;
    const stride = this.mayorWalking ? Math.sin(this.walkCycle) * 10 : 0;

    ctx.scale(this.mayorDir * 0.6, 0.6);
    ctx.translate(0, -bob);

    ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowBlur = 10;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.rect(-12 + stride * 0.5, -42, 9, 38);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(4 - stride * 0.5, -42, 9, 38);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(-7 + stride * 0.5, -2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(9 - stride * 0.5, -2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-16, -92);
    ctx.lineTo(16, -92);
    ctx.lineTo(24, -34);
    ctx.lineTo(11, -34);
    ctx.lineTo(8, -58);
    ctx.lineTo(-8, -58);
    ctx.lineTo(-11, -34);
    ctx.lineTo(-24, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-15, -94);
    ctx.lineTo(15, -94);
    ctx.lineTo(12, -56);
    ctx.lineTo(-12, -56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-14, -92);
    ctx.lineTo(13, -62);
    ctx.lineTo(7, -56);
    ctx.lineTo(-16, -84);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, -94);
    ctx.lineTo(-12, -74);
    ctx.lineTo(0, -68);
    ctx.moveTo(6, -94);
    ctx.lineTo(12, -74);
    ctx.lineTo(0, -68);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-15, -90);
    ctx.lineTo(-23, -60);
    ctx.lineTo(-16, -58);
    ctx.lineTo(-11, -82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(15, -90);
    ctx.lineTo(24, -62);
    ctx.lineTo(17, -59);
    ctx.lineTo(11, -82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(21, -60);
    ctx.lineTo(23, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(21, -61, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -107, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -105);
    ctx.lineTo(-6, -96);
    ctx.lineTo(0, -94);
    ctx.lineTo(6, -96);
    ctx.lineTo(8, -105);
    ctx.moveTo(-5, -101);
    ctx.lineTo(0, -103);
    ctx.lineTo(5, -101);
    ctx.moveTo(-4, -108);
    ctx.lineTo(-2, -108);
    ctx.moveTo(2, -108);
    ctx.lineTo(4, -108);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -115, 14, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-9, -133, 18, 18);
    ctx.strokeRect(-9, -133, 18, 18);
    ctx.beginPath();
    ctx.moveTo(-9, -119);
    ctx.lineTo(9, -119);
    ctx.stroke();

    ctx.restore();
  }

  drawSidewalkPropsAndPedestrians(ctx, groundY) {
    const bounds = this.getActiveRenderBounds(this.canvas.width || 1280);
    const minSlot = Math.max(this.minSlot ?? -12, Math.floor(bounds.minX / this.slotWidth));
    const maxSlot = Math.min(this.maxSlot ?? 12, Math.ceil(bounds.maxX / this.slotWidth));

    for (let s = minSlot; s <= maxSlot; s++) {
      if (this.crossStreets.includes(s)) continue;
      const lx = s * this.slotWidth - 95;
      if (lx < bounds.minX || lx > bounds.maxX) continue;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.5;
      ctx.fillRect(lx - 3, groundY - 125, 6, 155);
      ctx.strokeRect(lx - 3, groundY - 125, 6, 155);

      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(lx - 12, groundY - 130, 24, 7);
      ctx.strokeRect(lx - 12, groundY - 130, 24, 7);

      if (!this.daylightMode) {
        const cone = ctx.createRadialGradient(lx, groundY - 125, 4, lx, groundY - 40, 85);
        cone.addColorStop(0, 'rgba(186, 230, 253, 0.35)');
        cone.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(lx - 12, groundY - 125);
        ctx.lineTo(lx + 12, groundY - 125);
        ctx.lineTo(lx + 55, groundY + 30);
        ctx.lineTo(lx - 55, groundY + 30);
        ctx.closePath();
        ctx.fill();
      }

      if (s % 2 === 0) {
        ctx.fillStyle = '#33588a';
        ctx.fillRect(lx + 16, groundY + 12, 48, 12);
        ctx.strokeRect(lx + 16, groundY + 12, 48, 12);
      } else {
        ctx.fillStyle = '#33588a';
        ctx.fillRect(lx + 18, groundY + 4, 18, 26);
        ctx.strokeRect(lx + 18, groundY + 4, 18, 26);
      }
    }

    const girlCycle = ['Girl1a', 'Girl2', 'Girl3', 'Girl4', 'Girl1b', 'Girl2', 'Girl3', 'Girl4'];
    for (const p of this.pedestrians) {
      if (p.x < bounds.minX || p.x > bounds.maxX) continue;
      // Slight sidewalk depth variation based on direction so pedestrians pass each other naturally
      const py = groundY + (p.dir > 0 ? 22 : 16);
      const frameKey = girlCycle[(p.frameIndex || 0) % girlCycle.length];
      const girlImg = window.SPRITES?.pedestrians?.[frameKey];

      if (girlImg && girlImg.complete && girlImg.naturalWidth > 0) {
        ctx.save();
        ctx.translate(p.x, py);
        // Girl sprites natively face Right (dir = 1); flip horizontally when walking Left (dir = -1)
        if (p.dir < 0) ctx.scale(-1, 1);

        const drawH = 88;
        const drawW = Math.round(drawH * (girlImg.naturalWidth / girlImg.naturalHeight));
        ctx.drawImage(girlImg, Math.round(-drawW * 0.5), -drawH + 5, drawW, drawH);
        ctx.restore();
        continue;
      }

      const legSwing = Math.sin(p.phase) * 5;

      ctx.save();
      ctx.translate(p.x, py);
      ctx.scale(p.dir, 1);
      ctx.fillStyle = '#4a72a8';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.2;

      ctx.fillRect(-4 + legSwing * 0.5, -26, 5, 26);
      ctx.strokeRect(-4 + legSwing * 0.5, -26, 5, 26);
      ctx.fillRect(1 - legSwing * 0.5, -26, 5, 26);
      ctx.strokeRect(1 - legSwing * 0.5, -26, 5, 26);

      ctx.fillStyle = '#6495c7';
      ctx.fillRect(-7, -54, 14, 28);
      ctx.strokeRect(-7, -54, 14, 28);

      ctx.fillStyle = '#93c5fd';
      ctx.beginPath();
      ctx.arc(0, -62, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawForegroundVehicles(ctx, groundY) {
    // Place vehicles down on the asphalt street deck (road starts at groundY + 66)
    const roadY = groundY + 136;
    const busFrames = ['bus3', 'bus4', 'bus5', 'bus6'];
    const carFrames = ['car1', 'car2', 'car3', 'car4', 'car5', 'car6'];

    const bounds = this.getActiveRenderBounds(this.canvas.width || 1280);
    // Draw upper lane (right-to-left, dir < 0) first so lower lane (left-to-right, dir > 0) renders in front
    const sortedVehicles = [...this.streetVehicles].sort((a, b) => a.dir - b.dir);

    for (const v of sortedVehicles) {
      if (v.x < bounds.minX - 140 || v.x > bounds.maxX + 140) continue;

      // Left-to-right (dir > 0) lowered further down; Right-to-left (dir < 0) raised slightly higher
      const laneY = roadY + (v.dir > 0 ? 24 : -18);

      const fIdx = v.frameIndex || 0;
      const spriteKey = v.kind === 'bus'
        ? busFrames[fIdx % busFrames.length]
        : carFrames[fIdx % carFrames.length];
      const spriteImg = window.SPRITES?.vehicles?.[spriteKey];

      if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        ctx.save();
        ctx.translate(v.x, laneY);

        if (v.kind === 'bus') {
          // bus3..bus6 are natively facing Left (dir === -1).
          // Flip horizontally when going Left-to-Right (dir === 1).
          if (v.dir > 0) ctx.scale(-1, 1);
          const drawW = 285;
          const drawH = 95;
          ctx.drawImage(spriteImg, Math.round(-drawW * 0.5), -drawH + 6, drawW, drawH);
        } else {
          // Car1..Car6 are natively facing Right (dir === 1).
          // Flip horizontally when going Right-to-Left (dir === -1).
          if (v.dir < 0) ctx.scale(-1, 1);
          const drawW = 168;
          const drawH = 72;
          ctx.drawImage(spriteImg, Math.round(-drawW * 0.5), -drawH + 2, drawW, drawH);
        }

        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.translate(v.x, roadY);
      ctx.scale(v.dir, 1);
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 3;

      if (v.kind === 'bus') {
        ctx.fillStyle = this.daylightMode ? '#94a3b8' : '#355685';
        ctx.fillRect(-110, -68, 220, 62);
        ctx.strokeRect(-110, -68, 220, 62);

        ctx.fillStyle = '#bae6fd';
        for (let wx = -96; wx <= 65; wx += 38) {
          ctx.fillRect(wx, -56, 30, 22);
          ctx.strokeRect(wx, -56, 30, 22);
        }
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-65, -4, 14, 0, Math.PI * 2);
        ctx.arc(65, -4, 14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = this.daylightMode ? '#cbd5e1' : '#4a6b96';
        ctx.beginPath();
        ctx.moveTo(-68, -10);
        ctx.lineTo(-64, -32);
        ctx.lineTo(-34, -52);
        ctx.lineTo(24, -52);
        ctx.lineTo(58, -30);
        ctx.lineTo(68, -10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.moveTo(-30, -47);
        ctx.lineTo(20, -47);
        ctx.lineTo(44, -30);
        ctx.lineTo(-48, -30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-38, -8, 12, 0, Math.PI * 2);
        ctx.arc(38, -8, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

window.StreetExplorationView = StreetExplorationView;	