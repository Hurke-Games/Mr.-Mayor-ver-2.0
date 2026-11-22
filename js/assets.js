// assets.js - Preloader and tight bounding-box metadata for sliced PNG assets & Mr Mayor animation frames
const SPRITES = {
  buildings: {},
  mayor: {},
  vehicles: {},
  pedestrians: {},
  crops: {
    // Tight opaque source rectangles (sx, sy, sw, sh) measured from the PNG canvases
    // Ground / Street Deck tiles
    'curb_mid': {
      sx: 232,
      sy: 63,
      sw: 280,
      sh: 275,
      sidewalkH: 85,
      roadY: 148,
      cleanRoadX: 327,
      cleanRoadW: 185
    },
    'curb_left': { sx: 348, sy: 44, sw: 88, sh: 280, sidewalkH: 84 },
    'curb_right': { sx: 357, sy: 47, sw: 88, sh: 279, sidewalkH: 84 },
    'road_asphalt': { sx: 463, sy: 123, sw: 84, sh: 264 },
    'crosswalk': { sx: 458, sy: 112, sw: 120, sh: 258 },

    // Building Facade Sprites (tight building bounds flush with ground base)
    'comm_1_bakery': { sx: 408, sy: 152, sw: 228, sh: 245, baseH: 255, doorRatio: 0.68, yOffset: 6 },
    'comm_1_grocery': { sx: 434, sy: 170, sw: 176, sh: 226, baseH: 235, doorRatio: 0.70, yOffset: 11 },
    'comm_1_cafe': { sx: 424, sy: 160, sw: 194, sh: 229, baseH: 245, doorRatio: 0.24, yOffset: 6 },
    // 1x1 Civic / Emergency Buildings (1 street block wide ~246px, no growth scaling)
    'fire': { sx: 404, sy: 136, sw: 249, sh: 247, baseH: 342, targetW: 246, targetH: 342, doorRatio: 0.50, yOffset: 6 },
    'police': { sx: 164, sy: 60, sw: 929, sh: 691, baseH: 293, targetW: 246, targetH: 293, doorRatio: 0.43, yOffset: 16 },
    // 2x2 Civic / Education Buildings (2 street blocks wide ~480-485px across 500px 2-slot span, no growth scaling)
    'city_hall': { sx: 156, sy: 25, sw: 1147, sh: 810, baseH: 441, targetW: 480, targetH: 441, doorRatio: 0.50, yOffset: 13, spanBlocks: 2 },
    'school': { sx: 82, sy: 66, sw: 1303, sh: 612, baseH: 296, targetW: 485, targetH: 296, doorRatio: 0.34, yOffset: 18, spanBlocks: 2 },
    'university': { sx: 145, sy: 166, sw: 1192, sh: 693, baseH: 321, targetW: 480, targetH: 321, doorRatio: 0.50, yOffset: 13, spanBlocks: 2 },

    // Parallax Background Layers
    'bg_sky': { sx: 0, sy: 0, sw: 2752, sh: 1536 },
    'bg_sky_day': { sx: 0, sy: 0, sw: 2752, sh: 1536 },
    'bg_skyline_far': { sx: 0, sy: 6, sw: 3168, sh: 1336 },
    'bg_skyline_far_day': { sx: 0, sy: 20, sw: 2750, sh: 1104 },
    'bg_train': { sx: 0, sy: 230, sw: 2750, sh: 1208 },
    'bg_train_day': { sx: 2, sy: 238, sw: 2748, sh: 1176 },
    'bg_train_viaduct': { sx: 0, sy: 230, sw: 2750, sh: 1208 },
    'bg_power_lines': { sx: 1360, sy: 230, sw: 1390, sh: 1208 },
    'by_sidewalkandstreet': { sx: 0, sy: 62, sw: 2750, sh: 836, sidewalkTopY: 409, roadBottomY: 894 },
    'by_sidewalkandstreet_day': { sx: 10, sy: 558, sw: 2720, sh: 592, sidewalkTopY: 805, roadBottomY: 1150 }
  },
  // Per-file Y-baseline, horizontal center, and scale calibration for Mr Mayor (400x634 source PNGs).
  // Normalizes every frame to the 456px walk height baseline (cMinY = top of hat, cMaxY = bottom of shoe sole)
  // and locks the shoe soles to the ground baseline. Optional yOffset/xOffset allow manual fine-tuning.
  mayorFrames: {
    'R':   { cMinY: 10,  cMaxY: 627, charH: 618, cx: 225.5, scale: 0.7379, yOffset: 0, xOffset: 0 },
    'L':   { cMinY: 10,  cMaxY: 627, charH: 618, cx: 173.5, scale: 0.7379, yOffset: 0, xOffset: 0 },
    '1R':  { cMinY: 172, cMaxY: 621, charH: 450, cx: 201.5, scale: 1.0133, yOffset: 0, xOffset: 0 },
    '2R':  { cMinY: 173, cMaxY: 621, charH: 449, cx: 200.5, scale: 1.0156, yOffset: 0, xOffset: 0 },
    '3R':  { cMinY: 176, cMaxY: 626, charH: 451, cx: 197.5, scale: 1.0111, yOffset: 0, xOffset: 0 },
    '4R':  { cMinY: 169, cMaxY: 620, charH: 452, cx: 198.5, scale: 1.0088, yOffset: 0, xOffset: 0 },
    '5R':  { cMinY: 168, cMaxY: 622, charH: 455, cx: 195.5, scale: 1.0022, yOffset: 0, xOffset: 0 },
    '6R':  { cMinY: 167, cMaxY: 620, charH: 454, cx: 199.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    '7R':  { cMinY: 164, cMaxY: 619, charH: 456, cx: 202.5, scale: 1.0000, yOffset: 0, xOffset: 0 },
    '8R':  { cMinY: 163, cMaxY: 621, charH: 459, cx: 196.0, scale: 0.9935, yOffset: 0, xOffset: 0 },
    '9R':  { cMinY: 164, cMaxY: 623, charH: 460, cx: 193.0, scale: 0.9913, yOffset: 0, xOffset: 0 },
    '10R': { cMinY: 163, cMaxY: 621, charH: 459, cx: 185.0, scale: 0.9935, yOffset: 0, xOffset: 0 },
    '11R': { cMinY: 166, cMaxY: 622, charH: 457, cx: 189.0, scale: 0.9978, yOffset: 0, xOffset: 0 },
    '12R': { cMinY: 165, cMaxY: 621, charH: 457, cx: 196.0, scale: 0.9978, yOffset: 0, xOffset: 0 },
    '13R': { cMinY: 172, cMaxY: 625, charH: 454, cx: 196.5, scale: 1.0044, yOffset: 0, xOffset: 0 },
    '14R': { cMinY: 175, cMaxY: 628, charH: 454, cx: 204.5, scale: 1.0044, yOffset: 0, xOffset: 0 },
    '15R': { cMinY: 164, cMaxY: 617, charH: 454, cx: 202.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    '16R': { cMinY: 173, cMaxY: 626, charH: 454, cx: 195.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    '17R': { cMinY: 171, cMaxY: 619, charH: 449, cx: 205.5, scale: 1.0156, yOffset: 0, xOffset: 0 },
    '18R': { cMinY: 173, cMaxY: 621, charH: 449, cx: 208.0, scale: 1.0156, yOffset: 0, xOffset: 0 },
    '19R': { cMinY: 180, cMaxY: 630, charH: 451, cx: 196.5, scale: 1.0111, yOffset: 0, xOffset: 0 },
    '20R': { cMinY: 175, cMaxY: 628, charH: 454, cx: 202.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    '21R': { cMinY: 170, cMaxY: 626, charH: 457, cx: 195.5, scale: 0.9978, yOffset: 0, xOffset: 0 },
    '22R': { cMinY: 162, cMaxY: 619, charH: 458, cx: 198.5, scale: 0.9956, yOffset: 0, xOffset: 0 },
    '23R': { cMinY: 170, cMaxY: 628, charH: 459, cx: 194.0, scale: 0.9935, yOffset: 0, xOffset: 0 },
    '24R': { cMinY: 169, cMaxY: 626, charH: 458, cx: 197.0, scale: 0.9956, yOffset: 0, xOffset: 0 },
    '25R': { cMinY: 169, cMaxY: 630, charH: 462, cx: 202.0, scale: 0.9870, yOffset: 0, xOffset: 0 },
    '26R': { cMinY: 169, cMaxY: 629, charH: 461, cx: 196.0, scale: 0.9892, yOffset: 0, xOffset: 0 },
    '27R': { cMinY: 168, cMaxY: 630, charH: 463, cx: 202.5, scale: 0.9849, yOffset: 0, xOffset: 0 },
    '28R': { cMinY: 167, cMaxY: 627, charH: 461, cx: 198.5, scale: 0.9892, yOffset: 0, xOffset: 0 },
    '29R': { cMinY: 169, cMaxY: 629, charH: 461, cx: 200.5, scale: 0.9892, yOffset: 0, xOffset: 0 },
    '30R': { cMinY: 143, cMaxY: 624, charH: 482, cx: 202.0, scale: 0.9461, yOffset: 0, xOffset: 0 },
    '31R': { cMinY: 152, cMaxY: 628, charH: 477, cx: 207.0, scale: 0.9560, yOffset: 0, xOffset: 0 },
    '32R': { cMinY: 150, cMaxY: 626, charH: 477, cx: 203.0, scale: 0.9560, yOffset: 0, xOffset: 0 },
    '33R': { cMinY: 152, cMaxY: 625, charH: 474, cx: 200.5, scale: 0.9620, yOffset: 0, xOffset: 0 },
    '34R': { cMinY: 152, cMaxY: 624, charH: 473, cx: 203.0, scale: 0.9641, yOffset: 0, xOffset: 0 },
    '35R': { cMinY: 173, cMaxY: 624, charH: 452, cx: 210.5, scale: 1.0088, yOffset: 0, xOffset: 0 },
    '36R': { cMinY: 166, cMaxY: 619, charH: 454, cx: 205.0, scale: 1.0044, yOffset: 0, xOffset: 0 },

    'L1':  { cMinY: 172, cMaxY: 621, charH: 450, cx: 197.5, scale: 1.0133, yOffset: 0, xOffset: 0 },
    'L2':  { cMinY: 173, cMaxY: 621, charH: 449, cx: 198.5, scale: 1.0156, yOffset: 0, xOffset: 0 },
    'L3':  { cMinY: 176, cMaxY: 626, charH: 451, cx: 201.5, scale: 1.0111, yOffset: 0, xOffset: 0 },
    'L4':  { cMinY: 169, cMaxY: 620, charH: 452, cx: 200.5, scale: 1.0088, yOffset: 0, xOffset: 0 },
    'L5':  { cMinY: 168, cMaxY: 622, charH: 455, cx: 203.5, scale: 1.0022, yOffset: 0, xOffset: 0 },
    'L6':  { cMinY: 167, cMaxY: 620, charH: 454, cx: 200.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    'L7':  { cMinY: 164, cMaxY: 619, charH: 456, cx: 196.5, scale: 1.0000, yOffset: 0, xOffset: 0 },
    'L8':  { cMinY: 163, cMaxY: 621, charH: 459, cx: 203.0, scale: 0.9935, yOffset: 0, xOffset: 0 },
    'L9':  { cMinY: 164, cMaxY: 623, charH: 460, cx: 206.0, scale: 0.9913, yOffset: 0, xOffset: 0 },
    'L10': { cMinY: 163, cMaxY: 621, charH: 459, cx: 214.0, scale: 0.9935, yOffset: 0, xOffset: 0 },
    'L11': { cMinY: 166, cMaxY: 622, charH: 457, cx: 210.0, scale: 0.9978, yOffset: 0, xOffset: 0 },
    'L12': { cMinY: 165, cMaxY: 621, charH: 457, cx: 203.0, scale: 0.9978, yOffset: 0, xOffset: 0 },
    'L13': { cMinY: 172, cMaxY: 625, charH: 454, cx: 202.5, scale: 1.0044, yOffset: 0, xOffset: 0 },
    'L14': { cMinY: 175, cMaxY: 628, charH: 454, cx: 194.5, scale: 1.0044, yOffset: 0, xOffset: 0 },
    'L15': { cMinY: 164, cMaxY: 617, charH: 454, cx: 197.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    'L16': { cMinY: 173, cMaxY: 626, charH: 454, cx: 204.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    'L17': { cMinY: 171, cMaxY: 619, charH: 449, cx: 193.5, scale: 1.0156, yOffset: 0, xOffset: 0 },
    'L18': { cMinY: 173, cMaxY: 621, charH: 449, cx: 191.0, scale: 1.0156, yOffset: 0, xOffset: 0 },
    'L19': { cMinY: 180, cMaxY: 630, charH: 451, cx: 202.5, scale: 1.0111, yOffset: 0, xOffset: 0 },
    'L20': { cMinY: 175, cMaxY: 628, charH: 454, cx: 197.0, scale: 1.0044, yOffset: 0, xOffset: 0 },
    'L21': { cMinY: 170, cMaxY: 626, charH: 457, cx: 203.5, scale: 0.9978, yOffset: 0, xOffset: 0 },
    'L22': { cMinY: 162, cMaxY: 619, charH: 458, cx: 200.5, scale: 0.9956, yOffset: 0, xOffset: 0 },
    'L23': { cMinY: 170, cMaxY: 628, charH: 459, cx: 205.0, scale: 0.9935, yOffset: 0, xOffset: 0 },
    'L24': { cMinY: 169, cMaxY: 626, charH: 458, cx: 202.0, scale: 0.9956, yOffset: 0, xOffset: 0 },
    'L25': { cMinY: 169, cMaxY: 630, charH: 462, cx: 197.0, scale: 0.9870, yOffset: 0, xOffset: 0 },
    'L26': { cMinY: 169, cMaxY: 629, charH: 461, cx: 203.0, scale: 0.9892, yOffset: 0, xOffset: 0 },
    'L27': { cMinY: 168, cMaxY: 630, charH: 463, cx: 196.5, scale: 0.9849, yOffset: 0, xOffset: 0 },
    'L28': { cMinY: 167, cMaxY: 627, charH: 461, cx: 200.5, scale: 0.9892, yOffset: 0, xOffset: 0 },
    'L29': { cMinY: 169, cMaxY: 629, charH: 461, cx: 198.5, scale: 0.9892, yOffset: 0, xOffset: 0 },
    'L30': { cMinY: 143, cMaxY: 624, charH: 482, cx: 197.0, scale: 0.9461, yOffset: 0, xOffset: 0 },
    'L31': { cMinY: 152, cMaxY: 628, charH: 477, cx: 192.0, scale: 0.9560, yOffset: 0, xOffset: 0 },
    'L32': { cMinY: 150, cMaxY: 626, charH: 477, cx: 196.0, scale: 0.9560, yOffset: 0, xOffset: 0 },
    'L33': { cMinY: 152, cMaxY: 625, charH: 474, cx: 198.5, scale: 0.9620, yOffset: 0, xOffset: 0 },
    'L34': { cMinY: 152, cMaxY: 624, charH: 473, cx: 196.0, scale: 0.9641, yOffset: 0, xOffset: 0 },
    'L35': { cMinY: 173, cMaxY: 624, charH: 452, cx: 188.5, scale: 1.0088, yOffset: 0, xOffset: 0 },
    'L36': { cMinY: 166, cMaxY: 619, charH: 454, cx: 194.0, scale: 1.0044, yOffset: 0, xOffset: 0 }
  },
  loaded: false
};

function loadGameSprites(onComplete) {
  const manifest = {
    // 4-Layer Parallax Background System (in sprites/backgrounds/)
    'bg_sky': 'sprites/backgrounds/bg_sky.png',
    'bg_sky_day': 'sprites/backgrounds/bg_sky_day.png',
    'bg_skyline_far': 'sprites/backgrounds/bg_skyline_far.png',
    'bg_skyline_far_day': 'sprites/backgrounds/bg_skyline_far_day.png',
    'bg_train': 'sprites/backgrounds/bg_train.png',
    'bg_train_day': 'sprites/backgrounds/bg_train_day.png',
    'bg_train_viaduct': 'sprites/backgrounds/bg_train_viaduct.png',
    'bg_power_lines': 'sprites/backgrounds/bg_power_lines.png',
    'by_sidewalkandstreet': 'sprites/backgrounds/bg_sidewalkandstreet.png',
    'by_sidewalkandstreet_day': 'sprites/backgrounds/by_sidewalkandstreet_day.png',

    // Indoor Locations (in sprites/backgrounds/Indoor locations/)
    'indoor_mayor_office': "sprites/backgrounds/Indoor locations/Mayor's Office.png",

    // Storefront & Civic Building Facades
    'comm_1_bakery': 'sprites/buildings/bakery.png',
    'comm_1_grocery': 'sprites/buildings/grocery.png',
    'comm_1_cafe': 'sprites/buildings/cafe.png',
    'fire': 'sprites/buildings/fire_station.png',
    'police': 'sprites/buildings/Police.png',
    'city_hall': 'sprites/buildings/City_Hall.png',
    'school': 'sprites/buildings/School.png',
    'university': 'sprites/buildings/University.png',

    // Street Deck & Curb Sprites
    'curb_left': 'sprites/ground/curb_left.png',
    'curb_mid': 'sprites/ground/curb_mid.png',
    'curb_right': 'sprites/ground/curb_right.png',
    'road_asphalt': 'sprites/ground/road_asphalt.png',
    'crosswalk': 'sprites/ground/crosswalk.png'
  };

  // Mr Mayor Character Animation Sprites (in sprites/Characters/Mr Mayor/)
  const mayorManifest = {
    'Face': 'sprites/Characters/Mr Mayor/Face.png',
    'R': 'sprites/Characters/Mr Mayor/R.png',
    'R_fallback': 'sprites/Characters/Mr Mayor/R.jpg',
    'L': 'sprites/Characters/Mr Mayor/L.png'
  };
  for (let i = 1; i <= 36; i++) {
    mayorManifest[`${i}R`] = `sprites/Characters/Mr Mayor/${i}R.png`;
    mayorManifest[`L${i}`] = `sprites/Characters/Mr Mayor/L${i}.png`;
  }

  // Vehicle Animation Frames (in sprites/Animation frames/)
  // Car1..Car6: native Left-to-Right (dir = 1)
  // bus3..bus6: native Right-to-Left (dir = -1)
  const vehicleManifest = {};
  for (let i = 1; i <= 6; i++) {
    vehicleManifest[`car${i}`] = `sprites/Animation frames/Car${i}.png`;
  }
  for (let i = 3; i <= 6; i++) {
    vehicleManifest[`bus${i}`] = `sprites/Animation frames/bus${i}.png`;
  }

  // Pedestrian Animation Frames (in sprites/Animation frames/)
  // Sequence: Girl1a, Girl2, Girl3, Girl4, Girl1b, Girl2, Girl3, Girl4
  const pedestrianManifest = {
    'Girl1a': 'sprites/Animation frames/Girl1a.png',
    'Girl1b': 'sprites/Animation frames/Girl1b.png',
    'Girl2': 'sprites/Animation frames/Girl2.png',
    'Girl3': 'sprites/Animation frames/Girl3.png',
    'Girl4': 'sprites/Animation frames/Girl4.png'
  };

  const buildingKeys = Object.keys(manifest);
  const mayorKeys = Object.keys(mayorManifest);
  const vehicleKeys = Object.keys(vehicleManifest);
  const pedestrianKeys = Object.keys(pedestrianManifest);
  const total = buildingKeys.length + mayorKeys.length + vehicleKeys.length + pedestrianKeys.length;
  let loadedCount = 0;

  const checkDone = () => {
    loadedCount++;
    if (loadedCount >= total) {
      if (!SPRITES.mayor['R'] || !SPRITES.mayor['R'].naturalWidth) {
        SPRITES.mayor['R'] = SPRITES.mayor['R_fallback'];
      }
      SPRITES.loaded = true;
      if (onComplete) onComplete();
    }
  };

  buildingKeys.forEach(key => {
    const img = new Image();
    img.src = manifest[key];
    img.onload = checkDone;
    img.onerror = () => {
      console.warn(`[Sprite Missing] Could not load ${manifest[key]}.`);
      checkDone();
    };
    SPRITES.buildings[key] = img;
  });

  mayorKeys.forEach(key => {
    const img = new Image();
    img.src = mayorManifest[key];
    img.onload = checkDone;
    img.onerror = () => {
      if (key === 'R') {
        // Fallback to R.jpg if R.png is not present
        img.src = 'sprites/Characters/Mr Mayor/R.jpg';
      }
      checkDone();
    };
    SPRITES.mayor[key] = img;
  });

  vehicleKeys.forEach(key => {
    const img = new Image();
    img.src = vehicleManifest[key];
    img.onload = checkDone;
    img.onerror = () => {
      console.warn(`[Sprite Missing] Could not load ${vehicleManifest[key]}.`);
      checkDone();
    };
    SPRITES.vehicles[key] = img;
  });

  pedestrianKeys.forEach(key => {
    const img = new Image();
    img.src = pedestrianManifest[key];
    img.onload = checkDone;
    img.onerror = () => {
      console.warn(`[Sprite Missing] Could not load ${pedestrianManifest[key]}.`);
      checkDone();
    };
    SPRITES.pedestrians[key] = img;
  });
}

window.SPRITES = SPRITES;
window.loadGameSprites = loadGameSprites;
