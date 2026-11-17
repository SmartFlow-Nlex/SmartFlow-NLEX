/**
 * Everything the game says, in one place, so a Filipino version can sit beside it later.
 * Lines are short on purpose: one sentence at a time, and the detail lives in the Atlas
 * and behind "See the numbers". Story lines are fiction; anything stated as fact about a
 * species comes from core/speciesFacts.ts, which lists a source for each record.
 */

export type Locale = 'en';

/** The one line on screen for each step: a few words, no more. */
export const OBJECTIVES: Record<string, string> = {
  'obj.find': 'Find the hurt hornbill',
  'obj.path': 'Clear the path',
  'obj.help': 'Help the ranger',
  'obj.gridFind': 'Find the broken scanner',
  'obj.gridFix': 'Fix the scanner',
  'obj.gridFlow': 'Get the traffic moving',
  'obj.riverCollect': 'Pick up the litter',
  'obj.riverClear': 'Clear the blockage',
  'obj.riverWildlife': 'Spot the animals coming back',
  'obj.ecoFind': 'Find the power switch',
  'obj.ecoConnect': 'Connect the solar panels',
  'obj.ecoSwitch': 'Turn on the solar power',
  'obj.yardGather': 'Collect the supplies',
  'obj.yardChoose': 'Choose a greener vehicle',
  'obj.yardSend': 'Send the delivery',
  'obj.routePick': 'Pick up the supplies',
  'obj.routeChoose': 'Choose a suitable route',
  'obj.routeDeliver': 'Complete the delivery',
  'obj.smartCollect': 'Collect the parcels',
  'obj.smartCombine': 'Combine the deliveries',
  'obj.smartDispatch': 'Dispatch the vehicle',
  'obj.cargoFind': 'Find the supplies',
  'obj.cargoLoad': 'Load the right vehicle',
  'obj.cargoSend': 'Send the cargo',
  'obj.maintInspect': 'Inspect the equipment',
  'obj.maintTools': 'Collect the repair tools',
  'obj.maintDispatch': 'Send one coordinated dispatch',
  'obj.fuelInspect': 'Inspect the service van',
  'obj.fuelFix': 'Fix the tyre pressure',
  'obj.fuelTest': 'Run a test dispatch',
  'obj.nightFind': 'Find the control room',
  'obj.nightRepair': 'Repair the lighting controller',
  'obj.nightLights': 'Switch on smart lighting',
  'obj.rainFind': 'Find the blocked drain',
  'obj.rainClear': 'Remove the debris',
  'obj.rainHelp': 'Help the maintenance team',
  'obj.patrolPoints': 'Find the inspection points',
  'obj.patrolRoute': 'Choose the patrol route',
  'obj.patrolGo': 'Complete the inspection',
};

