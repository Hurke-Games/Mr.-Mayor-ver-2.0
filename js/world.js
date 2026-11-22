// City World State, Terrain Generation, Simulation Mechanics & Overlays
class CityWorld {
  constructor(size = CONFIG.GRID_SIZE) {
    this.size = size;
    this.cityName = 'METROVALE';
    this.mayorName = 'Charles';
    this.playerRole = 'mayor'; // 'mayor' or 'businessman'
    this.businessmanName = 'Vance';
    this.businessMoney = CONFIG.BUSINESS_STARTING_CASH || 20000;
    this.aiMayorAlignment = 'good'; // 'good' or 'corrupt'
    this.commSubsidy = 0; // 0% to 50% Commercial Subsidy (speeds growth & boosts output)
    this.indSubsidy = 0;  // 0% to 50% Industrial Subsidy (speeds growth & boosts output)
    this.homeResidence = { x: 19, y: 25 };

    this.money = CONFIG.STARTING_CASH;
    this.taxRate = CONFIG.DEFAULT_TAX_RATE;
    this.population = 0;
    this.commercialJobs = 0;
    this.industrialJobs = 0;

    // Business Man Portfolio & Loan Statistics
    this.businessStats = {
      ownedCount: 0,
      commOwned: 0,
      indOwned: 0,
      goodCount: 0,
      corruptCount: 0,
      commIncome: 0,
      indIncome: 0,
      monthlyIncome: 0,
      monthlyLoanPayments: 0,
      netMonthlyCashFlow: 0,
      totalDebt: 0,
      creditLimit: 150000,
      availableCredit: 150000,
      netWorth: CONFIG.BUSINESS_STARTING_CASH || 30000,
      ownedList: [],
      properties: []
    };
    this.bmNegativeCashMonths = 0;

    // Time & Speed
    this.year = 2030;
    this.month = 1;
    this.day = 1;
    this.tickCount = 0;
    this.speed = 1; // 0 = paused, 1, 2, 4, 8

    // RCI Demands (-100 to +100)
    this.demand = { res: 75, comm: 45, ind: 60 };

    // Financial & Grid Statistics
    this.stats = {
      taxIncome: 0,
      upkeepCost: 0,
      netTrend: 0,
      powerGenerated: 0,
      powerConsumed: 0,
      avgMorale: 85,
      morale: 85,
      avgPollution: 0,
      avgCrime: 5,
      avgHealth: 75,
      avgTraffic: 0,
      waterCoverage: 100,
      wateredPct: 100,
      historyPop: [0],
      historyFunds: [CONFIG.STARTING_CASH],
      historyMorale: [85]
    };

    this.alerts = [];
    this.grid = [];
    this.rings = []; // Active 3x3 Tier-4 rings: { cx, cy, zoneType }

    // 2-Year Election Cycle & Moral vs Corrupt Campaign Tracking
    this.mayorStanding = null; // 'moral' | 'corrupt' | null
    this.activeCampaignOptions = {}; // { [optionId]: boolean } currently checked
    this.paidThisMonth = {};         // { [optionId]: boolean } whether current month's cost was paid
    this.campaignMonthsActive = {};  // { [optionId]: number (0..12) } months active during the 12-month cycle
    this.totalCampaignSpent = 0;
    this.playerRunningForMayor = false; // When player in another role (e.g. Business Man) runs for Mayor
    this.pendingOddYearAdvisorPrompt = false; // Jan 1 of odd years: drag Mayor to advisor, pause & show menu
    this.pendingElectionResult = null;        // Jan 1 of even years: election outcome payload
    this.aiBuildQueue = [];                   // Active AI Mayor blueprint construction queue
    this.aiBlocksBuilt = 0;                   // Count of 9x9 superblocks (7x7 enclosures) planned by AI Mayor
    this.aiCivicBoxesBuilt = 0;               // Count of 2x6 civic enclosures planned by AI Mayor (1 per 2 superblocks)

    this.initGrid();
    this.generateTerrain();
    this.placeStarterCityHall();
    this.recalculateAll();
  }

  createEmptyTile(x, y) {
    return {
      x,
      y,
      terrain: 'land', // 'land', 'river', 'lake', 'forest'
      elevation: 0,
      undergroundPower: false,
      undergroundWater: false,
      pipeWatered: false,
      elevatedRail: false,
      building: null, // null or { id, type, category, zoneType, level, pop, maxPop, construction, powered, watered, bridge, ringCenter }
      // Calculated overlay metrics (0 - 100)
      powered: false,
      watered: false,
      roadAccess: false,
      pollution: 0,
      crime: 0,
      traffic: 0,
      health: 50,
      morale: 75,
      landValue: 50,
      seed: Math.random()
    };
  }

  isRoadSurface(tile) {
    if (!tile || !tile.building) return false;
    return ['road', 'avenue', 'highway', 'railway_station'].includes(tile.building.id);
  }

  hasRail(tile) {
    if (!tile) return false;
    if (tile.elevatedRail) return true;
    if (!tile.building) return false;
    return (
      tile.building.id === 'monorail' ||
      tile.building.id === 'railway_station' ||
      Boolean(tile.building.hasElevatedRail)
    );
  }

  pumpHasWaterSource(x, y, radius = 6) {
    const rSq = radius * radius;
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(this.size - 1, y + radius);
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(this.size - 1, x + radius);
    for (let ny = minY; ny <= maxY; ny++) {
      for (let nx = minX; nx <= maxX; nx++) {
        const dSq = (nx - x) * (nx - x) + (ny - y) * (ny - y);
        if (dSq <= rSq) {
          const nt = this.grid[ny][nx];
          if (nt && (nt.terrain === 'river' || nt.terrain === 'lake')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  initGrid() {
    this.grid = [];
    for (let y = 0; y < this.size; y++) {
      const row = [];
      for (let x = 0; x < this.size; x++) {
        row.push(this.createEmptyTile(x, y));
      }
      this.grid.push(row);
    }
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    return this.grid[y][x];
  }

  // Convert internal 0-based grid (gx, gy) to player-facing 1-based square coordinates:
  // Bottom-left most square (gx = 0, gy = size - 1) is (x1,y1); top-right most square (gx = size - 1, gy = 0) is (x56,y56).
  getSquareCoords(gx, gy) {
    return {
      x: Math.max(1, Math.min(this.size, Math.round(gx) + 1)),
      y: Math.max(1, Math.min(this.size, this.size - Math.round(gy)))
    };
  }

  formatSquare(gx, gy) {
    const c = this.getSquareCoords(gx, gy);
    return `(x${c.x},y${c.y})`;
  }

  // Generate natural landscape: winding river, lake, and dense forest patches
  generateTerrain(seedOffset = null) {
    const s = seedOffset !== null ? seedOffset : Math.random() * 100;
    this.terrainSeed = s;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        t.terrain = 'land';
        t.building = null;
        t.undergroundPower = false;
        t.undergroundWater = false;
        t.pipeWatered = false;
        t.elevatedRail = false;
      }
    }

    // 1. Winding River cutting across the terrain
    for (let y = 0; y < this.size; y++) {
      const wave = Math.sin((y / this.size) * Math.PI * 2.2 + s) * 6.5 +
                   Math.cos((y / this.size) * Math.PI * 4.0 + s * 0.5) * 2.2;
      const riverCenter = Math.floor(this.size * 0.68 + wave);
      const riverWidth = 2 + (Math.sin(y * 0.3 + s) > 0.5 ? 1 : 0);

      for (let dx = -1; dx <= riverWidth; dx++) {
        const rx = riverCenter + dx;
        const tile = this.getTile(rx, y);
        if (tile) {
          tile.terrain = 'river';
        }
      }
    }

    // 2. Scenic Lake nestled in lower-left quadrant
    const lakeX = Math.floor(this.size * 0.22);
    const lakeY = Math.floor(this.size * 0.76);
    for (let y = lakeY - 6; y <= lakeY + 6; y++) {
      for (let x = lakeX - 7; x <= lakeX + 7; x++) {
        const dist = Math.hypot((x - lakeX) * 0.85, (y - lakeY) * 1.1) +
                     Math.sin(x * 0.7 + y * 0.5 + s) * 1.4;
        if (dist < 5.2) {
          const tile = this.getTile(x, y);
          if (tile) tile.terrain = 'lake';
        }
      }
    }

    // 3. Dense Forest patches on land
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const tile = this.grid[y][x];
        if (tile.terrain !== 'land') continue;
        const n = Math.sin(x * 0.23 + s) * Math.cos(y * 0.23 + s * 1.3) +
                  Math.sin((x + y) * 0.14 - s) * 0.5;
        if (n > 0.52) {
          tile.terrain = 'forest';
        }
      }
    }
  }

  // Ensure every New City starts with a City Hall and an intersecting street block (while keeping full $5,000 cash)
  placeStarterCityHall() {
    const cx = 22;
    const cy = 24;
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 6; x <= cx + 6; x++) {
        const t = this.getTile(x, y);
        if (t && t.terrain !== 'river') t.terrain = 'land';
      }
    }
    // Main horizontal street in front of City Hall (y = cy)
    for (let x = cx - 6; x <= cx + 6; x++) {
      this.placeTool(x, cy, 'road', true);
    }
    // Intersecting 90-degree cross streets at cx - 5 and cx + 5
    for (let y = cy - 4; y <= cy + 4; y++) {
      this.placeTool(cx - 5, y, 'road', true);
      this.placeTool(cx + 5, y, 'road', true);
    }
    // Place 2x2 City Hall right on the street at (cx - 1, cy - 2) -> spans x=21..22, y=22..23 + Wind Turbine
    this.placeTool(cx - 1, cy - 2, 'city_hall', true);
    this.placeTool(cx - 4, cy - 1, 'wind_plant', true);

    // Place Water Pumping Station at (x29,y28) -> internal grid (gx = 28, gy = 28)
    // (Removed old starter water station that was at (x20,y33) -> (gx = 19, gy = 23))
    const pumpGx = 28; // x29
    const pumpGy = 28; // y28
    const pumpTile = this.getTile(pumpGx, pumpGy);
    if (pumpTile) pumpTile.terrain = 'land';
    if (!this.pumpHasWaterSource(pumpGx, pumpGy, 6)) {
      const springTile = this.getTile(pumpGx + 2, pumpGy);
      if (springTile) springTile.terrain = 'lake';
    }
    this.placeTool(pumpGx, pumpGy, 'water_pump', true);

    // Underground Power Conduits & Underground Water Pipes along main street (x-axis) up to x28 (gx = 27)
    for (let x = cx - 4; x <= 27; x++) {
      this.placeTool(x, cy - 1, 'powerline_under', true);
      this.placeTool(x, cy, 'powerline_under', true);
      this.placeTool(x, cy - 1, 'water_pipe', true);
      this.placeTool(x, cy, 'water_pipe', true);
    }
    // Underground Power Conduits & Underground Water Pipes from (x28,y28) to (x28,y32) -> gx = 27, gy = 24..28
    for (let gy = 24; gy <= 28; gy++) {
      this.placeTool(27, gy, 'powerline_under', true);
      this.placeTool(27, gy, 'water_pipe', true);
    }
    // Also place conduit & pipe at (x29,y28) (gx = 28, gy = 28) so the Water Pumping Station connects directly across the x-axis
    this.placeTool(pumpGx, pumpGy, 'powerline_under', true);
    this.placeTool(pumpGx, pumpGy, 'water_pipe', true);

    // Place a Starter Home Residence for Business Man mode + starter Commercial & Industrial zones along the street
    this.placeTool(cx - 2, cy + 1, 'zone_res', true);
    this.placeTool(cx - 2, cy + 1, 'powerline_under', true);
    const homeTile = this.getTile(cx - 2, cy + 1);
    if (homeTile && homeTile.building) {
      homeTile.building.construction = 0;
      homeTile.building.level = 1;
      homeTile.building.maxPop = CONFIG.ZONE_LEVELS.res[1].maxPop;
      homeTile.building.pop = homeTile.building.maxPop;
      homeTile.building.isHomeResidence = true;
      this.homeResidence = { x: cx - 2, y: cy + 1 };
    }

    this.placeTool(cx + 2, cy - 1, 'zone_comm', true);
    const startComm = this.getTile(cx + 2, cy - 1);
    if (startComm && startComm.building) {
      startComm.building.construction = 0;
      startComm.building.level = 1;
      startComm.building.maxPop = CONFIG.ZONE_LEVELS.comm[1].maxPop;
      startComm.building.pop = startComm.building.maxPop;
    }

    this.placeTool(cx + 3, cy - 1, 'zone_ind', true);
    const startInd = this.getTile(cx + 3, cy - 1);
    if (startInd && startInd.building) {
      startInd.building.construction = 0;
      startInd.building.level = 1;
      startInd.building.maxPop = CONFIG.ZONE_LEVELS.ind[1].maxPop;
      startInd.building.pop = startInd.building.maxPop;
    }

