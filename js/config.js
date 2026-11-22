// Game Configuration, Buildings, Zone Progression, and Palette
// Building names use classic civic/urban terminology (no "cyber" prefixes)
const CONFIG = {
  GRID_SIZE: 56,
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,
  STARTING_CASH: 5000,
  DEFAULT_TAX_RATE: 9, // 9%

  // Zone Level Capacities & Visual Names
  ZONE_LEVELS: {
    res: {
      0: { name: 'Residential Zone Plot', maxPop: 0, taxBase: 0, sideSign: 'CONSTRUCTION' },
      1: { name: 'Suburban Cottages (L1)', maxPop: 40, taxBase: 12, sideSign: 'TOWNHOUSES' },
      2: { name: 'Brick Apartment Complex (L2)', maxPop: 140, taxBase: 36, sideSign: 'APARTMENTS' },
      3: { name: 'High-Rise Residential Tower (L3)', maxPop: 360, taxBase: 85, sideSign: 'RESIDENCES' },
      4: { name: 'Grand Condo Complex (L4 Ring)', maxPop: 720, taxBase: 190, sideSign: 'GRAND CONDOS' } // 2x pop & economic potential
    },
    comm: {
      0: { name: 'Commercial Zone Plot', maxPop: 0, taxBase: 0, sideSign: 'RETAIL LOT' },
      1: { name: 'Neighborhood Bakery, Cafe & Grocery (L1)', maxPop: 35, taxBase: 18, sideSign: 'BAKERY' },
      2: { name: 'Midtown Shopping Center (L2)', maxPop: 130, taxBase: 52, sideSign: 'GROCERY STORE' },
      3: { name: 'Downtown Commerce Block (L3)', maxPop: 340, taxBase: 125, sideSign: 'COMMERCE HUB' },
      4: { name: 'Grand Glass Skyscraper (L4 Ring)', maxPop: 680, taxBase: 270, sideSign: 'CENTRAL TOWER' } // 2x jobs & economic potential
    },
    ind: {
      0: { name: 'Industrial Zone Plot', maxPop: 0, taxBase: 0, pollution: 2, sideSign: 'INDUSTRIAL LOT' },
      1: { name: 'Freight Warehouses (L1)', maxPop: 45, taxBase: 16, pollution: 18, sideSign: 'WAREHOUSE' },
      2: { name: 'Manufacturing Factory (L2)', maxPop: 150, taxBase: 46, pollution: 38, sideSign: 'FACTORY WORKS' },
      3: { name: 'Heavy Steel Foundry (L3)', maxPop: 380, taxBase: 110, pollution: 65, sideSign: 'STEEL FOUNDRY' },
      4: { name: 'Grand Industrial Complex (L4)', maxPop: 760, taxBase: 230, pollution: 85, sideSign: 'INDUSTRIAL COMPLEX' }
    }
  },

  // Business Man Mode Configuration (Realistic 10x Annual Valuation + 20% Down Commercial Mortgages)
  // Commercial L1 = $1,000/mo ($12k/yr -> $120,000 Market Value, $24,000 20% Down Payment)
  // Industrial L1 = $1,500/mo ($18k/yr -> $180,000 Market Value, $36,000 20% Down Payment)
  BUSINESS_STARTING_CASH: 30000,
  BUSINESS_LOAN: {
    downPaymentPct: 0.20,  // 20% down payment when financing
    annualInterestRate: 0.065, // 6.5% APR commercial mortgage
    termMonths: 240,       // 20-year amortization
    maxLtvCollateralMult: 4.5 // Max total debt allowed relative to Net Worth / Equity
  },
  BUSINESS_SCALES: {
    comm: {
      1: { level: 1, label: 'Level 1 (Small Shop)', buyCost: 120000, upgradeCost: 72000, baseIncome: 1000 },
      2: { level: 2, label: 'Level 2 (Midtown Store)', buyCost: 264000, upgradeCost: 138000, baseIncome: 2200 },
      3: { level: 3, label: 'Level 3 (Commerce Hub)', buyCost: 540000, upgradeCost: 270000, baseIncome: 4500 },
      4: { level: 4, label: 'Max Level 4 (Commercial Tower)', buyCost: 1080000, upgradeCost: 0, baseIncome: 9000 }
    },
    ind: {
      1: { level: 1, label: 'Level 1 (Warehouse)', buyCost: 180000, upgradeCost: 108000, baseIncome: 1500 },
      2: { level: 2, label: 'Level 2 (Factory Works)', buyCost: 396000, upgradeCost: 210000, baseIncome: 3300 },
      3: { level: 3, label: 'Level 3 (Steel Foundry)', buyCost: 816000, upgradeCost: 402000, baseIncome: 6800 },
      4: { level: 4, label: 'Max Level 4 (Industrial Complex)', buyCost: 1620000, upgradeCost: 0, baseIncome: 13500 }
    },
    // Fallback by level
    1: { level: 1, label: 'Level 1', buyCost: 120000, upgradeCost: 72000, baseIncome: 1000 },
    2: { level: 2, label: 'Level 2', buyCost: 264000, upgradeCost: 138000, baseIncome: 2200 },
    3: { level: 3, label: 'Level 3', buyCost: 540000, upgradeCost: 270000, baseIncome: 4500 },
    4: { level: 4, label: 'Max Level 4', buyCost: 1080000, upgradeCost: 0, baseIncome: 9000 }
  },

  // Toolbar Categories
  CATEGORIES: [
    { id: 'zones', label: 'ZONING', icon: '⬡', color: '#4ade80' },
    { id: 'roads', label: 'TRANSIT', icon: '╬', color: '#38bdf8' },
    { id: 'power', label: 'POWER', icon: '⚡', color: '#facc15' },
    { id: 'civic', label: 'CIVIC', icon: '🛡', color: '#c084fc' },
    { id: 'edu', label: 'EDU & MORALE', icon: '★', color: '#f472b6' },
    { id: 'special', label: 'SPECIAL PROJECTS', icon: '🏆', color: '#f43f5e' },
    { id: 'env', label: 'ECO & WATER', icon: '❖', color: '#2dd4bf' },
    { id: 'demolish', label: 'BULLDOZE', icon: '✕', color: '#f87171' }
  ],

  // Buildable Tools & Structures
  TOOLS: {
    // ZONES (Light green for Res, Medium blue for Comm, Amber/Orange for Ind)
    zone_res: {
      id: 'zone_res',
      category: 'zones',
      name: 'Residential Zone',
      sideSign: 'APARTMENTS',
      cost: 25,
      upkeep: 0,
      powerUse: 5,
      color: '#6ee7b7', // Light green
      stroke: '#34d399',
      desc: 'Light-green zone for citizens. Evolves L1 Suburbs → L2 Apartments → L3 High-Rise. Surround any tile with 8 L3 plots at ≥90% morale for Tier-4 Condo Complex (2x pop/tax)!'
    },
    zone_comm: {
      id: 'zone_comm',
      category: 'zones',
      name: 'Commercial Zone',
      sideSign: 'BAKERY & CAFE',
      cost: 35,
      upkeep: 0,
      powerUse: 8,
      color: '#38bdf8', // Medium blue
      stroke: '#0284c7',
      desc: 'Medium-blue zone for shops & offices. Evolves L1 Bakery/Grocery/Cafe → L2 Shopping Center → L3 Downtown. Surround any tile with 8 L3 plots at ≥90% morale for Tier-4 Skyscraper!'
    },
    zone_ind: {
      id: 'zone_ind',
      category: 'zones',
      name: 'Industrial Zone',
      sideSign: 'FACTORY',
      cost: 30,
      upkeep: 0,
      powerUse: 12,
      color: '#fbbf24', // Amber
      stroke: '#f59e0b',
      desc: 'Industrial manufacturing sector. Evolves L1 Warehouses → L2 Factories → L3 Foundry. Generates tax revenue and pollution.'
    },

    // ROADS & TRANSIT
    road: {
      id: 'road',
      category: 'roads',
      name: 'City Road',
      cost: 10,
      upkeep: 1,
      powerUse: 0,
      trafficCap: 100,
      color: '#0f172a',
      stroke: '#38bdf8',
      desc: 'Standard interconnected asphalt street for cars, buses, and delivery trucks. Automatically forms bridges over rivers ($20).'
    },
    avenue: {
      id: 'avenue',
      category: 'roads',
      name: 'Main Avenue',
      cost: 25,
      upkeep: 2,
      powerUse: 1,
      trafficCap: 240,
      color: '#1e293b',
      stroke: '#00f5d4',
      desc: 'Dual-lane boulevard with median divide. Handles 2.4x traffic capacity and boosts nearby commercial flow.'
    },
    highway: {
      id: 'highway',
      category: 'roads',
      name: 'Express Highway',
      cost: 55,
      upkeep: 4,
      powerUse: 2,
      trafficCap: 500,
      color: '#1e1b4b',
      stroke: '#e879f9',
      desc: 'High-speed elevated expressway for heavy metropolitan traffic. Greatly reduces congestion across long distances.'
    },
    monorail: {
      id: 'monorail',
      category: 'roads',
      name: 'Raised Rail Track',
      cost: 40,
      upkeep: 3,
      powerUse: 3,
      trafficCap: 350,
      color: '#164e63',
      stroke: '#22d3ee',
      desc: 'Elevated rail tracks that can be built directly over roads or on open land. Connect with Railway Stations where roads and rail cross!'
    },
    bus_station: {
      id: 'bus_station',
      category: 'roads',
      name: 'Bus Station',
      sideSign: 'BUS STATION',
      cost: 160,
      upkeep: 10,
      powerUse: 8,
      trafficReductionPct: 20,
      moraleBoost: 10,
      radius: 8,
      color: '#38bdf8',
      stroke: '#00f5d4',
      desc: 'Dispatches municipal shuttle buses across an 8-tile range, lowering traffic by 20% within its coverage radius.'
    },
    railway_station: {
      id: 'railway_station',
      category: 'roads',
      name: 'Railway Station',
      sideSign: 'RAIL STATION',
      cost: 220,
      upkeep: 14,
      powerUse: 12,
      trafficCap: 350,
      trafficReductionPct: 30,
      moraleBoost: 18,
      radius: 10,
      color: '#06b6d4',
      stroke: '#22d3ee',
      desc: 'Entry and exit terminal for the Raised Rail system. Must be placed where roads and raised rail cross to allow passenger access and exit!'
    },

    // POWER & ELECTRICAL
    powerline_above: {
      id: 'powerline_above',
      category: 'power',
      name: 'Pylon Power Lines',
      sideSign: 'POWER GRID',
      cost: 8,
      upkeep: 0,
      powerUse: 0,
      color: '#fef08a',
      stroke: '#eab308',
      desc: 'Above-ground electrical power lines on steel pylons. Only power lines transport electricity (roads do not transport power).'
    },
    powerline_under: {
      id: 'powerline_under',
      category: 'power',
      name: 'Underground Power Conduit',
      cost: 18,
      upkeep: 0,
      powerUse: 0,
      color: '#fde047',
      stroke: '#ca8a04',
      desc: 'Subterranean electrical cable that can go under roads, buildings, and parks to transport power across streets!'
    },
    wind_plant: {
      id: 'wind_plant',
      category: 'power',
      name: 'Wind Turbine Array',
      sideSign: 'WIND POWER',
      cost: 220,
      upkeep: 8,
      powerGen: 180,
      pollution: 0,
      color: '#67e8f9',
      stroke: '#06b6d4',
      desc: 'Clean spinning wind turbines. Generates 180 MW of clean zero-pollution electricity.'
    },
    solar_plant: {
      id: 'solar_plant',
      category: 'power',
      name: 'Solar Collector Array',
      sideSign: 'SOLAR STATION',
      cost: 420,
      upkeep: 14,
      powerGen: 380,
      pollution: 0,
      color: '#fde047',
      stroke: '#38bdf8',
      desc: 'High-efficiency photovoltaic glass array. Generates 380 MW of zero-pollution power.'
    },
    coal_plant: {
      id: 'coal_plant',
      category: 'power',
      name: 'Coal Power Station',
      sideSign: 'POWER STATION',
      cost: 550,
      upkeep: 28,
      powerGen: 950,
      pollution: 75,
      radius: 6,
      color: '#f97316',
      stroke: '#ea580c',
      desc: 'Heavy generator with twin puffing smokestacks. Produces 950 MW at low cost, but emits heavy pollution.'
    },
    nuclear_plant: {
      id: 'nuclear_plant',
      category: 'power',
      name: 'Nuclear Power Plant',
      sideSign: 'NUCLEAR PLANT',
      cost: 1400,
      upkeep: 65,
      powerGen: 2600,
      pollution: 8,
      radius: 4,
      color: '#22d3ee',
      stroke: '#a855f7',
      desc: 'Reactor core with twin hyperbolic cooling towers and rising steam. Generates 2,600 MW with minimal pollution.'
    },

    // CIVIC & EMERGENCY SERVICES
    police: {
      id: 'police',
      category: 'civic',
      name: 'Police Station',
      sideSign: 'POLICE DEPT',
      cost: 280,
      upkeep: 18,
      powerUse: 15,
      crimeReduction: 85,
      radius: 9,
      color: '#3b82f6',
      stroke: '#60a5fa',
      desc: 'Deploys patrol cruisers and suppresses crime in a 9-tile radius. Essential for high morale and commercial growth.'
    },
    fire: {
      id: 'fire',
      category: 'civic',
      name: 'Fire & Rescue Station',
      sideSign: 'FIRE & RESCUE',
      cost: 240,
      upkeep: 15,
      powerUse: 12,
      moraleBoost: 12,
      crimeReduction: 20,
      radius: 8,
      color: '#ef4444',
      stroke: '#f87171',
      desc: 'Protects industrial and dense residential sectors from hazards, improving neighborhood safety and morale.'
    },
    hospital: {
      id: 'hospital',
      category: 'civic',
      name: 'General Hospital',
      sideSign: 'HOSPITAL',
      cost: 360,
      upkeep: 24,
      powerUse: 25,
      healthBoost: 90,
      moraleBoost: 18,
      radius: 10,
      color: '#10b981',
      stroke: '#34d399',
      desc: 'Provides advanced healthcare coverage in a 10-tile radius. Crucial for reaching 90%+ citizen morale and max population.'
    },
    city_hall: {
      id: 'city_hall',
      category: 'civic',
      name: 'City Hall & Plaza (2x2)',
      sideSign: 'CITY HALL',
      size: 2,
      cost: 800,
      upkeep: 35,
      powerUse: 30,
      moraleBoost: 30,
      crimeReduction: 30,
      radius: 14,
      color: '#e879f9',
      stroke: '#f0abfc',
      desc: 'Grand 2x2 civic headquarters with monument plaza. Enter City Hall from the street to access the full City Planning Map!'
    },

    // EDUCATION & ENTERTAINMENT / MORALE
    school: {
      id: 'school',
      category: 'edu',
      name: 'Public School & Playground (2x2)',
      sideSign: 'CITY SCHOOL',
      size: 2,
      cost: 220,
      upkeep: 14,
      powerUse: 10,
      moraleBoost: 22,
      healthBoost: 15,
      radius: 8,
      color: '#fb7185',
      stroke: '#fda4af',
      desc: '2x2 neighborhood school with playground. Raises residential satisfaction and commercial workforce skill.'
    },
    university: {
      id: 'university',
      category: 'edu',
      name: 'State University (2x2)',
      sideSign: 'UNI CAMPUS',
      size: 2,
      cost: 520,
      upkeep: 30,
      powerUse: 25,
      moraleBoost: 32,
      crimeReduction: 25,
      radius: 11,
      color: '#a855f7',
      stroke: '#c084fc',
      desc: 'Advanced research campus. Boosts morale, lowers crime, and accelerates Tier-3 & Tier-4 commercial/industrial upgrades.'
    },
    // SPECIAL PROJECTS
    stadium: {
      id: 'stadium',
      category: 'special',
      name: 'City Stadium (5x5)',
      sideSign: 'CITY STADIUM',
      size: 5,
      cost: 750,
      upkeep: 40,
      powerUse: 45,
      moraleBoost: 55,
      radius: 15,
      color: '#f43f5e',
      stroke: '#38bdf8',
      desc: 'Colossal 5x5 Special Project arena with flickering floodlights. Provides a massive +55 entertainment & morale boost in a 15-tile radius!'
    },

    // ECO, SCRUBBERS & WATER
    park: {
      id: 'park',
      category: 'env',
      name: 'City Park & Plaza',
      sideSign: 'CITY PARK',
      cost: 45,
      upkeep: 2,
      powerUse: 1,
      pollutionReduction: 28,
      moraleBoost: 20,
      radius: 4,
      color: '#34d399',
      stroke: '#10b981',
      desc: 'Lush trees and fountain plaza. Absorbs local pollution and makes an ideal centerpiece for a Tier-4 3x3 ring!'
    },
    scrubber: {
      id: 'scrubber',
      category: 'env',
      name: 'Air Scrubber Tower',
      sideSign: 'AIR PURIFIER',
      cost: 260,
      upkeep: 16,
      powerUse: 20,
      pollutionReduction: 85,
      radius: 7,
      color: '#2dd4bf',
      stroke: '#14b8a6',
      desc: 'Industrial air purifier. Neutralizes heavy factory and coal plant pollution in a 7-tile radius.'
    },
    water_pump: {
      id: 'water_pump',
      category: 'env',
      name: 'Water Pumping Station',
      sideSign: 'WATER WORKS',
      cost: 180,
      upkeep: 10,
      powerUse: 10,
      healthBoost: 25,
      pollutionReduction: 20,
      radius: 6,
      color: '#0ea5e9',
      stroke: '#38bdf8',
      desc: 'Requires a water square (river or lake) within its 6-tile range to operate! Connect Underground Water Pipes to deliver water across the city.'
    },
    water_pipe: {
      id: 'water_pipe',
      category: 'env',
      name: 'Underground Water Pipe',
      cost: 12,
      upkeep: 0,
      powerUse: 0,
      color: '#38bdf8',
      stroke: '#0284c7',
      desc: 'Subterranean water pipe that runs under roads, buildings, and water to deliver clean water from an active Water Pumping Station.'
    },

    // DEMOLISH
    demolish: {
      id: 'demolish',
      category: 'demolish',
      name: 'Demolish / Bulldoze',
      cost: 5,
      upkeep: 0,
      color: '#ef4444',
      stroke: '#f87171',
      desc: 'Clears buildings, roads, raised rail, or underground power/water conduits on the selected tile.'
    }
  },

  // Data Overlays (Mayor Municipal Overlays vs Business Man Investment Overlays)
  OVERLAYS: [
    { id: 'none', name: 'Normal View', key: '1', color: '#38bdf8' },
    { id: 'power', name: 'Electrical Grid', key: '2', color: '#facc15' },
    { id: 'water', name: 'Water View', key: '3', color: '#0ea5e9' },
    { id: 'pollution', name: 'Pollution', key: '4', color: '#a3e635' },
    { id: 'crime', name: 'Crime Rate', key: '5', color: '#f87171' },
    { id: 'traffic', name: 'Traffic Flow', key: '6', color: '#fb923c' },
    { id: 'health', name: 'Healthcare', key: '7', color: '#34d399' },
    { id: 'morale', name: 'Entertainment / Morale', key: '8', color: '#e879f9' }
  ],

  BUSINESS_OVERLAYS: [
    { id: 'none', name: 'Ownership & For Sale', key: '1', color: '#4ade80' },
    { id: 'biz_profit', name: 'Monthly Profit Heatmap', key: '2', color: '#facc15' },
    { id: 'biz_scale', name: 'Building Scale (L1–L4)', key: '3', color: '#38bdf8' },
    { id: 'biz_climate', name: 'Ethics & Subsidy Climate', key: '4', color: '#e879f9' }
  ]
};

window.CONFIG = CONFIG;