/** Navie's hint for each step: one sentence, saying who can do it. */
export const HINTS: Record<string, string> = {
  'obj.find': 'Walk to the creek bank, then Sukat scans the bird.',
  'obj.path': 'Dayo moves the log, and Baging or Awit bridges the creek.',
  'obj.help': 'Bring the kit to the tent, then plant two saplings.',
  'obj.gridFind': 'The scanner is by the last booth. Sukat can scan it.',
  'obj.gridFix': 'Tap the scanner, then turn the pieces to join the wires.',
  'obj.gridFlow': 'Tap lanes to open them. The hint button fills one in.',
  'obj.riverCollect': 'Tap each piece. Baging reaches the floating bottle.',
  'obj.riverClear': 'The trash rack is under the road. Baging or Dayo clears it.',
  'obj.riverWildlife': 'Walk along the bank and take a photo of each animal.',
  'obj.ecoFind': 'The power switch is on the workshop wall.',
  'obj.ecoConnect': 'Dayo climbs, or Awit glides, up to the roof box.',
  'obj.ecoSwitch': 'Back to the power switch. Flip it on!',
  'obj.yardGather': 'Each supply needs one hero. The button says who.',
  'obj.yardChoose': 'Tap the van and pick the greenest vehicle.',
  'obj.yardSend': 'Tap the van to send it off.',
  'obj.routePick': 'Three supply crates are in the yard. Anyone can grab them.',
  'obj.routeChoose': 'Tap the van and compare the routes.',
  'obj.routeDeliver': 'Tap the van to send the crew off.',
  'obj.smartCollect': 'Four parcels are around the yard. Anyone can pick them up.',
  'obj.smartCombine': 'Tap the van. Can one vehicle carry everything?',
  'obj.smartDispatch': 'Tap the van to send it off.',
  'obj.cargoFind': 'The supplies are stacked in the yard. Anyone can check them.',
  'obj.cargoLoad': 'Tap the van, pick a vehicle, then pack the cargo.',
  'obj.cargoSend': 'Tap the vehicle to send it.',
  'obj.maintInspect': 'Check the two flagged spots. Anyone can inspect them.',
  'obj.maintTools': 'Three tools are around the depot. Anyone can grab them.',
  'obj.maintDispatch': 'At the van: plan one trip, then send the crew.',
  'obj.fuelInspect': 'The service van is parked in the yard.',
  'obj.fuelFix': 'Tap the van and set each tyre right.',
  'obj.fuelTest': 'Choose how the van waits, then send it on its test run.',
  'obj.nightFind': 'The control room is the office by the trucks.',
  'obj.nightRepair': 'Tap the controller and join the wires.',
  'obj.nightLights': 'Choose a setting that keeps the safety lamps on.',
  'obj.rainFind': 'The blocked drain is by the creek road.',
  'obj.rainClear': 'Pick up the three piles of debris. Anyone can do it.',
  'obj.rainHelp': 'At the crew van: choose how they travel, then send them.',
  'obj.patrolPoints': 'Walk to each flag along the creek.',
  'obj.patrolRoute': 'Tap the patrol car and compare the routes.',
  'obj.patrolGo': 'Tap the patrol car to start the patrol.',
};

/** The Hornbill Homecoming. */
export const LINES = {
  tooClose: 'Too close! Let’s give the bird some space.',
  open1: 'Look! A big bird by the creek. Its wing looks hurt.',
  open2: 'Let’s stay back and scan it from the bank.',
  scan1: 'A rufous hornbill! Netting is caught on his wing.',
  scan2: 'Our truck is stuck behind a fallen tree. Can you clear the path?',
  logDayo: 'Hup! The track is clear!',
  logBaging: 'Stre-e-etch! The track is clear!',
  bridgeVine: 'Vine bridge, ready!',
  bridgeRope: 'Rope bridge, ready!',
  rangerKit: 'Thank you! Please bring the kit to the tent.',
  assess1: 'Stay back, please. I will check him.',
  assess3b: 'Only bruised! And it isn’t the nesting months, so no mate is waiting on him.',
  assess5: 'Let’s plant two trees to mend his forest!',
  planted: 'Planted!',
  release1: 'He is healed. Time to go home!',
  release2: 'There he goes! Welcome home!',
  release3: 'You did it, Guardians!',
  clueFeather: 'A big flight feather. Fresh!',
  clueNetting: 'Old netting. This is what caught him.',
  clueFig: 'Figs with beak marks. Something big ate here.',
  channel: 'Water flows to the new trees!',
  timeJump: 'Weeks later. An illustrative story moment.',
  seasonBanner: 'Next season. An illustrative story moment.',
  season1: 'The saplings are growing!',
  season2: 'And he is back in this forest.',
  season3: 'One trip did not change the climate. Many careful choices add up.',
};

/**
 * The NLEX missions. Navie speaks in the first person; nobody gives Navie a he or a she.
 * The places are made-up versions, and the traffic, waste and energy numbers are game
 * assumptions, labelled Simulated wherever they appear.
 */
