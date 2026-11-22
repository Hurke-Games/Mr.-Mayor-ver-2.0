// UI Controller, Mode Switcher (City Hall 2D Map <-> Street Exploration), Save/Load Manager (3 Slots), HUD & Controls
class GameUI {
  constructor(world, entities, renderer, streetView) {
    this.world = world;
    this.entities = entities;
    this.renderer = renderer;
    this.streetView = streetView;

    this.mode = 'street'; // 'street' (2D side-scrolling exploration) or 'map' (2D isometric City Hall planning map)
    this.activeCategory = 'zones';
    this.activeTool = 'zone_res';
    this.renderer.activeTool = this.activeTool;

    this.isPanning = false;
    this.isDrawing = false;
    this.panStart = { x: 0, y: 0 };
    this.camStart = { x: 0, y: 0 };
    this.dragStartGrid = null;

    this.streetView.onOpenCityMap = () => {
      this.setGameMode('map');
    };
    this.streetView.onExitToStreet = () => {
      this.streetView.syncFromCityHall();
      this.setGameMode('street');
    };

    this.bindStartMenu();
    this.bindHUD();
    this.bindStreetHUD();
    this.bindCanvasEvents();
    this.renderToolbarCategories();
    this.renderToolButtons();
    this.renderOverlayBar();
    this.setGameMode('street');
    this.updateHUD();
  }

  setGameMode(mode) {
    this.mode = mode;
    const isStreet = mode === 'street';
    const isIndoor = mode === 'indoor';
    const isBM = this.world.playerRole === 'businessman';
    this.streetView.active = isStreet || isIndoor;
    this.streetView.indoorLocation = isIndoor ? 'mayor_office' : null;

    const streetLayer = document.getElementById('street-hud-layer');
    const mapLayer = document.getElementById('city-map-hud-layer');
    const streetMinimapCard = document.getElementById('street-minimap-card');
    const streetToolsDock = document.getElementById('street-tools-dock');
    const btnStreetLight = document.getElementById('btn-street-lighting');
    const btnIndoorExitStreet = document.getElementById('btn-indoor-exit-street');
    const btnStreetEnterHall = document.getElementById('btn-street-enter-hall');
    const streetControlsHint = document.querySelector('#street-top-left-bar .street-controls-hint');
    const bottomDock = document.getElementById('bottom-dock');
    const mayorFiscalCard = document.getElementById('mayor-fiscal-card');
    const bmMapCard = document.getElementById('business-map-summary-card');
    const btnExitHall = document.getElementById('btn-exit-city-hall');
    const mayorTopStats = document.getElementById('mayor-top-hud-stats');
    const bmTopStats = document.getElementById('bm-top-hud-stats');
    const mayorTopPower = document.getElementById('mayor-top-hud-power');
    const mayorTopWater = document.getElementById('mayor-top-hud-water');
    const mayorRciCard = document.getElementById('mayor-rci-card');
    const hoverPopup = document.getElementById('hover-square-popup');
    if (hoverPopup) hoverPopup.classList.add('hidden');

    if (isIndoor) {
      streetLayer.classList.remove('hidden');
      mapLayer.classList.add('hidden');
      if (streetMinimapCard) streetMinimapCard.classList.add('hidden');
      if (streetToolsDock) streetToolsDock.classList.add('hidden');
      if (btnStreetLight) btnStreetLight.classList.add('hidden');
      if (btnIndoorExitStreet) btnIndoorExitStreet.classList.remove('hidden');
      if (btnStreetEnterHall) btnStreetEnterHall.classList.add('hidden');
      if (streetControlsHint) {
        streetControlsHint.innerHTML = `
          <span><strong>[A / D]</strong> Run Across Office</span>
          <span><strong>[Click Left Wall Map]</strong> City Map Option</span>
          <span><strong>[Click Man on Right]</strong> Election Details</span>
          <span><strong>[Click Right Door]</strong> Exit to Street</span>
        `;
      }
      this.streetView.mayorFrame = 'L';
      this.streetView.mayorLastDir = 'L';
      this.streetView.mayorWalkIndex = 0;
      this.streetView.mayorAnimTimer = 0;
      this.streetView.mayorTransitionQueue = [];
      this.streetView.prevMoveDir = 0;
      this.streetView.idleTime = 1.0;
      this.streetView.keys.left = false;
      this.streetView.keys.right = false;
      this.streetView.updateStreetHUD();
    } else if (isStreet) {
      streetLayer.classList.remove('hidden');
      mapLayer.classList.add('hidden');
      if (streetMinimapCard) streetMinimapCard.classList.remove('hidden');
      if (streetToolsDock) streetToolsDock.classList.remove('hidden');
      if (btnStreetLight) btnStreetLight.classList.remove('hidden');
      if (btnIndoorExitStreet) btnIndoorExitStreet.classList.add('hidden');
      if (btnStreetEnterHall) btnStreetEnterHall.classList.remove('hidden');
      if (streetControlsHint) {
        streetControlsHint.innerHTML = `
          <span><strong>[A / D]</strong> Walk Street</span>
          <span><strong>[W / S / Click]</strong> Cross at Crosswalk</span>
          <span><strong>[E]</strong> Enter Building</span>
          <span><strong>[Q / R]</strong> Turn 90° Corner</span>
        `;
      }
      this.streetView.mayorFrame = 'R';
      this.streetView.mayorLastDir = 'R';
      this.streetView.mayorWalkIndex = 0;
      this.streetView.mayorAnimTimer = 0;
      this.streetView.mayorTransitionQueue = [];
      this.streetView.prevMoveDir = 0;
      this.streetView.idleTime = 1.0;
      this.streetView.keys.left = false;
      this.streetView.keys.right = false;
      this.streetView.rebuildStreetCorridor();
      this.streetView.updateStreetHUD();
    } else {
      streetLayer.classList.add('hidden');
      mapLayer.classList.remove('hidden');
      if (isBM) {
        if (bottomDock) bottomDock.classList.add('hidden');
        if (mayorFiscalCard) mayorFiscalCard.classList.add('hidden');
        if (mayorTopStats) mayorTopStats.classList.add('hidden');
        if (mayorTopPower) mayorTopPower.classList.add('hidden');
        if (mayorTopWater) mayorTopWater.classList.add('hidden');
        if (mayorRciCard) mayorRciCard.classList.add('hidden');
        if (bmTopStats) bmTopStats.classList.remove('hidden');
        if (bmMapCard) bmMapCard.classList.remove('hidden');
        if (btnExitHall) btnExitHall.textContent = '🚶 RETURN TO STREET';
        this.renderer.activeTool = null;
        const validBmIds = (CONFIG.BUSINESS_OVERLAYS || []).map(o => o.id);
        if (!validBmIds.includes(this.renderer.activeOverlay)) {
          this.renderer.activeOverlay = 'none';
        }
      } else {
        if (bottomDock) bottomDock.classList.remove('hidden');
        if (mayorFiscalCard) mayorFiscalCard.classList.remove('hidden');
        if (mayorTopStats) mayorTopStats.classList.remove('hidden');
        if (mayorTopPower) mayorTopPower.classList.remove('hidden');
        if (mayorTopWater) mayorTopWater.classList.remove('hidden');
        if (mayorRciCard) mayorRciCard.classList.remove('hidden');
        if (bmTopStats) bmTopStats.classList.add('hidden');
        if (bmMapCard) bmMapCard.classList.add('hidden');
        if (btnExitHall) btnExitHall.textContent = "🏛 MAYOR'S OFFICE";
        this.renderer.activeTool = this.activeTool;
        const validMayorIds = (CONFIG.OVERLAYS || []).map(o => o.id);
        if (!validMayorIds.includes(this.renderer.activeOverlay)) {
          this.renderer.activeOverlay = 'none';
        }
      }
      this.renderOverlayBar();
      this.updateHUD();
    }
  }

