// Main Game Loop & Dual-Mode Initialization with Preloaded Sprites
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const minimapCanvas = document.getElementById('minimap-canvas');

  // Load comic-style PNG sprites first
  loadGameSprites(() => {
    const world = new CityWorld(CONFIG.GRID_SIZE);
    world.loadShowcaseMetropolis();

    const entities = new EntityManager(world);
    const renderer = new IsoRenderer(canvas, minimapCanvas, world, entities);
    renderer.centerCameraOn(22, 22);

    let ui = null;
    const streetView = new StreetExplorationView(canvas, world, () => {
      if (ui) {
        if (world.playerRole === 'mayor') {
          streetView.indoorMayorX = 0.62;
          ui.setGameMode('indoor');
        } else {
          ui.setGameMode('map');
        }
      }
    });
    window.streetView = streetView;

    ui = new GameUI(world, entities, renderer, streetView);

    // Optional URL params for live preview testing (?autostreet=1&camX=260)
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostreet') === '1') {
      document.getElementById('start-menu-overlay')?.classList.add('hidden');
      ui.setGameMode('street');
      if (params.has('camX')) {
        const cx = Number(params.get('camX')) || 0;
        streetView.mayorX = cx;
        streetView.cameraX = cx;
      }
    }

    let lastTime = performance.now();
    let simAccumulator = 0;

    function gameLoop(now) {
      requestAnimationFrame(gameLoop);

      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      try {
        if (world.speed > 0) {
          const baseStepInterval = 1.35;
          simAccumulator += dt * world.speed;
          while (simAccumulator >= baseStepInterval) {
            simAccumulator -= baseStepInterval;
            world.stepSimulation();
            ui.updateHUD();
            if (renderer.selectedTile && ui.mode === 'map') {
              const st = world.getTile(renderer.selectedTile.x, renderer.selectedTile.y);
              if (st) ui.updateInspector(st);
            }
            if (world.pendingOddYearAdvisorPrompt) {
              world.pendingOddYearAdvisorPrompt = false;
              simAccumulator = 0;
              ui.handleOddYearAdvisorPrompt();
              break;
            }
            if (world.pendingElectionResult) {
              const electionRes = world.pendingElectionResult;
              world.pendingElectionResult = null;
              simAccumulator = 0;
              ui.openElectionResultModal(electionRes);
              break;
            }
          }
        }

        if (ui.mode === 'street' || ui.mode === 'indoor') {
          streetView.update(dt);
          streetView.render();
        } else {
          entities.update(dt, world.speed);
          renderer.render(dt);
        }
      } catch (err) {
        console.error('Game loop error:', err);
      }
    }

    requestAnimationFrame(gameLoop);
  });
});