export const NLEX_LINES = {
  welcome1: 'Hi! I’m Navie. Welcome to the Eco Command Center!',
  welcome2: 'The Wasteworks keeps causing trouble on the road.',
  welcome3: 'Talk to me for a mission. Let’s go, Guardians!',
  idle: 'Pick a mission!',
  incoming: 'A new mission! Come and see me.',
  noMission: 'All quiet! Explore, or replay a mission.',

  gridArrive: 'The traffic is stuck! Let’s find out why.',
  gridFound1: 'The RFID scanner is jammed!',
  gridFound2: 'A Wasteworks jammer! Let’s fix it.',
  gridFixPuzzle: 'Join the wires so power reaches the scanner.',
  gridFixed: 'Scanner fixed! Now open the lanes.',
  gridOpen: 'The traffic is moving again!',
  gridDone: 'Less waiting means less fuel burned. Great job!',
  gridClueTyres: 'Van tyre marks. The Wasteworks!',
  gridClueFlyer: 'A Wasteworks flyer. Rude!',
  gridLaneHintCash: 'Cash is slow, so it needs more lanes.',
  gridLaneHintTruck: 'Trucks need a wide lane: 1 or 6.',
  gridLaneHintRepair: 'Lane 4 is under repair.',
  gridLaneHintStaff: 'Only 3 collectors, so 3 cash lanes at most.',

  riverArrive: 'Salamat! Please help clean our creek!',
  riverAllPicked: 'All picked up! Now clear the blockage.',
  riverRackDayo: 'Blockage cleared!',
  riverRackBaging: 'Got it all from the bank!',
  riverFlow: 'Listen! The water is flowing again!',
  riverAnimals: 'Look! Animals are coming back!',
  riverDone: 'Wow! More animals are here!',

  ecoArrive: 'Our new solar roof won’t switch on!',
  ecoFound: 'The roof wires are scrambled!',
  ecoWiring: 'Join the wires from the panels to the box.',
  ecoWired: 'Wires connected!',
  ecoSolarOn: 'Here goes... switch on!',
  ecoOn: 'Solar power is on!',

  delArrive: 'Supplies for the field team! Let’s find them.',
  delAllGot: 'All packed! Now pick a vehicle.',
  delChosen: 'Great choice!',
  delSend: 'Off it goes!',
  delDone: 'On its way! And the ridge team has news...',

  celebrate: 'Mission complete! Great job, Guardians!',

  routeArrive: 'The repair crew needs supplies at the site. Let’s pack!',
  routePacked: 'All packed! Which way should the van go?',
  smartArrive: 'Two shops ordered today. Let’s gather the parcels!',
  smartPacked: 'All here! Do we really need two vans?',
  cargoArrive: 'A heavy load for the work site. Let’s find it!',
  cargoFound: 'Pipes, cement and a survey kit. Heavy!',
  cargoLoaded: 'Packed tight and ready to go!',
  maintArrive: 'Three jobs on one stretch today. Let’s check the gear!',
  maintChecked: 'A dim lamp and a bent sign. We need tools!',
  maintTools: 'Tools ready! Now plan the trip.',
  fuelArrive: 'Our van drinks too much fuel. Can you check it?',
  fuelFound: 'The tyres are low! That wastes fuel.',
  fuelFixed: 'Tyres pumped up just right!',
  nightArrive: 'The yard lamps stay on all day. What a waste!',
  nightFound: 'The lighting controller is broken.',
  nightFixed: 'Controller fixed! Now choose the setting.',
  nightSafe: 'Safety lamps stay on. Everyone can see the way.',
  rainArrive: 'The road is flooding! The drain must be blocked.',
  rainFound: 'Leaves and rubbish block the drain!',
  rainCleared: 'The water is draining away!',
  patrolArrive: 'Three spots need checking today. Let’s find them!',
  patrolFound: 'All three found! Now plan the route.',
  sendOff: 'Off it goes!',
  bonusFound: 'A bonus find!',
};