  bindStreetHUD() {
    // Moonwalk Mode Checkbox (inverts walking animation direction)
    const chkMoonwalk = document.getElementById('chk-moonwalk');
    if (chkMoonwalk) {
      chkMoonwalk.addEventListener('change', () => {
        if (window.cyberAudio) window.cyberAudio.playClick();
        this.streetView.moonwalkMode = chkMoonwalk.checked;
        chkMoonwalk.blur();
      });
    }

    // Toggle Deep Blue (Image 1) vs Ice-Blue Daylight (Image 2)
    const btnLight = document.getElementById('btn-street-lighting');
    if (btnLight) {
      btnLight.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.streetView.daylightMode = !this.streetView.daylightMode;
      });
    }

    // Business Man Portfolio HQ button in Street HUD
    const btnHomeHq = document.getElementById('btn-street-home-hq');
    if (btnHomeHq) {
      btnHomeHq.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.streetView.openPortfolioModal();
      });
    }

    // Enter City Hall (Mayor's Office for Mayor / Ownership Map for Business Man)
    const btnHall = document.getElementById('btn-street-enter-hall');
    if (btnHall) {
      btnHall.addEventListener('click', () => {
        window.cyberAudio.playUpgrade();
        if (this.world.playerRole === 'mayor') {
          this.streetView.indoorMayorX = 0.62;
          this.setGameMode('indoor');
        } else {
          this.setGameMode('map');
        }
      });
    }

    // Step Out of Indoor Mayor's Office to Street View
    const btnIndoorExitStreet = document.getElementById('btn-indoor-exit-street');
    if (btnIndoorExitStreet) {
      btnIndoorExitStreet.addEventListener('click', () => {
        window.cyberAudio.playUpgrade();
        this.streetView.syncFromCityHall();
        this.setGameMode('street');
      });
    }

    // Left Wall Map Option Modal buttons inside Mayor's Office
    const btnWallMapToCityMap = document.getElementById('btn-wall-map-open-city-map');
    if (btnWallMapToCityMap) {
      btnWallMapToCityMap.addEventListener('click', () => {
        window.cyberAudio.playUpgrade();
        document.getElementById('indoor-wall-map-modal')?.classList.add('hidden');
        this.setGameMode('map');
      });
    }

    const btnCloseWallMap = document.getElementById('btn-close-wall-map-modal');
    if (btnCloseWallMap) {
      btnCloseWallMap.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('indoor-wall-map-modal')?.classList.add('hidden');
      });
    }

    // Right Advisor Election Details Modal close button
    const btnCloseElection = document.getElementById('btn-close-election-modal');
    if (btnCloseElection) {
      btnCloseElection.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('election-details-modal')?.classList.add('hidden');
        if (this.world.speed === 0) {
          this.world.speed = 1;
          this.syncSpeedButtons();
        }
        this.updateHUD();
      });
    }

    // Exit City Map (for Mayor: goes into Indoor Mayor's Office; for Business Man: returns to Street)
    const btnExitHall = document.getElementById('btn-exit-city-hall');
    if (btnExitHall) {
      btnExitHall.addEventListener('click', () => {
        window.cyberAudio.playUpgrade();
        if (this.world.playerRole === 'mayor') {
          this.streetView.indoorMayorX = 0.22;
          this.setGameMode('indoor');
        } else {
          this.setGameMode('street');
        }
      });
    }

    // Portfolio Modal buttons
    const btnClosePort = document.getElementById('btn-close-portfolio');
    if (btnClosePort) {
      btnClosePort.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('business-portfolio-modal')?.classList.add('hidden');
      });
    }

    const btnCloseBmPopup = document.getElementById('btn-close-bm-popup');
    if (btnCloseBmPopup) {
      btnCloseBmPopup.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('bm-property-popup')?.classList.add('hidden');
        document.getElementById('bm-choice-hover-popup')?.classList.add('hidden');
      });
    }

    const btnPortToMap = document.getElementById('btn-portfolio-to-map');
    if (btnPortToMap) {
      btnPortToMap.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('business-portfolio-modal')?.classList.add('hidden');
        this.setGameMode('map');
      });
    }

    const btnBmMapPort = document.getElementById('btn-bm-open-portfolio-map');
    if (btnBmMapPort) {
      btnBmMapPort.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.streetView.openPortfolioModal();
      });
    }

    const chkMapRunMayor = document.getElementById('chk-map-run-for-mayor');
    if (chkMapRunMayor) {
      chkMapRunMayor.addEventListener('change', () => {
        window.cyberAudio.playClick();
        this.world.playerRunningForMayor = chkMapRunMayor.checked;
        this.updateHUD();
      });
    }

    // Bottom-Right Street Holographic Tools: Hammer, Road (90° Turn), Wrench (City Map)
    const btnHammer = document.getElementById('btn-street-hammer');
    if (btnHammer) {
      btnHammer.addEventListener('click', () => {
        // Quick-build or upgrade the lot in front of Mayor Charles!
        const slotIndex = Math.round(this.streetView.mayorX / this.streetView.slotWidth);
        const slot = this.streetView.slots.find(s => s.slotIndex === slotIndex);
        if (slot) {
          if (!slot.building) {
            const res = this.world.placeTool(slot.gridX, slot.gridY, 'zone_comm');
            if (res.ok) {
              const t = this.world.getTile(slot.gridX, slot.gridY);
              if (t && t.building) {
                t.building.construction = 0;
                t.building.level = 1;
                t.building.maxPop = CONFIG.ZONE_LEVELS.comm[1].maxPop;
                t.building.pop = t.building.maxPop;
              }
              this.world.recalculateAll();
              this.streetView.rebuildStreetCorridor();
              window.cyberAudio.playPlace();
            } else {
              window.cyberAudio.playError();
            }
          } else if (slot.building.category === 'zones' && slot.building.level < 3) {
            slot.building.level++;
            const zDef = CONFIG.ZONE_LEVELS[slot.building.zoneType][slot.building.level];
            slot.building.maxPop = zDef.maxPop;
            slot.building.pop = zDef.maxPop;
            this.world.recalculateAll();
            this.streetView.rebuildStreetCorridor();
            window.cyberAudio.playUpgrade();
          } else {
            this.setGameMode('map');
          }
        }
      });
    }

    const btnRoad = document.getElementById('btn-street-road');
    if (btnRoad) {
      btnRoad.addEventListener('click', () => {
        this.streetView.trigger90DegreeRotation(1);
      });
    }

    const btnWrench = document.getElementById('btn-street-wrench');
    if (btnWrench) {
      btnWrench.addEventListener('click', () => {
        window.cyberAudio.playClick();
        if (this.world.playerRole === 'mayor') {
          this.streetView.indoorMayorX = 0.62;
          this.setGameMode('indoor');
        } else {
          this.setGameMode('map');
        }
      });
    }

    // Interior Modal buttons
    const btnCloseInt = document.getElementById('btn-close-interior');
    if (btnCloseInt) {
      btnCloseInt.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('street-interior-modal').classList.add('hidden');
      });
    }

    const btnIntMap = document.getElementById('btn-interior-to-map');
    if (btnIntMap) {
      btnIntMap.addEventListener('click', () => {
        window.cyberAudio.playClick();
        document.getElementById('street-interior-modal').classList.add('hidden');
        this.setGameMode('map');
      });
    }
  }

  // ==================== START MENU & SAVE SLOTS ====================
  bindStartMenu() {
    const startModal = document.getElementById('start-menu-overlay');
    const inputMayorName = document.getElementById('input-mayor-name');
    const inputBmName = document.getElementById('input-businessman-name');
    const selectAiMayor = document.getElementById('select-ai-mayor-type');
    const startMenuTitle = document.getElementById('start-menu-title');
    const btnStartStreetShowcase = document.getElementById('btn-start-street-showcase');
    const btnStartNew = document.getElementById('btn-start-new');
    const btnStartShowcase = document.getElementById('btn-start-showcase');
    const btnStartBmShowcase = document.getElementById('btn-start-bm-showcase');
    const btnStartBmNew = document.getElementById('btn-start-bm-new');
    const btnOpenLoad = document.getElementById('btn-open-load');
    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    const btnScenarios = document.getElementById('btn-scenarios');
    const btnHudMenu = document.getElementById('btn-hud-menu');
    const btnHudSave = document.getElementById('btn-hud-save');

    // Left Role Tabs (Mayor, Business Man, Police Chief, Journalist)
    document.querySelectorAll('.role-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        if (window.cyberAudio) window.cyberAudio.playClick();
        const roleTab = tabBtn.getAttribute('data-role-tab');
        document.querySelectorAll('.role-tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        document.querySelectorAll('.role-tab-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById(`role-panel-${roleTab}`);
        if (panel) panel.classList.remove('hidden');
      });
    });

    const applyMayorName = () => {
      const rawName = inputMayorName ? inputMayorName.value.trim() : '';
      const name = rawName || 'Charles';
      this.world.mayorName = name;
      if (startMenuTitle) startMenuTitle.textContent = `MAYOR ${name.toUpperCase()}`;
      const streetMayorName = document.getElementById('street-mayor-name');
      if (streetMayorName && this.world.playerRole === 'mayor') {
        streetMayorName.textContent = `Mayor ${name}:`;
      }
    };

    const applyBusinessmanSetup = () => {
      const rawBm = inputBmName ? inputBmName.value.trim() : '';
      this.world.businessmanName = rawBm || 'Vance';
      this.world.aiMayorAlignment = selectAiMayor ? selectAiMayor.value : 'good';
      this.world.mayorName = (inputMayorName && inputMayorName.value.trim()) ? inputMayorName.value.trim() : 'Charles';
    };

    if (inputMayorName) {
      inputMayorName.addEventListener('input', applyMayorName);
      inputMayorName.addEventListener('change', applyMayorName);
    }

    const updateSoundBtnText = () => {
      const on = window.cyberAudio.enabled;
      btnSoundToggle.textContent = `SOUND SYNTH: ${on ? 'ONLINE [ON]' : 'MUTED [OFF]'}`;
      btnSoundToggle.classList.toggle('active-neon', on);
      const hudSound = document.getElementById('btn-hud-sound');
      if (hudSound) hudSound.textContent = on ? '🔊' : '🔇';
    };
    updateSoundBtnText();

    // Walk the Streets of Metrovale immediately as Mayor!
    if (btnStartStreetShowcase) {
      btnStartStreetShowcase.addEventListener('click', () => {
        applyMayorName();
        this.world.playerRole = 'mayor';
        this.world.resetCampaignState();
        window.cyberAudio.playUpgrade();
        window.cyberAudio.startAmbient();
        this.world.loadShowcaseMetropolis();
        this.entities.reset();
        this.streetView.syncFromCityHall();
        this.setGameMode('street');
        startModal.classList.add('hidden');
      });
    }

    // Start New City as Mayor ($5,000 Starting Cash)
    btnStartNew.addEventListener('click', () => {
      applyMayorName();
      this.world.playerRole = 'mayor';
      this.world.resetCampaignState();
      window.cyberAudio.playClick();
      window.cyberAudio.startAmbient();
      this.world.initGrid();
      this.world.generateTerrain();
      this.world.placeStarterCityHall();
      this.world.money = CONFIG.STARTING_CASH;
      this.world.taxRate = CONFIG.DEFAULT_TAX_RATE;
      this.world.cityName = 'METROVALE';
      this.world.year = 2088;
      this.world.month = 1;
      this.world.day = 1;
      this.world.rings = [];
      this.world.recalculateAll();
      this.entities.reset();
      this.renderer.centerCameraOn(22, 24);
      this.streetView.syncFromCityHall();
      this.setGameMode('map');
      startModal.classList.add('hidden');
      this.world.addAlert(`Welcome Mayor ${this.world.mayorName}! Starting cash: $5,000. Click "MAYOR'S OFFICE" anytime to visit your office or walk the streets!`, 'info');
      this.updateHUD();
    });

    // Launch Thriving Showcase Metropolis in 2D Map Mode as Mayor
    btnStartShowcase.addEventListener('click', () => {
      applyMayorName();
      this.world.playerRole = 'mayor';
      this.world.resetCampaignState();
      window.cyberAudio.playUpgrade();
      window.cyberAudio.startAmbient();
      this.world.loadShowcaseMetropolis();
      this.entities.reset();
      this.renderer.centerCameraOn(22, 22);
      this.streetView.syncFromCityHall();
      this.setGameMode('map');
      startModal.classList.add('hidden');
      this.world.addAlert('METROPOLIS LOADED: Click "🏛 MAYOR\'S OFFICE" in the top bar to visit your office or walk the streets!', 'combo');
      this.updateHUD();
    });

    // Start as Business Man (Vance) in Showcase Metropolis (Starts at Home Residence with $20,000)
    if (btnStartBmShowcase) {
      btnStartBmShowcase.addEventListener('click', () => {
        this.world.resetCampaignState();
        this.world.loadShowcaseMetropolis();
        applyBusinessmanSetup();
        this.world.playerRole = 'businessman';
        this.world.businessMoney = CONFIG.BUSINESS_STARTING_CASH || 20000;
        this.world.recalculateAll();
        this.entities.reset();
        this.streetView.syncFromHomeResidence();
        this.setGameMode('street');
        window.cyberAudio.playUpgrade();
        window.cyberAudio.startAmbient();
        startModal.classList.add('hidden');
        this.world.addAlert(
          `Welcome Executive ${this.world.businessmanName}! You start outside your Residence HQ with $${this.world.businessMoney.toLocaleString()}. Walk to Commercial & Industrial zones and press [E] to buy them!`,
          'combo'
        );
        this.updateHUD();
      });
    }

    // Start as Business Man (Vance) in Developing AI Mayor City
    if (btnStartBmNew) {
      btnStartBmNew.addEventListener('click', () => {
        this.world.resetCampaignState();
        this.world.initGrid();
        this.world.generateTerrain();
        this.world.placeStarterCityHall();
        applyBusinessmanSetup();
        this.world.playerRole = 'businessman';
        this.world.money = 12000;
        this.world.businessMoney = CONFIG.BUSINESS_STARTING_CASH || 20000;
        this.world.taxRate = CONFIG.DEFAULT_TAX_RATE;
        this.world.cityName = 'METROVALE';
        this.world.year = 2088;
        this.world.month = 1;
        this.world.day = 1;
        this.world.rings = [];
        this.world.stepAIMayor();
        this.world.recalculateAll();
        this.entities.reset();
        this.streetView.syncFromHomeResidence();
        this.setGameMode('street');
        window.cyberAudio.playUpgrade();
        window.cyberAudio.startAmbient();
        startModal.classList.add('hidden');
        this.world.addAlert(
          `Executive ${this.world.businessmanName} deployed! AI Mayor ${this.world.mayorName} (${this.world.aiMayorAlignment.toUpperCase()}) is actively building the city.`,
          'info'
        );
        this.updateHUD();
      });
    }

    btnOpenLoad.addEventListener('click', () => {
      window.cyberAudio.playClick();
      this.openSaveLoadModal('load');
    });

    btnHudSave.addEventListener('click', () => {
      window.cyberAudio.playClick();
      this.openSaveLoadModal('save');
    });

    btnHudMenu.addEventListener('click', () => {
      window.cyberAudio.playClick();
      startModal.classList.remove('hidden');
    });

    btnSoundToggle.addEventListener('click', () => {
      window.cyberAudio.toggle();
      updateSoundBtnText();
    });

    const hudSound = document.getElementById('btn-hud-sound');
    if (hudSound) {
      hudSound.addEventListener('click', () => {
        window.cyberAudio.toggle();
        updateSoundBtnText();
      });
    }

    btnScenarios.addEventListener('click', () => {
      window.cyberAudio.playClick();
      document.getElementById('scenario-modal').classList.remove('hidden');
    });

    document.getElementById('btn-close-scenario').addEventListener('click', () => {
      window.cyberAudio.playClick();
      document.getElementById('scenario-modal').classList.add('hidden');
    });

    document.getElementById('btn-close-saveload').addEventListener('click', () => {
      window.cyberAudio.playClick();
      document.getElementById('saveload-modal').classList.add('hidden');
    });
  }

  openSaveLoadModal(mode = 'load') {
    const modal = document.getElementById('saveload-modal');
    const title = document.getElementById('saveload-title');
    const container = document.getElementById('save-slots-container');
    title.textContent = mode === 'save' ? 'SAVE METROPOLIS MATRIX (3 SLOTS)' : 'LOAD METROPOLIS MATRIX (3 SLOTS)';
    container.innerHTML = '';

    for (let slot = 1; slot <= 3; slot++) {
      const key = `cybercity_save_slot_${slot}`;
      let savedData = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) savedData = JSON.parse(raw);
      } catch (e) {}

      const card = document.createElement('div');
      card.className = 'save-slot-card';

      if (savedData) {
        card.innerHTML = `
          <div class="slot-info">
            <div class="slot-header">SLOT 0${slot} // ${savedData.cityName}</div>
            <div class="slot-meta">
              <span>POP: ${Number(savedData.population || 0).toLocaleString()}</span>
              <span>FUNDS: $${Number(savedData.money || 0).toLocaleString()}</span>
              <span>DATE: ${savedData.year}.${String(savedData.month).padStart(2, '0')}</span>
            </div>
            <div class="slot-time">Saved: ${savedData.savedAt || 'Unknown'}</div>
          </div>
          <div class="slot-actions">
            ${mode === 'save' ? `<button class="cyber-btn small" data-action="save" data-slot="${slot}">OVERWRITE</button>` : ''}
            <button class="cyber-btn small primary" data-action="load" data-slot="${slot}">LOAD</button>
            <button class="cyber-btn small danger" data-action="delete" data-slot="${slot}">✕</button>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="slot-info">
            <div class="slot-header">SLOT 0${slot} // [EMPTY MEMORY BANK]</div>
            <div class="slot-meta">No city data recorded in this slot.</div>
          </div>
          <div class="slot-actions">
            ${mode === 'save'
              ? `<button class="cyber-btn small primary" data-action="save" data-slot="${slot}">SAVE HERE</button>`
              : `<span class="slot-empty-tag">EMPTY</span>`}
          </div>
        `;
      }

      container.appendChild(card);
    }

    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-action');
        const slot = btn.getAttribute('data-slot');
        const key = `cybercity_save_slot_${slot}`;

        if (act === 'save') {
          const payload = this.world.serialize();
          localStorage.setItem(key, JSON.stringify(payload));
          window.cyberAudio.playUpgrade();
          this.world.addAlert(`City saved to Memory Slot 0${slot}.`, 'info');
          this.openSaveLoadModal(mode);
        } else if (act === 'load') {
          const raw = localStorage.getItem(key);
          if (raw) {
            const data = JSON.parse(raw);
            this.world.deserialize(data);
            const inputMayorName = document.getElementById('input-mayor-name');
            if (inputMayorName) inputMayorName.value = this.world.mayorName || 'Charles';
            const startMenuTitle = document.getElementById('start-menu-title');
            if (startMenuTitle) startMenuTitle.textContent = `MAYOR ${(this.world.mayorName || 'Charles').toUpperCase()}`;
            this.entities.reset();
            this.streetView.syncFromCityHall();
            window.cyberAudio.playUpgrade();
            window.cyberAudio.startAmbient();
            modal.classList.add('hidden');
            document.getElementById('start-menu-overlay').classList.add('hidden');
            this.world.addAlert(`Loaded ${this.world.cityName} from Slot 0${slot}.`, 'info');
            this.updateHUD();
          }
        } else if (act === 'delete') {
          localStorage.removeItem(key);
          window.cyberAudio.playDemolish();
          this.openSaveLoadModal(mode);
        }
      });
    });

    modal.classList.remove('hidden');
  }

  // ==================== HUD, SPEED & TAX CONTROLS ====================
  bindHUD() {
    const nameEl = document.getElementById('hud-city-name');
    nameEl.addEventListener('change', () => {
      this.world.cityName = nameEl.value.trim() || 'METROVALE';
    });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.cyberAudio.playClick();
        const spd = Number(btn.getAttribute('data-speed'));
        this.world.speed = spd;
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const taxSlider = document.getElementById('tax-slider');
    const taxVal = document.getElementById('tax-rate-val');
    taxSlider.addEventListener('input', () => {
      this.world.taxRate = Number(taxSlider.value);
      taxVal.textContent = `${this.world.taxRate}%`;
      this.world.recalculateAll();
      this.updateHUD();
    });

    const commSubSlider = document.getElementById('comm-subsidy-slider');
    const commSubVal = document.getElementById('comm-subsidy-val');
    if (commSubSlider) {
      commSubSlider.addEventListener('input', () => {
        this.world.commSubsidy = Number(commSubSlider.value);
        if (commSubVal) commSubVal.textContent = `${this.world.commSubsidy}%`;
        this.world.recalculateAll();
        this.updateHUD();
      });
    }

    const indSubSlider = document.getElementById('ind-subsidy-slider');
    const indSubVal = document.getElementById('ind-subsidy-val');
    if (indSubSlider) {
      indSubSlider.addEventListener('input', () => {
        this.world.indSubsidy = Number(indSubSlider.value);
        if (indSubVal) indSubVal.textContent = `${this.world.indSubsidy}%`;
        this.world.recalculateAll();
        this.updateHUD();
      });
    }

    const topWaterBtn = document.getElementById('mayor-top-hud-water');
    if (topWaterBtn) {
      topWaterBtn.style.cursor = 'pointer';
      topWaterBtn.title = 'Click to toggle Water View overlay';
      topWaterBtn.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.setOverlay(this.renderer.activeOverlay === 'water' ? 'none' : 'water');
      });
    }

    const topPowerBtn = document.getElementById('mayor-top-hud-power');
    if (topPowerBtn) {
      topPowerBtn.style.cursor = 'pointer';
      topPowerBtn.title = 'Click to toggle Power Grid overlay';
      topPowerBtn.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.setOverlay(this.renderer.activeOverlay === 'power' ? 'none' : 'power');
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.mode !== 'map') return;
      if (e.target.tagName === 'INPUT') return;
      if (e.key >= '1' && e.key <= '8') {
        const idx = Number(e.key) - 1;
        const ov = this.getActiveOverlayList()[idx];
        if (ov) {
          this.setOverlay(ov.id);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        this.world.speed = this.world.speed === 0 ? 1 : 0;
        document.querySelectorAll('.speed-btn').forEach(b => {
          b.classList.toggle('active', Number(b.getAttribute('data-speed')) === this.world.speed);
        });
      }
    });
  }

  // ==================== BUILD TOOLBAR & OVERLAYS ====================
  renderToolbarCategories() {
    const catContainer = document.getElementById('toolbar-categories');
    catContainer.innerHTML = '';

    CONFIG.CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `cat-btn ${this.activeCategory === cat.id ? 'active' : ''}`;
      btn.style.setProperty('--cat-color', cat.color);
      btn.innerHTML = `<span class="cat-icon">${cat.icon}</span><span class="cat-label">${cat.label}</span>`;
      btn.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.activeCategory = cat.id;
        const firstTool = Object.values(CONFIG.TOOLS).find(t => t.category === cat.id);
        if (firstTool) {
          this.selectTool(firstTool.id);
        }
        this.renderToolbarCategories();
        this.renderToolButtons();
      });
      catContainer.appendChild(btn);
    });
  }

  renderToolButtons() {
    const toolsContainer = document.getElementById('toolbar-items');
    toolsContainer.innerHTML = '';

    const tools = Object.values(CONFIG.TOOLS).filter(t => t.category === this.activeCategory);
    tools.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = `tool-btn ${this.activeTool === tool.id ? 'active' : ''}`;
      btn.style.setProperty('--tool-color', tool.color);
      btn.innerHTML = `
        <div class="tool-swatch" style="background:${tool.color};border-color:${tool.stroke}"></div>
        <div class="tool-meta">
          <div class="tool-name">${tool.name}</div>
          <div class="tool-cost">$${tool.cost}${tool.powerGen ? ` • +${tool.powerGen}MW` : ''}</div>
        </div>
      `;
      btn.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.selectTool(tool.id);
      });
      toolsContainer.appendChild(btn);
    });

    this.updateActiveToolBanner();
  }

  selectTool(toolId) {
    this.activeTool = toolId;
    this.renderer.activeTool = toolId;
    if (toolId === 'powerline_under') {
      this.setOverlay('power');
    } else if (toolId === 'water_pipe' || toolId === 'water_pump') {
      this.setOverlay('water');
    }
    this.renderToolButtons();
  }

  updateActiveToolBanner() {
    const tool = CONFIG.TOOLS[this.activeTool];
    const banner = document.getElementById('tool-desc-banner');
    if (!tool || !banner) return;
    banner.innerHTML = `
      <strong>${tool.name} ($${tool.cost})</strong> — ${tool.desc}
    `;
  }

  getActiveOverlayList() {
    if (this.world.playerRole === 'businessman' && CONFIG.BUSINESS_OVERLAYS) {
      return CONFIG.BUSINESS_OVERLAYS;
    }
    return CONFIG.OVERLAYS;
  }

  renderOverlayBar() {
    const bar = document.getElementById('overlay-bar');
    bar.innerHTML = '';
    this.getActiveOverlayList().forEach(ov => {
      const btn = document.createElement('button');
      btn.className = `overlay-btn ${this.renderer.activeOverlay === ov.id ? 'active' : ''}`;
      btn.style.setProperty('--ov-color', ov.color);
      btn.innerHTML = `<span class="ov-key">[${ov.key}]</span> ${ov.name}`;
      btn.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.setOverlay(ov.id);
      });
      bar.appendChild(btn);
    });
  }

  setOverlay(ovId) {
    this.renderer.activeOverlay = ovId;
    this.renderOverlayBar();
  }

  // ==================== 2D MAP CANVAS INTERACTION ====================
  bindCanvasEvents() {
    const canvas = this.renderer.canvas;

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('dblclick', (e) => {
      if (this.mode !== 'map' || this.world.playerRole !== 'businessman') return;
      const g = this.renderer.screenToGrid(e.clientX, e.clientY);
      const tile = this.world.getTile(g.x, g.y);
      if (!tile || !tile.building) return;
      const b = tile.building;
      if (b.isHomeResidence) {
        window.cyberAudio.playClick();
        this.streetView.openPortfolioModal();
      } else if (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
        window.cyberAudio.playClick();
        this.streetView.openBusinessPropertyPopup({ tile });
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'map') return;
      window.cyberAudio.init();

      // Holding down the mouse scroll wheel (Middle Click, e.button === 1) rotates the city map while moving the mouse
      if (e.button === 1) {
        e.preventDefault();
        this.isRotating = true;
        this.rotateStartX = e.clientX;
        this.rotateStartAngle = this.renderer.rotationAngle || 0;
        this.rotatePivot = this.renderer.screenToGridFloat(
          this.renderer.canvas.width * 0.5,
          this.renderer.canvas.height * 0.5
        );
        return;
      }

      // Right-click hold (e.button === 2) or Shift + Left-click pans the map
      if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.camStart = { x: this.renderer.camX, y: this.renderer.camY };
        return;
      }

      if (e.button === 0) {
        const g = this.renderer.screenToGrid(e.clientX, e.clientY);
        const tile = this.world.getTile(g.x, g.y);
        if (!tile) return;

        this.renderer.selectedTile = { x: g.x, y: g.y };
        this.updateInspector(tile);

        // Business Man cannot build on the 2D City View — he only inspects ownership and walks to buildings on the street!
        if (this.world.playerRole === 'businessman') {
          window.cyberAudio.playClick();
          return;
        }

        const draggableTools = ['road', 'avenue', 'highway', 'monorail', 'powerline_above', 'powerline_under', 'water_pipe', 'zone_res', 'zone_comm', 'zone_ind', 'demolish'];
        if (this.activeTool && draggableTools.includes(this.activeTool)) {
          this.isDrawing = true;
          this.dragStartGrid = { x: g.x, y: g.y };
          this.renderer.dragPath = [{ x: g.x, y: g.y }];
        } else if (this.activeTool) {
          this.applyToolAt(g.x, g.y);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.mode !== 'map') return;
      if (this.isRotating) {
        const dx = e.clientX - this.rotateStartX;
        this.renderer.setRotation(this.rotateStartAngle + dx * 0.007, this.rotatePivot);
        return;
      }
      if (this.isPanning) {
        const dx = (e.clientX - this.panStart.x) / this.renderer.zoom;
        const dy = (e.clientY - this.panStart.y) / this.renderer.zoom;
        this.renderer.camX = this.camStart.x + dx;
        this.renderer.camY = this.camStart.y + dy;
        return;
      }

      const g = this.renderer.screenToGrid(e.clientX, e.clientY);
      const hoverPopup = document.getElementById('hover-square-popup');
      const isOverCanvas = e.target === canvas;
      if (this.world.getTile(g.x, g.y)) {
        this.renderer.hoverTile = { x: g.x, y: g.y };
        if (hoverPopup && isOverCanvas) {
          hoverPopup.textContent = this.world.formatSquare(g.x, g.y);
          hoverPopup.style.left = `${Math.min(window.innerWidth - 80, e.clientX + 14)}px`;
          hoverPopup.style.top = `${Math.max(8, e.clientY - 26)}px`;
          hoverPopup.classList.remove('hidden');
        } else if (hoverPopup && e.target !== this.renderer.minimapCanvas) {
          hoverPopup.classList.add('hidden');
        }
      } else {
        this.renderer.hoverTile = null;
        if (hoverPopup && e.target !== this.renderer.minimapCanvas) {
          hoverPopup.classList.add('hidden');
        }
      }

      if (this.isDrawing && this.dragStartGrid && this.renderer.hoverTile) {
        this.renderer.dragPath = this.computeDragPath(this.dragStartGrid, this.renderer.hoverTile, this.activeTool);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.mode !== 'map') return;
      if (this.isRotating) {
        this.isRotating = false;
        return;
      }
      if (this.isPanning) {
        this.isPanning = false;
        return;
      }
      if (this.isDrawing) {
        this.isDrawing = false;
        const path = this.renderer.dragPath;
        this.renderer.dragPath = [];
        if (path.length > 0) {
          let placedAny = false;
          let lastError = null;
          let lastErrorPt = null;
          for (const pt of path) {
            const res = this.world.placeTool(pt.x, pt.y, this.activeTool);
            if (res.ok) placedAny = true;
            else {
              lastError = res.reason;
              lastErrorPt = pt;
            }
          }
          if (placedAny) {
            if (this.activeTool === 'demolish') window.cyberAudio.playDemolish();
            else window.cyberAudio.playPlace();
            this.world.checkTier4Rings();
          } else if (lastError) {
            window.cyberAudio.playError();
            const sqTag = lastErrorPt ? ` at ${this.world.formatSquare(lastErrorPt.x, lastErrorPt.y)}` : '';
            this.world.addAlert(`${lastError}${sqTag}`, 'warn', lastErrorPt);
          }
          this.updateHUD();
          if (this.renderer.selectedTile) {
            const st = this.world.getTile(this.renderer.selectedTile.x, this.renderer.selectedTile.y);
            if (st) this.updateInspector(st);
          }
        }
      }
    });

    canvas.addEventListener('wheel', (e) => {
      if (this.mode !== 'map') return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.renderer.zoom = Math.max(0.45, Math.min(2.2, this.renderer.zoom * factor));
    }, { passive: false });

    this.renderer.minimapCanvas.addEventListener('mousedown', (e) => {
      const rect = this.renderer.minimapCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const gx = Math.floor((mx / rect.width) * this.world.size);
      const gy = Math.floor((my / rect.height) * this.world.size);
      this.renderer.centerCameraOn(gx, gy);
    });

    this.renderer.minimapCanvas.addEventListener('mousemove', (e) => {
      const hoverPopup = document.getElementById('hover-square-popup');
      if (!hoverPopup) return;
      const rect = this.renderer.minimapCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const gx = Math.max(0, Math.min(this.world.size - 1, Math.floor((mx / rect.width) * this.world.size)));
      const gy = Math.max(0, Math.min(this.world.size - 1, Math.floor((my / rect.height) * this.world.size)));
      hoverPopup.textContent = this.world.formatSquare(gx, gy);
      hoverPopup.style.left = `${Math.max(8, e.clientX - 68)}px`;
      hoverPopup.style.top = `${Math.max(8, e.clientY - 26)}px`;
      hoverPopup.classList.remove('hidden');
    });

    this.renderer.minimapCanvas.addEventListener('mouseleave', () => {
      const hoverPopup = document.getElementById('hover-square-popup');
      if (hoverPopup) hoverPopup.classList.add('hidden');
    });
  }

  computeDragPath(start, end, toolId) {
    const points = [];
    const isZone = toolId && toolId.startsWith('zone_');

    if (isZone) {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.getTile(x, y)) points.push({ x, y });
        }
      }
    } else {
      const dx = end.x >= start.x ? 1 : -1;
      for (let x = start.x; x !== end.x + dx; x += dx) {
        if (this.world.getTile(x, start.y)) points.push({ x, y: start.y });
      }
      const dy = end.y >= start.y ? 1 : -1;
      for (let y = start.y + dy; y !== end.y + dy; y += dy) {
        if (this.world.getTile(end.x, y)) points.push({ x: end.x, y });
      }
    }
    return points;
  }

  applyToolAt(x, y) {
    const res = this.world.placeTool(x, y, this.activeTool);
    if (res.ok) {
      if (this.activeTool === 'demolish') window.cyberAudio.playDemolish();
      else window.cyberAudio.playPlace();
      this.world.checkTier4Rings();
    } else {
      window.cyberAudio.playError();
      this.world.addAlert(`${res.reason} at ${this.world.formatSquare(x, y)}`, 'warn', { x, y });
    }
    this.updateHUD();
    const tile = this.world.getTile(x, y);
    if (tile) this.updateInspector(tile);
  }

  // ==================== HUD & INSPECTOR REFRESH ====================
  updateHUD() {
    document.getElementById('hud-city-name').value = this.world.cityName;
    document.getElementById('hud-pop').textContent = this.world.population.toLocaleString();
    document.getElementById('hud-date').textContent =
      `${this.world.year}.${String(this.world.month).padStart(2, '0')}.${String(this.world.day).padStart(2, '0')}`;
    document.getElementById('hud-money').textContent = `$${this.world.money.toLocaleString()}`;

    const trendEl = document.getElementById('hud-trend');
    const net = this.world.stats.netTrend;
    trendEl.textContent = `${net >= 0 ? '▲ +' : '▼ '}$${net.toLocaleString()}/mo`;
    trendEl.className = `budget-trend ${net >= 0 ? 'pos' : 'neg'}`;

    const pGen = this.world.stats.powerGenerated;
    const pUse = this.world.stats.powerConsumed;
    const pEl = this.getElementById ? document.getElementById('hud-power') : document.querySelector('#hud-power');
    if (pEl) {
      pEl.textContent = `${pUse} / ${pGen} MW`;
      pEl.style.color = pUse > pGen ? '#f87171' : '#facc15';
    }

    const wEl = document.getElementById('hud-water');
    if (wEl) {
      const wCov = this.world.stats.waterCoverage ?? 100;
      wEl.textContent = `${wCov}% 💧`;
      wEl.style.color = wCov < 70 ? '#f87171' : '#38bdf8';
    }

    document.getElementById('hud-morale').textContent = `${this.world.stats.avgMorale}%`;

    this.updateDemandBar('rci-res', this.world.demand.res);
    this.updateDemandBar('rci-comm', this.world.demand.comm);
    this.updateDemandBar('rci-ind', this.world.demand.ind);

    document.getElementById('stat-tax-income').textContent = `+$${this.world.stats.taxIncome}`;
    document.getElementById('stat-upkeep').textContent = `-$${this.world.stats.upkeepCost}`;

    const commSubSlider = document.getElementById('comm-subsidy-slider');
    const commSubVal = document.getElementById('comm-subsidy-val');
    if (commSubSlider) commSubSlider.value = this.world.commSubsidy;
    if (commSubVal) commSubVal.textContent = `${this.world.commSubsidy}%`;

    const indSubSlider = document.getElementById('ind-subsidy-slider');
    const indSubVal = document.getElementById('ind-subsidy-val');
    if (indSubSlider) indSubSlider.value = this.world.indSubsidy;
    if (indSubVal) indSubVal.textContent = `${this.world.indSubsidy}%`;

    // Update Business Man Ownership Map Summary Card & Top HUD Bar if playing as Business Man
    const bs = this.world.businessStats;
    const bmHudName = document.getElementById('bm-hud-name');
    const bmHudMoney = document.getElementById('bm-hud-money');
    const bmHudTotalInc = document.getElementById('bm-hud-total-inc');
    const bmHudLoanPmt = document.getElementById('bm-hud-loan-pmt');
    const bmHudNetFlow = document.getElementById('bm-hud-net-flow');
    const bmHudNetWorth = document.getElementById('bm-hud-networth');
    const netFlow = bs.netMonthlyCashFlow ?? ((bs.monthlyIncome || 0) - (bs.monthlyLoanPayments || 0));
    if (bmHudName) bmHudName.textContent = (this.world.businessmanName || 'Vance').toUpperCase();
    if (bmHudMoney) bmHudMoney.textContent = `$${this.world.businessMoney.toLocaleString()}`;
    if (bmHudTotalInc) bmHudTotalInc.textContent = `+$${(bs.monthlyIncome || 0).toLocaleString()}/mo`;
    if (bmHudLoanPmt) bmHudLoanPmt.textContent = `-$${(bs.monthlyLoanPayments || 0).toLocaleString()}/mo`;
    if (bmHudNetFlow) {
      bmHudNetFlow.textContent = `${netFlow >= 0 ? '+' : ''}$${netFlow.toLocaleString()}/mo`;
      bmHudNetFlow.style.color = netFlow >= 0 ? '#4ade80' : '#f43f5e';
    }
    if (bmHudNetWorth) bmHudNetWorth.textContent = `$${(bs.netWorth || this.world.businessMoney).toLocaleString()}`;

    const bmCashEl = document.getElementById('bm-map-cash');
    const bmCommIncEl = document.getElementById('bm-map-comm-income');
    const bmIndIncEl = document.getElementById('bm-map-ind-income');
    const bmIncEl = document.getElementById('bm-map-income');
    const bmLoanPmtEl = document.getElementById('bm-map-loan-pmt');
    const bmNetFlowEl = document.getElementById('bm-map-net-flow');
    const bmDebtEl = document.getElementById('bm-map-debt');
    const bmCreditEl = document.getElementById('bm-map-credit');
    const bmOwnedEl = document.getElementById('bm-map-owned');
    const bmMayorEl = document.getElementById('bm-map-mayor-type');
    const bmCommSubEl = document.getElementById('bm-map-comm-sub');
    const bmIndSubEl = document.getElementById('bm-map-ind-sub');
    const bmMapOwnedListEl = document.getElementById('bm-map-owned-list');

    if (bmCashEl) bmCashEl.textContent = `$${this.world.businessMoney.toLocaleString()}`;
    if (bmCommIncEl) bmCommIncEl.textContent = `+$${(bs.commIncome || 0).toLocaleString()}/mo`;
    if (bmIndIncEl) bmIndIncEl.textContent = `+$${(bs.indIncome || 0).toLocaleString()}/mo`;
    if (bmIncEl) bmIncEl.textContent = `+$${(bs.monthlyIncome || 0).toLocaleString()}/mo`;
    if (bmLoanPmtEl) bmLoanPmtEl.textContent = `-$${(bs.monthlyLoanPayments || 0).toLocaleString()}/mo`;
    if (bmNetFlowEl) {
      bmNetFlowEl.textContent = `${netFlow >= 0 ? '+' : ''}$${netFlow.toLocaleString()}/mo`;
      bmNetFlowEl.style.color = netFlow >= 0 ? '#4ade80' : '#f43f5e';
    }
    if (bmDebtEl) bmDebtEl.textContent = `$${(bs.totalDebt || 0).toLocaleString()}`;
    if (bmCreditEl) bmCreditEl.textContent = `$${Math.round((bs.availableCredit || 0) / 1000).toLocaleString()}K`;
    if (bmOwnedEl) {
      bmOwnedEl.textContent = `${bs.ownedCount} (${bs.commOwned || 0} Comm / ${bs.indOwned || 0} Ind)`;
    }
    if (bmMayorEl) {
      bmMayorEl.textContent = `${this.world.mayorName} (${this.world.aiMayorAlignment.toUpperCase()})`;
      bmMayorEl.style.color = this.world.aiMayorAlignment === 'corrupt' ? '#f43f5e' : '#4ade80';
    }
    if (bmCommSubEl) bmCommSubEl.textContent = `${this.world.commSubsidy}%`;
    if (bmIndSubEl) bmIndSubEl.textContent = `${this.world.indSubsidy}%`;
    const chkMapRunMayor = document.getElementById('chk-map-run-for-mayor');
    const lblMapRunMayor = document.getElementById('lbl-map-run-for-mayor');
    const nextElecYear = this.world.year % 2 === 1 ? this.world.year + 1 : this.world.year + 2;
    if (chkMapRunMayor) chkMapRunMayor.checked = Boolean(this.world.playerRunningForMayor);
    if (lblMapRunMayor) lblMapRunMayor.textContent = `🗳 Run for Mayor (Next Election: Jan 1, ${nextElecYear})`;

    if (bmMapOwnedListEl) {
      const list = bs.ownedList || bs.properties || [];
      if (list.length === 0) {
        bmMapOwnedListEl.innerHTML = `<div style="font-size:10px;color:#94a3b8;padding:4px;">Click any Commercial or Industrial building on this map to buy & manage it!</div>`;
      } else {
        bmMapOwnedListEl.innerHTML = list.map(p => {
          const isGood = p.mode === 'good' || p.ethics === 'good';
          const badgeCol = isGood ? '#4ade80' : '#f43f5e';
          const zoneBadge = p.zoneType === 'comm' ? 'COMM' : 'IND';
          const sq = this.world.formatSquare(p.x, p.y);
          return `<div class="bm-map-owned-row" data-gx="${p.x}" data-gy="${p.y}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-bottom:1px solid rgba(148,163,184,0.12);font-size:10px;cursor:pointer;" title="Click to focus on map">
            <div>
              <strong style="color:#f8fafc;">${p.name}</strong>
              <span style="color:#94a3b8;margin-left:4px;">[${zoneBadge} L${p.scale || p.level} • ${sq}]</span>
            </div>
            <div style="text-align:right;">
              <span style="color:${badgeCol};font-weight:700;margin-right:6px;">${isGood ? 'GOOD' : 'CORRUPT'}</span>
              <strong style="color:#4ade80;">+$${p.income.toLocaleString()}/mo</strong>
            </div>
          </div>`;
        }).join('');
        bmMapOwnedListEl.querySelectorAll('.bm-map-owned-row').forEach(row => {
          row.addEventListener('click', () => {
            const gx = Number(row.getAttribute('data-gx'));
            const gy = Number(row.getAttribute('data-gy'));
            window.cyberAudio.playClick();
            this.renderer.centerCameraOn(gx, gy);
            this.renderer.selectedTile = { x: gx, y: gy };
            const t = this.world.getTile(gx, gy);
            if (t) this.updateInspector(t);
          });
        });
      }
    }

    this.drawMiniGraph();

    const alertBox = document.getElementById('alert-ticker');
    if (alertBox && this.world.alerts.length > 0) {
      const recent = this.world.alerts.slice(0, 4);
      alertBox.innerHTML = recent.map((al, idx) => {
        const hasCoords = Boolean(al.coords && typeof al.coords.x === 'number');
        return `<div class="alert-feed-item ${hasCoords ? 'clickable' : ''}" data-alert-idx="${idx}" title="${hasCoords ? `Click to jump to ${al.coords.label}` : ''}">
          <span class="alert-tag ${al.type}">[${al.date}]</span> ${al.text}
        </div>`;
      }).join('');
      alertBox.querySelectorAll('.alert-feed-item.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-alert-idx'));
          const al = this.world.alerts[idx];
          if (al && al.coords) {
            window.cyberAudio.playClick();
            this.renderer.centerCameraOn(al.coords.x, al.coords.y);
            this.renderer.selectedTile = { x: al.coords.x, y: al.coords.y };
            const t = this.world.getTile(al.coords.x, al.coords.y);
            if (t) this.updateInspector(t);
          }
        });
      });
    }

    if (this.streetView) {
      this.streetView.updateStreetHUD();
    }
  }

  updateDemandBar(id, val) {
    const bar = document.getElementById(id);
    if (!bar) return;
    const pct = Math.max(5, Math.min(100, Math.round((val + 100) * 0.5)));
    bar.style.height = `${pct}%`;
  }

  updateInspector(tile) {
    const box = document.getElementById('tile-inspector-content');
    if (!tile) return;

    const isBM = this.world.playerRole === 'businessman';
    const sqCoord = this.world.formatSquare(tile.x, tile.y);

    // ==================== BUSINESS MAN PROPERTY & MARKET TELEMETRY ====================
    if (isBM) {
      let title = `SECTOR ${sqCoord} // ${tile.terrain.toUpperCase()}`;
      let html = `<div class="insp-row"><span>Map Square:</span> <strong style="color:#00f5d4">${sqCoord}</strong></div>`;

      if (tile.building) {
        const b = tile.building;
        const def = CONFIG.TOOLS[b.id];

        if (b.category === 'zones' && (b.zoneType === 'comm' || b.zoneType === 'ind')) {
          const zLvl = CONFIG.ZONE_LEVELS[b.zoneType][b.level];
          const info = this.world.getBusinessPropertyInfo(tile);
          const isComm = b.zoneType === 'comm';
          title = zLvl ? zLvl.name : def.name;

          html += `
            <div class="insp-row"><span>Sector Type:</span> <strong style="color:${isComm ? '#38bdf8' : '#fbbf24'}">${isComm ? 'COMMERCIAL' : 'INDUSTRIAL'} (Scale L${info.scale}/4)</strong></div>
            <div class="insp-row"><span>Active Subsidy:</span> <strong style="color:#4ade80">+${info.subsidyPct}% (Mayor ${this.world.mayorName})</strong></div>
            <div class="insp-row"><span>Local Morale:</span> <strong style="color:${tile.morale >= 75 ? '#4ade80' : '#fbbf24'}">${tile.morale}%</strong></div>
          `;

          if (!info.owned) {
            const netGoodLoan = info.goodIncome - info.estMonthlyLoanPayment;
            const netCorruptLoan = info.corruptIncome - info.estMonthlyLoanPayment;
            html += `
              <div style="margin-top:8px;padding:8px;background:rgba(15,23,42,0.88);border:1px solid #fbbf24;border-radius:4px;">
                <div class="insp-row"><span>Market Value (10x Yr):</span> <strong style="color:#fde047;">$${info.buyCost.toLocaleString()}</strong></div>
                <div class="insp-row"><span>20% Down Payment:</span> <strong style="color:#38bdf8;font-size:12px;">$${info.downPayment.toLocaleString()}</strong></div>
                <div class="insp-row"><span>Mortgage (80% Loan):</span> <strong style="color:#f87171;">-$${info.estMonthlyLoanPayment.toLocaleString()}/mo</strong></div>
                <div class="insp-row"><span>Good Gross / Net:</span> <strong style="color:#4ade80;">+$${info.goodIncome.toLocaleString()} (${netGoodLoan >= 0 ? '+' : ''}$${netGoodLoan.toLocaleString()}/mo)</strong></div>
                <div class="insp-row"><span>Corrupt Gross / Net:</span> <strong style="color:#f43f5e;">+$${info.corruptIncome.toLocaleString()} (+$${netCorruptLoan.toLocaleString()}/mo)</strong></div>
                <div style="font-size:9.5px;color:#94a3b8;margin-top:6px;">Finance with 20% Down ($${info.downPayment.toLocaleString()}):</div>
                <div style="display:flex;gap:6px;margin-top:4px;">
                  <button id="btn-map-buy-good" class="cyber-btn small primary" style="flex:1;">🏦 GOOD (20% DN)</button>
                  <button id="btn-map-buy-corrupt" class="cyber-btn small danger" style="flex:1;">🏦 CORRUPT (20% DN)</button>
                </div>
                ${this.world.businessMoney >= info.buyCost
                  ? `<div style="display:flex;gap:6px;margin-top:5px;">
                      <button id="btn-map-cash-good" class="cyber-btn small" style="flex:1;">💵 CASH GOOD</button>
                      <button id="btn-map-cash-corrupt" class="cyber-btn small" style="flex:1;">💵 CASH CORRUPT</button>
                    </div>`
                  : ''
                }
              </div>
            `;
          } else {
            const isGood = info.ethics === 'good';
            const netNow = info.netCurrentIncome;
            html += `
              <div style="margin-top:8px;padding:8px;background:rgba(15,23,42,0.88);border:1px solid ${isGood ? '#4ade80' : '#f43f5e'};border-radius:4px;">
                <div class="insp-row"><span>Status:</span> <strong style="color:${isGood ? '#4ade80' : '#f43f5e'}">★ OWNED (${isGood ? 'GOOD' : 'CORRUPT 2X'})</strong></div>
                <div class="insp-row"><span>Gross Revenue:</span> <strong style="color:#38bdf8;">+$${info.currentIncome.toLocaleString()}/mo</strong></div>
                ${info.loanBalance > 0
                  ? `<div class="insp-row"><span>Loan Balance:</span> <strong style="color:#f87171;">$${info.loanBalance.toLocaleString()} (-$${info.loanMonthlyPayment.toLocaleString()}/mo)</strong></div>`
                  : `<div class="insp-row"><span>Mortgage Status:</span> <strong style="color:#4ade80;">DEBT-FREE ✓</strong></div>`
                }
                <div class="insp-row"><span>Net Cash Flow:</span> <strong style="color:${netNow >= 0 ? '#4ade80' : '#f43f5e'};font-size:12px;">${netNow >= 0 ? '+' : ''}$${netNow.toLocaleString()}/mo</strong></div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button id="btn-map-set-good" class="cyber-btn small ${isGood ? 'primary' : ''}" style="flex:1;">🟢 GOOD</button>
                  <button id="btn-map-set-corrupt" class="cyber-btn small ${!isGood ? 'danger' : ''}" style="flex:1;">🔴 CORRUPT</button>
                </div>
                ${info.canUpgrade
                  ? `<button id="btn-map-upgrade-biz" class="cyber-btn small accent" style="width:100%;margin-top:6px;">
                      ⬆ FINANCE UPGRADE L${info.scale + 1} ($${info.upgradeDownPayment.toLocaleString()} Down)
                    </button>`
                  : `<div style="text-align:center;color:#fde047;font-size:10px;font-weight:700;margin-top:6px;">★ MAXIMUM SCALE L4</div>`
                }
                ${info.loanBalance > 0
                  ? `<button id="btn-map-payoff-loan" class="cyber-btn small" style="width:100%;margin-top:5px;">
                      💰 PAY OFF LOAN ($${info.loanBalance.toLocaleString()})
                    </button>`
                  : ''
                }
              </div>
            `;
          }

          html += `
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button id="btn-map-quick-popup" class="cyber-btn small" style="flex:1;">⚡ DEAL POPUP</button>
              <button id="btn-insp-walk-here" class="cyber-btn small" style="flex:1;">🚶 STREET VIEW</button>
            </div>
          `;
        } else if (b.isHomeResidence) {
          title = `${(this.world.businessmanName || 'VANCE').toUpperCase()}'S RESIDENCE HQ`;
          html += `
            <div class="insp-row"><span>Property:</span> <strong style="color:#facc15">🏠 PRIVATE RESIDENCE HQ</strong></div>
            <div class="insp-row"><span>Owned Businesses:</span> <strong>${this.world.businessStats.ownedCount}</strong></div>
            <div class="insp-row"><span>Total Monthly Income:</span> <strong style="color:#4ade80">+$${this.world.businessStats.monthlyIncome.toLocaleString()}/mo</strong></div>
            <button id="btn-map-open-hq" class="cyber-btn small primary" style="width:100%;margin-top:8px;">💼 OPEN PORTFOLIO LEDGER</button>
            <button id="btn-insp-walk-here" class="cyber-btn small" style="width:100%;margin-top:6px;">🚶 STEP OUTSIDE HQ</button>
          `;
        } else if (b.category === 'zones' && b.zoneType === 'res') {
          const zLvl = CONFIG.ZONE_LEVELS.res[b.level];
          title = zLvl ? zLvl.name : def.name;
          html += `
            <div class="insp-row"><span>District:</span> <strong style="color:#6ee7b7">RESIDENTIAL (L${Math.max(1, b.level)})</strong></div>
            <div class="insp-row"><span>Local Customers:</span> <strong>${b.pop} Residents</strong></div>
            <div class="insp-row"><span>Neighborhood Morale:</span> <strong>${tile.morale}%</strong></div>
            <div style="font-size:10px;color:#94a3b8;margin-top:6px;">Residential zones cannot be purchased, but higher nearby population & morale boost your Commercial demand.</div>
          `;
        } else {
          title = def ? def.name : b.id;
          html += `
            <div class="insp-row"><span>Facility:</span> <strong>${title}</strong></div>
            <div class="insp-row"><span>Local Morale:</span> <strong>${tile.morale}%</strong></div>
            <div class="insp-row"><span>Air Pollution:</span> <strong>${tile.pollution}%</strong></div>
          `;
          if (!this.world.isRoadSurface(tile)) {
            html += `<button id="btn-insp-walk-here" class="cyber-btn small" style="width:100%;margin-top:8px;">🚶 WALK TO THIS BUILDING</button>`;
          }
        }
      } else {
        html += `
          <div class="insp-row"><span>Status:</span> <span style="color:#94a3b8;">Undeveloped ${tile.terrain}</span></div>
          <div style="font-size:10px;color:#94a3b8;margin-top:6px;">AI Mayor ${this.world.mayorName} manages city zoning & construction. Click any Commercial (Blue) or Industrial (Amber) building to buy it!</div>
        `;
      }

      box.innerHTML = `<div class="insp-title">${title}</div>${html}`;

      const handleMapBuy = (ethics, useLoan) => {
        const res = this.world.buyBusinessAt(tile.x, tile.y, ethics, useLoan);
        if (res.ok) {
          window.cyberAudio.playUpgrade();
          this.updateHUD();
          this.updateInspector(tile);
        } else {
          window.cyberAudio.playError();
          this.world.addAlert(res.reason, 'warn', { x: tile.x, y: tile.y });
          this.updateHUD();
        }
      };

      document.getElementById('btn-map-buy-good')?.addEventListener('click', () => handleMapBuy('good', true));
      document.getElementById('btn-map-buy-corrupt')?.addEventListener('click', () => handleMapBuy('corrupt', true));
      document.getElementById('btn-map-cash-good')?.addEventListener('click', () => handleMapBuy('good', false));
      document.getElementById('btn-map-cash-corrupt')?.addEventListener('click', () => handleMapBuy('corrupt', false));

      document.getElementById('btn-map-payoff-loan')?.addEventListener('click', () => {
        const res = this.world.payOffBusinessLoanAt(tile.x, tile.y);
        if (res.ok) {
          window.cyberAudio.playUpgrade();
          this.updateHUD();
          this.updateInspector(tile);
        } else {
          window.cyberAudio.playError();
          this.world.addAlert(res.reason, 'warn', { x: tile.x, y: tile.y });
          this.updateHUD();
        }
      });

      document.getElementById('btn-map-set-good')?.addEventListener('click', () => {
        if (this.world.setBusinessEthicsAt(tile.x, tile.y, 'good').ok) {
          window.cyberAudio.playClick();
          this.updateHUD();
          this.updateInspector(tile);
        }
      });

      document.getElementById('btn-map-set-corrupt')?.addEventListener('click', () => {
        if (this.world.setBusinessEthicsAt(tile.x, tile.y, 'corrupt').ok) {
          window.cyberAudio.playClick();
          this.updateHUD();
          this.updateInspector(tile);
        }
      });

      document.getElementById('btn-map-upgrade-biz')?.addEventListener('click', () => {
        const res = this.world.upgradeBusinessAt(tile.x, tile.y);
        if (res.ok) {
          window.cyberAudio.playUpgrade();
          this.updateHUD();
          this.updateInspector(tile);
        } else {
          window.cyberAudio.playError();
          this.world.addAlert(res.reason, 'warn', { x: tile.x, y: tile.y });
          this.updateHUD();
        }
      });

      document.getElementById('btn-map-quick-popup')?.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.streetView.openBusinessPropertyPopup({ tile });
      });

      document.getElementById('btn-map-open-hq')?.addEventListener('click', () => {
        window.cyberAudio.playClick();
        this.streetView.openPortfolioModal();
      });

      document.getElementById('btn-insp-walk-here')?.addEventListener('click', () => {
        window.cyberAudio.playUpgrade();
        this.streetView.syncOutsideTile(tile.x, tile.y);
        this.setGameMode('street');
      });
      return;
    }

    // ==================== MAYOR MUNICIPAL TELEMETRY ====================
    let title = `TERRAIN: ${tile.terrain.toUpperCase()} ${sqCoord}`;
    let detail = `<div class="insp-row"><span>Map Square:</span> <strong style="color:#00f5d4">${sqCoord}</strong></div>`;

    if (tile.building) {
      const b = tile.building;
      const def = CONFIG.TOOLS[b.id];
      if (b.category === 'zones') {
        const zLvl = CONFIG.ZONE_LEVELS[b.zoneType][b.level];
        title = zLvl ? zLvl.name : def.name;
        detail = `
          <div class="insp-row"><span>Zone Scale:</span> <strong>Scale L${Math.max(1, b.level)}${b.level === 4 ? ' ★ MAX' : ' / 4'}</strong></div>
          <div class="insp-row"><span>Occupancy:</span> <strong>${b.pop} / ${b.maxPop}</strong></div>
        `;

        if (b.zoneType === 'comm' || b.zoneType === 'ind') {
          const info = this.world.getBusinessPropertyInfo(tile);
          const ownerTag = b.ownedByPlayer
            ? `<strong style="color:#4ade80">★ OWNED BY ${(this.world.businessmanName || 'VANCE').toUpperCase()} (${b.businessEthics === 'corrupt' ? 'CORRUPT 2X' : 'GOOD'})</strong>`
            : `<strong style="color:#fbbf24">UNOWNED ($${info.buyCost.toLocaleString()})</strong>`;
          detail += `<div class="insp-row"><span>Ownership:</span> ${ownerTag}</div>`;
        } else if (b.isHomeResidence) {
          detail += `<div class="insp-row"><span>Ownership:</span> <strong style="color:#facc15">🏠 ${(this.world.businessmanName || 'VANCE').toUpperCase()}'S HOME RESIDENCE HQ</strong></div>`;
        }
      } else {
        title = def ? def.name : b.id;
      }

      const util = this.world.getBuildingUtilityStatus(tile);
      let statusLabel = 'OPERATIONAL ✓';
      let statusColor = '#4ade80';
      if (!util.operational) {
        statusColor = '#f43f5e';
        if (b.id === 'water_pump' && !b.hasWaterSource) {
          statusLabel = 'OFFLINE (NO WATER IN RANGE)';
        } else if (util.needsPower && !util.hasPower && util.needsWater && !util.hasWater) {
          statusLabel = 'OFFLINE (NO POWER & NO WATER)';
        } else if (util.needsPower && !util.hasPower) {
          statusLabel = 'OFFLINE (NO POWER)';
        } else if (util.needsWater && !util.hasWater) {
          statusLabel = 'OFFLINE (NO WATER)';
        } else {
          statusLabel = 'OFFLINE';
        }
      }
      detail += `<div class="insp-row"><span>Facility Status:</span> <strong style="color:${statusColor}">${statusLabel}</strong></div>`;

      if (b.category === 'zones' && b.level > 0 && (!tile.powered || !tile.watered)) {
        const degNotes = [];
        if (!tile.powered) degNotes.push('3%/day level drop risk (No Power)');
        if (!tile.watered) degNotes.push(`50% every 3d level drop (${b.noWaterDays || 0}d no water)`);
        detail += `<div class="insp-row"><span>Degradation:</span> <strong style="color:#fb923c">${degNotes.join(' • ')}</strong></div>`;
      }

      if (b.id === 'water_pump') {
        detail += `<div class="insp-row"><span>Water Source (R:6):</span> <strong style="color:${b.hasWaterSource !== false ? '#38bdf8' : '#f43f5e'}">${b.hasWaterSource !== false ? 'RIVER/LAKE IN RANGE 💧' : 'NO WATER IN RANGE!'}</strong></div>`;
      } else if (b.id === 'bus_station') {
        detail += `<div class="insp-row"><span>Transit Effect:</span> <strong style="color:#38bdf8">-20% Traffic (Radius 8)</strong></div>`;
      } else if (b.id === 'railway_station') {
        detail += `<div class="insp-row"><span>Transit Effect:</span> <strong style="color:#38bdf8">Rail Entry/Exit • -30% Traffic</strong></div>`;
      }

      if (b.id === 'city_hall') {
        detail += `<button id="btn-insp-walk-street" class="cyber-btn small accent" style="width:100%;margin:6px 0;">🏛 ENTER MAYOR'S OFFICE</button>`;
      }
    }

    const hasRailHere = this.world.hasRail(tile);
    detail += `
      <div class="insp-row"><span>Power Status:</span> <strong style="color:${tile.powered ? '#4ade80' : '#f87171'}">${tile.powered ? 'ENERGIZED ⚡' : 'UNPOWERED'}</strong></div>
      <div class="insp-row"><span>Underground Cable:</span> <strong>${tile.undergroundPower ? 'INSTALLED' : 'None'}</strong></div>
      <div class="insp-row"><span>Water Supply:</span> <strong style="color:${tile.watered ? '#38bdf8' : '#fb923c'}">${tile.watered ? (tile.pipeWatered ? 'PIPED WATER 💧' : 'NATURAL WATER') : 'UNWATERED'}</strong></div>
      <div class="insp-row"><span>Underground Pipe:</span> <strong>${tile.undergroundWater ? 'INSTALLED 💧' : 'None'}</strong></div>
      ${hasRailHere ? `<div class="insp-row"><span>Raised Rail:</span> <strong style="color:#38bdf8">OVERHEAD TRACK 🚝</strong></div>` : ''}
      <div class="insp-row"><span>Citizen Morale:</span> <strong style="color:${tile.morale >= 90 ? '#e879f9' : '#38bdf8'}">${tile.morale}% ${tile.morale >= 90 ? '(Tier-4 Ready!)' : ''}</strong></div>
      <div class="insp-row"><span>Healthcare:</span> <strong>${tile.health}%</strong></div>
      <div class="insp-row"><span>Pollution:</span> <strong>${tile.pollution}%</strong></div>
      <div class="insp-row"><span>Crime Rate:</span> <strong>${tile.crime}%</strong></div>
      <div class="insp-row"><span>Traffic Load:</span> <strong>${tile.traffic}%</strong></div>
    `;

    box.innerHTML = `<div class="insp-title">${title}</div>${detail}`;

    const walkBtn = document.getElementById('btn-insp-walk-street');
    if (walkBtn) {
      walkBtn.addEventListener('click', () => {
        window.cyberAudio.playUpgrade();
        this.streetView.indoorMayorX = 0.22;
        this.setGameMode('indoor');
      });
    }
  }

  drawMiniGraph() {
    const c = document.getElementById('mini-graph-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.5);
    ctx.lineTo(W, H * 0.5);
    ctx.stroke();

    const popArr = this.world.stats.historyPop;
    const morArr = this.world.stats.historyMorale;
    if (popArr.length < 2) return;

    const maxPop = Math.max(100, ...popArr);
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    popArr.forEach((v, i) => {
      const x = (i / (popArr.length - 1)) * W;
      const y = H - (v / maxPop) * (H - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    morArr.forEach((v, i) => {
      const x = (i / (morArr.length - 1)) * W;
      const y = H - (v / 100) * (H - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ==================== 2-YEAR ELECTION CYCLE: ODD-YEAR ADVISOR PROMPT & EVEN-YEAR ELECTION RESULTS ====================
  syncSpeedButtons() {
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', Number(b.getAttribute('data-speed')) === this.world.speed);
    });
  }

  // Jan 1 of Odd Years: Pause the game, drag the Mayor to their Advisor in the Mayor's Office, and show the Advisor menu
  handleOddYearAdvisorPrompt() {
    this.world.speed = 0;
    this.syncSpeedButtons();
    if (window.cyberAudio) window.cyberAudio.playUpgrade();

    this.streetView.indoorMayorX = 0.72; // Right beside the Campaign Advisor
    this.streetView.mayorDir = 1;
    this.setGameMode('indoor');
    this.streetView.mayorFrame = 'R';
    this.streetView.openElectionDetailsModal(true);
    this.updateHUD();
  }

  // Jan 1 of Even Years: Display official election results & handle role transitions on Mayor defeat or victory
  openElectionResultModal(result) {
    this.world.speed = 0;
    this.syncSpeedButtons();

    const modal = document.getElementById('election-result-modal');
    const titleEl = document.getElementById('election-result-title');
    const subEl = document.getElementById('election-result-subtitle');
    const bodyEl = document.getElementById('election-result-body');
    const actionsEl = document.getElementById('election-result-actions');
    if (!modal || !bodyEl || !actionsEl) return;

    const challengerPct = Math.max(0, Number((100 - result.votePct).toFixed(2)));
    const voteColor = result.mayorWon ? '#4ade80' : '#f43f5e';

    if (result.wasPlayerMayor) {
      if (result.mayorWon) {
        if (window.cyberAudio) window.cyberAudio.playUpgrade();
        if (titleEl) titleEl.textContent = `🎉 MAYOR ${result.mayorName.toUpperCase()} RE-ELECTED!`;
        if (subEl) subEl.textContent = `JANUARY 1, ${result.year} MUNICIPAL ELECTION VICTORY`;
        bodyEl.innerHTML = `
          <div style="background:rgba(15,28,54,0.92);border:1.5px solid #4ade80;border-radius:8px;padding:14px;margin-bottom:10px;">
            <div style="font-size:13px;color:#e2e8f0;margin-bottom:10px;">
              Congratulations, <strong>Mayor ${result.mayorName}</strong>! The citizens of <strong>${this.world.cityName}</strong> have re-elected you for another two-year term.
            </div>
            <div class="insp-row"><span>Mayor ${result.mayorName} (Incumbent):</span> <strong style="color:#4ade80;font-size:15px;">${result.votePct.toFixed(1)}% ✓</strong></div>
            <div class="insp-row"><span>Opposition Challenger:</span> <strong style="color:#94a3b8;">${challengerPct.toFixed(1)}%</strong></div>
          </div>
        `;
        actionsEl.innerHTML = `
          <button id="btn-election-continue-mayor" class="cyber-btn accent">🏛 CONTINUE GOVERNING AS MAYOR</button>
        `;
        document.getElementById('btn-election-continue-mayor')?.addEventListener('click', () => {
          if (window.cyberAudio) window.cyberAudio.playClick();
          modal.classList.add('hidden');
          this.world.speed = 1;
          this.syncSpeedButtons();
          this.updateHUD();
        });
      } else {
        if (window.cyberAudio) window.cyberAudio.playAlert();
        if (titleEl) titleEl.textContent = `🗳 ELECTION DEFEAT — NEW MAYOR ELECTED`;
        if (subEl) subEl.textContent = `JANUARY 1, ${result.year} MUNICIPAL ELECTION • CHOOSE YOUR NEW ROLE`;
        bodyEl.innerHTML = `
          <div style="background:rgba(15,28,54,0.92);border:1.5px solid #f43f5e;border-radius:8px;padding:14px;margin-bottom:12px;">
            <div style="font-size:13px;color:#e2e8f0;margin-bottom:10px;line-height:1.5;">
              <strong>Mayor ${result.mayorName}</strong> lost the ${result.year} municipal election. New Computer Mayor <strong>Mayor ${result.newAiName}</strong> has taken office at City Hall. Life goes on in <strong>${this.world.cityName}</strong> — choose which role you will transition into:
            </div>
            <div class="insp-row"><span>Mayor ${result.mayorName} (You):</span> <strong style="color:#f43f5e;font-size:14px;">${result.votePct.toFixed(1)}%</strong></div>
            <div class="insp-row"><span>Mayor ${result.newAiName} (Winner):</span> <strong style="color:#4ade80;font-size:14px;">${challengerPct.toFixed(1)}% ✓</strong></div>
          </div>
        `;
        actionsEl.innerHTML = `
          <button id="btn-election-switch-bm" class="cyber-btn accent">💼 CONTINUE AS BUSINESS MAN (PLAY NOW)</button>
          <button class="cyber-btn" disabled style="opacity:0.5;cursor:not-allowed;">🚓 CONTINUE AS POLICE CHIEF (COMING SOON)</button>
          <button class="cyber-btn" disabled style="opacity:0.5;cursor:not-allowed;">📰 CONTINUE AS JOURNALIST (COMING SOON)</button>
        `;
        document.getElementById('btn-election-switch-bm')?.addEventListener('click', () => {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          modal.classList.add('hidden');
          // Transition the player to Business Man in this same city while the new AI Mayor takes over City Hall
          this.world.playerRole = 'businessman';
          this.world.businessmanName = this.world.businessmanName || result.mayorName || 'Vance';
          this.world.mayorName = result.newAiName || 'Victoria';
          this.world.aiMayorAlignment = result.newAiAlign || (Math.random() < 0.5 ? 'good' : 'corrupt');
          this.world.businessMoney = Math.max(this.world.businessMoney || 0, CONFIG.BUSINESS_STARTING_CASH || 20000);
          this.world.activeCampaignOptions = {};
          this.world.paidThisMonth = {};
          this.world.campaignMonthsActive = {};
          this.world.selectAICampaignOptions();
          this.world.findHomeResidence();
          this.world.recalculateAll();
          this.streetView.syncFromHomeResidence();
          this.setGameMode('street');
          this.world.speed = 1;
          this.syncSpeedButtons();
          this.updateHUD();
        });
      }
    } else {
      // Computer was Mayor
      if (result.playerElectedMayor) {
        if (window.cyberAudio) window.cyberAudio.playUpgrade();
        if (titleEl) titleEl.textContent = `🏛 YOU WON THE MAYORAL ELECTION!`;
        if (subEl) subEl.textContent = `JANUARY 1, ${result.year} • ${result.mayorName.toUpperCase()} ELECTED MAYOR`;
        bodyEl.innerHTML = `
          <div style="background:rgba(15,28,54,0.92);border:1.5px solid #4ade80;border-radius:8px;padding:14px;margin-bottom:10px;">
            <div style="font-size:13px;color:#e2e8f0;margin-bottom:10px;line-height:1.5;">
              Incumbent Computer Mayor <strong>${result.oldMayorName}</strong> lost the election with only <strong>${result.votePct.toFixed(1)}%</strong> of the vote! Because you ran for office, <strong>${result.mayorName}</strong> is now the new <strong>Mayor of ${this.world.cityName}</strong>!
            </div>
            <div class="insp-row"><span>${result.mayorName} (You — Winner):</span> <strong style="color:#4ade80;font-size:15px;">${challengerPct.toFixed(1)}% ✓</strong></div>
            <div class="insp-row"><span>Incumbent Mayor ${result.oldMayorName}:</span> <strong style="color:#f43f5e;">${result.votePct.toFixed(1)}%</strong></div>
          </div>
        `;
        actionsEl.innerHTML = `
          <button id="btn-election-take-mayor-office" class="cyber-btn accent">🏛 TAKE OFFICE AS MAYOR OF ${this.world.cityName.toUpperCase()}</button>
        `;
        document.getElementById('btn-election-take-mayor-office')?.addEventListener('click', () => {
          if (window.cyberAudio) window.cyberAudio.playUpgrade();
          modal.classList.add('hidden');
          this.world.playerRole = 'mayor';
          this.world.mayorName = result.mayorName || 'Vance';
          this.world.activeCampaignOptions = {};
          this.world.paidThisMonth = {};
          this.world.campaignMonthsActive = {};
          this.world.mayorStanding = null;
          this.streetView.indoorMayorX = 0.55;
          this.setGameMode('indoor');
          this.world.speed = 1;
          this.syncSpeedButtons();
          this.updateHUD();
        });
      } else {
        if (window.cyberAudio) window.cyberAudio.playClick();
        if (titleEl) {
          titleEl.textContent = result.mayorWon
            ? `🗳 AI MAYOR ${result.mayorName.toUpperCase()} RE-ELECTED`
            : `🗳 NEW AI MAYOR ${result.mayorName.toUpperCase()} ELECTED`;
        }
        if (subEl) subEl.textContent = `JANUARY 1, ${result.year} MUNICIPAL ELECTION REPORT`;
        const summaryMsg = result.mayorWon
          ? `Incumbent Computer Mayor <strong>${result.mayorName}</strong> won re-election with <strong>${result.votePct.toFixed(1)}%</strong> of the vote.`
          : `Incumbent Computer Mayor <strong>${result.oldMayorName}</strong> lost with <strong>${result.votePct.toFixed(1)}%</strong> of the vote! New Computer Mayor <strong>Mayor ${result.mayorName}</strong> (${result.newAiAlign === 'corrupt' ? 'Corrupt' : 'Good / Honest'}) has taken office at City Hall.`;

        bodyEl.innerHTML = `
          <div style="background:rgba(15,28,54,0.92);border:1.5px solid ${voteColor};border-radius:8px;padding:14px;margin-bottom:10px;">
            <div style="font-size:13px;color:#e2e8f0;margin-bottom:10px;line-height:1.5;">${summaryMsg}</div>
            <div class="insp-row"><span>Incumbent Vote Share:</span> <strong style="color:${voteColor};">${result.votePct.toFixed(1)}%</strong></div>
            <div class="insp-row"><span>Challenger Vote Share:</span> <strong>${challengerPct.toFixed(1)}%</strong></div>
          </div>
        `;
        actionsEl.innerHTML = `
          <button id="btn-election-ack-ai" class="cyber-btn primary">✓ CONTINUE</button>
        `;
        document.getElementById('btn-election-ack-ai')?.addEventListener('click', () => {
          if (window.cyberAudio) window.cyberAudio.playClick();
          modal.classList.add('hidden');
          this.world.speed = 1;
          this.syncSpeedButtons();
          this.updateHUD();
        });
      }
    }

    modal.classList.remove('hidden');
  }
}

window.GameUI = GameUI;