    this.recalculateAll();
  }

  findHomeResidence() {
    if (this.homeResidence) {
      const ht = this.getTile(this.homeResidence.x, this.homeResidence.y);
      if (ht && ht.building && ht.building.zoneType === 'res') {
        ht.building.isHomeResidence = true;
        return this.homeResidence;
      }
    }
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.building && t.building.isHomeResidence) {
          this.homeResidence = { x, y };
          return this.homeResidence;
        }
      }
    }
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.building && t.building.category === 'zones' && t.building.zoneType === 'res') {
          t.building.isHomeResidence = true;
          this.homeResidence = { x, y };
          return this.homeResidence;
        }
      }
    }
    return { x: 19, y: 25 };
  }

  findCityHall() {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.building && t.building.id === 'city_hall') {
          if (t.building.size === 2 && t.building.originX !== undefined) {
            return { x: t.building.originX + 1, y: t.building.originY + 1 };
          }
          return { x, y };
        }
      }
    }
    // If no city hall exists, place a 2x2 City Hall at (21, 22) for free
    this.placeTool(21, 22, 'city_hall', true);
    return { x: 22, y: 23 };
  }

  clearMultiTileBuildingAt(x, y) {
    const t = this.getTile(x, y);
    if (!t || !t.building) return;
    const b = t.building;
    const sz = b.size || 1;
    const ox = b.originX ?? x;
    const oy = b.originY ?? y;
    for (let dy = 0; dy < sz; dy++) {
      for (let dx = 0; dx < sz; dx++) {
        const sub = this.getTile(ox + dx, oy + dy);
        if (sub && sub.building && sub.building.id === b.id) {
          sub.building = null;
        }
      }
    }
  }

  // Place a tool on tile (x, y)
  placeTool(x, y, toolId, free = false) {
    const tile = this.getTile(x, y);
    if (!tile) return { ok: false, reason: 'Out of bounds' };
    const tool = CONFIG.TOOLS[toolId];
    if (!tool) return { ok: false, reason: 'Unknown tool' };
    const footprint = tool.size || 1;

    // Demolish tool
    if (toolId === 'demolish') {
      if (!tile.building && !tile.undergroundPower && !tile.undergroundWater && !tile.elevatedRail && tile.terrain !== 'forest') {
        return { ok: false, reason: 'Nothing to demolish here' };
      }
      if (!free && this.money < tool.cost) {
        return { ok: false, reason: 'Insufficient funds ($5 required)' };
      }
      if (!free) this.money -= tool.cost;

      if (tile.building) {
        if (tile.building.ringCenter) {
          this.breakRingAt(tile.building.ringCenter.x, tile.building.ringCenter.y);
        }
        if ((tile.building.size || 1) > 1) {
          this.clearMultiTileBuildingAt(x, y);
        } else {
          tile.building = null;
          tile.elevatedRail = false;
        }
      } else if (tile.elevatedRail) {
        tile.elevatedRail = false;
      } else if (tile.undergroundWater) {
        tile.undergroundWater = false;
      } else if (tile.undergroundPower) {
        tile.undergroundPower = false;
      } else if (tile.terrain === 'forest') {
        tile.terrain = 'land';
      }
      this.recalculateAll();
      return { ok: true, action: 'demolish' };
    }

    // Underground Power Conduit can be placed under ANY tile (even rivers, roads, or buildings)
    if (toolId === 'powerline_under') {
      if (tile.undergroundPower) {
        return { ok: false, reason: 'Underground power conduit already exists here' };
      }
      if (!free && this.money < tool.cost) {
        return { ok: false, reason: `Insufficient funds ($${tool.cost} needed)` };
      }
      if (!free) this.money -= tool.cost;
      tile.undergroundPower = true;
      this.recalculateAll();
      return { ok: true, action: 'place' };
    }

    // Underground Water Pipe can be placed under ANY tile (even rivers, roads, or buildings)
    if (toolId === 'water_pipe') {
      if (tile.undergroundWater) {
        return { ok: false, reason: 'Underground water pipe already exists here' };
      }
      if (!free && this.money < tool.cost) {
        return { ok: false, reason: `Insufficient funds ($${tool.cost} needed)` };
      }
      if (!free) this.money -= tool.cost;
      tile.undergroundWater = true;
      this.recalculateAll();
      return { ok: true, action: 'place' };
    }

    // Multi-tile (e.g. 2x2 or 5x5) building validation & placement
    if (footprint > 1) {
      for (let dy = 0; dy < footprint; dy++) {
        for (let dx = 0; dx < footprint; dx++) {
          const sub = this.getTile(x + dx, y + dy);
          if (!sub) return { ok: false, reason: `Not enough space at map edge for ${footprint}x${footprint} building` };
          if (sub.terrain === 'river' || sub.terrain === 'lake') {
            return { ok: false, reason: `Cannot build ${footprint}x${footprint} structure on water` };
          }
          if (!free && sub.building) {
            return { ok: false, reason: `${footprint}x${footprint} footprint blocked — bulldoze existing structures first` };
          }
        }
      }

      if (!free && this.money < tool.cost) {
        return { ok: false, reason: `Insufficient funds ($${tool.cost} needed)` };
      }
      if (!free) this.money -= tool.cost;

      for (let dy = 0; dy < footprint; dy++) {
        for (let dx = 0; dx < footprint; dx++) {
          const sub = this.getTile(x + dx, y + dy);
          if (sub.building && (sub.building.size || 1) > 1) {
            this.clearMultiTileBuildingAt(x + dx, y + dy);
          }
          if (sub.terrain === 'forest') sub.terrain = 'land';
          sub.building = {
            id: toolId,
            category: tool.category,
            size: footprint,
            originX: x,
            originY: y,
            isOrigin: dx === 0 && dy === 0,
            isRenderAnchor: dx === footprint - 1 && dy === footprint - 1,
            level: 1,
            pop: 0,
            maxPop: 0,
            construction: 0,
            bridge: false,
            placedTick: this.tickCount,
            variant: (x * 7 + y * 13) % 3
          };
        }
      }

      this.recalculateAll();
      return { ok: true, action: 'place', cost: tool.cost };
    }

    // Water checks: only roads, avenues, highways, monorails, and above-ground powerlines can cross rivers as bridges/spans
    const isWater = tile.terrain === 'river' || tile.terrain === 'lake';
    const canBridge = ['road', 'avenue', 'highway', 'monorail', 'powerline_above'].includes(toolId);

    if (isWater && !canBridge) {
      return { ok: false, reason: 'Cannot build structures on water (only bridges & power lines)' };
    }
    if (isWater && tile.terrain === 'lake' && toolId !== 'powerline_above') {
      return { ok: false, reason: 'Bridges can only span across rivers' };
    }

    const actualCost = isWater ? tool.cost * 2 : tool.cost;

    // Special Case 1: Building Raised Rail (`monorail`) directly OVER an existing Road (`road`, `avenue`, `highway`)
    if (toolId === 'monorail' && tile.building && ['road', 'avenue', 'highway'].includes(tile.building.id)) {
      if (tile.building.hasElevatedRail || tile.elevatedRail) {
        return { ok: false, reason: 'Raised rail already built over this road' };
      }
      if (!free && this.money < actualCost) {
        return { ok: false, reason: `Insufficient funds ($${actualCost} needed)` };
      }
      if (!free) this.money -= actualCost;
      tile.building.hasElevatedRail = true;
      tile.elevatedRail = true;
      this.recalculateAll();
      return { ok: true, action: 'place', cost: actualCost };
    }

    // Special Case 2: Building a Road (`road`, `avenue`, `highway`) UNDER an existing Raised Rail (`monorail`)
    if (['road', 'avenue', 'highway'].includes(toolId) && tile.building && tile.building.id === 'monorail') {
      if (!free && this.money < actualCost) {
        return { ok: false, reason: `Insufficient funds ($${actualCost} needed)` };
      }
      if (!free) this.money -= actualCost;
      tile.building = {
        id: toolId,
        category: 'roads',
        hasElevatedRail: true,
        level: 1,
        pop: 0,
        maxPop: 0,
        construction: 0,
        bridge: isWater,
        placedTick: this.tickCount,
        variant: (x * 7 + y * 13) % 3
      };
      tile.elevatedRail = true;
      this.recalculateAll();
      return { ok: true, action: 'place', cost: actualCost };
    }

    // Special Case 3: Railway Station — must be placed where roads and raised rail cross or meet
    if (toolId === 'railway_station') {
      if (tile.building && tile.building.id === 'railway_station') {
        return { ok: false, reason: 'Railway Station already built here' };
      }
      const adjDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const hasRoadHereOrAdj =
        this.isRoadSurface(tile) ||
        adjDirs.some(([dx, dy]) => this.isRoadSurface(this.getTile(x + dx, y + dy)));
      const hasRailHereOrAdj =
        this.hasRail(tile) ||
        adjDirs.some(([dx, dy]) => this.hasRail(this.getTile(x + dx, y + dy)));

      if (!free && (!hasRoadHereOrAdj || !hasRailHereOrAdj)) {
        return { ok: false, reason: 'Railway Station must be placed where roads and raised rail cross!' };
      }
      if (!free && tile.building && !['road', 'avenue', 'highway', 'monorail'].includes(tile.building.id)) {
        return { ok: false, reason: 'Place Railway Station on a road/rail crossing — bulldoze other buildings first' };
      }
      if (!free && this.money < actualCost) {
        return { ok: false, reason: `Insufficient funds ($${actualCost} needed)` };
      }
      if (!free) this.money -= actualCost;
      const underlyingRoad = (tile.building && ['road', 'avenue', 'highway'].includes(tile.building.id))
        ? tile.building.id
        : 'road';
      if (tile.terrain === 'forest') tile.terrain = 'land';
      tile.building = {
        id: 'railway_station',
        category: 'roads',
        underlyingRoad,
        hasElevatedRail: true,
        level: 1,
        pop: 0,
        maxPop: 0,
        construction: 0,
        bridge: isWater,
        placedTick: this.tickCount,
        variant: (x * 7 + y * 13) % 3
      };
      tile.elevatedRail = true;
      this.recalculateAll();
      return { ok: true, action: 'place', cost: actualCost };
    }

    // Check existing building
    const hadElevatedRail = Boolean(tile.elevatedRail || (tile.building && tile.building.hasElevatedRail));
    if (tile.building) {
      if (tile.building.id === toolId) {
        return { ok: false, reason: 'Already built here' };
      }
      const isRoadUpgrade =
        (tile.building.id === 'road' && (toolId === 'avenue' || toolId === 'highway')) ||
        (tile.building.id === 'avenue' && toolId === 'highway');
      const isEmptyZoneReplace = tile.building.category === 'zones' && tile.building.level === 0 && tool.category === 'zones';

      if (!isRoadUpgrade && !isEmptyZoneReplace) {
        return { ok: false, reason: 'Tile occupied — bulldoze first' };
      }
    }

    if (!free && this.money < actualCost) {
      return { ok: false, reason: `Insufficient funds ($${actualCost} needed)` };
    }

    if (!free) this.money -= actualCost;

    if (tile.terrain === 'forest') {
      tile.terrain = 'land';
    }

    if (tool.category === 'zones') {
      const zoneType = toolId.replace('zone_', ''); // 'res', 'comm', 'ind'
      tile.building = {
        id: toolId,
        category: 'zones',
        zoneType,
        level: 0,
        pop: 0,
        maxPop: 0,
        construction: 100,
        bridge: false,
        ringCenter: null,
        ringIndex: -1,
        placedTick: this.tickCount,
        variant: (x * 7 + y * 13) % 3
      };
    } else {
      const keepRail = toolId === 'monorail' || (['road', 'avenue', 'highway'].includes(toolId) && hadElevatedRail);
      tile.building = {
        id: toolId,
        category: tool.category,
        hasElevatedRail: keepRail,
        level: 1,
        pop: 0,
        maxPop: 0,
        construction: 0,
        bridge: isWater,
        placedTick: this.tickCount,
        variant: (x * 7 + y * 13) % 3
      };
      if (keepRail) tile.elevatedRail = true;
      if (toolId === 'water_pump') {
        const hasWaterSq = this.pumpHasWaterSource(x, y, tool.radius || 6);
        tile.building.hasWaterSource = hasWaterSq;
        if (!hasWaterSq && !free) {
          this.addAlert(`Water Pumping Station at ${this.formatSquare(x, y)} needs a water square (river or lake) within its 6-tile range to work!`, 'warn', { x, y });
        }
      }
    }

    this.recalculateAll();
    return { ok: true, action: 'place', cost: actualCost };
  }

  breakRingAt(cx, cy) {
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ];
    for (const [dx, dy] of offsets) {
      const t = this.getTile(cx + dx, cy + dy);
      if (t && t.building && t.building.ringCenter &&
          t.building.ringCenter.x === cx && t.building.ringCenter.y === cy) {
        t.building.ringCenter = null;
        t.building.ringIndex = -1;
        if (t.building.level === 4) {
          t.building.level = 3;
          const l3 = CONFIG.ZONE_LEVELS[t.building.zoneType][3];
          t.building.maxPop = l3.maxPop;
          t.building.pop = Math.min(t.building.pop, l3.maxPop);
        }
      }
    }
    this.rings = this.rings.filter(r => !(r.cx === cx && r.cy === cy));
  }

  recalculateAll() {
    // 1. Bootstrap power & water so mutually connected Power Plants <-> Water Pumping Stations can energize and water each other
    this.recalculatePower(true);
    this.recalculateWater();
    // 2. Enforce strict rule: Power Plants require Water (t.watered) to generate power; if unwatered, their power output turns off
    this.recalculatePower(false);
    this.recalculateWater();
    this.recalculateOverlays();
    this.recalculateTotals();
  }

  // Returns utility requirements & operational state for any building tile:
  // - Power Plants: need Water only (since they make power)
  // - Civic, Edu & Morale, Special Projects (Stadium), Air Scrubber, Bus Station, Railway Station, and Zones: need BOTH Power and Water
  // - City Park & Plaza (`park`): needs NEITHER Power nor Water
  // - Water Pumping Station (`water_pump`): needs Power only (and a water square in its 6-tile range to make water)
  // - Transit Roads (`road`, `avenue`, `highway`): need NEITHER Power nor Water
  // - Raised Rail (`monorail`): needs Power only (not Water)
  getBuildingUtilityStatus(tile) {
    if (!tile || !tile.building) {
      return { needsPower: false, needsWater: false, hasPower: true, hasWater: true, operational: true };
    }
    const b = tile.building;
    const id = b.id;
    const def = CONFIG.TOOLS[id];

    if (id === 'park' || ['road', 'avenue', 'highway', 'powerline_above'].includes(id)) {
      return { needsPower: false, needsWater: false, hasPower: true, hasWater: true, operational: true };
    }

    if (id === 'monorail') {
      return {
        needsPower: true,
        needsWater: false,
        hasPower: Boolean(tile.powered),
        hasWater: true,
        operational: Boolean(tile.powered)
      };
    }

    if (id === 'water_pump') {
      const hasSource = b.hasWaterSource !== false;
      return {
        needsPower: true,
        needsWater: false,
        hasPower: Boolean(tile.powered),
        hasWater: hasSource,
        operational: Boolean(tile.powered && hasSource)
      };
    }

    if (def && def.powerGen) {
      return {
        needsPower: false,
        needsWater: true,
        hasPower: Boolean(tile.watered),
        hasWater: Boolean(tile.watered),
        operational: Boolean(tile.watered)
      };
    }

    return {
      needsPower: true,
      needsWater: true,
      hasPower: Boolean(tile.powered),
      hasWater: Boolean(tile.watered),
      operational: Boolean(tile.powered && tile.watered)
    };
  }

  isBuildingOperational(tile) {
    return this.getBuildingUtilityStatus(tile).operational;
  }

  // Only power lines (powerline_above and powerline_under) and power plants transport electricity.
  // Roads do NOT transport power! Power plants require Water (t.watered) to generate electricity.
  recalculatePower(ignoreWaterRequirement = false) {
    let totalGen = 0;
    let totalUse = 0;
    const queue = [];
    const visited = new Set();

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        t.powered = false;
        if (t.building) {
          const def = CONFIG.TOOLS[t.building.id];
          if (def && def.powerGen) {
            const plantHasWater = ignoreWaterRequirement || Boolean(t.watered);
            if (plantHasWater) {
              totalGen += def.powerGen;
              t.powered = true;
              queue.push([x, y]);
              visited.add(`${x},${y}`);
            }
          }
          if (def && def.powerUse) {
            if ((t.building.size || 1) > 1 && !t.building.isOrigin) continue;
            const lvlMult = t.building.category === 'zones' ? Math.max(1, t.building.level) : 1;
            totalUse += def.powerUse * lvlMult;
          }
          if (t.building.hasElevatedRail && t.building.id !== 'monorail' && t.building.id !== 'railway_station') {
            totalUse += CONFIG.TOOLS.monorail.powerUse || 3;
          }
        }
      }
    }

    // 1. Propagate electricity ONLY through Power Plants, Pylon Power Lines (powerline_above), and Underground Power Conduits (undergroundPower)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const energizedConductors = [];
    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      energizedConductors.push([cx, cy]);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nt = this.getTile(nx, ny);
        if (!nt) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;

        const isPowerLineOrPlant =
          nt.undergroundPower ||
          Boolean(nt.building && (nt.building.id === 'powerline_above' || (CONFIG.TOOLS[nt.building.id]?.powerGen && (ignoreWaterRequirement || nt.watered))));

        if (isPowerLineOrPlant) {
          visited.add(key);
          nt.powered = true;
          queue.push([nx, ny]);
        }
      }
    }

    // 2. Energize buildings & zones within 1 tile of any energized power line / underground conduit / power plant
    // (Note: Roads do not transport power; buildings themselves do not conduct power across roads)
    for (const [cx, cy] of energizedConductors) {
      for (const [dx, dy] of dirs) {
        const nt = this.getTile(cx + dx, cy + dy);
        if (!nt || !nt.building) continue;
        // Power plants make power (they only require water, not external power)
        if (CONFIG.TOOLS[nt.building.id]?.powerGen) continue;
        // Roads do not transport or store power unless they have undergroundPower or raised rail
        if (['road', 'avenue', 'highway'].includes(nt.building.id) && !nt.undergroundPower && !nt.building.hasElevatedRail) {
          continue;
        }
        nt.powered = true;
        // If this is part of a multi-tile building (2x2 or 5x5), power the entire multi-tile footprint
        if ((nt.building.size || 1) > 1 && nt.building.originX !== undefined) {
          const ox = nt.building.originX;
          const oy = nt.building.originY;
          const sz = nt.building.size;
          for (let sdy = 0; sdy < sz; sdy++) {
            for (let sdx = 0; sdx < sz; sdx++) {
              const sub = this.getTile(ox + sdx, oy + sdy);
              if (sub) sub.powered = true;
            }
          }
        }
      }
    }

    this.stats.powerGenerated = totalGen;
    this.stats.powerConsumed = totalUse;
  }

  // Water Pumping Stations require Power (t.powered) and at least one water square (river or lake) within their range to operate,
  // and deliver water through connected Underground Water Pipes (undergroundWater). Underground Water Pipes do not need electricity.
  recalculateWater() {
    const queue = [];
    const visited = new Set();

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        t.pipeWatered = false;
        t.watered = (t.terrain === 'river' || t.terrain === 'lake');
      }
    }

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.building && t.building.id === 'water_pump') {
          const def = CONFIG.TOOLS.water_pump;
          const rad = def?.radius || 6;
          const hasWaterSquare = this.pumpHasWaterSource(x, y, rad);
          t.building.hasWaterSource = hasWaterSquare;

          if (t.powered && hasWaterSquare) {
            t.watered = true;
            t.pipeWatered = true;
            queue.push([x, y]);
            visited.add(`${x},${y}`);
            this.applyRadialEffect(x, y, rad, (nt) => {
              nt.watered = true;
            });
          }
        }
      }
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const pressurizedPipes = [];
    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      pressurizedPipes.push([cx, cy]);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nt = this.getTile(nx, ny);
        if (!nt) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;

        const isWaterPipe = nt.undergroundWater || Boolean(nt.building && nt.building.id === 'water_pump' && nt.powered && nt.building.hasWaterSource);
        if (isWaterPipe) {
          visited.add(key);
          nt.pipeWatered = true;
          nt.watered = true;
          queue.push([nx, ny]);
        }
      }
    }

    // Each pressurized Underground Water Pipe delivers water to tiles within 2 squares
    for (const [px, py] of pressurizedPipes) {
      this.applyRadialEffect(px, py, 2, (nt) => {
        nt.watered = true;
      });
    }

    // Propagate water across multi-tile footprints (2x2 and 5x5) if any tile of the footprint receives water
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.watered && t.building && (t.building.size || 1) > 1 && t.building.originX !== undefined) {
          const ox = t.building.originX;
          const oy = t.building.originY;
          const sz = t.building.size;
          for (let sdy = 0; sdy < sz; sdy++) {
            for (let sdx = 0; sdx < sz; sdx++) {
              const sub = this.getTile(ox + sdx, oy + sdy);
              if (sub) sub.watered = true;
            }
          }
        }
      }
    }
  }

  recalculateOverlays() {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        t.pollution = 0;
        t.crime = 5;
        t.traffic = 0;
        t.health = t.watered ? 55 : 45;
        t.morale = t.watered ? 72 : 68;
        t.roadAccess = false;

        if (t.terrain === 'forest') t.pollution -= 8;
        if (t.terrain === 'river' || t.terrain === 'lake') {
          t.morale += 6;
        }
      }
    }

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        let foundRoad = false;
        for (let dy = -3; dy <= 3 && !foundRoad; dy++) {
          for (let dx = -3; dx <= 3 && !foundRoad; dx++) {
            const nt = this.getTile(x + dx, y + dy);
            if (this.isRoadSurface(nt)) {
              foundRoad = true;
            }
          }
        }
        t.roadAccess = foundRoad;
      }
    }

    let activeRailStationCount = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.building && t.building.id === 'railway_station' && t.powered && t.watered) {
          activeRailStationCount++;
        }
      }
    }

    const transitReducers = [];

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (!t.building) continue;
        const b = t.building;
        if ((b.size || 1) > 1 && !b.isOrigin) continue;
        const def = CONFIG.TOOLS[b.id];
        if (!def) continue;

        const isOnline = this.isBuildingOperational(t);

        if (b.category === 'zones') {
          const zDef = CONFIG.ZONE_LEVELS[b.zoneType][b.level];
          if (b.zoneType === 'ind' && zDef && zDef.pollution) {
            // Owned Good industrial businesses create 80% pollution; Corrupt ones create 120% pollution
            let pollMult = 1.0;
            if (b.ownedByPlayer) {
              pollMult = b.businessEthics === 'corrupt' ? 1.2 : 0.8;
            }
            const effPoll = zDef.pollution * pollMult;
            this.applyRadialEffect(x, y, 5, (nt, falloff) => {
              nt.pollution += effPoll * falloff;
              nt.morale -= effPoll * 0.35 * falloff;
            });
          }

          // Owned Business Ethics Morale Effects:
          // Good Commercial/Industrial improves city morale; Corrupt Commercial/Industrial harms worker morale
          if (b.ownedByPlayer && b.level > 0) {
            const ethicsDelta = b.businessEthics === 'corrupt'
              ? (b.zoneType === 'ind' ? -18 : -14)
              : (b.zoneType === 'comm' ? 14 : 12);
            this.applyRadialEffect(x, y, 6, (nt, falloff) => {
              nt.morale += ethicsDelta * falloff;
            });
          }

          if (b.level > 0) {
            const popFactor = b.pop / 100;
            this.applyRadialEffect(x, y, 4, (nt, falloff) => {
              nt.crime += popFactor * (b.zoneType === 'ind' ? 9 : 6) * falloff;
              if (this.isRoadSurface(nt)) {
                const cap = CONFIG.TOOLS[nt.building.id]?.trafficCap || 100;
                nt.traffic += (b.pop * 0.45 * falloff) * (100 / cap);
              }
            });
          }
        }

        // Power plants only emit pollution when operational (watered)
        if (def.pollution && def.pollution > 0 && isOnline) {
          const rad = def.radius || 6;
          this.applyRadialEffect(x, y, rad, (nt, falloff) => {
            nt.pollution += def.pollution * falloff;
            nt.morale -= def.pollution * 0.4 * falloff;
          });
        }

        // Raised rail over a road needs power (not water) to provide rail transit benefits
        if (this.hasRail(t) && t.powered) {
          const stationMult = activeRailStationCount > 0 ? 1.25 : 0.65;
          this.applyRadialEffect(x, y, 4, (nt, falloff) => {
            nt.morale += 8 * falloff * stationMult;
            nt.traffic = Math.max(0, nt.traffic - 18 * falloff * stationMult);
          });
        }

        if (!isOnline) continue;

        // Water Pumping Station requires a water square within its range to operate
        if (b.id === 'water_pump' && !b.hasWaterSource) {
          continue;
        }

        const cx = (b.size || 1) > 1 ? x + Math.floor(b.size / 2) : x;
        const cy = (b.size || 1) > 1 ? y + Math.floor(b.size / 2) : y;

        if (def.pollutionReduction) {
          const rad = def.radius || 5;
          this.applyRadialEffect(cx, cy, rad, (nt, falloff) => {
            nt.pollution -= def.pollutionReduction * falloff;
          });
        }

        if (def.crimeReduction) {
          const rad = def.radius || 8;
          this.applyRadialEffect(cx, cy, rad, (nt, falloff) => {
            nt.crime -= def.crimeReduction * falloff;
            nt.morale += (def.crimeReduction * 0.18) * falloff;
          });
        }

        if (def.healthBoost) {
          const rad = def.radius || 9;
          this.applyRadialEffect(cx, cy, rad, (nt, falloff) => {
            nt.health += def.healthBoost * falloff;
            if (b.id === 'water_pump') nt.watered = true;
          });
        }

        if (def.moraleBoost) {
          const rad = def.radius || 8;
          this.applyRadialEffect(cx, cy, rad, (nt, falloff) => {
            nt.morale += def.moraleBoost * falloff;
          });
        }

        // Bus Stations and Railway Stations require BOTH Power and Water (`isOnline` verified above)
        if (b.id === 'bus_station') {
          transitReducers.push({ x: cx, y: cy, radius: def.radius || 8, pct: 0.20 });
        } else if (b.id === 'railway_station') {
          transitReducers.push({ x: cx, y: cy, radius: def.radius || 10, pct: 0.30 });
        }
      }
    }

    // Apply Bus Station (-20% traffic in range) and Railway Station (-30% traffic in range) reductions
    for (const tr of transitReducers) {
      this.applyRadialEffect(tr.x, tr.y, tr.radius, (nt) => {
        if (nt.traffic > 0) {
          nt.traffic = nt.traffic * (1 - tr.pct);
        }
      });
    }

    const taxPenalty = (this.taxRate - 9) * 2.5;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        t.pollution = Math.max(0, Math.min(100, Math.round(t.pollution)));
        t.crime = Math.max(0, Math.min(100, Math.round(t.crime)));
        t.traffic = Math.max(0, Math.min(100, Math.round(t.traffic)));
        t.health = Math.max(0, Math.min(100, Math.round(t.health - t.pollution * 0.25)));

        let m = t.morale;
        m += (t.health - 50) * 0.28;
        m -= t.pollution * 0.45;
        m -= t.crime * 0.4;
        m -= Math.max(0, t.traffic - 55) * 0.25;
        m -= taxPenalty;
        if (t.building && t.building.category === 'zones') {
          if (!t.powered) m -= 30;
          if (!t.watered) m -= 25;
        }
        t.morale = Math.max(0, Math.min(100, Math.round(m)));
      }
    }
  }

  applyRadialEffect(cx, cy, radius, callback) {
    const rSq = radius * radius;
    const minY = Math.max(0, cy - radius);
    const maxY = Math.min(this.size - 1, cy + radius);
    const minX = Math.max(0, cx - radius);
    const maxX = Math.min(this.size - 1, cx + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (dSq <= rSq) {
          const dist = Math.sqrt(dSq);
          const falloff = 1 - (dist / (radius + 0.5));
          callback(this.grid[y][x], falloff);
        }
      }
    }
  }

  checkTier4Rings() {
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ];

    for (let cy = 1; cy < this.size - 1; cy++) {
      for (let cx = 1; cx < this.size - 1; cx++) {
        const firstTile = this.getTile(cx - 1, cy - 1);
        if (!firstTile || !firstTile.building || firstTile.building.category !== 'zones') continue;

        const zType = firstTile.building.zoneType;
        if (zType !== 'res' && zType !== 'comm') continue;

        let validRing = true;
        let alreadyRingForThisCenter = true;

        for (let i = 0; i < 8; i++) {
          const [dx, dy] = offsets[i];
          const nt = this.getTile(cx + dx, cy + dy);
          if (!nt || !nt.building || nt.building.category !== 'zones' || nt.building.zoneType !== zType) {
            validRing = false;
            break;
          }
          const b = nt.building;
          if (b.ringCenter && (b.ringCenter.x !== cx || b.ringCenter.y !== cy)) {
            validRing = false;
            break;
          }
          if (!b.ringCenter || b.ringCenter.x !== cx || b.ringCenter.y !== cy) {
            alreadyRingForThisCenter = false;
          }
          const l3Max = CONFIG.ZONE_LEVELS[zType][3].maxPop;
          const isMaxLevel3 = (b.level === 3 && b.pop >= l3Max) || b.level === 4;
          const hasHighMorale = nt.morale >= 90;

          if (!isMaxLevel3 || !hasHighMorale || !nt.powered || !nt.watered) {
            validRing = false;
            break;
          }
        }

        if (validRing && !alreadyRingForThisCenter) {
          const l4Def = CONFIG.ZONE_LEVELS[zType][4];
          for (let i = 0; i < 8; i++) {
            const [dx, dy] = offsets[i];
            const nt = this.getTile(cx + dx, cy + dy);
            nt.building.level = 4;
            nt.building.maxPop = l4Def.maxPop;
            nt.building.pop = l4Def.maxPop;
            nt.building.ringCenter = { x: cx, y: cy };
            nt.building.ringIndex = i;
          }
          this.rings.push({ cx, cy, zoneType: zType });
          const label = zType === 'res' ? 'Tier-4 Grand Condo Complex' : 'Tier-4 Central Skyscraper Complex';
          this.addAlert(`MEGA-COMBO UNLOCKED: ${label} formed at ${this.formatSquare(cx, cy)}! Pop & Revenue DOUBLED!`, 'combo', { x: cx, y: cy });
          if (window.cyberAudio) window.cyberAudio.playMegaCombo();
        }
      }
    }
  }

  recalculateTotals() {
    let pop = 0;
    let commJobs = 0;
    let indJobs = 0;
    let taxRev = 0;
    let upkeep = 0;

    let zoneCount = 0;
    let wateredZoneCount = 0;
    let activeWaterPumps = 0;
    let totalWaterPumps = 0;
    let commTileCount = 0;
    let indTileCount = 0;
    let moraleSum = 0;
    let pollSum = 0;
    let crimeSum = 0;
    let healthSum = 0;
    let trafficSum = 0;
    let roadCount = 0;

    let ownedCount = 0;
    let commOwned = 0;
    let indOwned = 0;
    let goodCount = 0;
    let corruptCount = 0;
    let commIncome = 0;
    let indIncome = 0;
    let monthlyBusinessIncome = 0;
    let monthlyLoanPayments = 0;
    let totalBusinessDebt = 0;
    let propertyAssetValue = 0;
    const ownedProperties = [];

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        pollSum += t.pollution;
        if (!t.building) continue;
        const b = t.building;
        const def = CONFIG.TOOLS[b.id];
        if (def && def.upkeep) {
          if (!((b.size || 1) > 1 && !b.isOrigin)) {
            upkeep += def.upkeep;
          }
        }
        if (b.hasElevatedRail && b.id !== 'monorail' && b.id !== 'railway_station') {
          upkeep += CONFIG.TOOLS.monorail.upkeep || 3;
        }
        if (b.id === 'water_pump') {
          totalWaterPumps++;
          if (t.powered && b.hasWaterSource) activeWaterPumps++;
        }
        if (this.isRoadSurface(t)) {
          trafficSum += t.traffic;
          roadCount++;
        }
        if (b.category === 'zones') {
          zoneCount++;
          if (t.watered) wateredZoneCount++;
          moraleSum += t.morale;
          crimeSum += t.crime;
          healthSum += t.health;

          const subPct = b.zoneType === 'comm'
            ? (this.commSubsidy || 0)
            : (b.zoneType === 'ind' ? (this.indSubsidy || 0) : 0);
          const subsidyOutputMult = 1 + subPct / 100;

          if (b.level > 0 && t.powered) {
            const zDef = CONFIG.ZONE_LEVELS[b.zoneType][b.level] || CONFIG.ZONE_LEVELS[b.zoneType][3];
            const fillRatio = b.maxPop > 0 ? b.pop / b.maxPop : 0;
            const moraleMultiplier = 0.6 + (t.morale / 100) * 0.8;
            taxRev += zDef.taxBase * fillRatio * (this.taxRate / 9) * moraleMultiplier * subsidyOutputMult;
          }

          if (b.zoneType === 'res') pop += b.pop;
          else if (b.zoneType === 'comm') {
            commJobs += Math.round(b.pop * subsidyOutputMult);
            commTileCount++;
          } else if (b.zoneType === 'ind') {
            indJobs += Math.round(b.pop * subsidyOutputMult);
            indTileCount++;
          }

          if (b.ownedByPlayer && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
            ownedCount++;
            const ethics = b.businessEthics === 'corrupt' ? 'corrupt' : 'good';
            if (ethics === 'corrupt') corruptCount++;
            else goodCount++;

            const propInfo = this.getBusinessPropertyInfo(t);
            if (b.zoneType === 'comm') {
              commOwned++;
              commIncome += propInfo.currentIncome;
            } else {
              indOwned++;
              indIncome += propInfo.currentIncome;
            }
            const debt = Math.max(0, Math.round(b.loanBalance || 0));
            const loanPmt = debt > 0 ? Math.max(0, Math.round(b.loanMonthlyPayment || this.calculateMonthlyLoanPayment(debt))) : 0;
            monthlyBusinessIncome += propInfo.currentIncome;
            monthlyLoanPayments += loanPmt;
            totalBusinessDebt += debt;
            propertyAssetValue += propInfo.buyCost;
            const zDef = CONFIG.ZONE_LEVELS[b.zoneType]?.[Math.max(1, b.level)] || {};
            ownedProperties.push({
              x,
              y,
              name: zDef.name || (b.zoneType === 'comm' ? 'Commercial Business' : 'Industrial Business'),
              zoneType: b.zoneType,
              level: Math.max(1, b.level),
              ethics,
              income: propInfo.currentIncome,
              monthlyProfit: propInfo.currentIncome,
              loanBalance: debt,
              loanPayment: loanPmt,
              netProfit: propInfo.currentIncome - loanPmt,
              buyCost: propInfo.buyCost,
              upgradeCost: propInfo.upgradeCost,
              upgradeDownPayment: propInfo.upgradeDownPayment
            });
          }
        }
      }
    }

    // Subsidy municipal budget cost for the Mayor's treasury
    const subsidyUpkeep = Math.round((commTileCount * (this.commSubsidy || 0) + indTileCount * (this.indSubsidy || 0)) * 0.18);
    upkeep += subsidyUpkeep;

    this.population = Math.round(pop);
    this.commercialJobs = Math.round(commJobs);
    this.industrialJobs = Math.round(indJobs);

    this.stats.taxIncome = Math.round(taxRev);
    this.stats.upkeepCost = Math.round(upkeep);
    this.stats.netTrend = this.stats.taxIncome - this.stats.upkeepCost;

    const netWorthVal = Math.max(0, Math.round((this.businessMoney || 0) + propertyAssetValue - totalBusinessDebt));
    const creditMult = CONFIG.BUSINESS_LOAN?.maxLtvCollateralMult || 4.5;
    const creditLimit = Math.max(150000, Math.round(netWorthVal * creditMult));
    const availableCredit = Math.max(0, creditLimit - totalBusinessDebt);

    this.businessStats = {
      ownedCount,
      commOwned,
      indOwned,
      goodCount,
      corruptCount,
      commIncome: Math.round(commIncome),
      indIncome: Math.round(indIncome),
      monthlyIncome: Math.round(monthlyBusinessIncome),
      monthlyLoanPayments: Math.round(monthlyLoanPayments),
      netMonthlyCashFlow: Math.round(monthlyBusinessIncome - monthlyLoanPayments),
      totalDebt: Math.round(totalBusinessDebt),
      creditLimit,
      availableCredit,
      netWorth: Math.round((this.businessMoney || 0) + propertyAssetValue - totalBusinessDebt),
      ownedList: ownedProperties,
      properties: ownedProperties
    };

    const totalCells = this.size * this.size;
    this.stats.avgPollution = Math.round(pollSum / totalCells);
    this.stats.avgMorale = zoneCount > 0 ? Math.round(moraleSum / zoneCount) : 85;
    this.stats.morale = this.stats.avgMorale;
    this.stats.avgCrime = zoneCount > 0 ? Math.round(crimeSum / zoneCount) : 4;
    this.stats.avgHealth = zoneCount > 0 ? Math.round(healthSum / zoneCount) : 75;
    this.stats.avgTraffic = roadCount > 0 ? Math.round(trafficSum / roadCount) : 0;
    this.stats.waterCoverage = zoneCount > 0 ? Math.round((wateredZoneCount / zoneCount) * 100) : 100;
    this.stats.wateredPct = this.stats.waterCoverage;
    this.stats.activeWaterPumps = activeWaterPumps;
    this.stats.totalWaterPumps = totalWaterPumps;

    const totalJobs = this.commercialJobs + this.industrialJobs;
    const taxEffect = (9 - this.taxRate) * 5;
    const commSubBoost = (this.commSubsidy || 0) * 0.65;
    const indSubBoost = (this.indSubsidy || 0) * 0.65;

    this.demand.res = Math.max(-100, Math.min(100, Math.round(
      55 + (totalJobs - this.population * 0.85) * 0.08 + (this.stats.avgMorale - 65) * 0.7 + taxEffect
    )));
    this.demand.comm = Math.max(-100, Math.min(100, Math.round(
      40 + (this.population * 0.55 - this.commercialJobs) * 0.1 + (this.stats.avgMorale - 60) * 0.5 + taxEffect + commSubBoost
    )));
    this.demand.ind = Math.max(-100, Math.min(100, Math.round(
      50 + (this.population * 0.45 - this.industrialJobs) * 0.1 + taxEffect * 1.1 + indSubBoost
    )));
  }

  calculateMonthlyLoanPayment(principal) {
    if (!principal || principal <= 0) return 0;
    const annualRate = CONFIG.BUSINESS_LOAN?.annualInterestRate ?? 0.065;
    const termMonths = CONFIG.BUSINESS_LOAN?.termMonths ?? 240;
    const r = annualRate / 12;
    if (r <= 0) return Math.ceil(principal / termMonths);
    const factor = Math.pow(1 + r, termMonths);
    return Math.round((principal * r * factor) / (factor - 1));
  }

  // Returns pricing, 20% down payment, monthly loan payment, upgrade cost, and Good vs Corrupt income for any Commercial/Industrial tile
  getBusinessPropertyInfo(tile) {
    if (!tile || !tile.building || tile.building.category !== 'zones') return null;
    const b = tile.building;
    if (b.zoneType !== 'comm' && b.zoneType !== 'ind') return null;

    const scaleLvl = Math.max(1, Math.min(4, b.level || 1));
    const zoneScales = CONFIG.BUSINESS_SCALES?.[b.zoneType] || CONFIG.BUSINESS_SCALES;
    const scaleDef = zoneScales?.[scaleLvl] || {
      level: scaleLvl,
      label: `Level ${scaleLvl}`,
      buyCost: scaleLvl * 120000,
      upgradeCost: scaleLvl < 4 ? scaleLvl * 72000 : 0,
      baseIncome: b.zoneType === 'ind' ? 1500 * scaleLvl : 1000 * scaleLvl
    };

    const nextLvl = Math.min(4, scaleLvl + 1);
    const nextScaleDef = zoneScales?.[nextLvl] || scaleDef;

    const downPct = CONFIG.BUSINESS_LOAN?.downPaymentPct ?? 0.20;
    const downPayment = Math.round(scaleDef.buyCost * downPct);
    const loanPrincipal = Math.max(0, scaleDef.buyCost - downPayment);
    const estMonthlyLoanPayment = this.calculateMonthlyLoanPayment(loanPrincipal);

    const upgradeCost = scaleLvl < 4 ? scaleDef.upgradeCost : 0;
    const upgradeDownPayment = Math.round(upgradeCost * downPct);
    const upgradeLoanPrincipal = Math.max(0, upgradeCost - upgradeDownPayment);
    const estUpgradeLoanPayment = this.calculateMonthlyLoanPayment(upgradeLoanPrincipal);

    const subsidyPct = b.zoneType === 'comm' ? (this.commSubsidy || 0) : (this.indSubsidy || 0);
    const subMult = 1 + (subsidyPct / 100);
    const baseGoodIncome = scaleDef.baseIncome;
    const baseCorruptIncome = scaleDef.baseIncome * 2;
    const goodIncome = Math.round(baseGoodIncome * subMult);
    const corruptIncome = Math.round(baseCorruptIncome * subMult);
    const nextGoodIncome = Math.round(nextScaleDef.baseIncome * subMult);
    const nextCorruptIncome = Math.round(nextScaleDef.baseIncome * 2 * subMult);

    const currentEthics = b.businessEthics === 'corrupt' ? 'corrupt' : 'good';
    const baseSelected = currentEthics === 'corrupt' ? baseCorruptIncome : baseGoodIncome;
    const currentIncome = currentEthics === 'corrupt' ? corruptIncome : goodIncome;
    const subsidyBonus = currentIncome - baseSelected;
    const isOwned = Boolean(b.ownedByPlayer);
    const activeLoanBalance = isOwned ? Math.max(0, Math.round(b.loanBalance || 0)) : 0;
    const activeLoanPayment = activeLoanBalance > 0
      ? Math.max(0, Math.round(b.loanMonthlyPayment || this.calculateMonthlyLoanPayment(activeLoanBalance)))
      : 0;

    return {
      zoneType: b.zoneType,
      scale: scaleLvl,
      scaleLabel: scaleDef.label,
      buyCost: scaleDef.buyCost,
      downPayment,
      loanPrincipal,
      estMonthlyLoanPayment,
      upgradeCost,
      upgradeDownPayment,
      upgradeLoanPrincipal,
      estUpgradeLoanPayment,
      canUpgrade: scaleLvl < 4,
      subsidyPct,
      subsidyBonus,
      baseGoodIncome,
      baseCorruptIncome,
      goodIncome,
      corruptIncome,
      goodProfit: goodIncome,
      corruptProfit: corruptIncome,
      nextGoodIncome,
      nextCorruptIncome,
      currentIncome,
      loanBalance: activeLoanBalance,
      loanMonthlyPayment: activeLoanPayment,
      netCurrentIncome: currentIncome - activeLoanPayment,
      owned: isOwned,
      ownedByPlayer: isOwned,
      ethics: currentEthics
    };
  }

  buyBusinessAt(x, y, ethics = 'good', useLoan = true) {
    const tile = this.getTile(x, y);
    const info = this.getBusinessPropertyInfo(tile);
    if (!info) return { ok: false, reason: 'Only Commercial or Industrial zones can be purchased as businesses.' };
    if (info.ownedByPlayer) return { ok: false, reason: 'You already own this business.' };

    const cashRequired = useLoan ? info.downPayment : info.buyCost;
    const newDebt = useLoan ? info.loanPrincipal : 0;

    if (this.businessMoney < cashRequired) {
      return {
        ok: false,
        reason: useLoan
          ? `Insufficient cash for 20% down payment ($${cashRequired.toLocaleString()} required).`
          : `Insufficient personal funds for full cash purchase ($${cashRequired.toLocaleString()} required).`
      };
    }

    if (useLoan && newDebt > (this.businessStats?.availableCredit ?? Infinity)) {
      return {
        ok: false,
        reason: `Bank loan denied! Loan of $${newDebt.toLocaleString()} exceeds your available credit line ($${(this.businessStats?.availableCredit || 0).toLocaleString()}). Pay down existing debt or grow Net Worth first.`
      };
    }

    this.businessMoney -= cashRequired;
    const b = tile.building;
    b.ownedByPlayer = true;
    b.businessEthics = ethics === 'corrupt' ? 'corrupt' : 'good';
    b.loanBalance = newDebt;
    b.loanMonthlyPayment = newDebt > 0 ? this.calculateMonthlyLoanPayment(newDebt) : 0;

    if (b.level === 0) {
      b.construction = 0;
      b.level = 1;
    }
    const zDef = CONFIG.ZONE_LEVELS[b.zoneType][b.level] || CONFIG.ZONE_LEVELS[b.zoneType][1];
    b.maxPop = zDef.maxPop;
    b.pop = Math.max(b.pop || 0, Math.round(zDef.maxPop * 0.85));

    this.recalculateAll();
    this.updateAIMayorSubsidies();
    this.recalculateTotals();
    return {
      ok: true,
      cost: cashRequired,
      financed: newDebt,
      monthlyPayment: b.loanMonthlyPayment,
      level: b.level,
      ethics: b.businessEthics
    };
  }

  upgradeBusinessAt(x, y, useLoan = true) {
    const tile = this.getTile(x, y);
    const info = this.getBusinessPropertyInfo(tile);
    if (!info || !info.ownedByPlayer) return { ok: false, reason: 'You must own this business to upgrade it.' };
    if (!info.canUpgrade) return { ok: false, reason: 'Already at maximum Scale 4!' };

    const cashRequired = useLoan ? info.upgradeDownPayment : info.upgradeCost;
    const addedDebt = useLoan ? info.upgradeLoanPrincipal : 0;

    if (this.businessMoney < cashRequired) {
      return {
        ok: false,
        reason: useLoan
          ? `Insufficient cash for 20% upgrade down payment ($${cashRequired.toLocaleString()} required).`
          : `Insufficient personal funds ($${cashRequired.toLocaleString()} required to upgrade with cash).`
      };
    }

    if (useLoan && addedDebt > (this.businessStats?.availableCredit ?? Infinity)) {
      return {
        ok: false,
        reason: `Bank construction loan denied! $${addedDebt.toLocaleString()} exceeds available credit ($${(this.businessStats?.availableCredit || 0).toLocaleString()}).`
      };
    }

    this.businessMoney -= cashRequired;
    const b = tile.building;
    b.level = Math.min(4, Math.max(1, b.level) + 1);
    b.construction = 0;
    if (addedDebt > 0) {
      b.loanBalance = Math.round((b.loanBalance || 0) + addedDebt);
      b.loanMonthlyPayment = this.calculateMonthlyLoanPayment(b.loanBalance);
    }

    const zDef = CONFIG.ZONE_LEVELS[b.zoneType][b.level] || CONFIG.ZONE_LEVELS[b.zoneType][3];
    b.maxPop = zDef.maxPop;
    b.pop = zDef.maxPop;

    this.recalculateAll();
    return { ok: true, cost: cashRequired, financed: addedDebt, newLevel: b.level };
  }

  payOffBusinessLoanAt(x, y) {
    const tile = this.getTile(x, y);
    if (!tile || !tile.building || !tile.building.ownedByPlayer) {
      return { ok: false, reason: 'Not an owned business.' };
    }
    const b = tile.building;
    const balance = Math.max(0, Math.round(b.loanBalance || 0));
    if (balance <= 0) return { ok: false, reason: 'This property has no active loan.' };
    if (this.businessMoney < balance) {
      return { ok: false, reason: `Insufficient cash ($${balance.toLocaleString()} required to pay off loan).` };
    }
    this.businessMoney -= balance;
    b.loanBalance = 0;
    b.loanMonthlyPayment = 0;
    this.recalculateTotals();
    return { ok: true, paid: balance };
  }

  processMonthlyBusinessFinances() {
    if (!this.businessStats) return;
    const annualRate = CONFIG.BUSINESS_LOAN?.annualInterestRate ?? 0.065;
    const monthlyRate = annualRate / 12;

    let totalGrossIncome = 0;
    let totalLoanPaid = 0;
    const mortgagedTiles = [];

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        const b = t?.building;
        if (!b || !b.ownedByPlayer || (b.zoneType !== 'comm' && b.zoneType !== 'ind')) continue;

        const info = this.getBusinessPropertyInfo(t);
        if (info) totalGrossIncome += info.currentIncome;

        if ((b.loanBalance || 0) > 0) {
          const interest = b.loanBalance * monthlyRate;
          const pmt = Math.min(b.loanBalance + interest, b.loanMonthlyPayment || this.calculateMonthlyLoanPayment(b.loanBalance));
          const principalPaid = Math.max(0, pmt - interest);
          b.loanBalance = Math.max(0, Math.round(b.loanBalance - principalPaid));
          if (b.loanBalance === 0) b.loanMonthlyPayment = 0;
          totalLoanPaid += Math.round(pmt);
          if (b.loanBalance > 0) {
            mortgagedTiles.push({ x, y, tile: t });
          }
        }
      }
    }

    this.businessMoney += Math.round(totalGrossIncome - totalLoanPaid);

    if (this.businessMoney < 0 && mortgagedTiles.length > 0) {
      this.bmNegativeCashMonths = (this.bmNegativeCashMonths || 0) + 1;
      if (this.bmNegativeCashMonths >= 3) {
        const foreclosed = mortgagedTiles[mortgagedTiles.length - 1];
        const fb = foreclosed.tile.building;
        fb.ownedByPlayer = false;
        fb.businessEthics = 'good';
        fb.loanBalance = 0;
        fb.loanMonthlyPayment = 0;
        this.bmNegativeCashMonths = 0;
        this.addAlert(
          `BANK FORECLOSURE at ${this.formatSquare(foreclosed.x, foreclosed.y)}! Cash remained negative for 3 months, so the bank repossessed your mortgaged property.`,
          'danger',
          { x: foreclosed.x, y: foreclosed.y }
        );
      } else {
        this.addAlert(
          `DEBT WARNING (${this.bmNegativeCashMonths}/3 months): Your personal cash is negative ($${this.businessMoney.toLocaleString()}). Switch to Corrupt mode or sell/upgrade to cover loan payments before foreclosure!`,
          'warn'
        );
      }
    } else {
      this.bmNegativeCashMonths = 0;
    }
  }

  setBusinessEthicsAt(x, y, ethics = 'good') {
    const tile = this.getTile(x, y);
    if (!tile || !tile.building || !tile.building.ownedByPlayer) {
      return { ok: false, reason: 'Not an owned business.' };
    }
    tile.building.businessEthics = ethics === 'corrupt' ? 'corrupt' : 'good';
    this.recalculateAll();
    this.updateAIMayorSubsidies();
    this.recalculateTotals();
    return { ok: true, ethics: tile.building.businessEthics };
  }

  // AI Mayor adjusts Commercial & Industrial Subsidies based on his alignment (good vs corrupt) and the player's business ethics
  updateAIMayorSubsidies() {
    if (this.playerRole !== 'businessman') return;
    const { ownedCount, goodCount, corruptCount } = this.businessStats;
    if (ownedCount === 0) return;

    const netGoodRatio = (goodCount - corruptCount) / ownedCount; // +1 = all good, -1 = all corrupt
    const mayorIsGood = this.aiMayorAlignment !== 'corrupt';

    // Good Mayor rewards Good businesses (+subsidy) and penalizes Corrupt ones (-subsidy).
    // Corrupt Mayor rewards Corrupt businesses (+subsidy) and penalizes Good ones (-subsidy).
    const alignmentMatch = mayorIsGood ? netGoodRatio : -netGoodRatio;
    const targetSubsidy = Math.max(0, Math.min(50, Math.round(20 + alignmentMatch * 25)));

    this.commSubsidy = targetSubsidy;
    this.indSubsidy = targetSubsidy;
  }

  // Autonomous Computer Mayor (Good vs. Corrupt Urban Planner):
  // - Builds 9x9 road superblocks (7x7 interior enclosure = 49 tiles):
  //   * Four 3x3 corner pods (Res/Comm with center Park, or Ind with center Air Scrubber)
  //   * Four "4th position" outer-edge midpoints: 2 Police Stations across from each other, 1 Bus Station, and 1 Fire Station
  //   * 9-spot inner cross in the middle: Parks, or Air Scrubbers when Industrial 3x3s are present
  // - Periodically boxes off 2x6 enclosures (4x8 or 8x4 road box) for Public School (2x2), State University (2x2), and General Hospitals (1x1)
  // - Builds Water Pumping Stations near water, Power Plants (clean Wind/Solar/Nuclear for Good; Coal for Corrupt),
  //   and connects all buildings with Underground Power Conduits (`powerline_under`) and Underground Water Pipes (`water_pipe`)
  stepAIMayor() {
    if (this.playerRole !== 'businessman') return;

    if (!Array.isArray(this.aiBuildQueue)) this.aiBuildQueue = [];
    if (typeof this.aiBlocksBuilt !== 'number') this.aiBlocksBuilt = 0;

    const mayorIsGood = this.aiMayorAlignment !== 'corrupt';

    // 1. Adjust Commercial/Industrial subsidies & tax rate according to Good vs. Corrupt alignment
    this.updateAIMayorSubsidies();
    if (this.tickCount % 10 === 0) {
      if (mayorIsGood) {
        const targetTax = (this.money > 8000 && this.stats.netTrend > 250) ? 8 : 9;
        if (this.taxRate > targetTax) this.taxRate--;
        else if (this.taxRate < targetTax && this.money < 3000) this.taxRate++;
      } else {
        // Corrupt Mayor taxes higher (10-11%) to pad the treasury unless morale is critically low in an election year
        const electionDanger = (this.year % 2 === 1) && (this.stats.avgMorale < 54);
        const targetTax = electionDanger ? 9 : (this.money < 6000 ? 11 : 10);
        if (this.taxRate < targetTax) this.taxRate++;
        else if (this.taxRate > targetTax) this.taxRate--;
      }
    }

    // 2. Self-Healing Utility Pass: ensure active Water Pumping Station + connect any unpowered/unwatered buildings
    this.ensureAIUtilitiesAndWaterSupply();

    // 3. Ensure Power Generation stays ahead of city demand (Good = Wind/Solar/Nuclear; Corrupt = Coal/Wind)
    this.ensureAIPowerCapacity(mayorIsGood);

    // 4. Upgrade congested roads (Good upgrades at >=55% traffic; Corrupt waits until >=82% traffic)
    if (this.tickCount % 9 === 0 && this.money >= 900) {
      const trafficThreshold = mayorIsGood ? 55 : 82;
      for (let y = 4; y < this.size - 4; y++) {
        let upgraded = false;
        for (let x = 4; x < this.size - 4; x++) {
          const t = this.getTile(x, y);
          if (t && t.building && t.building.id === 'road' && t.traffic >= trafficThreshold) {
            this.placeTool(x, y, 'avenue');
            upgraded = true;
            break;
          }
        }
        if (upgraded) break;
      }
    }

    // Keep a safe treasury reserve (higher during odd election years for campaign options)
    const minReserve = (this.year % 2 === 1) ? (mayorIsGood ? 600 : 900) : 250;
    if (this.money <= minReserve) return;

    // 5. If the blueprint build queue is empty, plan the next 9x9 Superblock (7x7 enclosure) or 2x6 School/University/Hospital Enclosure.
    // Strict 2:1 ratio: builds TWO 7x7 enclosures (9x9 road blocks) for every ONE 2x6 enclosure (7x7 built twice as often as 2x6).
    if (this.aiBuildQueue.length === 0) {
      if (typeof this.aiCivicBoxesBuilt !== 'number') this.aiCivicBoxesBuilt = 0;
      const shouldBuild2x6CivicBox =
        this.aiBlocksBuilt >= 2 &&
        Math.floor(this.aiBlocksBuilt / 2) > this.aiCivicBoxesBuilt;

      let planned = false;
      if (shouldBuild2x6CivicBox) {
        planned = this.planNextAI2x6CivicBox(mayorIsGood);
        if (!planned) {
          // If no 2x6 site was available right now, advance civic counter so we don't get stuck and build a 7x7 instead
          this.aiCivicBoxesBuilt = Math.floor(this.aiBlocksBuilt / 2);
        }
      }
      if (!planned) {
        planned = this.planNextAI9x9Superblock(mayorIsGood);
      }
      if (!planned && !shouldBuild2x6CivicBox) {
        this.planNextAI2x6CivicBox(mayorIsGood);
      }
    }

    // 6. Execute affordable steps from the active blueprint queue
    this.executeAIBuildQueueSteps(minReserve);

    // 7. Connect nearby road gaps (1-3 tiles apart, e.g. small red box) & infill the starter downtown / Business Man's Home strip (bigger red box)
    if (this.tickCount % 3 === 0 && this.money > minReserve + 80) {
      this.connectNearbyAIRoadGaps();
    }
    if (this.tickCount % 4 === 0 && this.money > minReserve + 120) {
      this.infillStarterDowntownArea(mayorIsGood);
    }
  }

  // Connects (targetX, targetY) to the nearest energized underground/above-ground power line or power plant
  connectAIPowerToTile(targetX, targetY, free = false) {
    const startTile = this.getTile(targetX, targetY);
    if (!startTile) return;
    if (!startTile.undergroundPower && (free || this.money >= CONFIG.TOOLS.powerline_under.cost)) {
      this.placeTool(targetX, targetY, 'powerline_under', free);
    }
    if (startTile.powered) return;

    let bestSource = null;
    let bestDist = Infinity;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        const isConductor = t.undergroundPower ||
          Boolean(t.building && (t.building.id === 'powerline_above' || CONFIG.TOOLS[t.building.id]?.powerGen));
        if (t.powered && isConductor) {
          const d = Math.abs(x - targetX) + Math.abs(y - targetY);
          if (d < bestDist) {
            bestDist = d;
            bestSource = { x, y };
          }
        }
      }
    }
    if (!bestSource) bestSource = { x: 22, y: 24 };

    let cx = bestSource.x;
    let cy = bestSource.y;
    while (cx !== targetX || cy !== targetY) {
      if (cx !== targetX) cx += (targetX > cx ? 1 : -1);
      else if (cy !== targetY) cy += (targetY > cy ? 1 : -1);
      const t = this.getTile(cx, cy);
      if (t && !t.undergroundPower) {
        if (!free && this.money < CONFIG.TOOLS.powerline_under.cost) break;
        this.placeTool(cx, cy, 'powerline_under', free);
      }
    }
  }

  // Connects (targetX, targetY) to the nearest pressurized Underground Water Pipe or active Water Pumping Station
  connectAIWaterToTile(targetX, targetY, free = false) {
    const startTile = this.getTile(targetX, targetY);
    if (!startTile) return;
    if (!startTile.undergroundWater && (free || this.money >= CONFIG.TOOLS.water_pipe.cost)) {
      this.placeTool(targetX, targetY, 'water_pipe', free);
    }
    if (startTile.watered && startTile.pipeWatered) return;

    let bestSource = null;
    let bestDist = Infinity;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        const isPipeOrPump = t.undergroundWater || Boolean(t.building && t.building.id === 'water_pump');
        if (t.pipeWatered && isPipeOrPump) {
          const d = Math.abs(x - targetX) + Math.abs(y - targetY);
          if (d < bestDist) {
            bestDist = d;
            bestSource = { x, y };
          }
        }
      }
    }
    if (!bestSource) bestSource = { x: 28, y: 28 };

    let cx = bestSource.x;
    let cy = bestSource.y;
    while (cx !== targetX || cy !== targetY) {
      if (cx !== targetX) cx += (targetX > cx ? 1 : -1);
      else if (cy !== targetY) cy += (targetY > cy ? 1 : -1);
      const t = this.getTile(cx, cy);
      if (t && !t.undergroundWater) {
        if (!free && this.money < CONFIG.TOOLS.water_pipe.cost) break;
        this.placeTool(cx, cy, 'water_pipe', free);
      }
    }
  }

  // Prevents the AI Mayor from ever placing roads side-by-side (2x2 road squares) or tighter than 2 tiles between parallel roads
  canAIPlaceRoadAt(x, y, allowRiverBridge = true) {
    const t = this.getTile(x, y);
    if (!t || t.terrain === 'lake') return false;
    if (this.isRoadSurface(t)) return true;

    // Never form a 2x2 block of roads in any of the 4 quadrants around (x, y)
    const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [qx, qy] of quads) {
      const r1 = this.isRoadSurface(this.getTile(x + qx, y));
      const r2 = this.isRoadSurface(this.getTile(x, y + qy));
      const r3 = this.isRoadSurface(this.getTile(x + qx, y + qy));
     if (r1 && r2 && r3) {
        return false;
      }
    }
    return true;
  }

  // Connects a new block corner (targetX, targetY) to the nearest existing road with road + underground power + underground water
  connectAIRoadAndUtilitiesToTile(targetX, targetY) {
    let bestRoad = null;
    let bestDist = Infinity;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (this.isRoadSurface(t)) {
          const d = Math.abs(x - targetX) + Math.abs(y - targetY);
          if (d < bestDist) {
            bestDist = d;
            bestRoad = { x, y };
          }
        }
      }
    }
    if (!bestRoad) return;

    let cx = bestRoad.x;
    let cy = bestRoad.y;
    while (cx !== targetX || cy !== targetY) {
      if (cx !== targetX) cx += (targetX > cx ? 1 : -1);
      else if (cy !== targetY) cy += (targetY > cy ? 1 : -1);
      const t = this.getTile(cx, cy);
      if (!t) break;
      if (!t.building && t.terrain !== 'lake') {
        this.aiBuildQueue.push({ x: cx, y: cy, toolId: 'road', wirePower: true, wireWater: true, checkRoadSpacing: true });
      } else {
        this.aiBuildQueue.push({ x: cx, y: cy, toolId: null, wirePower: true, wireWater: true });
      }
    }
  }

  // Repairs any unpowered or unwatered buildings and builds a new Water Pumping Station near water if needed
  ensureAIUtilitiesAndWaterSupply() {
    // 1. Ensure at least one operational Water Pumping Station exists
    if ((this.stats.activeWaterPumps || 0) === 0 && this.money >= 220) {
      // First check if an existing water_pump just needs power or water source
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const t = this.grid[y][x];
          if (t.building && t.building.id === 'water_pump') {
            if (!t.powered) this.connectAIPowerToTile(x, y);
            if (!t.undergroundWater) this.placeTool(x, y, 'water_pipe');
            return;
          }
        }
      }
      // Otherwise build a new Water Pumping Station within 6 tiles of a river or lake
      let bestPumpSite = null;
      let bestDist = Infinity;
      for (let y = 6; y < this.size - 6; y++) {
        for (let x = 6; x < this.size - 6; x++) {
          const t = this.getTile(x, y);
          if (!t || t.building || t.terrain === 'river' || t.terrain === 'lake') continue;
          if (this.pumpHasWaterSource(x, y, 6)) {
            const d = Math.abs(x - 24) + Math.abs(y - 24);
            if (d < bestDist) {
              bestDist = d;
              bestPumpSite = { x, y };
            }
          }
        }
      }
      if (bestPumpSite) {
        const res = this.placeTool(bestPumpSite.x, bestPumpSite.y, 'water_pump');
        if (res.ok) {
          this.connectAIPowerToTile(bestPumpSite.x, bestPumpSite.y);
          this.connectAIWaterToTile(bestPumpSite.x, bestPumpSite.y);
          this.addAlert(
            `AI Mayor ${this.mayorName || 'Charles'} constructed a Water Pumping Station at ${this.formatSquare(bestPumpSite.x, bestPumpSite.y)}.`,
            'info',
            bestPumpSite
          );
          return;
        }
      }
    }

    // 2. Scan for any existing Power Plant, Water Pump, Civic, or Zone building missing water or power and wire it up
    if (this.money < 60) return;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (!t.building) continue;
        if ((t.building.size || 1) > 1 && !t.building.isOrigin) continue;

        const req = this.getBuildingUtilityStatus(t);
        if (req.needsWater && !req.hasWater) {
          this.connectAIWaterToTile(x, y);
          return;
        }
        if (req.needsPower && !req.hasPower) {
          this.connectAIPowerToTile(x, y);
          return;
        }
      }
    }
  }

  // Ensures power generation stays ahead of consumption using alignment-appropriate power plants
  ensureAIPowerCapacity(mayorIsGood) {
    if (this.stats.powerConsumed + 35 < this.stats.powerGenerated) return;

    let plantId = 'wind_plant';
    if (mayorIsGood) {
      if (this.money >= 1650 && this.stats.powerConsumed >= 550) plantId = 'nuclear_plant';
      else if (this.money >= 520) plantId = 'solar_plant';
      else plantId = 'wind_plant';
    } else {
      // Corrupt Mayor favors high-output, polluting Coal Power Stations
      if (this.money >= 650) plantId = 'coal_plant';
      else plantId = 'wind_plant';
    }

    const plantCost = CONFIG.TOOLS[plantId]?.cost || 220;
    if (this.money < plantCost + 60) return;

    // Find an empty land tile adjacent to a road (preferring the starter City Hall utility block or tucked corners so we never block an open 9x9 superblock site)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const queuedCoords = new Set((this.aiBuildQueue || []).map(s => `${s.x},${s.y}`));
    let bestSite = null;
    let bestScore = -Infinity;

    for (let y = 4; y < this.size - 4; y++) {
      for (let x = 4; x < this.size - 4; x++) {
        if (queuedCoords.has(`${x},${y}`)) continue;
        const t = this.getTile(x, y);
        if (!t || t.building || t.terrain === 'river' || t.terrain === 'lake') continue;
        const adjRoad = dirs.some(([dx, dy]) => this.isRoadSurface(this.getTile(x + dx, y + dy)));
        if (!adjRoad) continue;

        let score = 0;
        if (t.watered) score += 50;
        if (t.powered) score += 40;
        // Strongly prefer placing standalone power plants inside the starter City Hall sector (x=16..28, y=20..28)
        // or tightly adjacent to existing buildings so open 9x9 superblock sites remain unobstructed
        if (x >= 16 && x <= 28 && y >= 20 && y <= 28) {
          score += 120;
        }
        const adjBuildings = dirs.filter(([dx, dy]) => Boolean(this.getTile(x + dx, y + dy)?.building)).length;
        score += adjBuildings * 25;

        const distCenter = Math.abs(x - 22) + Math.abs(y - 24);
        score -= distCenter * 1.2;

        if (score > bestScore) {
          bestScore = score;
          bestSite = { x, y };
        }
      }
    }

    if (bestSite) {
      const res = this.placeTool(bestSite.x, bestSite.y, plantId);
      if (res.ok) {
        this.connectAIWaterToTile(bestSite.x, bestSite.y);
        this.connectAIPowerToTile(bestSite.x, bestSite.y);
        // If Corrupt Mayor built a Coal Plant and has extra cash + high pollution, drop an Air Scrubber nearby
        const plantName = CONFIG.TOOLS[plantId]?.name || 'Power Plant';
        this.addAlert(
          `AI Mayor ${this.mayorName || 'Charles'} built a ${plantName} at ${this.formatSquare(bestSite.x, bestSite.y)}.`,
          'info',
          bestSite
        );
      }
    }
  }

  // Checks if a 9x9 area with top-left road corner at (bx, by) can host a 9x9 Road Block (7x7 interior enclosure)
  isValid9x9SuperblockSite(bx, by) {
    if (bx < 2 || by < 2 || bx + 8 >= this.size - 2 || by + 8 >= this.size - 2) return false;

    for (let dy = 0; dy <= 8; dy++) {
      for (let dx = 0; dx <= 8; dx++) {
        const x = bx + dx;
        const y = by + dy;
        const t = this.getTile(x, y);
        if (!t) return false;
        const isPerimeter = (dx === 0 || dx === 8 || dy === 0 || dy === 8);
        if (isPerimeter) {
          // Perimeter is a 9x9 road ring (cannot cross lakes/rivers or overwrite non-road buildings)
          if (t.terrain === 'lake' || t.terrain === 'river') return false;
          if (t.building && !this.isRoadSurface(t)) return false;

          // If this perimeter tile is not already an existing shared road, make sure we don't place it
          // 1 or 2 tiles parallel to another road outside the block (prevents double roads & tight road grids)
          if (!this.isRoadSurface(t)) {
            if (dy === 0 && (this.isRoadSurface(this.getTile(x, y - 1)) || this.isRoadSurface(this.getTile(x, y - 2)))) return false;
            if (dy === 8 && (this.isRoadSurface(this.getTile(x, y + 1)) || this.isRoadSurface(this.getTile(x, y + 2)))) return false;
            if (dx === 0 && (this.isRoadSurface(this.getTile(x - 1, y)) || this.isRoadSurface(this.getTile(x - 2, y)))) return false;
            if (dx === 8 && (this.isRoadSurface(this.getTile(x + 1, y)) || this.isRoadSurface(this.getTile(x + 2, y)))) return false;
          }
        } else {
          // 7x7 interior enclosure (49 tiles) must be buildable land/forest and empty
          if (t.terrain === 'river' || t.terrain === 'lake') return false;
          if (t.building) return false;
        }
      }
    }
    return true;
  }

  // Finds the best available (bx, by) for the next 9x9 Road Block (7x7 interior enclosure)
  findNext9x9SuperblockSite() {
    const candidates = [];
    // Primary 8-tile superblock lattice aligned with starter block edges (x = 1, 9, 17, 27, 29, 35, 37, 45; y = 4, 12, 16, 20, 24, 28, 36, 44)
    const latticeX = new Set([1, 9, 17, 19, 27, 29, 35, 37, 45]);
    const latticeY = new Set([4, 12, 16, 20, 24, 28, 32, 36, 44]);

    // Scan all valid 9x9 positions across the map (giving a strong bonus to lattice-aligned and road-sharing positions)
    for (let by = 2; by <= this.size - 11; by++) {
      for (let bx = 2; bx <= this.size - 11; bx++) {
        if (this.isValid9x9SuperblockSite(bx, by)) {
          let latticeBonus = 0;
          if (latticeX.has(bx)) latticeBonus += 25;
          if (latticeY.has(by)) latticeBonus += 25;
          candidates.push({ bx, by, latticeBonus });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Score candidates: prefer sites that share existing perimeter road tiles and are close to City Hall (22, 24)
    let best = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      let existingRoadCount = 0;
      for (let i = 0; i <= 8; i++) {
        if (this.isRoadSurface(this.getTile(c.bx + i, c.by))) existingRoadCount++;
        if (this.isRoadSurface(this.getTile(c.bx + i, c.by + 8))) existingRoadCount++;
        if (this.isRoadSurface(this.getTile(c.bx, c.by + i))) existingRoadCount++;
        if (this.isRoadSurface(this.getTile(c.bx + 8, c.by + i))) existingRoadCount++;
      }
      const dist = Math.abs((c.bx + 4) - 22) + Math.abs((c.by + 4) - 24);
      const score = c.latticeBonus + existingRoadCount * 10 - dist * 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // Plans a complete 9x9 Road Superblock (7x7 interior = 4x 3x3 corner pods, 2 opposite Police, 1 Bus Station, 1 Fire Station, 9-spot inner cross)
  planNextAI9x9Superblock(mayorIsGood) {
    const site = this.findNext9x9SuperblockSite();
    if (!site) return false;
    const { bx, by } = site;

    // 1. Connect (bx, by) to the existing road, power, and water networks
    this.connectAIRoadAndUtilitiesToTile(bx, by);

    // 2. Queue the 9x9 outer road perimeter + underground power & water trunk along the perimeter
    for (let x = bx; x <= bx + 8; x++) {
      this.aiBuildQueue.push({ x, y: by, toolId: 'road', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x, y: by + 8, toolId: 'road', wirePower: true, wireWater: true });
    }
    for (let y = by + 1; y <= by + 7; y++) {
      this.aiBuildQueue.push({ x: bx, y, toolId: 'road', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: bx + 8, y, toolId: 'road', wirePower: true, wireWater: true });
    }

    // Queue internal underground power & water grid lines through the 7x7 interior (cross + 3x3 centers)
    // so every single building in the 49-tile enclosure is 100% powered and watered
    for (let i = 1; i <= 7; i++) {
      this.aiBuildQueue.push({ x: bx + 4, y: by + i, toolId: null, wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: bx + i, y: by + 4, toolId: null, wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: bx + 2, y: by + i, toolId: null, wirePower: true, wireWater: false });
      this.aiBuildQueue.push({ x: bx + 6, y: by + i, toolId: null, wirePower: true, wireWater: false });
    }

    // 3. Choose the 4 Corner 3x3 Pods ([Top-Left, Top-Right, Bottom-Left, Bottom-Right]):
    // - 3 of the 4 3x3s are ALWAYS one of each regardless: 1 Residential, 1 Commercial, 1 Industrial
    // - The 4th 3x3 goes to whichever zone type currently has the highest RCI demand!
    const dRes = this.demand?.res ?? 50;
    const dComm = this.demand?.comm ?? 40;
    const dInd = this.demand?.ind ?? 45;

    let highestDemandZone = 'zone_res';
    if (dComm >= dRes && dComm >= dInd) {
      highestDemandZone = 'zone_comm';
    } else if (dInd >= dRes && dInd >= dComm) {
      highestDemandZone = 'zone_ind';
    } else {
      highestDemandZone = 'zone_res';
    }

    const baseCorners = ['zone_res', 'zone_comm', 'zone_ind', highestDemandZone];
    const rot = this.aiBlocksBuilt % 4;
    const cornerTypes = [
      baseCorners[(0 + rot) % 4],
      baseCorners[(1 + rot) % 4],
      baseCorners[(2 + rot) % 4],
      baseCorners[(3 + rot) % 4]
    ];

    const cornerCenters = [
      { cx: bx + 2, cy: by + 2, zoneId: cornerTypes[0] }, // Top-Left 3x3
      { cx: bx + 6, cy: by + 2, zoneId: cornerTypes[1] }, // Top-Right 3x3
      { cx: bx + 2, cy: by + 6, zoneId: cornerTypes[2] }, // Bottom-Left 3x3
      { cx: bx + 6, cy: by + 6, zoneId: cornerTypes[3] }  // Bottom-Right 3x3
    ];

    const queueCornerPod = (pod) => {
      // Center of 3x3: Park for Residential/Commercial, Air Scrubber for Industrial
      const centerTool = pod.zoneId === 'zone_ind' ? 'scrubber' : 'park';
      this.aiBuildQueue.push({
        x: pod.cx,
        y: pod.cy,
        toolId: centerTool,
        wirePower: true,
        wireWater: true
      });
      // 8 surrounding zone tiles of the 3x3
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          this.aiBuildQueue.push({
            x: pod.cx + dx,
            y: pod.cy + dy,
            toolId: pod.zoneId,
            wirePower: true,
            wireWater: true,
            initZone: true
          });
        }
      }
    };

    // Interleave the 4 corner 3x3 pods with the 4 outer-edge "4th position" civic/transit stations
    // Top-Left & Top-Right 3x3s
    queueCornerPod(cornerCenters[0]);
    queueCornerPod(cornerCenters[1]);

    // 4th Position Outer-Edge Slot 1 (Top midpoint) & Slot 4 (Right midpoint): Police Station & Fire Station
    this.aiBuildQueue.push({ x: bx + 4, y: by + 1, toolId: 'police', wirePower: true, wireWater: true });
    this.aiBuildQueue.push({ x: bx + 7, y: by + 4, toolId: 'fire', wirePower: true, wireWater: true });

    // Bottom-Left & Bottom-Right 3x3s
    queueCornerPod(cornerCenters[2]);
    queueCornerPod(cornerCenters[3]);

    // 4th Position Outer-Edge Slot 2 (Bottom midpoint, directly across from Top Police) & Slot 3 (Left midpoint, across from Fire)
    this.aiBuildQueue.push({ x: bx + 4, y: by + 7, toolId: 'police', wirePower: true, wireWater: true });
    this.aiBuildQueue.push({ x: bx + 1, y: by + 4, toolId: 'bus_station', wirePower: true, wireWater: true });

    // 5. Queue the 9-Spot Inner Cross in the middle of the 7x7 enclosure:
    // Spots: (4,2), (4,3), (2,4), (3,4), (4,4), (5,4), (6,4), (4,5), (4,6)
    const hasIndTL = cornerTypes[0] === 'zone_ind';
    const hasIndTR = cornerTypes[1] === 'zone_ind';
    const hasIndBL = cornerTypes[2] === 'zone_ind';
    const hasIndBR = cornerTypes[3] === 'zone_ind';
    const anyIndInBlock = hasIndTL || hasIndTR || hasIndBL || hasIndBR;

    const innerCrossSpots = [
      { dx: 4, dy: 4, touchesInd: anyIndInBlock },
      { dx: 4, dy: 2, touchesInd: hasIndTL || hasIndTR },
      { dx: 4, dy: 3, touchesInd: hasIndTL || hasIndTR },
      { dx: 2, dy: 4, touchesInd: hasIndTL || hasIndBL },
      { dx: 3, dy: 4, touchesInd: hasIndTL || hasIndBL },
      { dx: 5, dy: 4, touchesInd: hasIndTR || hasIndBR },
      { dx: 6, dy: 4, touchesInd: hasIndTR || hasIndBR },
      { dx: 4, dy: 5, touchesInd: hasIndBL || hasIndBR },
      { dx: 4, dy: 6, touchesInd: hasIndBL || hasIndBR }
    ];

    innerCrossSpots.forEach((spot, idx) => {
      let crossTool = 'park';
      if (anyIndInBlock && spot.touchesInd) {
        // Place Air Scrubbers ("air filters") in the inner cross when Industrial 3x3s are present
        if (mayorIsGood) {
          crossTool = 'scrubber';
        } else {
          // Corrupt Mayor puts Air Scrubbers on the primary industrial cross spots and Parks on the odd ones to save upkeep
          crossTool = (idx % 2 === 0) ? 'scrubber' : 'park';
        }
      }
      this.aiBuildQueue.push({
        x: bx + spot.dx,
        y: by + spot.dy,
        toolId: crossTool,
        wirePower: true,
        wireWater: true
      });
    });

    this.aiBlocksBuilt++;
    this.addAlert(
      `AI Mayor ${this.mayorName || 'Charles'} broke ground on a 9x9 Superblock at ${this.formatSquare(bx + 4, by + 4)}.`,
      'info',
      { x: bx + 4, y: by + 4 }
    );
    return true;
  }

  // Checks if an 8x4 (horizontal 6x2 interior) or 4x8 (vertical 2x6 interior) road-boxed area is valid for School + University + Hospitals
  isValid2x6CivicBoxSite(ax, ay, horizontal = true) {
    const w = horizontal ? 7 : 3; // 0..7 (8 tiles) or 0..3 (4 tiles)
    const h = horizontal ? 3 : 7; // 0..3 (4 tiles) or 0..7 (8 tiles)
    if (ax < 2 || ay < 2 || ax + w >= this.size - 2 || ay + h >= this.size - 2) return false;

    for (let dy = 0; dy <= h; dy++) {
      for (let dx = 0; dx <= w; dx++) {
        const x = ax + dx;
        const y = ay + dy;
        const t = this.getTile(x, y);
        if (!t) return false;
        const isPerimeter = (dx === 0 || dx === w || dy === 0 || dy === h);
        if (isPerimeter) {
          if (t.terrain === 'lake' || t.terrain === 'river') return false;
          if (t.building && !this.isRoadSurface(t)) return false;

          // Prevent placing a new perimeter road 1 or 2 tiles parallel to another road outside the box
          if (!this.isRoadSurface(t)) {
            if (dy === 0 && (this.isRoadSurface(this.getTile(x, y - 1)) || this.isRoadSurface(this.getTile(x, y - 2)))) return false;
            if (dy === h && (this.isRoadSurface(this.getTile(x, y + 1)) || this.isRoadSurface(this.getTile(x, y + 2)))) return false;
            if (dx === 0 && (this.isRoadSurface(this.getTile(x - 1, y)) || this.isRoadSurface(this.getTile(x - 2, y)))) return false;
            if (dx === w && (this.isRoadSurface(this.getTile(x + 1, y)) || this.isRoadSurface(this.getTile(x + 2, y)))) return false;
          }
        } else {
          if (t.terrain === 'river' || t.terrain === 'lake') return false;
          if (t.building) return false;
        }
      }
    }
    return true;
  }

  // Periodically boxes off a 2x6 interior area with roads for a 2x2 Public School, 2x2 State University, and 1x1 General Hospitals
  planNextAI2x6CivicBox(mayorIsGood) {
    let bestSite = null;
    let bestScore = -Infinity;

    for (const horizontal of [true, false]) {
      const w = horizontal ? 7 : 3;
      const h = horizontal ? 3 : 7;
      for (let ay = 4; ay <= this.size - h - 3; ay++) {
        for (let ax = 4; ax <= this.size - w - 3; ax++) {
          if (!this.isValid2x6CivicBoxSite(ax, ay, horizontal)) continue;

          // Count how many perimeter tiles already have roads (so the 2x6 box snaps cleanly against a 9x9 superblock wall)
          let sharedRoads = 0;
          for (let dy = 0; dy <= h; dy++) {
            for (let dx = 0; dx <= w; dx++) {
              if (dx === 0 || dx === w || dy === 0 || dy === h) {
                if (this.isRoadSurface(this.getTile(ax + dx, ay + dy))) sharedRoads++;
              }
            }
          }
          if (sharedRoads === 0) continue;

          const dist = Math.abs(ax - 22) + Math.abs(ay - 24);
          const score = sharedRoads * 12 - dist * 1.4;
          if (score > bestScore) {
            bestScore = score;
            bestSite = { ax, ay, horizontal };
          }
        }
      }
    }

    if (!bestSite) return false;
    const { ax, ay, horizontal } = bestSite;
    const w = horizontal ? 7 : 3;
    const h = horizontal ? 3 : 7;

    // 1. Connect & queue outer road box + underground power & water around the 2x6 enclosure
    this.connectAIRoadAndUtilitiesToTile(ax, ay);
    for (let dy = 0; dy <= h; dy++) {
      for (let dx = 0; dx <= w; dx++) {
        if (dx === 0 || dx === w || dy === 0 || dy === h) {
          this.aiBuildQueue.push({ x: ax + dx, y: ay + dy, toolId: 'road', wirePower: true, wireWater: true });
        } else {
          this.aiBuildQueue.push({ x: ax + dx, y: ay + dy, toolId: null, wirePower: true, wireWater: true });
        }
      }
    }

    // 2. Fill the 2x6 interior (12 tiles = 2x2 School + 2x2 University + four 1x1 slots for Hospitals & Power/Park)
    const extraSlotTool = mayorIsGood ? 'solar_plant' : 'coal_plant';
    const fourthSlotTool = mayorIsGood ? 'hospital' : 'park';

    if (horizontal) {
      // Interior is dx = 1..6, dy = 1..2
      this.aiBuildQueue.push({ x: ax + 1, y: ay + 1, toolId: 'school', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 3, y: ay + 1, toolId: 'university', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 5, y: ay + 1, toolId: 'hospital', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 6, y: ay + 1, toolId: fourthSlotTool, wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 5, y: ay + 2, toolId: extraSlotTool, wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 6, y: ay + 2, toolId: 'park', wirePower: true, wireWater: true });
    } else {
      // Interior is dx = 1..2, dy = 1..6
      this.aiBuildQueue.push({ x: ax + 1, y: ay + 1, toolId: 'school', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 1, y: ay + 3, toolId: 'university', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 1, y: ay + 5, toolId: 'hospital', wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 2, y: ay + 5, toolId: fourthSlotTool, wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 1, y: ay + 6, toolId: extraSlotTool, wirePower: true, wireWater: true });
      this.aiBuildQueue.push({ x: ax + 2, y: ay + 6, toolId: 'park', wirePower: true, wireWater: true });
    }

    this.aiCivicBoxesBuilt = (this.aiCivicBoxesBuilt || 0) + 1;
    this.addAlert(
      `AI Mayor ${this.mayorName || 'Charles'} boxed off a 2x6 Education & Hospital District at ${this.formatSquare(ax + 1, ay + 1)}.`,
      'info',
      { x: ax + 1, y: ay + 1 }
    );
    return true;
  }

  // Executes affordable steps from `this.aiBuildQueue` each simulation tick
  executeAIBuildQueueSteps(minReserve = 250) {
    let stepsDone = 0;
    const maxStepsPerTick = 5;

    while (this.aiBuildQueue.length > 0 && stepsDone < maxStepsPerTick) {
      const step = this.aiBuildQueue[0];
      const t = this.getTile(step.x, step.y);
      if (!t) {
        this.aiBuildQueue.shift();
        continue;
      }

      // Calculate required cash for this step
      let stepCost = 0;
      if (step.toolId) {
        const def = CONFIG.TOOLS[step.toolId];
        if (def) {
          const alreadyHasSame = t.building && (t.building.id === step.toolId || (step.toolId === 'road' && this.isRoadSurface(t)));
          if (!alreadyHasSame) {
            stepCost += (t.terrain === 'river' ? def.cost * 2 : def.cost);
          }
        }
      }
      if (step.wirePower && !t.undergroundPower) {
        stepCost += CONFIG.TOOLS.powerline_under.cost;
      }
      if (step.wireWater && !t.undergroundWater) {
        stepCost += CONFIG.TOOLS.water_pipe.cost;
      }

      // Wait for next tax cycle if treasury cannot afford this step while keeping minReserve
      if (this.money - stepCost < minReserve) {
        break;
      }

      this.aiBuildQueue.shift();

      if (step.wirePower && !t.undergroundPower) {
        this.placeTool(step.x, step.y, 'powerline_under');
      }
      if (step.wireWater && !t.undergroundWater) {
        this.placeTool(step.x, step.y, 'water_pipe');
      }

      if (step.toolId) {
        const skipRoad =
          step.toolId === 'road' &&
          (this.isRoadSurface(t) || (step.checkRoadSpacing && !this.canAIPlaceRoadAt(step.x, step.y, false)));
        if (!skipRoad && !t.building) {
          const res = this.placeTool(step.x, step.y, step.toolId);
          if (res.ok) {
            const placedTile = this.getTile(step.x, step.y);
            // If multi-tile (2x2 School or University), also wire all 4 sub-tiles with underground power & water
            const footprint = CONFIG.TOOLS[step.toolId]?.size || 1;
            if (footprint > 1) {
              for (let sdy = 0; sdy < footprint; sdy++) {
                for (let sdx = 0; sdx < footprint; sdx++) {
                  const sub = this.getTile(step.x + sdx, step.y + sdy);
                  if (sub && !sub.undergroundPower) this.placeTool(step.x + sdx, step.y + sdy, 'powerline_under', true);
                  if (sub && !sub.undergroundWater) this.placeTool(step.x + sdx, step.y + sdy, 'water_pipe', true);
                }
              }
            }
            if (step.initZone && placedTile && placedTile.building && placedTile.building.category === 'zones') {
              placedTile.building.construction = 0;
              placedTile.building.level = 1;
              const l1 = CONFIG.ZONE_LEVELS[placedTile.building.zoneType][1];
              placedTile.building.maxPop = l1.maxPop;
              placedTile.building.pop = Math.round(l1.maxPop * 0.7);
              this.recalculateAll();
            }
            stepsDone++;
          }
        }
      }
    }
  }

  // Connects ONLY true dead-end road stubs (1 road neighbor) straight ahead across a 1-2 tile land gap to an existing road,
  // while strictly forbidding parallel side-by-side roads, 2x2 road grids, or river road-flooding
  connectNearbyAIRoadGaps() {
    const queuedSet = new Set((this.aiBuildQueue || []).map(s => `${s.x},${s.y}`));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (let y = 4; y < this.size - 4; y++) {
      for (let x = 4; x < this.size - 4; x++) {
        const t = this.getTile(x, y);
        if (!this.isRoadSurface(t) || t.terrain === 'river') continue;

        // Only extend a TRUE dead-end road tile (a road tile that has exactly 1 orthogonal road neighbor)
        const roadNeighbors = dirs.filter(([dx, dy]) => this.isRoadSurface(this.getTile(x + dx, y + dy)));
        if (roadNeighbors.length !== 1) continue;

        // Direction the dead-end road is already heading (opposite its single road neighbor)
        const dx = -roadNeighbors[0][0];
        const dy = -roadNeighbors[0][1];
        // Perpendicular direction to verify no parallel road is within 2 tiles on either side
        const px = dy;
        const py = dx;

        for (let gap = 1; gap <= 2; gap++) {
          const tx = x + dx * (gap + 1);
          const ty = y + dy * (gap + 1);
          const targetTile = this.getTile(tx, ty);
          if (!this.isRoadSurface(targetTile) || targetTile.terrain === 'river') continue;

          let canBridgeGap = true;
          const gapTiles = [];
          for (let step = 1; step <= gap; step++) {
            const gx = x + dx * step;
            const gy = y + dy * step;
            const gt = this.getTile(gx, gy);
            // Never place gap roads on rivers/lakes, on occupied/queued tiles, or where a parallel road is within 2 tiles
            if (!gt || gt.building || gt.terrain === 'river' || gt.terrain === 'lake' || queuedSet.has(`${gx},${gy}`)) {
              canBridgeGap = false;
              break;
            }
            const hasNearbyParallelRoad =
              this.isRoadSurface(this.getTile(gx + px, gy + py)) ||
              this.isRoadSurface(this.getTile(gx - px, gy - py)) ||
              this.isRoadSurface(this.getTile(gx + px * 2, gy + py * 2)) ||
              this.isRoadSurface(this.getTile(gx - px * 2, gy - py * 2));
            if (hasNearbyParallelRoad || !this.canAIPlaceRoadAt(gx, gy, false)) {
              canBridgeGap = false;
              break;
            }
            gapTiles.push({ x: gx, y: gy });
          }

          if (canBridgeGap && gapTiles.length > 0) {
            for (const pt of gapTiles) {
              if (this.money < 50) return;
              this.placeTool(pt.x, pt.y, 'road');
              if (!this.getTile(pt.x, pt.y)?.undergroundPower) {
                this.placeTool(pt.x, pt.y, 'powerline_under');
              }
              if (!this.getTile(pt.x, pt.y)?.undergroundWater) {
                this.placeTool(pt.x, pt.y, 'water_pipe');
              }
            }
            return;
          }
        }
      }
    }
  }

  // Fills the initial Starter Downtown & Business Man's Home area (x = 16..28, y = 19..29) with buildings
  // (without adding tight interior road loops) where pre-existing structures prevent a full 7x7 or 2x6 box from fitting
  infillStarterDowntownArea(mayorIsGood) {
    const queuedSet = new Set((this.aiBuildQueue || []).map(s => `${s.x},${s.y}`));

    // Find empty land tiles inside the starter downtown box (x = 16..28, y = 19..29)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const candidates = [];

    for (let y = 19; y <= 29; y++) {
      for (let x = 16; x <= 28; x++) {
        if (queuedSet.has(`${x},${y}`)) continue;
        const t = this.getTile(x, y);
        if (!t || t.building || t.terrain === 'river' || t.terrain === 'lake') continue;

        let touchesRoad = false;
        let withinThreeOfRoad = false;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (this.isRoadSurface(this.getTile(x + dx, y + dy))) {
              withinThreeOfRoad = true;
              if (Math.abs(dx) + Math.abs(dy) === 1) touchesRoad = true;
            }
          }
        }
        if (!withinThreeOfRoad) continue;

        // Prioritize direct road-frontage tiles along the Business Man's Home strip first, then interior rows
        const isHomeStrip = (x >= 18 && x <= 26 && y >= 21 && y <= 27);
        const distHome = Math.abs(x - 20) + Math.abs(y - 25);
        const score = (isHomeStrip ? 100 : 40) + (touchesRoad ? 30 : 0) - distHome * 3;
        candidates.push({ x, y, score });
      }
    }

    if (candidates.length === 0) return;
    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0];

    // 3. Choose the best building for this starter downtown slot:
    //    - Check if any neighbor is Industrial or a Coal Plant and lacks an Air Scrubber -> place 'scrubber'
    //    - Ensure the starter downtown core has at least 1 Police, 1 Fire, 1 Bus Station, and Parks
    //    - Otherwise build the highest-demand RCI zone ('zone_comm', 'zone_res', or 'zone_ind')
    let hasStarterPolice = false;
    let hasStarterFire = false;
    let hasStarterBus = false;
    let starterParks = 0;
    for (let y = 19; y <= 29; y++) {
      for (let x = 16; x <= 28; x++) {
        const b = this.getTile(x, y)?.building;
        if (!b) continue;
        if (b.id === 'police') hasStarterPolice = true;
        else if (b.id === 'fire') hasStarterFire = true;
        else if (b.id === 'bus_station') hasStarterBus = true;
        else if (b.id === 'park') starterParks++;
      }
    }

    const adjIndOrCoal = dirs.some(([dx, dy]) => {
      const nb = this.getTile(pick.x + dx, pick.y + dy)?.building;
      return nb && (nb.id === 'zone_ind' || nb.id === 'coal_plant');
    });
    const adjScrubber = dirs.some(([dx, dy]) => this.getTile(pick.x + dx, pick.y + dy)?.building?.id === 'scrubber');

    let toolToPlace = 'zone_comm';
    if (adjIndOrCoal && !adjScrubber && this.money >= 320) {
      toolToPlace = 'scrubber';
    } else if (!hasStarterPolice && this.money >= 350) {
      toolToPlace = 'police';
    } else if (!hasStarterFire && this.money >= 320) {
      toolToPlace = 'fire';
    } else if (!hasStarterBus && this.money >= 240) {
      toolToPlace = 'bus_station';
    } else if (starterParks < 2 && ((pick.x + pick.y) % 5 === 0)) {
      toolToPlace = 'park';
    } else {
      const dRes = this.demand?.res ?? 50;
      const dComm = this.demand?.comm ?? 40;
      const dInd = this.demand?.ind ?? 45;
      if (dComm >= dRes && dComm >= dInd) toolToPlace = 'zone_comm';
      else if (dInd >= dRes && dInd >= dComm) toolToPlace = 'zone_ind';
      else toolToPlace = 'zone_res';
    }

    const res = this.placeTool(pick.x, pick.y, toolToPlace);
    if (res.ok) {
      this.connectAIPowerToTile(pick.x, pick.y);
      this.connectAIWaterToTile(pick.x, pick.y);
      const placedTile = this.getTile(pick.x, pick.y);
      if (placedTile && placedTile.building && placedTile.building.category === 'zones') {
        placedTile.building.construction = 0;
        placedTile.building.level = 1;
        const l1 = CONFIG.ZONE_LEVELS[placedTile.building.zoneType][1];
        placedTile.building.maxPop = l1.maxPop;
        placedTile.building.pop = Math.round(l1.maxPop * 0.75);
        this.recalculateAll();
      }
    }
  }

  degradeZoneTile(x, y, t, reason) {
    if (!t || !t.building || t.building.category !== 'zones') return false;
    const b = t.building;
    if (b.level <= 0) return false;

    const sq = this.formatSquare(x, y);

    if (b.level === 4 && b.ringCenter) {
      // Break the Tier-4 3x3 ring (sets ring members back to Level 3)
      this.breakRingAt(b.ringCenter.x, b.ringCenter.y);
      this.addAlert(`Building at ${sq} lost Tier-4 status due to ${reason}!`, 'warn', { x, y });
      return true;
    }

    if (b.level === 1 && b.isHomeResidence) {
      b.pop = Math.max(4, Math.floor(b.pop * 0.6));
      return false;
    }

    b.level = Math.max(0, b.level - 1);
    if (b.level === 0) {
      b.maxPop = 0;
      b.pop = 0;
      b.construction = 100;
    } else {
      const zDef = CONFIG.ZONE_LEVELS[b.zoneType][b.level];
      b.maxPop = zDef ? zDef.maxPop : 40;
      b.pop = Math.min(b.pop, b.maxPop);
    }
    this.addAlert(`Building at ${sq} degraded to Level ${b.level} due to ${reason}!`, 'warn', { x, y });
    return true;
  }

  stepSimulation() {
    this.tickCount++;
    const daysInStep = 3;

    this.day += daysInStep;
    if (this.day > 30) {
      // 1. Record the month that just finished for any campaign options that were active & paid during an odd (election) year
      if (this.year % 2 === 1) {
        for (const opt of this.getCampaignOptions()) {
          if (this.activeCampaignOptions?.[opt.id] && this.paidThisMonth?.[opt.id]) {
            this.campaignMonthsActive[opt.id] = Math.min(12, (this.campaignMonthsActive[opt.id] || 0) + 1);
          }
        }
      }

      this.day = 1;
      this.month++;
      if (this.month > 12) {
        this.month = 1;
        this.year++;
      }

      // 2. Add monthly city net trend & process Business Man gross revenue minus loan payments
      this.money += this.stats.netTrend;
      this.processMonthlyBusinessFinances();

      // 3. Two-Year Election Cycle Checks on Jan 1 (month === 1, day === 1):
      if (this.month === 1) {
        if (this.year % 2 === 0) {
          // Even Year Jan 1 -> Hold the Municipal Election! (Even years are non-election years after the Jan 1 vote)
          this.runMunicipalElection();
          this.activeCampaignOptions = {};
          this.campaignMonthsActive = {};
          this.paidThisMonth = {};
        } else {
          // Odd Year Jan 1 -> Start of 12-Month Election Year!
          this.campaignMonthsActive = {};
          this.paidThisMonth = {};
          if (this.playerRole === 'mayor') {
            this.billActiveCampaignOptionsForNewMonth();
            this.speed = 0;
            this.pendingOddYearAdvisorPrompt = true;
          } else {
            this.selectAICampaignOptions();
          }
        }
      } else if (this.year % 2 === 1) {
        // Months 2..12 of Odd (Election) Years -> Bill active campaign options for the new month
        this.paidThisMonth = {};
        if (this.playerRole !== 'mayor') {
          this.selectAICampaignOptions();
        } else {
          this.billActiveCampaignOptionsForNewMonth();
        }
      } else {
        // Months 2..12 of Even (Non-Election) Years -> No campaign spending
        this.paidThisMonth = {};
      }

      this.stats.historyPop.push(this.population);
      this.stats.historyFunds.push(this.money);
      this.stats.historyMorale.push(this.stats.avgMorale);
      if (this.stats.historyPop.length > 36) {
        this.stats.historyPop.shift();
        this.stats.historyFunds.shift();
        this.stats.historyMorale.shift();
      }
    } else {
      this.money += Math.round(this.stats.netTrend * 0.12);
    }

    let anyLevelUp = false;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (!t.building || t.building.category !== 'zones') continue;
        const b = t.building;

        // Daily Building Degradation Checks (simulated across each elapsed in-game day):
        // - Power loss: 3% chance to drop back a level per in-game day
        // - Water loss: after 3 days without water, 50% chance to lose a level every 3 days
        let degradedThisTick = false;
        for (let d = 0; d < daysInStep; d++) {
          if (b.level <= 0) break;

          if (!t.powered) {
            b.noPowerDays = (b.noPowerDays || 0) + 1;
            if (Math.random() < 0.03) {
              if (this.degradeZoneTile(x, y, t, 'power loss')) {
                degradedThisTick = true;
              }
            }
          } else {
            b.noPowerDays = 0;
          }

          if (b.level <= 0) break;

          if (!t.watered) {
            b.noWaterDays = (b.noWaterDays || 0) + 1;
            if (b.noWaterDays >= 3 && (b.noWaterDays % 3 === 0)) {
              if (Math.random() < 0.50) {
                if (this.degradeZoneTile(x, y, t, 'water loss (3+ days)')) {
                  degradedThisTick = true;
                }
              }
            }
          } else {
            b.noWaterDays = 0;
          }
        }

        if (degradedThisTick || !t.powered || !t.watered || !t.roadAccess) continue;

        const subPct = b.zoneType === 'comm'
          ? (this.commSubsidy || 0)
          : (b.zoneType === 'ind' ? (this.indSubsidy || 0) : 0);
        const subSpeedMult = 1 + subPct / 40;

        if (b.level === 0) {
          b.construction = Math.max(0, b.construction - Math.round(35 * subSpeedMult));
          if (b.construction === 0) {
            b.level = 1;
            const l1 = CONFIG.ZONE_LEVELS[b.zoneType][1];
            b.maxPop = l1.maxPop;
            b.pop = Math.round(l1.maxPop * 0.45);
            anyLevelUp = true;
          }
          continue;
        }

        const demandVal = this.demand[b.zoneType] || 20;
        if (t.morale >= 45 && demandVal > -40) {
          const baseGrowth = Math.max(2, Math.round((t.morale / 15) + (demandVal / 25)));
          const growthRate = Math.round(baseGrowth * subSpeedMult);
          b.pop = Math.min(b.maxPop, b.pop + growthRate);
        } else if (t.morale < 30) {
          b.pop = Math.max(4, b.pop - 2);
        }

        if (b.level === 1 && b.pop >= b.maxPop && t.morale >= 62) {
          b.level = 2;
          const l2 = CONFIG.ZONE_LEVELS[b.zoneType][2];
          b.maxPop = l2.maxPop;
          b.pop = Math.round(b.pop * 1.25);
          anyLevelUp = true;
        } else if (b.level === 2 && b.pop >= b.maxPop && t.morale >= 76) {
          b.level = 3;
          const l3 = CONFIG.ZONE_LEVELS[b.zoneType][3];
          b.maxPop = l3.maxPop;
          b.pop = Math.round(b.pop * 1.25);
          anyLevelUp = true;
        }
      }
    }

    if (this.playerRole === 'businessman') {
      this.stepAIMayor();
    }

    this.recalculateAll();
    this.checkTier4Rings();
    this.recalculateTotals();

    if (anyLevelUp && Math.random() < 0.25 && window.cyberAudio) {
      window.cyberAudio.playUpgrade();
    }

    if (this.tickCount % 15 === 0) {
      this.checkCityAlerts();
    }
  }

  checkCityAlerts() {
    let offlinePowerPlant = null;
    let offlineWaterPump = null;
    let unpoweredTile = null;
    let unwateredTile = null;
    let worstTrafficTile = null;
    let worstPollutionTile = null;
    let worstCrimeTile = null;
    let worstHealthTile = null;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (t.pollution >= 42 && (!worstPollutionTile || t.pollution > worstPollutionTile.pollution)) {
          worstPollutionTile = t;
        }
        if (!t.building) continue;
        const b = t.building;
        if ((b.size || 1) > 1 && !b.isOrigin) continue;

        const util = this.getBuildingUtilityStatus(t);
        const def = CONFIG.TOOLS[b.id];

        if (def && def.powerGen && !t.watered && !offlinePowerPlant) {
          offlinePowerPlant = t;
        } else if (b.id === 'water_pump' && (!t.powered || !b.hasWaterSource) && !offlineWaterPump) {
          offlineWaterPump = t;
        } else if (util.needsPower && !util.hasPower && !unpoweredTile) {
          unpoweredTile = t;
        } else if (util.needsWater && !util.hasWater && !unwateredTile) {
          unwateredTile = t;
        }

        if (this.isRoadSurface(t) && t.traffic >= 60 && (!worstTrafficTile || t.traffic > worstTrafficTile.traffic)) {
          worstTrafficTile = t;
        }

        if (b.category === 'zones' && b.level > 0) {
          if (t.crime >= 38 && (!worstCrimeTile || t.crime > worstCrimeTile.crime)) {
            worstCrimeTile = t;
          }
          if (t.health < 55 && (!worstHealthTile || t.health < worstHealthTile.health)) {
            worstHealthTile = t;
          }
        }
      }
    }

    if (offlinePowerPlant) {
      const sq = this.formatSquare(offlinePowerPlant.x, offlinePowerPlant.y);
      const name = CONFIG.TOOLS[offlinePowerPlant.building.id]?.name || 'Power Plant';
      this.addAlert(`POWER PLANT OFFLINE at ${sq}: ${name} has no water supply! Connect Underground Water Pipes.`, 'danger', { x: offlinePowerPlant.x, y: offlinePowerPlant.y });
    } else if (this.stats.powerConsumed > this.stats.powerGenerated && this.stats.powerConsumed > 0) {
      const target = unpoweredTile || { x: 22, y: 24 };
      const sq = this.formatSquare(target.x, target.y);
      this.addAlert(`POWER SHORTAGE near ${sq}! Demand (${this.stats.powerConsumed} MW) exceeds supply (${this.stats.powerGenerated} MW).`, 'danger', { x: target.x, y: target.y });
    } else if (offlineWaterPump) {
      const sq = this.formatSquare(offlineWaterPump.x, offlineWaterPump.y);
      const why = !offlineWaterPump.building.hasWaterSource ? 'no river/lake in 6-tile range' : 'unpowered';
      this.addAlert(`WATER PUMP OFFLINE at ${sq} (${why})!`, 'warn', { x: offlineWaterPump.x, y: offlineWaterPump.y });
    } else if (unpoweredTile) {
      const sq = this.formatSquare(unpoweredTile.x, unpoweredTile.y);
      const name = CONFIG.TOOLS[unpoweredTile.building.id]?.name || 'Building';
      this.addAlert(`No electricity at ${sq} (${name})! Connect power lines to prevent degradation.`, 'warn', { x: unpoweredTile.x, y: unpoweredTile.y });
    } else if (unwateredTile) {
      const sq = this.formatSquare(unwateredTile.x, unwateredTile.y);
      const name = CONFIG.TOOLS[unwateredTile.building.id]?.name || 'Building';
      this.addAlert(`No water supply at ${sq} (${name})! Connect Underground Water Pipes from a Water Pump.`, 'warn', { x: unwateredTile.x, y: unwateredTile.y });
    } else if (worstTrafficTile) {
      const sq = this.formatSquare(worstTrafficTile.x, worstTrafficTile.y);
      this.addAlert(`Heavy traffic (${worstTrafficTile.traffic}%) at ${sq}! Upgrade roads or place a Bus/Railway Station.`, 'warn', { x: worstTrafficTile.x, y: worstTrafficTile.y });
    } else if (worstPollutionTile) {
      const sq = this.formatSquare(worstPollutionTile.x, worstPollutionTile.y);
      this.addAlert(`High air pollution (${worstPollutionTile.pollution}%) at ${sq}! Deploy an Air Scrubber or City Park.`, 'warn', { x: worstPollutionTile.x, y: worstPollutionTile.y });
    } else if (worstCrimeTile) {
      const sq = this.formatSquare(worstCrimeTile.x, worstCrimeTile.y);
      this.addAlert(`Crime spike (${worstCrimeTile.crime}%) at ${sq}! Place a Police Station nearby.`, 'warn', { x: worstCrimeTile.x, y: worstCrimeTile.y });
    } else if (worstHealthTile && this.population > 300) {
      const sq = this.formatSquare(worstHealthTile.x, worstHealthTile.y);
      this.addAlert(`Low healthcare (${worstHealthTile.health}%) at ${sq}! Place a General Hospital or Water Station.`, 'info', { x: worstHealthTile.x, y: worstHealthTile.y });
    }
  }

  addAlert(text, type = 'info', coords = null) {
    if (this.alerts.length > 0 && this.alerts[0].text === text) return;
    const dateStr = `${this.year}.${String(this.month).padStart(2, '0')}`;
    this.alerts.unshift({
      text,
      type,
      date: dateStr,
      coords: coords ? { x: coords.x, y: coords.y, label: this.formatSquare(coords.x, coords.y) } : null,
      id: Date.now() + Math.random()
    });
    if (this.alerts.length > 18) this.alerts.pop();
    if (type === 'danger' && window.cyberAudio) {
      window.cyberAudio.playAlert();
    }
  }

  // ==================== ELECTION DETAILS, HAPPINESS BREAKDOWN & CAMPAIGN SPENDING ====================
  // Note: Monthly modifiers (.01% to .06%) are internal and never displayed to the player in the UI.
  getCampaignOptions() {
    return [
      // Moral Options
      {
        id: 'city_hall_tours',
        name: 'City Hall Tours',
        category: 'moral',
        cost: 500,
        monthlyMod: 0.01
      },
      {
        id: 'police_union_donation',
        name: 'Police Union Donation',
        category: 'moral',
        cost: 1200,
        monthlyMod: 0.02
      },
      {
        id: 'business_outreach',
        name: 'Business Outreach',
        category: 'moral',
        cost: 2500,
        monthlyMod: 0.03
      },
      {
        id: 'positive_campaign_ads',
        name: 'Positive Campaign Ads',
        category: 'moral',
        cost: 4000,
        monthlyMod: 0.04
      },
      // Corrupt Options
      {
        id: 'bribe_police_chief',
        name: 'Bribe Police Chief',
        category: 'corrupt',
        cost: 1200,
        monthlyMod: 0.04
      },
      {
        id: 'bribe_business_leaders',
        name: 'Bribe Business Leaders',
        category: 'corrupt',
        cost: 2500,
        monthlyMod: 0.05
      },
      {
        id: 'release_fake_news',
        name: 'Release Fake News',
        category: 'corrupt',
        cost: 4000,
        monthlyMod: 0.06
      }
    ];
  }

  resetCampaignState() {
    this.mayorStanding = null;
    this.activeCampaignOptions = {};
    this.paidThisMonth = {};
    this.campaignMonthsActive = {};
    this.totalCampaignSpent = 0;
    this.playerRunningForMayor = false;
    this.pendingOddYearAdvisorPrompt = false;
    this.pendingElectionResult = null;
  }

  getActiveCampaignCategory() {
    const opts = this.getCampaignOptions();
    for (const opt of opts) {
      if (this.activeCampaignOptions?.[opt.id]) {
        return opt.category; // 'moral' or 'corrupt'
      }
    }
    return null;
  }

  // Toggle a campaign checkbox in the Advisor Menu:
  // - Moral and Corrupt options are mutually exclusive (picking any Moral locks out Corrupt and vice versa)
  // - Turning ON immediately deducts the monthly cost for the current month
  // - Turning OFF in the same month returns (refunds) the monthly cost and forfeits that month's gain
  toggleCampaignOption(optionId, checked) {
    if (this.year % 2 === 0) {
      return { ok: false, reason: 'Not an election year.' };
    }
    const options = this.getCampaignOptions();
    const opt = options.find(o => o.id === optionId);
    if (!opt) return { ok: false, reason: 'Unknown campaign option.' };

    if (!this.activeCampaignOptions) this.activeCampaignOptions = {};
    if (!this.paidThisMonth) this.paidThisMonth = {};
    if (!this.campaignMonthsActive) this.campaignMonthsActive = {};

    const activeCat = this.getActiveCampaignCategory();

    if (checked) {
      if (activeCat && activeCat !== opt.category) {
        return {
          ok: false,
          reason: `Cannot select ${opt.category === 'moral' ? 'Moral' : 'Corrupt'} options while ${activeCat === 'moral' ? 'Moral' : 'Corrupt'} options are selected!`
        };
      }
      if (!this.paidThisMonth[optionId]) {
        if (this.money < opt.cost) {
          return {
            ok: false,
            reason: `Insufficient City Funds! ($${opt.cost.toLocaleString()} required for this month; Treasury has $${this.money.toLocaleString()})`
          };
        }
        this.money -= opt.cost;
        this.paidThisMonth[optionId] = true;
        this.totalCampaignSpent = (this.totalCampaignSpent || 0) + opt.cost;
      }
      this.activeCampaignOptions[optionId] = true;
      this.mayorStanding = opt.category;
      return { ok: true, checked: true, standing: this.mayorStanding };
    } else {
      this.activeCampaignOptions[optionId] = false;
      if (this.paidThisMonth[optionId]) {
        // Return cost for the current month when turned off
        this.money += opt.cost;
        this.paidThisMonth[optionId] = false;
        this.totalCampaignSpent = Math.max(0, (this.totalCampaignSpent || 0) - opt.cost);
      }
      const remainingCat = this.getActiveCampaignCategory();
      if (remainingCat) {
        this.mayorStanding = remainingCat;
      }
      return { ok: true, checked: false, standing: this.mayorStanding };
    }
  }

  // Deducts the monthly cost from City Funds for all currently selected campaign options at the start of a new month
  billActiveCampaignOptionsForNewMonth() {
    if (!this.activeCampaignOptions) this.activeCampaignOptions = {};
    if (!this.paidThisMonth) this.paidThisMonth = {};

    for (const opt of this.getCampaignOptions()) {
      if (this.activeCampaignOptions[opt.id]) {
        if (this.money >= opt.cost) {
          this.money -= opt.cost;
          this.paidThisMonth[opt.id] = true;
          this.totalCampaignSpent = (this.totalCampaignSpent || 0) + opt.cost;
        } else {
          // Cannot afford this month -> automatically uncheck so treasury doesn't go negative
          this.activeCampaignOptions[opt.id] = false;
          this.paidThisMonth[opt.id] = false;
          if (this.playerRole === 'mayor') {
            this.addAlert(
              `Campaign option "${opt.name}" ($${opt.cost.toLocaleString()}/mo) was turned off due to insufficient City Funds.`,
              'warn'
            );
          }
        }
      }
    }
  }

  // Computer AI Mayor selects Moral or Corrupt campaign options based on its alignment and available treasury
  selectAICampaignOptions() {
    if (!this.activeCampaignOptions) this.activeCampaignOptions = {};
    if (!this.paidThisMonth) this.paidThisMonth = {};

    const targetCat = this.aiMayorAlignment === 'corrupt' ? 'corrupt' : 'moral';
    this.mayorStanding = targetCat;

    // Clear any options from the opposite category
    for (const opt of this.getCampaignOptions()) {
      if (opt.category !== targetCat) {
        this.activeCampaignOptions[opt.id] = false;
      }
    }

    // Select affordable options in the AI Mayor's category while keeping a safe city reserve ($1,500)
    for (const opt of this.getCampaignOptions()) {
      if (opt.category !== targetCat) continue;
      if (this.money - opt.cost >= 1500) {
        this.activeCampaignOptions[opt.id] = true;
      } else {
        this.activeCampaignOptions[opt.id] = false;
      }
    }

    this.billActiveCampaignOptionsForNewMonth();
  }

  pickRandomAIMayorName(excludeName = '') {
    const names = ['Victoria', 'Arthur', 'Eleanor', 'Marcus', 'Diana', 'Sterling', 'Harold', 'Clara'];
    const filtered = names.filter(n => n.toLowerCase() !== String(excludeName || '').toLowerCase());
    return filtered[Math.floor(Math.random() * filtered.length)] || 'Victoria';
  }

  // Held every 2 years (even years) on Jan 1:
  // Base Vote % = Overall Public Opinion (this.stats.morale) +/- up to 3% random swing.
  // Campaign Modifiers: For each option in the Mayor's track over the 12 months, adds (monthsOn * mod) and subtracts ((12 - monthsOn) * mod).
  runMunicipalElection() {
    this.recalculateTotals();
    const publicOpinion = this.stats.morale ?? 85;
    const randomSwing = (Math.random() * 6) - 3; // -3% to +3%
    const baseVote = publicOpinion + randomSwing;

    const activeCat =
      this.getActiveCampaignCategory() ||
      this.mayorStanding ||
      (this.playerRole !== 'mayor' && this.aiMayorAlignment === 'corrupt' ? 'corrupt' : 'moral');

    let campaignDelta = 0;
    for (const opt of this.getCampaignOptions()) {
      if (opt.category !== activeCat) continue;
      const monthsOn = Math.min(12, Math.max(0, this.campaignMonthsActive?.[opt.id] || 0));
      const monthsOff = 12 - monthsOn;
      campaignDelta += (monthsOn * opt.monthlyMod) - (monthsOff * opt.monthlyMod);
    }

    const finalVotePct = Math.max(0, Math.min(100, Number((baseVote + campaignDelta).toFixed(2))));
    const mayorWon = finalVotePct >= 50;

    // Pause simulation so the player sees the election outcome
    this.speed = 0;

    if (this.playerRole === 'mayor') {
      if (mayorWon) {
        this.pendingElectionResult = {
          year: this.year,
          wasPlayerMayor: true,
          mayorWon: true,
          mayorName: this.mayorName || 'Charles',
          votePct: finalVotePct
        };
        this.addAlert(
          `ELECTION ${this.year}: Mayor ${this.mayorName || 'Charles'} won re-election with ${finalVotePct.toFixed(1)}% of the vote!`,
          'combo'
        );
      } else {
        const newAiAlign = Math.random() < 0.5 ? 'good' : 'corrupt';
        const newAiName = this.pickRandomAIMayorName(this.mayorName);
        this.pendingElectionResult = {
          year: this.year,
          wasPlayerMayor: true,
          mayorWon: false,
          mayorName: this.mayorName || 'Charles',
          votePct: finalVotePct,
          newAiName,
          newAiAlign
        };
        this.addAlert(
          `ELECTION ${this.year}: Mayor ${this.mayorName || 'Charles'} received ${finalVotePct.toFixed(1)}% of the vote and lost the election!`,
          'danger'
        );
      }
    } else {
      // Computer AI Mayor is running
      if (mayorWon) {
        const playerRan = Boolean(this.playerRunningForMayor);
        this.playerRunningForMayor = false;
        this.pendingElectionResult = {
          year: this.year,
          wasPlayerMayor: false,
          mayorWon: true,
          mayorName: this.mayorName || 'Charles',
          aiAlign: this.aiMayorAlignment,
          votePct: finalVotePct,
          playerRan
        };
        this.addAlert(
          `ELECTION ${this.year}: Incumbent Mayor ${this.mayorName || 'Charles'} won re-election with ${finalVotePct.toFixed(1)}% of the vote.`,
          'info'
        );
      } else {
        // Computer Mayor lost!
        const oldMayorName = this.mayorName || 'Charles';
        if (this.playerRunningForMayor) {
          // Player ran for office from another role and is assumed the winner -> switches to Mayor role!
          const newPlayerMayor = this.businessmanName || 'Vance';
          this.playerRunningForMayor = false;
          this.pendingElectionResult = {
            year: this.year,
            wasPlayerMayor: false,
            mayorWon: false,
            playerElectedMayor: true,
            oldMayorName,
            mayorName: newPlayerMayor,
            votePct: finalVotePct
          };
          this.addAlert(
            `ELECTION ${this.year}: ${newPlayerMayor} defeated incumbent Mayor ${oldMayorName} (${finalVotePct.toFixed(1)}%) and is now Mayor of ${this.cityName}!`,
            'combo'
          );
        } else {
          // Replace Computer Mayor with a new randomly Good or Corrupt Computer Mayor
          const newAiAlign = Math.random() < 0.5 ? 'good' : 'corrupt';
          const newAiName = this.pickRandomAIMayorName(oldMayorName);
          this.mayorName = newAiName;
          this.aiMayorAlignment = newAiAlign;
          this.mayorStanding = newAiAlign === 'corrupt' ? 'corrupt' : 'moral';
          this.activeCampaignOptions = {};
          this.updateAIMayorSubsidies();
          this.pendingElectionResult = {
            year: this.year,
            wasPlayerMayor: false,
            mayorWon: false,
            playerElectedMayor: false,
            oldMayorName,
            mayorName: newAiName,
            newAiAlign,
            votePct: finalVotePct
          };
          this.addAlert(
            `ELECTION ${this.year}: Mayor ${oldMayorName} lost (${finalVotePct.toFixed(1)}%)! New Mayor ${newAiName} has taken office.`,
            'warn'
          );
        }
      }
    }
  }

  getHappinessBreakdown() {
    let policeCount = 0;
    let fireCount = 0;
    let hospitalCount = 0;
    let schoolCount = 0;
    let uniCount = 0;
    let parkCount = 0;
    let stadiumCount = 0;
    let busStationCount = 0;
    let railStationCount = 0;
    let scrubberCount = 0;
    let unpoweredCount = 0;
    let unwateredCount = 0;
    let firstUnpoweredTile = null;
    let firstUnwateredTile = null;
    let highPollTile = null;
    let highCrimeTile = null;
    let highTrafficTile = null;
    let lowHealthTile = null;
    let goodBizCount = 0;
    let corruptBizCount = 0;
    let firstCorruptBizTile = null;
    let firstResTile = null;
    let firstCommTile = null;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        if (!t.building) continue;
        const b = t.building;
        if ((b.size || 1) > 1 && !b.isOrigin) continue;

        const online = this.isBuildingOperational(t);
        if (b.id === 'police' && online) policeCount++;
        if (b.id === 'fire' && online) fireCount++;
        if (b.id === 'hospital' && online) hospitalCount++;
        if (b.id === 'school' && online) schoolCount++;
        if (b.id === 'university' && online) uniCount++;
        if (b.id === 'park') parkCount++;
        if (b.id === 'stadium' && online) stadiumCount++;
        if (b.id === 'bus_station' && online) busStationCount++;
        if (b.id === 'railway_station' && online) railStationCount++;
        if (b.id === 'scrubber' && online) scrubberCount++;

        if (b.category === 'zones') {
          if (b.zoneType === 'res' && !firstResTile) firstResTile = t;
          if (b.zoneType === 'comm' && !firstCommTile) firstCommTile = t;
          if (b.ownedByPlayer) {
            if (b.businessEthics === 'corrupt') {
              corruptBizCount++;
              if (!firstCorruptBizTile) firstCorruptBizTile = t;
            } else {
              goodBizCount++;
            }
          }
        }

        const req = this.getBuildingUtilityStatus(t);
        if (req.needsPower && !req.hasPower && (b.category !== 'zones' || (b.level || 0) >= 1)) {
          unpoweredCount++;
          if (!firstUnpoweredTile) firstUnpoweredTile = t;
        }
        if (req.needsWater && !req.hasWater && (b.category !== 'zones' || (b.level || 0) >= 1)) {
          unwateredCount++;
          if (!firstUnwateredTile) firstUnwateredTile = t;
        }

        if (t.pollution > (highPollTile?.pollution || 20)) highPollTile = t;
        if (t.crime > (highCrimeTile?.crime || 18)) highCrimeTile = t;
        if (t.traffic > (highTrafficTile?.traffic || 25)) highTrafficTile = t;
        if (b.category === 'zones' && b.zoneType === 'res' && (b.level || 0) >= 1) {
          if (!lowHealthTile || t.health < lowHealthTile.health) lowHealthTile = t;
        }
      }
    }

    const chPos = this.findCityHall();
    const chSq = this.formatSquare(chPos.x, chPos.y);
    const resSq = firstResTile ? this.formatSquare(firstResTile.x, firstResTile.y) : chSq;
    const commSq = firstCommTile ? this.formatSquare(firstCommTile.x, firstCommTile.y) : chSq;

    const happyCandidates = [];
    const unhappyCandidates = [];

    // --- POSITIVE (HAPPY) CANDIDATES ---
    const waterPct = this.stats.waterCoverage ?? this.stats.wateredPct ?? 100;
    if (waterPct >= 80) {
      happyCandidates.push({
        score: 95,
        title: 'Clean Municipal Water Supply',
        detail: `${waterPct}% of buildings receive fresh piped water from active pumping stations.`,
        impact: `+${Math.min(18, Math.round(waterPct * 0.16))}% Morale`
      });
    }

    if (this.stats.powerGenerated >= this.stats.powerConsumed && this.stats.powerGenerated > 0) {
      const surplus = this.stats.powerGenerated - this.stats.powerConsumed;
      happyCandidates.push({
        score: 90,
        title: 'Reliable Electrical Grid & Power Surplus',
        detail: `Power plants generate ${this.stats.powerGenerated} MW (${surplus} MW surplus above demand).`,
        impact: '+14% Morale'
      });
    }

    if (this.taxRate <= 10) {
      happyCandidates.push({
        score: 88 + (10 - this.taxRate) * 3,
        title: `Competitive & Fair Tax Rate (${this.taxRate}%)`,
        detail: 'Homeowners and local shopkeepers appreciate keeping municipal tax rates affordable.',
        impact: `+${Math.max(6, (12 - this.taxRate) * 2)}% Morale`
      });
    }

    if (policeCount + fireCount > 0 || this.stats.avgCrime < 25) {
      happyCandidates.push({
        score: 84 + (policeCount + fireCount) * 4,
        title: 'Public Safety & Emergency Response',
        detail: `${policeCount} Police and ${fireCount} Fire Station(s) keep city-wide crime down at ${this.stats.avgCrime}%.`,
        impact: '+12% Morale'
      });
    }

    if (schoolCount + uniCount > 0) {
      happyCandidates.push({
        score: 82 + (schoolCount + uniCount * 2) * 5,
        title: 'Public Education & University Campuses',
        detail: `${schoolCount} Public School(s) and ${uniCount} State University campus(es) uplift families.`,
        impact: `+${Math.min(24, schoolCount * 8 + uniCount * 12)}% Morale`
      });
    }

    if (stadiumCount > 0 || parkCount > 0) {
      happyCandidates.push({
        score: 80 + stadiumCount * 15 + parkCount * 3,
        title: stadiumCount > 0 ? 'City Stadium & Green Plazas' : 'Neighborhood Parks & Plazas',
        detail: `${stadiumCount > 0 ? 'The 5x5 City Stadium and ' : ''}${parkCount} City Park(s) provide recreation and clean air.`,
        impact: `+${Math.min(30, stadiumCount * 18 + parkCount * 4)}% Morale`
      });
    }

    if (hospitalCount > 0 || this.stats.avgHealth >= 65) {
      happyCandidates.push({
        score: 78 + hospitalCount * 6,
        title: 'Healthcare & Medical Coverage',
        detail: `${hospitalCount} General Hospital(s) maintain an average citizen health rating of ${this.stats.avgHealth}%.`,
        impact: '+11% Morale'
      });
    }

    if (busStationCount + railStationCount > 0 || this.stats.avgTraffic < 35) {
      happyCandidates.push({
        score: 75 + (busStationCount + railStationCount) * 5,
        title: 'Mass Transit & Commuter Network',
        detail: `${busStationCount} Bus Station(s) and ${railStationCount} Railway Station(s) ease daily commutes.`,
        impact: '+10% Morale'
      });
    }

    if (goodBizCount > 0) {
      happyCandidates.push({
        score: 77 + goodBizCount * 4,
        title: 'Ethical Local Businesses & Fair Wages',
        detail: `${goodBizCount} privately owned business(es) operate with high wages and eco-friendly standards.`,
        impact: `+${Math.min(20, goodBizCount * 5)}% Morale`
      });
    }

    // Fallback baseline happy items so there are always 5
    const fallbackHappy = [
      {
        score: 60,
        title: 'Active City Hall Leadership',
        detail: `Mayor ${this.mayorName || 'Charles'}'s administration maintains civic order and urban planning.`,
        impact: '+8% Morale'
      },
      {
        score: 58,
        title: 'Local Commercial & Industrial Jobs',
        detail: `Local zones provide ${this.commercialJobs + this.industrialJobs} jobs across Metrovale.`,
        impact: '+7% Morale'
      },
      {
        score: 55,
        title: 'Connected Street & Sidewalk Grid',
        detail: 'Pedestrian crosswalks and paved avenues keep neighborhoods accessible.',
        impact: '+6% Morale'
      },
      {
        score: 52,
        title: 'Clean Air & Environmental Balance',
        detail: `City-wide air pollution averages ${this.stats.avgPollution}% across districts.`,
        impact: '+5% Morale'
      },
      {
        score: 50,
        title: 'Balanced Municipal Treasury',
        detail: `City Hall maintains $${this.money.toLocaleString()} in reserve funds for civic growth.`,
        impact: '+5% Morale'
      }
    ];
    for (const fb of fallbackHappy) {
      if (happyCandidates.length < 5 && !happyCandidates.some(h => h.title === fb.title)) {
        happyCandidates.push(fb);
      }
    }

    // --- NEGATIVE (UNHAPPY) CANDIDATES (WITH SQUARE COORDINATES WHERE ISSUES OCCUR) ---
    if (unpoweredCount > 0) {
      const sq = firstUnpoweredTile ? this.formatSquare(firstUnpoweredTile.x, firstUnpoweredTile.y) : chSq;
      unhappyCandidates.push({
        score: 98,
        title: `Power Outages at ${sq} (${unpoweredCount} Unpowered)`,
        detail: `Building(s) starting at ${sq} lack electricity and risk 3% daily level degradation.`,
        impact: `-${Math.min(25, unpoweredCount * 4)}% Morale`
      });
    }

    if (unwateredCount > 0) {
      const sq = firstUnwateredTile ? this.formatSquare(firstUnwateredTile.x, firstUnwateredTile.y) : chSq;
      unhappyCandidates.push({
        score: 96,
        title: `Water Shortages at ${sq} (${unwateredCount} Unwatered)`,
        detail: `Building(s) near ${sq} lack piped water and face a 50% level drop risk every 3 days.`,
        impact: `-${Math.min(28, unwateredCount * 5)}% Morale`
      });
    }

    if (this.taxRate >= 10) {
      unhappyCandidates.push({
        score: 75 + (this.taxRate - 9) * 4,
        title: `High Municipal Tax Burden (${this.taxRate}%) near ${resSq}`,
        detail: `Taxpayers around ${resSq} complain that high city tax rates squeeze household budgets.`,
        impact: `-${Math.max(4, (this.taxRate - 8) * 3)}% Morale`
      });
    }

    if (highPollTile && highPollTile.pollution >= 25) {
      const sq = this.formatSquare(highPollTile.x, highPollTile.y);
      unhappyCandidates.push({
        score: 70 + highPollTile.pollution * 0.3,
        title: `Industrial Smog & Air Pollution near ${sq}`,
        detail: `Air pollution reaches ${highPollTile.pollution}% near ${sq} (${scrubberCount === 0 ? 'no Air Scrubbers active' : 'needs more Air Scrubbers or Parks'}).`,
        impact: `-${Math.max(5, Math.round(highPollTile.pollution * 0.18))}% Morale`
      });
    }

    if (highTrafficTile && highTrafficTile.traffic >= 28) {
      const sq = this.formatSquare(highTrafficTile.x, highTrafficTile.y);
      unhappyCandidates.push({
        score: 68 + highTrafficTile.traffic * 0.25,
        title: `Commuter Traffic Congestion at ${sq}`,
        detail: `Road congestion hits ${highTrafficTile.traffic}% at ${sq} — voters want Bus/Railway Stations or wider Avenues.`,
        impact: `-${Math.max(4, Math.round(highTrafficTile.traffic * 0.14))}% Morale`
      });
    }

    if (highCrimeTile && highCrimeTile.crime >= 20) {
      const sq = this.formatSquare(highCrimeTile.x, highCrimeTile.y);
      unhappyCandidates.push({
        score: 66 + highCrimeTile.crime * 0.3,
        title: `Neighborhood Crime Concerns at ${sq}`,
        detail: `Crime rate is ${highCrimeTile.crime}% around ${sq} — residents want closer Police Station coverage.`,
        impact: `-${Math.max(4, Math.round(highCrimeTile.crime * 0.16))}% Morale`
      });
    }

    if (corruptBizCount > 0) {
      const sq = firstCorruptBizTile ? this.formatSquare(firstCorruptBizTile.x, firstCorruptBizTile.y) : commSq;
      unhappyCandidates.push({
        score: 82 + corruptBizCount * 4,
        title: `Corrupt Business Conditions at ${sq} (${corruptBizCount} Active)`,
        detail: `Workers near ${sq} report harsh working conditions and elevated pollution at corrupt enterprises.`,
        impact: `-${Math.min(24, corruptBizCount * 6)}% Morale`
      });
    }

    if (stadiumCount === 0) {
      unhappyCandidates.push({
        score: 58,
        title: `Demand for a Major City Stadium near ${chSq}`,
        detail: `Sports fans around ${chSq} want a 5x5 City Stadium Special Project for major events.`,
        impact: '-5% Morale'
      });
    }

    if (hospitalCount === 0 || (lowHealthTile && lowHealthTile.health < 65)) {
      const sq = lowHealthTile ? this.formatSquare(lowHealthTile.x, lowHealthTile.y) : resSq;
      unhappyCandidates.push({
        score: 62,
        title: `Healthcare Access Gaps at ${sq}`,
        detail: `Residential blocks near ${sq} request closer General Hospital coverage.`,
        impact: '-6% Morale'
      });
    }

    if (busStationCount + railStationCount < 2) {
      unhappyCandidates.push({
        score: 54,
        title: `Calls for Expanded Public Transit near ${commSq}`,
        detail: `Commuters around ${commSq} want more Bus Stations and Raised Rail / Railway Stations.`,
        impact: '-4% Morale'
      });
    }

    // Fallback minor complaints so there are always 5 clear items ranked (each with square coordinates)
    const fallbackUnhappy = [
      {
        score: 48,
        title: `Requests for Lower Property Taxes at ${resSq}`,
        detail: `Even at ${this.taxRate}% tax, homeowner associations near ${resSq} lobby for a 1-2% tax cut.`,
        impact: '-3% Morale'
      },
      {
        score: 45,
        title: `Desire for More Neighborhood Parks near ${resSq}`,
        detail: `Citizens in blocks around ${resSq} welcome additional green space and plazas.`,
        impact: '-3% Morale'
      },
      {
        score: 42,
        title: `Late-Night Street Noise near ${commSq}`,
        detail: `Residents near commercial avenues at ${commSq} report evening traffic and delivery noise.`,
        impact: '-2% Morale'
      },
      {
        score: 40,
        title: `Higher Business Subsidies Wanted at ${commSq}`,
        detail: `Shopkeepers around ${commSq} lobby City Hall (${chSq}) for higher growth subsidies.`,
        impact: '-2% Morale'
      },
      {
        score: 38,
        title: `More Underground Utility Conduits Wanted near ${chSq}`,
        detail: `Urban beautification groups near ${chSq} prefer underground conduits over surface pylons.`,
        impact: '-2% Morale'
      }
    ];
    for (const fb of fallbackUnhappy) {
      if (unhappyCandidates.length < 5 && !unhappyCandidates.some(u => u.title === fb.title)) {
        unhappyCandidates.push(fb);
      }
    }

    happyCandidates.sort((a, b) => b.score - a.score);
    unhappyCandidates.sort((a, b) => b.score - a.score);

    return {
      overallHappiness: this.stats.avgMorale ?? this.stats.morale ?? 85,
      topHappy: happyCandidates.slice(0, 5),
      topUnhappy: unhappyCandidates.slice(0, 5)
    };
  }

  serialize() {
    const compactGrid = [];
    for (let y = 0; y < this.size; y++) {
      const row = [];
      for (let x = 0; x < this.size; x++) {
        const t = this.grid[y][x];
        row.push({
          tr: t.terrain,
          up: t.undergroundPower ? 1 : 0,
          uw: t.undergroundWater ? 1 : 0,
          er: t.elevatedRail ? 1 : 0,
          b: t.building ? { ...t.building } : null
        });
      }
      compactGrid.push(row);
    }
    return {
      version: 2,
      savedAt: new Date().toLocaleString(),
      cityName: this.cityName,
      mayorName: this.mayorName || 'Charles',
      playerRole: this.playerRole || 'mayor',
      businessmanName: this.businessmanName || 'Vance',
      businessMoney: this.businessMoney ?? (CONFIG.BUSINESS_STARTING_CASH || 20000),
      aiMayorAlignment: this.aiMayorAlignment || 'good',
      commSubsidy: this.commSubsidy ?? 10,
      indSubsidy: this.indSubsidy ?? 10,
      homeResidence: this.homeResidence || { x: 19, y: 25 },
      money: this.money,
      taxRate: this.taxRate,
      population: this.population,
      year: this.year,
      month: this.month,
      day: this.day,
      tickCount: this.tickCount,
      rings: this.rings,
      mayorStanding: this.mayorStanding || null,
      activeCampaignOptions: this.activeCampaignOptions || {},
      paidThisMonth: this.paidThisMonth || {},
      campaignMonthsActive: this.campaignMonthsActive || {},
      totalCampaignSpent: this.totalCampaignSpent || 0,
      playerRunningForMayor: Boolean(this.playerRunningForMayor),
      aiBuildQueue: Array.isArray(this.aiBuildQueue) ? this.aiBuildQueue : [],
      aiBlocksBuilt: this.aiBlocksBuilt || 0,
      aiCivicBoxesBuilt: this.aiCivicBoxesBuilt || 0,
      stats: this.stats,
      grid: compactGrid
    };
  }

  deserialize(data) {
    if (!data || !data.grid) return false;
    this.cityName = data.cityName || 'METROVALE';
    this.mayorName = data.mayorName || 'Charles';
    this.playerRole = data.playerRole || 'mayor';
    this.businessmanName = data.businessmanName || 'Vance';
    this.businessMoney = data.businessMoney ?? (CONFIG.BUSINESS_STARTING_CASH || 20000);
    this.aiMayorAlignment = data.aiMayorAlignment || 'good';
    this.commSubsidy = data.commSubsidy ?? 10;
    this.indSubsidy = data.indSubsidy ?? 10;
    this.homeResidence = data.homeResidence || { x: 19, y: 25 };
    this.money = data.money ?? CONFIG.STARTING_CASH;
    this.taxRate = data.taxRate ?? CONFIG.DEFAULT_TAX_RATE;
    this.year = data.year || 2088;
    this.month = data.month || 1;
    this.day = data.day || 1;
    this.tickCount = data.tickCount || 0;
    this.rings = data.rings || [];
    this.mayorStanding = data.mayorStanding || null;
    this.activeCampaignOptions = data.activeCampaignOptions || {};
    this.paidThisMonth = data.paidThisMonth || {};
    this.campaignMonthsActive = data.campaignMonthsActive || {};
    this.totalCampaignSpent = data.totalCampaignSpent || 0;
    this.playerRunningForMayor = Boolean(data.playerRunningForMayor);
    this.aiBuildQueue = Array.isArray(data.aiBuildQueue) ? data.aiBuildQueue : [];
    this.aiBlocksBuilt = typeof data.aiBlocksBuilt === 'number' ? data.aiBlocksBuilt : 0;
    this.aiCivicBoxesBuilt = typeof data.aiCivicBoxesBuilt === 'number' ? data.aiCivicBoxesBuilt : 0;
    if (data.stats) this.stats = { ...this.stats, ...data.stats };

    this.size = data.grid.length;
    this.initGrid();
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const cell = data.grid[y][x];
        const t = this.grid[y][x];
        t.terrain = cell.tr || 'land';
        t.undergroundPower = !!cell.up;
        t.undergroundWater = !!cell.uw;
        t.elevatedRail = !!cell.er || Boolean(cell.b && (cell.b.id === 'monorail' || cell.b.id === 'railway_station' || cell.b.hasElevatedRail));
        t.building = cell.b || null;
      }
    }
    this.recalculateAll();
    return true;
  }

  // Build a thriving showcase metropolis (used for Showcase mode or instant demo)
  loadShowcaseMetropolis() {
    this.generateTerrain(4.2);
    this.cityName = 'METROVALE PRIME';
    this.money = 12450;
    this.year = 2094;
    this.month = 8;

    const cx = 22;
    const cy = 24;

    // Clear water in core downtown rectangle
    for (let y = 10; y <= 42; y++) {
      for (let x = 8; x <= 34; x++) {
        const t = this.getTile(x, y);
        if (t && t.terrain !== 'river') t.terrain = 'land';
      }
    }

    // Build interconnected grid of Roads, Avenues, Highways, and Bridge across the river
    for (let x = 8; x <= 46; x++) {
      this.placeTool(x, cy, 'avenue', true);
      this.placeTool(x, cy - 8, 'road', true);
      this.placeTool(x, cy + 8, 'road', true);
      this.placeTool(x, cy - 4, 'monorail', true);
    }
    for (let y = 10; y <= 42; y++) {
      this.placeTool(cx, y, 'highway', true);
      this.placeTool(cx - 8, y, 'avenue', true);
      this.placeTool(cx + 8, y, 'road', true);
      this.placeTool(cx - 12, y, 'road', true);
    }

    // Place Railway Stations at the road+rail crossings!
    this.placeTool(cx, cy - 4, 'railway_station', true);
    this.placeTool(cx - 8, cy - 4, 'railway_station', true);
    this.placeTool(cx + 8, cy - 4, 'railway_station', true);

    // Main Street buildings right along Avenue (y = cy - 1):
    // 2x2 City Hall at (cx - 2, cy - 2) -> spans x = cx-2..cx-1 (20..21), y = cy-2..cy-1 (22..23)
    this.placeTool(cx - 2, cy - 2, 'city_hall', true);
    this.placeTool(cx - 3, cy - 1, 'zone_comm', true); // Commercial shop
    this.placeTool(cx + 1, cy - 1, 'zone_comm', true); // Commercial shop
    this.placeTool(cx + 2, cy - 1, 'fire', true);      // 1x1 Fire & Rescue
    this.placeTool(cx + 3, cy - 1, 'hospital', true);  // 1x1 Hospital
    this.placeTool(cx - 4, cy - 1, 'police', true);    // 1x1 Police Station
    // 2x2 Public School at (cx + 4, cy - 2) -> spans x = cx+4..cx+5 (26..27), y = cy-2..cy-1 (22..23)
    this.placeTool(cx + 4, cy - 2, 'school', true);
    // 2x2 State University moved right to (cx + 6, cy - 2) -> spans x = cx+6..cx+7 (28..29), y = cy-2..cy-1 (22..23)
    this.placeTool(cx + 6, cy - 2, 'university', true);
    // Bus Station on Main Street at (cx - 5, cy - 1)
    this.placeTool(cx - 5, cy - 1, 'bus_station', true);
    // Water Pumping Station at (x30,y44) -> internal grid (gx = 29, gy = 12) (removed the one that was at (x34,y33) -> (33, 23))
    const showcasePumpTile = this.getTile(29, 12);
    if (showcasePumpTile && showcasePumpTile.terrain !== 'land') showcasePumpTile.terrain = 'land';
    this.placeTool(29, 12, 'water_pump', true);
    this.placeTool(29, 12, 'powerline_under', true);
    this.placeTool(29, 12, 'water_pipe', true);
    // Colossal 5x5 City Stadium Special Project at (23, 33) -> spans x=23..27, y=33..37
    this.placeTool(23, 33, 'stadium', true);

    // Upgrade the main street commercial shops to Level 1
    for (const sx of [cx - 3, cx + 1]) {
      const st = this.getTile(sx, cy - 1);
      if (st && st.building && st.building.category === 'zones') {
        st.building.construction = 0;
        st.building.level = 1;
        st.building.maxPop = CONFIG.ZONE_LEVELS.comm[1].maxPop;
        st.building.pop = st.building.maxPop;
      }
    }

    // Power Grid (Nuclear + Coal + Solar + Wind + Pylons + Underground Power Conduits under streets)
    this.placeTool(10, 12, 'nuclear_plant', true);
    this.placeTool(12, 12, 'coal_plant', true);
    this.placeTool(11, 13, 'scrubber', true);
    this.placeTool(14, 12, 'solar_plant', true);
    this.placeTool(15, 12, 'wind_plant', true);
    this.placeTool(16, 12, 'wind_plant', true);
    for (let x = 10; x <= cx; x++) {
      this.placeTool(x, 14, 'powerline_above', true);
      this.placeTool(x, 12, 'water_pipe', true);
    }
    for (let y = 12; y <= 36; y++) {
      this.placeTool(14, y, 'powerline_under', true);
      this.placeTool(14, y, 'water_pipe', true);
      this.placeTool(cx, y, 'powerline_under', true);
      this.placeTool(cx, y, 'water_pipe', true);
      this.placeTool(cx + 8, y, 'powerline_under', true);
      this.placeTool(cx + 8, y, 'water_pipe', true);
    }
    for (let x = 8; x <= 34; x++) {
      this.placeTool(x, cy, 'powerline_under', true);
      this.placeTool(x, cy - 1, 'powerline_under', true);
      this.placeTool(x, cy - 4, 'powerline_under', true);
      this.placeTool(x, cy + 8, 'powerline_under', true);
      this.placeTool(x, cy, 'water_pipe', true);
    }
    for (let y = cy - 6; y <= cy + 6; y++) {
      for (let x = cx - 7; x <= cx + 7; x++) {
        this.placeTool(x, y, 'powerline_under', true);
        this.placeTool(x, y, 'water_pipe', true);
      }
    }

    // Tier-4 Residential Condo Ring (3x3 around a Park at (cx - 5, cy - 5))
    const resCenter = { x: cx - 5, y: cy - 5 };
    this.placeTool(resCenter.x, resCenter.y, 'park', true);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = resCenter.x + dx;
        const ty = resCenter.y + dy;
        this.placeTool(tx, ty, 'zone_res', true);
        this.placeTool(tx, ty, 'powerline_under', true);
        const tile = this.getTile(tx, ty);
        if (tile && tile.building) {
          tile.building.construction = 0;
          tile.building.level = 3;
          tile.building.maxPop = CONFIG.ZONE_LEVELS.res[3].maxPop;
          tile.building.pop = tile.building.maxPop;
        }
      }
    }

    // Tier-4 Commercial Skyscraper Ring (3x3 around a Park at (cx + 5, cy - 6))
    const commCenter = { x: cx + 5, y: cy - 6 };
    this.placeTool(commCenter.x, commCenter.y, 'park', true);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = commCenter.x + dx;
        const ty = commCenter.y + dy;
        this.placeTool(tx, ty, 'zone_comm', true);
        this.placeTool(tx, ty, 'powerline_under', true);
        const tile = this.getTile(tx, ty);
        if (tile && tile.building) {
          tile.building.construction = 0;
          tile.building.level = 3;
          tile.building.maxPop = CONFIG.ZONE_LEVELS.comm[3].maxPop;
          tile.building.pop = tile.building.maxPop;
        }
      }
    }

    // Additional Level 1, 2, 3 Residential, Commercial, and Industrial districts
    this.placeTool(cx - 1, cy + 1, 'park', true);
    this.placeTool(cx + 1, cy + 1, 'zone_comm', true);
    const southComm = this.getTile(cx + 1, cy + 1);
    if (southComm && southComm.building) {
      southComm.building.construction = 0;
      southComm.building.level = 1;
      southComm.building.maxPop = CONFIG.ZONE_LEVELS.comm[1].maxPop;
      southComm.building.pop = southComm.building.maxPop;
    }
    for (let y = cy + 1; y <= cy + 6; y++) {
      for (let x = cx - 7; x <= cx - 2; x++) {
        this.placeTool(x, y, 'zone_res', true);
        const tile = this.getTile(x, y);
        if (tile && tile.building) {
          const lvl = ((x + y) % 3) + 1;
          tile.building.construction = 0;
          tile.building.level = lvl;
          tile.building.maxPop = CONFIG.ZONE_LEVELS.res[lvl].maxPop;
          tile.building.pop = Math.round(tile.building.maxPop * 0.9);
        }
      }
      for (let x = cx + 2; x <= cx + 7; x++) {
        this.placeTool(x, y, 'zone_comm', true);
        const tile = this.getTile(x, y);
        if (tile && tile.building) {
          const lvl = ((x + y) % 3) + 1;
          tile.building.construction = 0;
          tile.building.level = lvl;
          tile.building.maxPop = CONFIG.ZONE_LEVELS.comm[lvl].maxPop;
          tile.building.pop = Math.round(tile.building.maxPop * 0.9);
        }
      }
    }

    // Industrial Sector with scrubbers (reaching y = 23 right along Main Avenue so Industrial zones are directly accessible on Main Ave & West Ave)
    this.placeTool(11, 20, 'scrubber', true);
    for (let y = 17; y <= 23; y++) {
      for (let x = 9; x <= 13; x++) {
        if (x === 11 && y === 20) continue;
        this.placeTool(x, y, 'zone_ind', true);
        this.placeTool(x, y, 'powerline_under', true);
        const tile = this.getTile(x, y);
        if (tile && tile.building && tile.building.category === 'zones') {
          const lvl = ((x + y) % 3) + 1;
          tile.building.construction = 0;
          tile.building.level = lvl;
          tile.building.maxPop = CONFIG.ZONE_LEVELS.ind[lvl].maxPop;
          tile.building.pop = Math.round(tile.building.maxPop * 0.85);
        }
      }
    }

    // Designate Vance's Home Residence HQ on the South side of Main Avenue at (cx - 3, cy + 1) = (19, 25)
    const homeTile = this.getTile(cx - 3, cy + 1);
    if (homeTile && homeTile.building) {
      homeTile.building.isHomeResidence = true;
      this.homeResidence = { x: cx - 3, y: cy + 1 };
    }

    this.recalculateAll();
    this.checkTier4Rings();
    this.recalculateTotals();
  }
}

window.CityWorld = CityWorld;
