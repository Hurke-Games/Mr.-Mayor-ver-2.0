// assets.js
const SPRITES = {
  buildings: {},
  curb: {},
  street: {},
  characters: {},
  props: {},
  loaded: false
};

function loadGameSprites(onComplete) {
  const manifest = {
    // Commercial Growth Stages
    'comm_0': 'sprites/buildings/comm_scaffold.png',
    'comm_1_bakery': 'sprites/buildings/bakery.png',
    'comm_1_cafe': 'sprites/buildings/cafe.png',
    'comm_1_grocery': 'sprites/buildings/grocery.png',
    'comm_2': 'sprites/buildings/comm_level2.png',
    'comm_3': 'sprites/buildings/comm_level3.png',
    'comm_4': 'sprites/buildings/comm_skyscraper.png',

    // Civic
    'city_hall': 'sprites/buildings/city_hall.png',
    'fire': 'sprites/buildings/fire_station.png',
    'police': 'sprites/buildings/police.png',
    'hospital': 'sprites/buildings/hospital.png',

    // Ground / Curbs
    'curb_left': 'sprites/ground/curb_left.png',
    'curb_mid': 'sprites/ground/curb_mid.png',
    'curb_right': 'sprites/ground/curb_right.png',
    'road_asphalt': 'sprites/ground/road_asphalt.png',
    'crosswalk': 'sprites/ground/crosswalk.png',

    // Mayor Character & Vehicles
    'mayor_idle': 'sprites/mayor/mayor_idle.png',
    'car_sedan': 'sprites/vehicles/sedan.png',
    'city_bus': 'sprites/vehicles/bus.png'
  };

  let total = Object.keys(manifest).length;
  let count = 0;

  for (const [key, src] of Object.entries(manifest)) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      count++;
      if (count >= total) {
        SPRITES.loaded = true;
        if (onComplete) onComplete();
      }
    };
    img.onerror = () => {
      console.warn(`Failed to load image: ${src}`);
      count++;
      if (count >= total && onComplete) onComplete();
    };
    SPRITES.buildings[key] = img;
  }
}

window.SPRITES = SPRITES;
window.loadGameSprites = loadGameSprites;