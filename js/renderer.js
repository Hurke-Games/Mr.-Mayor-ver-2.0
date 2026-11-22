// High-Angle Isometric Cyber-Virtual Holographic Renderer
class IsoRenderer {
  constructor(canvas, minimapCanvas, world, entities) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');
    this.world = world;
    this.entities = entities;

    this.tileW = CONFIG.TILE_WIDTH;
    this.tileH = CONFIG.TILE_HEIGHT;

    // Camera state
    this.rotationAngle = 0;
    this.cosRot = 1;
    this.sinRot = 0;
    this.sortedTiles = null;
    this.sortedTilesAngle = null;
    this.camX = 0;
    this.camY = -this.world.size * (this.tileH * 0.45);
    this.zoom = 0.95;

    // Interaction state
    this.hoverTile = null;
    this.selectedTile = null;
    this.activeOverlay = 'none';
    this.activeTool = null;
    this.dragPath = []; // Tiles being dragged for road/zone placement
    this.time = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  centerCameraOn(gx, gy) {
    const iso = this.gridToIso(gx, gy);
    this.camX = -iso.x;
    this.camY = -iso.y;
  }

  setRotation(angleRad, pivotGrid = null) {
    const pivot = pivotGrid || this.screenToGridFloat(this.canvas.width * 0.5, this.canvas.height * 0.5);
    this.rotationAngle = angleRad;
    this.cosRot = Math.cos(angleRad);
    this.sinRot = Math.sin(angleRad);
    this.sortedTiles = null;
    if (pivot) {
      const newIso = this.gridToIso(pivot.x, pivot.y);
      this.camX = -newIso.x;
      this.camY = -newIso.y;
    }
  }