/** One short cheer per mission for the results screen. */
export const DONE_LINES: Record<string, string> = {
  'nlex-gridlock': 'The traffic is moving again!',
  'nlex-river': 'The creek is clean and full of life!',
  'nlex-eco': 'The sun is powering the depot!',
  'nlex-delivery': 'The supplies are on their way!',
  'hornbill-homecoming': 'Kalaw is home!',
  'green-route': 'The repair crew made it!',
  'smart-delivery': 'Both shops have their orders!',
  'eco-cargo': 'The cargo is on its way!',
  'green-maintenance': 'All three repairs are done!',
  'fuel-saver': 'The van is running lean!',
  'night-shift': 'The night yard is safe and smart!',
  'rainy-day': 'The road is draining again!',
  'eco-patrol': 'Inspection complete!',
};

/** Command Center talk: short, true in general, and different once missions are done. */
export const HUB_LINES = {
  joy: 'Sharing one ride halves the trips, and the fuel!',
  joyAfterCreek: 'Our creek neighbours keep sorting bins now!',
  ernesto: 'Native plants need less watering once they take root.',
  ernestoAfterSolar: 'Those lamps charge from their own little panels!',
  tech: 'The patrol car switches its engine off when parked.',
  techAfterPlaza: 'That model shows the plaza’s lane lights!',
  notice: 'Notice board',
  noticeEmpty: 'All done. Thank you!',
  weatherIntro: 'Rewire the weather station!',
  weatherDone: 'The forecast is back!',
  sensorsIntro: 'Sukat can check the air sensors.',
  sensorsDone: 'All sensors reporting!',
  tidyIntro: 'Litter! The recycling bin is by the workshop.',
  tidyDone: 'Spotless. Thank you!',
  quizIntro: 'Quiz time! The answers are in the Atlas.',
  quizRight: 'Correct!',
  quizWrong: 'Not that one. Try again!',
  quizDone: 'Three out of three!',
  butterflyIntro: 'Butterfly Watch: find 3 butterflies in the garden!',
  birdIntro: 'Find the Bird: listen for its song!',
  birdFound: 'There it is! A pied fantail.',
  spotterIntro: 'Wildlife Spotter: photograph 3 kinds of animals here!',
  vet: 'Every animal in our care is on its way home.',
  ranger: 'More field reports are coming in. We’ll need you again!',
};

/** Why a piece of rubbish goes where it goes. */
export const SORT_REASON: Record<'bio' | 'recycle' | 'residual', string> = {
  bio: 'it rots down',
  recycle: 'it can be made into something new',
  residual: 'it can be neither composted nor recycled',
};

export const BEYOND = [
  { id: 'combine', title: 'Combine a trip', text: 'Next time you need two errands, try doing them in one journey where that suits you.' },
  { id: 'share', title: 'Share a ride', text: 'Going the same way as someone? See whether a shared trip works for you both.' },
  { id: 'learn', title: 'Learn a local species', text: 'Find out which animals live near you, and what their homes need.' },
  { id: 'offpeak', title: 'Travel outside the rush', text: 'If your trip can wait, try leaving when the roads are quieter.' },
  { id: 'sort', title: 'Sort your rubbish', text: 'Keep biodegradable, recyclable and residual waste apart at home.' },
  { id: 'engineoff', title: 'Engine off while waiting', text: 'Parked and waiting for someone? Switch off the engine where it is safe to.' },
];

/** Sukat's plain-language notes, opened from the Atlas. */
export const CHAPTER_ONE_NOTES = [
  'Reducing greenhouse-gas emissions helps limit future climate risks. One trip does not change the climate. Many people’s choices, sustained over years, can.',
  'Protecting and restoring suitable habitat helps animals cope with the pressures they face. Climate change is one pressure among several.',
  'An animal in trouble today needs direct, competent help from trained people.',
];

/** What a real person should do, from DENR statements. Heroes in the game are not a model for handling wildlife. */
export const REAL_WORLD_HELP = {
  title: 'If you find a hurt wild animal',
  text: 'In the Philippines, report it to the nearest DENR office. Do not capture it, keep it, handle it unnecessarily or try to rehabilitate it yourself.',
  sources: ['https://tribune.net.ph/2026/09/09/juvenile-serpent-eagle-rescued-in-malapatan', 'https://tribune.net.ph/2026/10/05/philippine-serpent-eagle-rescued-in-subic'],
};