  getSortedTiles() {
    const size = this.world.size;
    if (this.sortedTiles && this.sortedTilesAngle === this.rotationAngle && this.sortedTiles.length === size * size) {
      return this.sortedTiles;
    }
    const list = [];
    const c = this.cosRot;
    const s = this.sinRot;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const depth = x * (c + s) + y * (c - s);
        list.push({ x, y, depth });
      }
    }
    list.sort((a, b) => a.depth - b.depth);
    this.sortedTiles = list;
    this.sortedTilesAngle = this.rotationAngle;
    return list;
  }

  // Convert Grid (x, y) to Isometric World coordinates (with 3D turntable rotation around grid center)
  gridToIso(gx, gy) {
    const center = (this.world.size - 1) * 0.5;
    const dx = gx - center;
    const dy = gy - center;
    const rx = center + dx * this.cosRot - dy * this.sinRot;
    const ry = center + dx * this.sinRot + dy * this.cosRot;
    return {
      x: (rx - ry) * (this.tileW * 0.5),
      y: (rx + ry) * (this.tileH * 0.5)
    };
  }

  // Convert Screen pixel (sx, sy) to floating-point Grid (gx, gy)
  screenToGridFloat(sx, sy) {
    const wx = (sx - this.canvas.width * 0.5) / this.zoom - this.camX;
    const wy = (sy - this.canvas.height * 0.5) / this.zoom - this.camY;
    const halfW = this.tileW * 0.5;
    const halfH = this.tileH * 0.5;
    const rx = (wy / halfH + wx / halfW) * 0.5;
    const ry = (wy / halfH - wx / halfW) * 0.5;
    const center = (this.world.size - 1) * 0.5;
    const drx = rx - center;
    const dry = ry - center;
    const gx = center + drx * this.cosRot + dry * this.sinRot;
    const gy = center - drx * this.sinRot + dry * this.cosRot;
    return { x: gx, y: gy };
  }

  // Convert Screen pixel (sx, sy) to integer Grid (gx, gy)
  screenToGrid(sx, sy) {
    const g = this.screenToGridFloat(sx, sy);
    return { x: Math.floor(g.x + 0.5), y: Math.floor(g.y + 0.5) };
  }

  render(dt) {
    this.time += dt;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // 1. Cyber-Virtual Cyberspace Background
    const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.45, 50, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    bgGrad.addColorStop(0, '#071124');
    bgGrad.addColorStop(0.6, '#030814');
    bgGrad.addColorStop(1, '#010308');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(this.camX, this.camY);

    const size = this.world.size;
    const showUndergroundPower = this.activeOverlay === 'power' || this.activeTool === 'powerline_under';
    const showUndergroundWater = this.activeOverlay === 'water' || this.activeTool === 'water_pipe' || this.activeTool === 'water_pump';
    const isTrafficView = this.activeOverlay === 'traffic';
    const isPowerView = this.activeOverlay === 'power';
    const isWaterView = this.activeOverlay === 'water';
    const isFilteredOverlay = isTrafficView || isPowerView || isWaterView;

    // Determine visible bounds for culling
    const halfW = this.tileW * 0.5;
    const halfH = this.tileH * 0.5;
    const orderedTiles = this.getSortedTiles();

    // 2. Render Base Terrain Tiles, Rivers, Lakes, Zones, and Overlay Heatmaps
    for (let i = 0; i < orderedTiles.length; i++) {
      const { x, y } = orderedTiles[i];
      const iso = this.gridToIso(x, y);
      if (!this.isVisible(iso.x, iso.y, 140)) continue;
      const tile = this.world.grid[y][x];
      this.drawBaseTile(ctx, tile, iso.x, iso.y, halfW, halfH, showUndergroundPower, showUndergroundWater);
    }

    // 3. Render River Boats (underneath bridges)
    this.drawBoats(ctx);

    // 4. Render Roads, Bridges, Pedestrians, Vehicles, Buildings, Trees, Pylons & Monorails in Painter's Order (back-to-front)
    // In Traffic Flow, Electrical Grid, or Water View, only the items related to that view stay 100% opaque while all other buildings become see-through!
    for (let i = 0; i < orderedTiles.length; i++) {
      const { x, y } = orderedTiles[i];
      const iso = this.gridToIso(x, y);
      if (!this.isVisible(iso.x, iso.y, 320)) continue;
      const tile = this.world.grid[y][x];

      if (tile.terrain === 'forest' && !tile.building) {
        if (isFilteredOverlay) {
          ctx.save();
          ctx.globalAlpha = 0.2;
          this.drawHoloForest(ctx, tile, iso.x, iso.y);
          ctx.restore();
        } else {
          this.drawHoloForest(ctx, tile, iso.x, iso.y);
        }
      }

      if (tile.building) {
        let isRelevantItem = true;
        if (isTrafficView) {
          isRelevantItem =
            ['road', 'avenue', 'highway', 'monorail', 'bus_station', 'railway_station'].includes(tile.building.id) ||
            Boolean(tile.building.hasElevatedRail) ||
            Boolean(tile.elevatedRail);
        } else if (isPowerView) {
          isRelevantItem = tile.building.category === 'power';
        } else if (isWaterView) {
          isRelevantItem = tile.building.id === 'water_pump';
        }

        if (!isRelevantItem) {
          ctx.save();
          ctx.globalAlpha = 0.22;
          this.drawStructure(ctx, tile, iso.x, iso.y, halfW, halfH);
          ctx.restore();
        } else {
          this.drawStructure(ctx, tile, iso.x, iso.y, halfW, halfH);
        }
      }
    }

    // 5. Render Power Line Catenary Wires & Tier-4 Ring Skybridges/Crowns
    if (isPowerView) {
      this.drawPowerWires(ctx);
      ctx.save();
      ctx.globalAlpha = 0.2;
      this.drawTier4RingCrowns(ctx);
      ctx.restore();
    } else if (isTrafficView || isWaterView) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      this.drawPowerWires(ctx);
      this.drawTier4RingCrowns(ctx);
      ctx.restore();
    } else {
      this.drawPowerWires(ctx);
      this.drawTier4RingCrowns(ctx);
    }

    // 6. Render Moving Vehicles, Pedestrians, Commuter Trains, and Smoke/Vapor Plumes
    this.drawPedestrians(ctx);
    this.drawVehicles(ctx);
    this.drawTrains(ctx);
    this.drawParticles(ctx);

    // 7. Render Hover Tool Preview, Radius Circle, and Drag Placement Preview
    this.drawToolPreview(ctx, halfW, halfH);

    ctx.restore();

    // 8. Render Minimap
    this.renderMinimap();
  }

  isVisible(wx, wy, margin = 120) {
    const sx = (wx + this.camX) * this.zoom + this.canvas.width * 0.5;
    const sy = (wy + this.camY) * this.zoom + this.canvas.height * 0.5;
    return (
      sx >= -margin * this.zoom &&
      sx <= this.canvas.width + margin * this.zoom &&
      sy >= -margin * this.zoom &&
      sy <= this.canvas.height + margin * this.zoom
    );
  }

  drawDiamond(ctx, cx, cy, hw, hh) {
    const c = this.cosRot;
    const s = this.sinRot;
    const ux = (c - s) * hw;
    const uy = (c + s) * hh;
    const vx = (-s - c) * hw;
    const vy = (c - s) * hh;

    ctx.beginPath();
    ctx.moveTo(cx - 0.5 * (ux + vx), cy - 0.5 * (uy + vy));
    ctx.lineTo(cx + 0.5 * (ux - vx), cy + 0.5 * (uy - vy));
    ctx.lineTo(cx + 0.5 * (ux + vx), cy + 0.5 * (uy + vy));
    ctx.lineTo(cx - 0.5 * (ux - vx), cy - 0.5 * (uy - vy));
    ctx.closePath();
  }

  drawBaseTile(ctx, tile, cx, cy, hw, hh, showUndergroundPower, showUndergroundWater) {
    this.drawDiamond(ctx, cx, cy, hw, hh);

    // Terrain fill
    if (tile.terrain === 'river' || tile.terrain === 'lake') {
      const pulse = Math.sin(this.time * 2.6 + (tile.x + tile.y) * 0.45) * 0.15;
      ctx.fillStyle = tile.terrain === 'river'
        ? `rgba(6, 78, 115, ${0.85 + pulse})`
        : `rgba(8, 58, 98, ${0.88 + pulse})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Animated data-ripple wave on water
      const waveOffset = ((this.time * 12 + tile.y * 5) % 16) - 8;
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.35)';
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy + waveOffset * 0.35);
      ctx.lineTo(cx + 10, cy + waveOffset * 0.35);
      ctx.stroke();
    } else {
      // Natural cyber-emerald digital terrain with visible grid on undeveloped terrain
      const checker = (tile.x + tile.y) % 2 === 0;
      ctx.fillStyle = tile.terrain === 'forest'
        ? (checker ? '#062822' : '#05221d')
        : (checker ? '#071b24' : '#06161f');
      ctx.fill();

      // Visible holographic grid on undeveloped land and under-construction zones
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.16)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Zone base color pad (Light Green for Res, Medium Blue for Comm, Cyber Amber for Ind)
    if (tile.building && tile.building.category === 'zones') {
      const zType = tile.building.zoneType;
      this.drawDiamond(ctx, cx, cy, hw - 2, hh - 1);
      if (zType === 'res') {
        ctx.fillStyle = tile.building.level === 0 ? 'rgba(110, 231, 183, 0.42)' : 'rgba(52, 211, 153, 0.24)';
        ctx.strokeStyle = '#6ee7b7';
      } else if (zType === 'comm') {
        ctx.fillStyle = tile.building.level === 0 ? 'rgba(56, 189, 248, 0.44)' : 'rgba(14, 165, 233, 0.25)';
        ctx.strokeStyle = '#38bdf8';
      } else {
        ctx.fillStyle = tile.building.level === 0 ? 'rgba(251, 191, 36, 0.42)' : 'rgba(245, 158, 11, 0.24)';
        ctx.strokeStyle = '#fbbf24';
      }
      ctx.fill();
      ctx.lineWidth = tile.building.ownedByPlayer ? 2.6 : 1.4;
      if (tile.building.ownedByPlayer) {
        ctx.strokeStyle = tile.building.businessEthics === 'corrupt' ? '#f43f5e' : '#10b981';
      } else if (tile.building.isHomeResidence && this.world.playerRole === 'businessman') {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.4;
      }
      ctx.stroke();
    } else if (tile.building && (tile.building.size || 1) > 1) {
      // Multi-tile (2x2 Civic / Education or 5x5 Special Project Stadium) foundation pad
      const toolDef = CONFIG.TOOLS[tile.building.id];
      this.drawDiamond(ctx, cx, cy, hw - 1, hh - 0.5);
      ctx.fillStyle = toolDef ? `${toolDef.color}38` : 'rgba(232, 121, 249, 0.25)';
      ctx.strokeStyle = toolDef ? toolDef.stroke : '#f0abfc';
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
    }

    // Active Data Overlay Heatmap
    if (this.activeOverlay !== 'none') {
      const ovColor = this.getOverlayTileColor(tile, this.activeOverlay);
      if (ovColor) {
        this.drawDiamond(ctx, cx, cy, hw - 1, hh - 0.5);
        ctx.fillStyle = ovColor;
        ctx.fill();
      }
    }

    // Underground Power Conduit visualization
    if (tile.undergroundPower && showUndergroundPower) {
      this.drawUndergroundConduitOnTile(ctx, tile, cx, cy, hw, hh, 'power');
    }

    // Underground Water Pipe visualization
    if (tile.undergroundWater && showUndergroundWater) {
      this.drawUndergroundConduitOnTile(ctx, tile, cx, cy, hw, hh, 'water');
    }

    // Highlight selected tile
    if (this.selectedTile && this.selectedTile.x === tile.x && this.selectedTile.y === tile.y) {
      this.drawDiamond(ctx, cx, cy, hw, hh);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  drawUndergroundConduitOnTile(ctx, tile, cx, cy, hw, hh, kind) {
    ctx.save();
    ctx.globalAlpha = 1.0;
    if (kind === 'power') {
      ctx.strokeStyle = tile.powered ? '#facc15' : '#ef4444';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([4, 3]);
    } else {
      ctx.strokeStyle = tile.pipeWatered ? '#00f5d4' : '#38bdf8';
      ctx.lineWidth = 3.0;
      ctx.setLineDash(tile.pipeWatered ? [] : [5, 3]);
    }

    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    ctx.beginPath();
    let hasConn = false;
    for (const d of dirs) {
      const nt = this.world.getTile(tile.x + d.dx, tile.y + d.dy);
      if (!nt) continue;
      const connected = kind === 'power'
        ? (nt.undergroundPower || Boolean(nt.building && (nt.building.id === 'powerline_above' || CONFIG.TOOLS[nt.building.id]?.powerGen)))
        : (nt.undergroundWater || Boolean(nt.building && nt.building.id === 'water_pump'));
      if (connected) {
        const nIso = this.gridToIso(tile.x + d.dx, tile.y + d.dy);
        ctx.moveTo(cx, cy);
        ctx.lineTo((cx + nIso.x) * 0.5, (cy + nIso.y) * 0.5);
        hasConn = true;
      }
    }

    if (!hasConn) {
      ctx.moveTo(cx - hw * 0.4, cy);
      ctx.lineTo(cx + hw * 0.4, cy);
      ctx.moveTo(cx, cy - hh * 0.4);
      ctx.lineTo(cx, cy + hh * 0.4);
    }
    ctx.stroke();

    // Node dot at tile center
    ctx.fillStyle = kind === 'power'
      ? (tile.powered ? '#fef08a' : '#ef4444')
      : (tile.pipeWatered ? '#00f5d4' : '#38bdf8');
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  getOverlayTileColor(tile, overlay) {
    // Business Man Investment Overlays
    if (this.world.playerRole === 'businessman') {
      const b = tile.building;
      const isBiz = b && b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind');
      if (overlay === 'none') {
        if (!isBiz) return null;
        if (b.ownedByPlayer) {
          return b.businessEthics === 'corrupt'
            ? 'rgba(244, 63, 94, 0.42)'
            : 'rgba(16, 185, 129, 0.42)';
        }
        return 'rgba(250, 204, 21, 0.28)';
      }
      if (overlay === 'biz_profit') {
        if (!isBiz) return null;
        const info = this.world.getBusinessPropertyInfo(tile);
        if (!info) return null;
        const income = b.ownedByPlayer ? info.currentIncome : info.goodIncome;
        if (income >= 9000) return 'rgba(232, 121, 249, 0.72)';
        if (income >= 4500) return 'rgba(250, 204, 21, 0.68)';
        if (income >= 2200) return 'rgba(56, 189, 248, 0.62)';
        return 'rgba(52, 211, 153, 0.52)';
      }
      if (overlay === 'biz_scale') {
        if (!isBiz) return null;
        const lvl = Math.max(1, b.level || 1);
        if (lvl >= 4) return 'rgba(250, 204, 21, 0.75)';
        if (lvl === 3) return 'rgba(192, 132, 252, 0.68)';
        if (lvl === 2) return 'rgba(56, 189, 248, 0.60)';
        return 'rgba(74, 222, 128, 0.48)';
      }
      if (overlay === 'biz_climate') {
        if (isBiz && b.ownedByPlayer) {
          return b.businessEthics === 'corrupt'
            ? 'rgba(244, 63, 94, 0.68)'
            : 'rgba(16, 185, 129, 0.68)';
        }
        if (tile.morale >= 85) return 'rgba(56, 189, 248, 0.35)';
        if (tile.morale < 50) return 'rgba(244, 63, 94, 0.35)';
        return null;
      }
    }

    switch (overlay) {
      case 'power':
        if (tile.building || tile.undergroundPower) {
          return tile.powered ? 'rgba(250, 204, 21, 0.42)' : 'rgba(239, 68, 68, 0.55)';
        }
        return null;
      case 'water':
        if (tile.terrain === 'river' || tile.terrain === 'lake') {
          return 'rgba(14, 165, 233, 0.55)';
        }
        if (tile.building && tile.building.id === 'water_pump') {
          return (tile.powered && tile.building.hasWaterSource)
            ? 'rgba(0, 245, 212, 0.72)'
            : 'rgba(239, 68, 68, 0.75)';
        }
        if (tile.watered) {
          return 'rgba(56, 189, 248, 0.46)';
        }
        if (tile.building || tile.undergroundWater) {
          return 'rgba(239, 68, 68, 0.52)';
        }
        return null;
      case 'pollution':
        if (tile.pollution <= 2) return null;
        return `rgba(163, 230, 53, ${Math.min(0.75, tile.pollution / 100)})`;
      case 'crime':
        if (tile.crime <= 5) return 'rgba(59, 130, 246, 0.14)';
        return `rgba(244, 63, 94, ${Math.min(0.75, tile.crime / 95)})`;
      case 'traffic':
        if (tile.building && (tile.building.id === 'bus_station' || tile.building.id === 'railway_station')) {
          return 'rgba(6, 182, 212, 0.62)';
        }
        if (!this.world.isRoadSurface(tile) && !this.world.hasRail(tile)) return null;
        if (tile.traffic < 25) return 'rgba(52, 211, 153, 0.5)';
        if (tile.traffic < 60) return 'rgba(251, 191, 36, 0.65)';
        return 'rgba(239, 68, 68, 0.8)';
      case 'health':
        return `rgba(16, 185, 129, ${Math.min(0.68, tile.health / 120)})`;
      case 'morale':
        if (tile.morale >= 90) return 'rgba(232, 121, 249, 0.62)'; // Highlights >=90% Tier-4 eligible tiles!
        if (tile.morale >= 65) return 'rgba(56, 189, 248, 0.36)';
        return 'rgba(249, 115, 22, 0.45)';
      default:
        return null;
    }
  }

  // Draw dense holographic wireframe trees on forest tiles
  drawHoloForest(ctx, tile, cx, cy) {
    const treePositions = [
      { ox: 0, oy: -4, h: 15 },
      { ox: -11, oy: 2, h: 12 },
      { ox: 11, oy: 3, h: 13 }
    ];
    for (const tp of treePositions) {
      const tx = cx + tp.ox;
      const ty = cy + tp.oy;
      // Trunk
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty - 4);
      ctx.stroke();

      // Glowing cyber-canopy cone
      ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty - tp.h);
      ctx.lineTo(tx + 6, ty - 3);
      ctx.lineTo(tx, ty - 1);
      ctx.lineTo(tx - 6, ty - 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Draw a 3D isometric prism (extruded box on isometric footprint)
  drawIsoBox(ctx, cx, cy, w, d, h, topColor, leftColor, rightColor, strokeColor, windows = null) {
    const hw = w * 0.5;
    const hh = d * 0.5;

    const pTop = { x: cx, y: cy - hh };
    const pRight = { x: cx + hw, y: cy };
    const pBottom = { x: cx, y: cy + hh };
    const pLeft = { x: cx - hw, y: cy };

    // Left face
    ctx.fillStyle = leftColor;
    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(pBottom.x, pBottom.y);
    ctx.lineTo(pBottom.x, pBottom.y - h);
    ctx.lineTo(pLeft.x, pLeft.y - h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Right face
    ctx.fillStyle = rightColor;
    ctx.beginPath();
    ctx.moveTo(pBottom.x, pBottom.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.lineTo(pRight.x, pRight.y - h);
    ctx.lineTo(pBottom.x, pBottom.y - h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Top face
    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y - h);
    ctx.lineTo(pRight.x, pRight.y - h);
    ctx.lineTo(pBottom.x, pBottom.y - h);
    ctx.lineTo(pLeft.x, pLeft.y - h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Optional glowing window strips on left & right faces
    if (windows && h >= 14) {
      ctx.strokeStyle = windows;
      ctx.lineWidth = 1;
      const rows = Math.floor(h / 7);
      for (let r = 1; r < rows; r++) {
        const wy = r * 6;
        // Left face window line
        ctx.beginPath();
        ctx.moveTo(pLeft.x + 3, pLeft.y - wy + 1.5);
        ctx.lineTo(pBottom.x - 3, pBottom.y - wy - 1.5);
        ctx.stroke();
        // Right face window line
        ctx.beginPath();
        ctx.moveTo(pBottom.x + 3, pBottom.y - wy - 1.5);
        ctx.lineTo(pRight.x - 3, pRight.y - wy + 1.5);
        ctx.stroke();
      }
    }
  }

  // Draw any building/road/zone structure on tile
  drawStructure(ctx, tile, cx, cy, hw, hh) {
    const b = tile.building;
    if (!b) return;

    const isBMMode = this.world.playerRole === 'businessman';
    const isBizTarget =
      (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) ||
      b.isHomeResidence ||
      b.id === 'city_hall';
    if (isBMMode && !isBizTarget && b.category !== 'roads') {
      ctx.save();
      ctx.globalAlpha = 0.34;
      this._drawStructureInner(ctx, tile, cx, cy, hw, hh);
      ctx.restore();
      return;
    }
    this._drawStructureInner(ctx, tile, cx, cy, hw, hh);
  }

  _drawStructureInner(ctx, tile, cx, cy, hw, hh) {
    const b = tile.building;
    if (!b) return;

    // 1. BUS STATION (in 'roads' category for Transit menu, rendered as a 3D transit building)
    if (b.id === 'bus_station') {
      this.drawSpecialBuilding(ctx, tile, cx, cy, hw, hh);
      this.drawStatusIcons(ctx, tile, cx, cy - 42);
      return;
    }

    // 2. ROADS, AVENUES, HIGHWAYS, RAISED RAIL (MONORAIL), RAILWAY STATIONS & BRIDGES
    if (b.category === 'roads') {
      this.drawRoadTile(ctx, tile, cx, cy, hw, hh);
      if (b.id === 'railway_station') {
        this.drawStatusIcons(ctx, tile, cx, cy - 46);
      }
      return;
    }

    // 3. ABOVE-GROUND POWER PYLONS
    if (b.id === 'powerline_above') {
      this.drawPylon(ctx, tile, cx, cy);
      return;
    }

    // 4. ZONES (Residential, Commercial, Industrial: Level 0 Scaffolding -> L1 -> L2 -> L3 -> L4 Ring)
    if (b.category === 'zones') {
      this.drawZoneBuilding(ctx, tile, cx, cy, hw, hh);
      this.drawStatusIcons(ctx, tile, cx, cy - 35);
      return;
    }

    // 5. MULTI-TILE STRUCTURES (2x2 Civic/Edu & 5x5 Special Project City Stadium)
    if ((b.size || 1) > 1) {
      const ox = b.originX ?? tile.x;
      const oy = b.originY ?? tile.y;
      const sz = b.size || 2;
      // Render multi-tile structure once at the front-most tile in painter's order (accounting for map rotation)
      const frontX = (this.cosRot + this.sinRot) >= 0 ? (ox + sz - 1) : ox;
      const frontY = (this.cosRot - this.sinRot) >= 0 ? (oy + sz - 1) : oy;
      if (tile.x !== frontX || tile.y !== frontY) return;
      const centerIso = this.gridToIso(ox + (sz - 1) * 0.5, oy + (sz - 1) * 0.5);
      this.drawSpecialBuilding(ctx, tile, centerIso.x, centerIso.y, hw * sz, hh * sz);
      this.drawStatusIcons(ctx, tile, centerIso.x, centerIso.y - (sz >= 5 ? 96 : 72));
      return;
    }

    this.drawSpecialBuilding(ctx, tile, cx, cy, hw, hh);
    this.drawStatusIcons(ctx, tile, cx, cy - 45);
  }

  drawRoadTile(ctx, tile, cx, cy, hw, hh) {
    const b = tile.building;
    const isBridge = b.bridge || tile.terrain === 'river';
    const hasSurfaceRoad = this.world.isRoadSurface(tile);
    const hasRaisedRail = this.world.hasRail(tile);

    // If bridge over river, draw support piers
    if (isBridge) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx - 18, cy - 2, 4, 10);
      ctx.fillRect(cx + 14, cy - 2, 4, 10);
    }

    // 1. Draw surface Road / Avenue / Highway deck if present (including under Raised Rail & Railway Stations!)
    if (hasSurfaceRoad) {
      const roadKind = b.id === 'railway_station' ? (b.underlyingRoad || 'road') : b.id;
      this.drawDiamond(ctx, cx, cy, hw - 2, hh - 1);
      if (roadKind === 'highway') {
        ctx.fillStyle = 'rgba(30, 27, 75, 0.94)';
        ctx.strokeStyle = '#e879f9';
      } else if (roadKind === 'avenue') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.strokeStyle = '#00f5d4';
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.strokeStyle = '#38bdf8';
      }
      ctx.fill();
      ctx.lineWidth = isBridge ? 2.2 : 1.1;
      ctx.stroke();

      // Interconnected lane markings toward adjacent road tiles
      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
      ];

      ctx.strokeStyle = roadKind === 'highway'
        ? 'rgba(232, 121, 249, 0.75)'
        : roadKind === 'avenue'
          ? 'rgba(0, 245, 212, 0.7)'
          : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = roadKind === 'highway' ? 2.5 : roadKind === 'avenue' ? 1.8 : 1.1;

      ctx.beginPath();
      for (const d of dirs) {
        const nt = this.world.getTile(tile.x + d.dx, tile.y + d.dy);
        if (this.world.isRoadSurface(nt)) {
          const nIso = this.gridToIso(tile.x + d.dx, tile.y + d.dy);
          ctx.moveTo(cx, cy);
          ctx.lineTo((cx + nIso.x) * 0.5, (cy + nIso.y) * 0.5);
        }
      }
      ctx.stroke();

      // Bridge suspension arch if crossing river
      if (isBridge) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy);
        ctx.quadraticCurveTo(cx, cy - 18, cx + 18, cy);
        ctx.stroke();
      }

      // Show underground power or water pipes passing under this road when their overlay/tool is active
      if (tile.undergroundPower && (this.activeOverlay === 'power' || this.activeTool === 'powerline_under')) {
        this.drawUndergroundConduitOnTile(ctx, tile, cx, cy, hw, hh, 'power');
      }
      if (tile.undergroundWater && (this.activeOverlay === 'water' || this.activeTool === 'water_pipe' || this.activeTool === 'water_pump')) {
        this.drawUndergroundConduitOnTile(ctx, tile, cx, cy, hw, hh, 'water');
      }
    }

    // 2. Draw Raised Rail overhead guideway & support pillars (standalone OR built over a road!)
    if (hasRaisedRail) {
      ctx.fillStyle = 'rgba(34, 211, 238, 0.72)';
      if (hasSurfaceRoad) {
        // Straddle pillars on road shoulders so cars drive cleanly underneath
        ctx.fillRect(cx - 13, cy - 16, 3, 15);
        ctx.fillRect(cx + 10, cy - 16, 3, 15);
      } else {
        ctx.fillRect(cx - 2, cy - 16, 4, 16);
      }

      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
      ];
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 4;
      ctx.beginPath();
      let anyConn = false;
      for (const d of dirs) {
        const nt = this.world.getTile(tile.x + d.dx, tile.y + d.dy);
        if (this.world.hasRail(nt)) {
          const nIso = this.gridToIso(tile.x + d.dx, tile.y + d.dy);
          ctx.moveTo(cx, cy - 16);
          ctx.lineTo((cx + nIso.x) * 0.5, (cy + nIso.y) * 0.5 - 16);
          anyConn = true;
        }
      }
      if (!anyConn) {
        ctx.moveTo(cx - 14, cy - 16 - 7);
        ctx.lineTo(cx + 14, cy - 16 + 7);
      }
      ctx.stroke();

      // Inner bright rail track core
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    // 3. Draw Railway Station overhead platform & street entry/exit stair towers where road & rail cross
    if (b.id === 'railway_station') {
      // Street-level boarding stair/elevator towers on both sidewalks
      this.drawIsoBox(
        ctx, cx - 14, cy + 2, 12, 6, 18,
        'rgba(34, 211, 238, 0.88)',
        'rgba(14, 116, 144, 0.92)',
        'rgba(8, 145, 178, 0.92)',
        '#67e8f9'
      );
      this.drawIsoBox(
        ctx, cx + 14, cy + 2, 12, 6, 18,
        'rgba(34, 211, 238, 0.88)',
        'rgba(14, 116, 144, 0.92)',
        'rgba(8, 145, 178, 0.92)',
        '#67e8f9'
      );
      // Elevated glass concourse canopy over the rail & road crossing
      this.drawIsoBox(
        ctx, cx, cy - 15, 44, 22, 12,
        'rgba(103, 232, 249, 0.82)',
        'rgba(22, 78, 99, 0.88)',
        'rgba(14, 116, 144, 0.88)',
        '#00f5d4',
        'rgba(224, 242, 254, 0.9)'
      );
      // Glowing station roof sign
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(cx, cy - 30, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPylon(ctx, tile, cx, cy) {
    // Steel lattice cyber-pylon
    ctx.strokeStyle = tile.powered ? '#facc15' : '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 2);
    ctx.lineTo(cx, cy - 26);
    ctx.lineTo(cx + 6, cy + 2);
    // Crossbars
    ctx.moveTo(cx - 9, cy - 18);
    ctx.lineTo(cx + 9, cy - 18);
    ctx.moveTo(cx - 6, cy - 24);
    ctx.lineTo(cx + 6, cy - 24);
    ctx.stroke();

    // Glowing insulator nodes
    ctx.fillStyle = tile.powered ? '#fde047' : '#64748b';
    ctx.beginPath();
    ctx.arc(cx, cy - 26, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawZoneBuilding(ctx, tile, cx, cy, hw, hh) {
    const b = tile.building;
    const zType = b.zoneType;
    const lvl = b.level;

    // LEVEL 0: Visible Construction Site with Scaffolding, Rotating Crane & Dirt/Grid Plot
    if (lvl === 0) {
      // Scaffolding wireframe box
      const stroke = zType === 'res' ? '#6ee7b7' : zType === 'comm' ? '#38bdf8' : '#fbbf24';
      this.drawIsoBox(
        ctx, cx, cy, 28, 14, 12,
        'rgba(15, 23, 42, 0.35)',
        'rgba(15, 23, 42, 0.45)',
        'rgba(15, 23, 42, 0.55)',
        stroke
      );
      // Rotating mini construction crane
      const angle = this.time * 1.4 + tile.seed * 6;
      const boomX = Math.cos(angle) * 14;
      const boomY = Math.sin(angle) * 7;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx, cy - 26);
      ctx.lineTo(cx + boomX, cy - 26 + boomY);
      ctx.stroke();
      return;
    }

    // RESIDENTIAL LEVELS (Light Green / Emerald / Cyan Wireframe)
    if (zType === 'res') {
      if (lvl === 1) {
        // L1: Suburban neighborhood with two cyber-cottages and tiny yard tree
        this.drawIsoBox(
          ctx, cx - 8, cy - 2, 18, 9, 11,
          'rgba(110, 231, 183, 0.78)',
          'rgba(16, 185, 129, 0.65)',
          'rgba(5, 150, 105, 0.72)',
          '#6ee7b7'
        );
        this.drawIsoBox(
          ctx, cx + 8, cy + 3, 16, 8, 9,
          'rgba(110, 231, 183, 0.78)',
          'rgba(16, 185, 129, 0.65)',
          'rgba(5, 150, 105, 0.72)',
          '#6ee7b7'
        );
        // Tiny yard holo-tree
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(cx + 2, cy - 6, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (lvl === 2) {
        // L2: Brick-styled Holo-Apartment Complex
        this.drawIsoBox(
          ctx, cx, cy + 2, 36, 18, 26,
          'rgba(52, 211, 153, 0.78)',
          'rgba(6, 95, 70, 0.82)',
          'rgba(4, 120, 87, 0.85)',
          '#6ee7b7',
          'rgba(167, 243, 208, 0.75)'
        );
      } else if (lvl === 3) {
        // L3: High-Rise Residential Glass Tower
        this.drawIsoBox(
          ctx, cx, cy + 3, 38, 19, 48,
          'rgba(110, 231, 183, 0.85)',
          'rgba(6, 78, 59, 0.84)',
          'rgba(16, 185, 129, 0.78)',
          '#a7f3d0',
          'rgba(209, 250, 229, 0.85)'
        );
        // Spire
        ctx.strokeStyle = '#6ee7b7';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 45);
        ctx.lineTo(cx, cy - 58);
        ctx.stroke();
      } else if (lvl === 4) {
        // L4 (Ring Member): Neo-Arcology Condo Complex Tower (double pop & revenue!)
        this.drawIsoBox(
          ctx, cx, cy + 4, 46, 23, 72,
          'rgba(167, 243, 208, 0.92)',
          'rgba(4, 120, 87, 0.88)',
          'rgba(16, 185, 129, 0.85)',
          '#fef08a',
          'rgba(254, 240, 138, 0.9)'
        );
        // Upper crown tier
        this.drawIsoBox(
          ctx, cx, cy - 68, 28, 14, 18,
          'rgba(250, 204, 21, 0.88)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(52, 211, 153, 0.9)',
          '#ffffff'
        );
      }
      return;
    }

    // COMMERCIAL LEVELS (Medium Blue / Cyan / Magenta Neon Wireframe)
    if (zType === 'comm') {
      if (lvl === 1) {
        // L1: Local Data-Shops with neon signboard
        this.drawIsoBox(
          ctx, cx, cy + 2, 32, 16, 14,
          'rgba(56, 189, 248, 0.75)',
          'rgba(3, 105, 161, 0.78)',
          'rgba(2, 132, 199, 0.82)',
          '#38bdf8',
          'rgba(186, 230, 253, 0.8)'
        );
        // Neon magenta billboard
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 7, cy - 18, 14, 5);
      } else if (lvl === 2) {
        // L2: Shopping Center with stepped glass atrium
        this.drawIsoBox(
          ctx, cx, cy + 3, 42, 21, 24,
          'rgba(56, 189, 248, 0.8)',
          'rgba(7, 89, 133, 0.85)',
          'rgba(14, 165, 233, 0.82)',
          '#38bdf8',
          'rgba(125, 211, 252, 0.85)'
        );
        this.drawIsoBox(
          ctx, cx, cy - 21, 24, 12, 10,
          'rgba(232, 121, 249, 0.75)',
          'rgba(14, 165, 233, 0.75)',
          'rgba(56, 189, 248, 0.8)',
          '#f0abfc'
        );
      } else if (lvl === 3) {
        // L3: Bustling Downtown Glass Office Tower
        this.drawIsoBox(
          ctx, cx, cy + 3, 40, 20, 56,
          'rgba(125, 211, 252, 0.88)',
          'rgba(12, 74, 110, 0.88)',
          'rgba(2, 132, 199, 0.85)',
          '#38bdf8',
          'rgba(224, 242, 254, 0.9)'
        );
        // Holographic beacon
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 53);
        ctx.lineTo(cx, cy - 68);
        ctx.stroke();
      } else if (lvl === 4) {
        // L4 (Ring Member): Hyper-Corp Glass Mega-Skyscraper (double jobs & revenue!)
        this.drawIsoBox(
          ctx, cx, cy + 4, 48, 24, 86,
          'rgba(186, 230, 253, 0.95)',
          'rgba(8, 47, 73, 0.92)',
          'rgba(14, 165, 233, 0.88)',
          '#e879f9',
          'rgba(240, 171, 252, 0.92)'
        );
        // Crystalline upper spire
        this.drawIsoBox(
          ctx, cx, cy - 82, 28, 14, 24,
          'rgba(240, 171, 252, 0.92)',
          'rgba(56, 189, 248, 0.88)',
          'rgba(192, 132, 252, 0.9)',
          '#ffffff'
        );
      }
      return;
    }

    // INDUSTRIAL LEVELS (Cyber Amber / Orange / Smokestacks)
    if (zType === 'ind') {
      if (lvl === 1) {
        // L1: Cyber-Warehouses
        this.drawIsoBox(
          ctx, cx, cy + 2, 36, 18, 13,
          'rgba(251, 191, 36, 0.72)',
          'rgba(146, 64, 14, 0.82)',
          'rgba(180, 83, 9, 0.82)',
          '#fbbf24'
        );
      } else if (lvl === 2) {
        // L2: Heavy Synth-Factory with puffing smokestack
        this.drawIsoBox(
          ctx, cx, cy + 3, 40, 20, 22,
          'rgba(245, 158, 11, 0.78)',
          'rgba(120, 53, 15, 0.86)',
          'rgba(180, 83, 9, 0.85)',
          '#fbbf24',
          'rgba(254, 243, 199, 0.7)'
        );
        // Smokestack
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#fbbf24';
        ctx.fillRect(cx + 6, cy - 34, 5, 14);
        ctx.strokeRect(cx + 6, cy - 34, 5, 14);
        if (tile.powered && Math.random() < 0.14) {
          this.entities.emitSmoke(tile.x, tile.y, 36, 'rgba(163, 230, 53, 0.45)');
        }
      } else if (lvl === 3) {
        // L3: Refinery & Foundry with twin stacks
        this.drawIsoBox(
          ctx, cx, cy + 3, 44, 22, 32,
          'rgba(251, 191, 36, 0.85)',
          'rgba(120, 53, 15, 0.9)',
          'rgba(217, 119, 6, 0.88)',
          '#fde047',
          'rgba(254, 240, 138, 0.85)'
        );
        ctx.fillStyle = '#451a03';
        ctx.strokeStyle = '#fde047';
        ctx.fillRect(cx - 8, cy - 46, 5, 16);
        ctx.strokeRect(cx - 8, cy - 46, 5, 16);
        ctx.fillRect(cx + 5, cy - 48, 5, 18);
        ctx.strokeRect(cx + 5, cy - 48, 5, 18);
        if (tile.powered && Math.random() < 0.22) {
          this.entities.emitSmoke(tile.x, tile.y, 48, 'rgba(190, 242, 100, 0.5)');
        }
      } else if (lvl >= 4) {
        // L4: Grand Industrial Complex (Larger scale & twin tall towers)
        this.drawIsoBox(
          ctx, cx, cy + 4, 48, 24, 52,
          'rgba(253, 224, 71, 0.92)',
          'rgba(120, 53, 15, 0.94)',
          'rgba(217, 119, 6, 0.92)',
          '#fef08a',
          'rgba(254, 240, 138, 0.92)'
        );
        ctx.fillStyle = '#451a03';
        ctx.strokeStyle = '#fef08a';
        ctx.fillRect(cx - 10, cy - 68, 6, 22);
        ctx.strokeRect(cx - 10, cy - 68, 6, 22);
        ctx.fillRect(cx + 5, cy - 70, 6, 24);
        ctx.strokeRect(cx + 5, cy - 70, 6, 24);
        if (tile.powered && Math.random() < 0.25) {
          this.entities.emitSmoke(tile.x, tile.y, 68, 'rgba(190, 242, 100, 0.55)');
        }
      }
    }
  }

  // Draw Civic, Utility, Power Plants, Parks, Scrubbers, and Stadium
  drawSpecialBuilding(ctx, tile, cx, cy, hw, hh) {
    const id = tile.building.id;

    switch (id) {
      case 'wind_plant': {
        // Pedestal + Spinning 3-blade rotor
        ctx.strokeStyle = '#67e8f9';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy + 2);
        ctx.lineTo(cx, cy - 30);
        ctx.stroke();

        const baseAngle = this.time * 4.2 + tile.seed * 10;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        for (let i = 0; i < 3; i++) {
          const a = baseAngle + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 30);
          ctx.lineTo(cx + Math.cos(a) * 13, cy - 30 + Math.sin(a) * 13);
          ctx.stroke();
        }
        break;
      }

      case 'solar_plant': {
        // Angled photovoltaic glass panels
        this.drawIsoBox(
          ctx, cx, cy + 2, 42, 21, 8,
          'rgba(56, 189, 248, 0.85)',
          'rgba(14, 116, 144, 0.85)',
          'rgba(2, 132, 199, 0.85)',
          '#fde047'
        );
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 8);
        ctx.lineTo(cx + 12, cy - 8);
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx, cy - 2);
        ctx.stroke();
        break;
      }

      case 'coal_plant': {
        // Coal Power Station with twin tall puffing smokestacks
        this.drawIsoBox(
          ctx, cx, cy + 3, 44, 22, 26,
          'rgba(249, 115, 22, 0.82)',
          'rgba(124, 45, 18, 0.9)',
          'rgba(154, 52, 18, 0.88)',
          '#fb923c',
          'rgba(254, 215, 170, 0.75)'
        );
        ctx.fillStyle = '#431407';
        ctx.strokeStyle = '#fb923c';
        ctx.fillRect(cx - 9, cy - 44, 6, 20);
        ctx.strokeRect(cx - 9, cy - 44, 6, 20);
        ctx.fillRect(cx + 4, cy - 44, 6, 20);
        ctx.strokeRect(cx + 4, cy - 44, 6, 20);
        if (Math.random() < 0.3) {
          this.entities.emitSmoke(tile.x, tile.y, 45, 'rgba(148, 163, 184, 0.65)');
        }
        break;
      }

      case 'nuclear_plant': {
        // Nuclear Fusion Plant with Cooling Towers & glowing reactor dome
        this.drawIsoBox(
          ctx, cx, cy + 4, 46, 23, 22,
          'rgba(34, 211, 238, 0.82)',
          'rgba(30, 27, 75, 0.9)',
          'rgba(59, 7, 100, 0.88)',
          '#22d3ee'
        );
        // Twin cooling towers
        for (const ox of [-9, 9]) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(cx + ox - 6, cy - 18);
          ctx.quadraticCurveTo(cx + ox - 3, cy - 30, cx + ox - 5, cy - 40);
          ctx.lineTo(cx + ox + 5, cy - 40);
          ctx.quadraticCurveTo(cx + ox + 3, cy - 30, cx + ox + 6, cy - 18);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        if (Math.random() < 0.28) {
          this.entities.emitSmoke(tile.x, tile.y, 42, 'rgba(103, 232, 249, 0.55)');
        }
        break;
      }

      case 'police': {
        // Cyber Police Precinct with flashing red/blue beacon
        this.drawIsoBox(
          ctx, cx, cy + 3, 40, 20, 26,
          'rgba(59, 130, 246, 0.85)',
          'rgba(23, 37, 84, 0.9)',
          'rgba(30, 64, 175, 0.88)',
          '#60a5fa',
          'rgba(191, 219, 254, 0.85)'
        );
        const flashRed = Math.floor(this.time * 6) % 2 === 0;
        ctx.fillStyle = flashRed ? '#ef4444' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(cx, cy - 28, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'fire': {
        // Fire Station
        this.drawIsoBox(
          ctx, cx, cy + 3, 40, 20, 22,
          'rgba(239, 68, 68, 0.85)',
          'rgba(127, 29, 29, 0.9)',
          'rgba(185, 28, 28, 0.88)',
          '#f87171',
          'rgba(254, 202, 202, 0.85)'
        );
        break;
      }

      case 'hospital': {
        // Bio-Med Hospital with glowing cross emblem
        this.drawIsoBox(
          ctx, cx, cy + 3, 44, 22, 34,
          'rgba(16, 185, 129, 0.85)',
          'rgba(6, 78, 59, 0.9)',
          'rgba(4, 120, 87, 0.88)',
          '#34d399',
          'rgba(209, 250, 229, 0.88)'
        );
        // Glowing cross on roof
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 34);
        ctx.lineTo(cx + 5, cy - 34);
        ctx.moveTo(cx, cy - 39);
        ctx.lineTo(cx, cy - 29);
        ctx.stroke();
        break;
      }

      case 'city_hall': {
        // 2x2 Grand City Hall with plaza & holographic clock/obelisk spire
        this.drawIsoBox(
          ctx, cx, cy + 8, 96, 48, 44,
          'rgba(232, 121, 249, 0.85)',
          'rgba(74, 4, 78, 0.9)',
          'rgba(112, 26, 117, 0.88)',
          '#f0abfc',
          'rgba(245, 208, 254, 0.88)'
        );
        this.drawIsoBox(
          ctx, cx, cy - 36, 52, 26, 34,
          'rgba(240, 171, 252, 0.92)',
          'rgba(134, 25, 143, 0.9)',
          'rgba(162, 28, 175, 0.9)',
          '#ffffff'
        );
        break;
      }

      case 'school': {
        // 2x2 Public School with playground
        this.drawIsoBox(
          ctx, cx - 8, cy + 4, 72, 36, 28,
          'rgba(251, 113, 133, 0.82)',
          'rgba(136, 19, 55, 0.88)',
          'rgba(190, 18, 60, 0.85)',
          '#fda4af',
          'rgba(255, 228, 230, 0.8)'
        );
        // Expanded holo-playground ring
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + 24, cy + 4, 8, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'university': {
        // 2x2 State University with geodesic holo-dome
        this.drawIsoBox(
          ctx, cx, cy + 6, 90, 45, 36,
          'rgba(168, 85, 247, 0.84)',
          'rgba(59, 7, 100, 0.9)',
          'rgba(88, 28, 135, 0.88)',
          '#c084fc',
          'rgba(233, 213, 255, 0.85)'
        );
        ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy - 34, 18, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'bus_station': {
        // Municipal Bus Station with covered boarding canopy & shuttle bus bay
        this.drawIsoBox(
          ctx, cx - 4, cy + 2, 38, 19, 18,
          'rgba(56, 189, 248, 0.86)',
          'rgba(12, 74, 110, 0.92)',
          'rgba(2, 132, 199, 0.88)',
          '#00f5d4',
          'rgba(186, 230, 253, 0.85)'
        );
        // Bus bay overhang canopy
        this.drawIsoBox(
          ctx, cx + 6, cy - 10, 26, 13, 5,
          'rgba(0, 245, 212, 0.8)',
          'rgba(14, 165, 233, 0.8)',
          'rgba(56, 189, 248, 0.85)',
          '#ffffff'
        );
        break;
      }

      case 'stadium': {
        // Colossal 5x5 Special Project City Stadium with tiered bowl, athletic pitch & 4 floodlight towers!
        this.drawIsoBox(
          ctx, cx, cy + 12, 224, 112, 36,
          'rgba(15, 23, 42, 0.94)',
          'rgba(136, 19, 55, 0.9)',
          'rgba(190, 18, 60, 0.88)',
          '#f43f5e',
          'rgba(253, 164, 175, 0.78)'
        );
        // Upper stadium concourse collar
        this.drawIsoBox(
          ctx, cx, cy - 24, 240, 120, 12,
          'rgba(30, 41, 59, 0.92)',
          'rgba(159, 18, 57, 0.9)',
          'rgba(225, 29, 72, 0.9)',
          '#38bdf8'
        );
        // Inner seating bowl rim
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 36, 86, 43, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Glowing emerald turf field inside the 5x5 stadium
        ctx.fillStyle = 'rgba(16, 185, 129, 0.88)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 36, 64, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Center pitch markings
        ctx.beginPath();
        ctx.moveTo(cx, cy - 68);
        ctx.lineTo(cx, cy - 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy - 36, 16, 8, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 4 Towering Flickering Stadium Light Masts
        const towers = [[-78, -56], [78, -56], [-78, -14], [78, -14]];
        for (let i = 0; i < towers.length; i++) {
          const [ox, oy] = towers[i];
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cx + ox, cy + oy);
          ctx.lineTo(cx + ox, cy + oy - 26);
          ctx.stroke();

          const flicker = Math.sin(this.time * 18 + i * 2.1) > -0.3 ? 1 : 0.45;
          ctx.fillStyle = `rgba(254, 240, 138, ${flicker})`;
          ctx.beginPath();
          ctx.arc(cx + ox, cy + oy - 28, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'park': {
        // Holo-Park with glowing fountain plaza & bio-trees
        this.drawDiamond(ctx, cx, cy, hw - 4, hh - 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.38)';
        ctx.strokeStyle = '#34d399';
        ctx.fill();
        ctx.stroke();
        // Central fountain
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 4.5, 0, Math.PI * 2);
        ctx.fill();
        this.drawHoloForest(ctx, tile, cx, cy);
        break;
      }

      case 'scrubber': {
        // Atmospheric Ion Scrubber tower with pulsing clean-air rings
        this.drawIsoBox(
          ctx, cx, cy + 2, 34, 17, 26,
          'rgba(45, 212, 191, 0.85)',
          'rgba(17, 94, 89, 0.9)',
          'rgba(15, 118, 110, 0.88)',
          '#2dd4bf'
        );
        const ringR = 5 + ((this.time * 8) % 10);
        ctx.strokeStyle = `rgba(45, 212, 191, ${1 - (ringR - 5) / 10})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 28, ringR, ringR * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'water_pump': {
        // Water Pumping Station (active when powered AND a water square is within range)
        const isWorking = tile.powered && tile.building.hasWaterSource;
        this.drawIsoBox(
          ctx, cx, cy + 2, 38, 19, 20,
          isWorking ? 'rgba(14, 165, 233, 0.88)' : 'rgba(71, 85, 105, 0.82)',
          isWorking ? 'rgba(12, 74, 110, 0.92)' : 'rgba(30, 41, 59, 0.9)',
          isWorking ? 'rgba(3, 105, 161, 0.9)' : 'rgba(51, 65, 85, 0.88)',
          isWorking ? '#00f5d4' : '#f87171'
        );
        // Cylindrical water tank on roof
        ctx.fillStyle = isWorking ? '#38bdf8' : '#64748b';
        ctx.beginPath();
        ctx.arc(cx, cy - 20, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  // Draw floating warning icons (unpowered lightning bolt, no-water-source icon, no-road icon, or Business Man ownership markers)
  drawStatusIcons(ctx, tile, cx, topY) {
    if (!tile.building) return;
    const b = tile.building;

    if (this.world.playerRole === 'businessman') {
      if (b.isHomeResidence) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - 24, topY - 12, 48, 15);
        ctx.strokeRect(cx - 24, topY - 12, 48, 15);
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🏠 HQ', cx, topY - 1);
        ctx.restore();
        return;
      }
      if (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
        const info = this.world.getBusinessPropertyInfo(tile);
        if (b.ownedByPlayer) {
          const isCorr = b.businessEthics === 'corrupt';
          const col = isCorr ? '#f43f5e' : '#4ade80';
          const netMo = info ? info.netCurrentIncome : 0;
          const sign = netMo >= 0 ? '+' : '';
          const tag = `★ L${b.level} ${sign}$${netMo.toLocaleString()}/mo`;
          ctx.save();
          ctx.fillStyle = 'rgba(10, 20, 38, 0.94)';
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.6;
          ctx.fillRect(cx - 48, topY - 14, 96, 15);
          ctx.strokeRect(cx - 48, topY - 14, 96, 15);
          ctx.fillStyle = col;
          ctx.font = 'bold 8.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(tag, cx, topY - 3);
          ctx.restore();
          return;
        } else if (info && this.zoom >= 0.85) {
          const downK = (info.downPayment / 1000).toFixed(1).replace('.0', '');
          const tag = `$${downK}K DN L${info.scale}`;
          ctx.save();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.1;
          ctx.fillRect(cx - 32, topY - 12, 64, 13);
          ctx.strokeRect(cx - 32, topY - 12, 64, 13);
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(tag, cx, topY - 2.5);
          ctx.restore();
          return;
        }
      }
    }

    if (b.id === 'water_pump' && !b.hasWaterSource && Math.floor(this.time * 3) % 2 === 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('💧 NO WATER IN RANGE!', cx, topY);
      return;
    }

    const util = this.world.getBuildingUtilityStatus(tile);
    const missingPower = util.needsPower && !util.hasPower;
    const missingWater = util.needsWater && !util.hasWater;

    if ((missingPower || missingWater) && Math.floor(this.time * 3) % 2 === 0) {
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      if (missingPower && missingWater) {
        ctx.fillStyle = '#facc15';
        ctx.fillText('⚡💧!', cx, topY);
      } else if (missingPower) {
        ctx.fillStyle = '#facc15';
        ctx.fillText('⚡!', cx, topY);
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('💧!', cx, topY);
      }
    } else if (tile.building.category === 'zones' && !tile.roadAccess && Math.floor(this.time * 2) % 2 === 0) {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO ROAD', cx, topY);
    }
  }

  // Draw overhead catenary wires between adjacent power pylons
  drawPowerWires(ctx) {
    const size = this.world.size;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = this.world.grid[y][x];
        if (!t.building || t.building.id !== 'powerline_above') continue;
        const iso1 = this.gridToIso(x, y);
        const neighbors = [[x + 1, y], [x, y + 1]];
        for (const [nx, ny] of neighbors) {
          const nt = this.world.getTile(nx, ny);
          if (nt && nt.building && (nt.building.id === 'powerline_above' || CONFIG.TOOLS[nt.building.id]?.powerGen)) {
            const iso2 = this.gridToIso(nx, ny);
            ctx.moveTo(iso1.x, iso1.y - 24);
            ctx.lineTo(iso2.x, iso2.y - 24);
          }
        }
      }
    }
    ctx.stroke();
  }

  // Draw Tier-4 3x3 Donut Ring Skybridges & Holographic Nexus Crowns
  drawTier4RingCrowns(ctx) {
    for (const ring of this.world.rings) {
      const centerIso = this.gridToIso(ring.cx, ring.cy);
      if (!this.isVisible(centerIso.x, centerIso.y, 260)) continue;

      const isRes = ring.zoneType === 'res';
      const ringColor = isRes ? '#6ee7b7' : '#e879f9';
      const glowColor = isRes ? 'rgba(110, 231, 183, 0.45)' : 'rgba(232, 121, 249, 0.45)';
      const h = isRes ? 64 : 78;

      // Connect the 8 outer towers with glowing skybridges
      const perimeter = [
        [-1, -1], [0, -1], [1, -1], [1, 0],
        [1, 1], [0, 1], [-1, 1], [-1, 0]
      ];
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let i = 0; i < perimeter.length; i++) {
        const [dx1, dy1] = perimeter[i];
        const [dx2, dy2] = perimeter[(i + 1) % perimeter.length];
        const p1 = this.gridToIso(ring.cx + dx1, ring.cy + dy1);
        const p2 = this.gridToIso(ring.cx + dx2, ring.cy + dy2);
        ctx.moveTo(p1.x, p1.y - h);
        ctx.lineTo(p2.x, p2.y - h);
      }
      ctx.stroke();

      // Floating holographic crown halo over the 3x3 mega-complex
      const pulse = Math.sin(this.time * 3) * 4;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(centerIso.x, centerIso.y - h - 22 + pulse, 48, 24, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        isRes ? '★ TIER-4 GRAND CONDO COMPLEX (2X)' : '★ TIER-4 CENTRAL SKYSCRAPER (2X)',
        centerIso.x,
        centerIso.y - h - 28 + pulse
      );
    }
  }

  // Draw moving vehicles on roads
  drawVehicles(ctx) {
    for (const v of this.entities.vehicles) {
      const iso = this.gridToIso(v.x - 0.5, v.y - 0.5);
      if (!this.isVisible(iso.x, iso.y, 60)) continue;

      // Tail trail
      const tailIso = this.gridToIso(v.x - 0.5 - v.dx * 0.22, v.y - 0.5 - v.dy * 0.22);
      ctx.strokeStyle = v.trail;
      ctx.lineWidth = v.size;
      ctx.beginPath();
      ctx.moveTo(tailIso.x, tailIso.y - 2);
      ctx.lineTo(iso.x, iso.y - 2);
      ctx.stroke();

      // Vehicle body
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.arc(iso.x, iso.y - 2, v.size * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw elevated commuter trains
  drawTrains(ctx) {
    for (const tr of this.entities.trains) {
      const head = this.gridToIso(tr.x - 0.5, tr.y - 0.5);
      const tail = this.gridToIso(tr.x - 0.5 - tr.dx * 0.55, tr.y - 0.5 - tr.dy * 0.55);
      if (!this.isVisible(head.x, head.y, 80)) continue;

      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y - 19);
      ctx.lineTo(head.x, head.y - 19);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(head.x, head.y - 19, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw river boats
  drawBoats(ctx) {
    for (const b of this.entities.boats) {
      const iso = this.gridToIso(b.x - 0.5, b.y - 0.5);
      if (!this.isVisible(iso.x, iso.y, 60)) continue;

      // Wake V-trail
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(iso.x, iso.y);
      ctx.lineTo(iso.x - 6, iso.y - b.dy * 5);
      ctx.moveTo(iso.x, iso.y);
      ctx.lineTo(iso.x + 6, iso.y - b.dy * 5);
      ctx.stroke();

      // Boat hull
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(iso.x, iso.y - 1, 4.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw tiny pedestrians walking on sidewalks
  drawPedestrians(ctx) {
    for (const p of this.entities.pedestrians) {
      const edge = Math.floor(p.progress);
      const frac = p.progress - edge;
      let ox = 0;
      let oy = 0;
      const r = 0.42;
      if (edge === 0) { ox = -r + frac * 2 * r; oy = -r; }
      else if (edge === 1) { ox = r; oy = -r + frac * 2 * r; }
      else if (edge === 2) { ox = r - frac * 2 * r; oy = r; }
      else { ox = -r; oy = r - frac * 2 * r; }

      const iso = this.gridToIso(p.tileX + ox, p.tileY + oy);
      if (!this.isVisible(iso.x, iso.y, 40)) continue;

      ctx.fillStyle = p.color;
      ctx.fillRect(iso.x - 1, iso.y - 3, 2, 3);
    }
  }

  // Draw rising smoke & cooling tower vapor particles
  drawParticles(ctx) {
    for (const pt of this.entities.particles) {
      const iso = this.gridToIso(pt.x, pt.y);
      if (!this.isVisible(iso.x, iso.y, 80)) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.alpha);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(iso.x, iso.y - pt.z, pt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw hover tile outline, drag preview, and radial effect circle
  drawToolPreview(ctx, hw, hh) {
    if (!this.hoverTile) return;
    const { x, y } = this.hoverTile;
    const tile = this.world.getTile(x, y);
    if (!tile) return;

    const iso = this.gridToIso(x, y);
    const tool = this.activeTool ? CONFIG.TOOLS[this.activeTool] : null;

    // Draw radius preview if tool has an effect radius
    if (tool && tool.radius) {
      ctx.save();
      ctx.strokeStyle = tool.stroke || '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.ellipse(
        iso.x,
        iso.y,
        tool.radius * hw,
        tool.radius * hh,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    // Draw drag path tiles if dragging roads/zones/powerlines, or full 2x2 footprint for 2x2 buildings
    let previewTiles = this.dragPath.length > 0 ? this.dragPath : [{ x, y }];
    if (tool && (tool.size || 1) > 1 && this.dragPath.length === 0) {
      previewTiles = [];
      for (let dy = 0; dy < tool.size; dy++) {
        for (let dx = 0; dx < tool.size; dx++) {
          previewTiles.push({ x: x + dx, y: y + dy });
        }
      }
    }
    for (const pt of previewTiles) {
      const pIso = this.gridToIso(pt.x, pt.y);
      this.drawDiamond(ctx, pIso.x, pIso.y, hw, hh);
      ctx.fillStyle = tool ? `${tool.color}55` : 'rgba(56, 189, 248, 0.25)';
      ctx.strokeStyle = tool ? tool.stroke : '#00f5d4';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Render Corner Minimap
  renderMinimap() {
    const mCtx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    const size = this.world.size;
    const cellW = W / size;
    const cellH = H / size;

    mCtx.fillStyle = '#030814';
    mCtx.fillRect(0, 0, W, H);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = this.world.grid[y][x];
        let col = '#071b24';
        if (t.terrain === 'river' || t.terrain === 'lake') col = '#0284c7';
        else if (t.terrain === 'forest') col = '#064e3b';

        if (t.building) {
          const b = t.building;
          if (b.ownedByPlayer) {
            col = b.businessEthics === 'corrupt' ? '#f43f5e' : '#10b981';
          } else if (b.isHomeResidence && this.world.playerRole === 'businessman') {
            col = '#facc15';
          } else if (this.world.hasRail(t)) {
            col = '#a855f7'; // Purple for raised rail on the minimap
          } else if (b.category === 'roads') col = '#94a3b8';
          else if (b.category === 'zones') {
            if (b.zoneType === 'res') col = b.level === 4 ? '#fef08a' : '#4ade80';
            else if (b.zoneType === 'comm') col = b.level === 4 ? '#f0abfc' : '#38bdf8';
            else col = '#fbbf24';
          } else if (b.category === 'power') col = '#facc15';
          else col = '#e879f9';
        } else if (this.world.hasRail(t)) {
          col = '#a855f7';
        }
        mCtx.fillStyle = col;
        mCtx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    // Draw camera viewport indicator on minimap
    const centerGrid = this.screenToGrid(this.canvas.width * 0.5, this.canvas.height * 0.5);
    const vx = Math.max(0, Math.min(W - 16, centerGrid.x * cellW - 12));
    const vy = Math.max(0, Math.min(H - 16, centerGrid.y * cellH - 12));
    mCtx.strokeStyle = '#00f5d4';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(vx, vy, 24, 24);

    // Draw Mayor's #38bdf8 glowing blue dot on the City Hall region minimap as well
    if (window.streetView && typeof window.streetView.getMayorGridPos === 'function') {
      const mPos = window.streetView.getMayorGridPos();
      const mx = (mPos.x + 0.5) * cellW;
      const my = (mPos.y + 0.5) * cellH;
      mCtx.save();
      mCtx.shadowColor = '#38bdf8';
      mCtx.shadowBlur = 8;
      mCtx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      mCtx.strokeStyle = '#38bdf8';
      mCtx.lineWidth = 1.4;
      mCtx.beginPath();
      mCtx.arc(mx, my, 4.8, 0, Math.PI * 2);
      mCtx.fill();
      mCtx.stroke();
      mCtx.fillStyle = '#38bdf8';
      mCtx.beginPath();
      mCtx.arc(mx, my, 2.6, 0, Math.PI * 2);
      mCtx.fill();
      mCtx.restore();
    }
  }
}

window.IsoRenderer = IsoRenderer;
