/**
 * Everything the game says, in one place, so a Filipino version can sit beside it later.
 * Story lines are fiction; anything stated as fact about the species comes from
 * core/speciesFacts.ts, which lists a source for each record.
 */

export type Locale = 'en';

export const OBJECTIVES: Record<string, string> = {
  'obj.call': 'Answer the call at Navie’s Mission Station',
  'obj.plazaSurvey': 'Climb to the overlook and scan the plaza with Sukat',
  'obj.plazaRepair': 'Fix the three faults: the signal, the cable and the jammer',
  'obj.plazaLanes': 'Set the lanes at the control-room console',
  'obj.plazaReopen': 'Reopen the plaza from the console',
  'obj.riverMeet': 'Meet Kagawad Paz at the barangay hall',
  'obj.riverSurvey': 'Scan the creek from the footbridge with Sukat',
  'obj.riverHazard': 'Tell Engr. Bautista about the leaking drum',
  'obj.riverCollect': 'Collect the rubbish and sort it into the right bins',
  'obj.riverRack': 'Clear the clogged trash rack',
  'obj.riverGate': 'Open the floodgate',
  'obj.riverPlan': 'Plan the collection run at the dispatch post',
  'obj.depotMeet': 'Meet Chief Ramos at the depot office',
  'obj.depotAudit': 'Scan the energy meter with Sukat',
  'obj.depotRepair': 'Fix the sensor, the air leak and the idling trucks',
  'obj.depotEnergy': 'Choose the upgrades at the office',
  'obj.depotPlan': 'Plan the delivery at the dispatch post',
  'obj.depotInstall': 'Install the upgrades',
  'obj.walk': 'Walk down to the creek bank',
  'obj.scan': 'Switch to Sukat and scan the bird from here',
  'obj.ranger': 'Talk to Ranger Ligaya',
  'obj.plan': 'Plan the deliveries at the transport board',
  'obj.log': 'Clear the fallen trunk off the track',
  'obj.cross': 'Get the crew across the washed-out crossing',
  'obj.deliver': 'Bring the kit and the saplings to the tent',
  'obj.signs': 'Put up two quiet-zone signs on the trails',
  'obj.assess': 'Tell Dr. Mayumi everything is ready',
  'obj.noise': 'Find what is making that droning noise',
  'obj.noiseOff': 'Shut down the abandoned generator',
  'obj.plant': 'Replant the forest gap at the four stakes',
  'obj.release': 'Head to the lookout',
};

export const LINES = {
  tooClose: 'Too close! Getting near stresses him. Stay back and let the specialist work.',
  open1: 'Sukat, look across the creek. That big bird is sitting really low, and one wing looks wrong.',
  open2: 'Let us keep our distance and scan from the bank. Walk down, and let me take the reading.',
  scan1: 'Rufous hornbill, an adult male: dark rufous head, big red bill and casque, white tail. Hard to miss.',
  scan2: 'His right wing is held badly, and something is snagged on it. I am adding him to the Wildlife Atlas. Only a specialist should handle him.',
  scan3: 'Then we get a specialist here. Ranger Ligaya will know who to call.',
  ranger1: 'Salamat, you came. The crossing washed out and a trunk came down on the access track, so my team cannot get close.',
  ranger2: 'Dr. Mayumi can assess him, but she and two rangers need her kit here by ten. We also need saplings and tools by half past eleven, to mend that gap the old road cut through the trees.',
  ranger3: 'Everything is at the field station. Can you plan the run for us? Kailangan lang, huwag sayangin ang biyahe. Do not waste a trip.',
  ranger4: 'I will set up the board. Plenty of plans can get there. Let us find one that burns less doing it.',
  station1: 'Welcome back! The Eco Dispatch Station is ready. Every option has to get the team and the gear there in time. Let us find one that burns less.',
  call1: 'Ranger Ligaya at the Malaya Ridge partner station is calling, from the Sierra Madre foothills.',
  call2: 'A big bird is sitting low by the creek, and one wing looks wrong. Can your team come and see? From a safe distance, please.',
  call3: 'Go and see. When the ranger knows what is needed, I will have the transport options ready here.',
  dispatchIntro: 'Loading up. Here we go.',
  logDayo: 'Hup! There. The track is clear.',
  logBaging: 'Stre-e-etch! And... got it. The track is clear.',
  bridgeVine: 'Hold on, I will be the bridge! Well, my vines will. The rangers can lay planks over them later.',
  bridgeRope: 'Line is across and tied off. The rangers have a safe crossing now.',
  assess1: 'Good work getting this here. Stay well back, please. Too many people frighten him, and a frightened bird can hurt himself.',
  assess2: 'The rangers and I will take it from here.',
  assess3: 'He is in the carrier and calm. The wing is bruised, nothing broken. The netting did it. I will keep him under care for now.',
  assess3b: 'He was lucky with the timing, too. In the nesting months, a male feeds his mate through a slit while she stays sealed inside a tree hole. She would have been depending on him.',
  assess4: 'Now his home needs looking after too. Something on the ridge is droning all day, and that is no way to keep birds settled.',
  assess5: 'And that gap in the canopy is still open. Mend those two things, and we will have somewhere good to bring him back to.',
  noiseSukat: 'Noise reading, loudest to the north-east. There, on that ledge: an abandoned generator somebody left running.',
  noiseAwit: 'I can see it from up here! A generator on the ledge, left running. That is our noise.',
  noiseQuiet: 'Off. And the fuel can comes down with it.',
  noiseAfter: 'Listen to that. That is just forest now.',
  channel: 'The sluice is open, and the old channel is flowing again. It runs right along the new planting.',
  clueFeather: 'A long dark flight feather. It fits a large forest bird, and it is fresh.',
  clueNetting: 'Discarded netting, snagged on a branch. I will mark it for the clean-up crew. This is what caught him.',
  clueFig: 'Fallen fig fruit with beak marks. Something big has been eating here.',
  timeJump: 'Later on. This scene is an illustrative story moment.',
  release1: 'He has healed, the area is quiet, and he is flying strongly. Time to let him go, close to where he was found.',
  release2: 'There he goes. Back in his own forest.',
  release3: 'I will log it. One bird helped, one gap replanted, one disturbance gone, and the run planned. Those are separate results, and I keep them separate.',
  seasonBanner: 'Next season. Monitored habitat progress: an illustrative story outcome.',
  season1: 'The saplings took. It is a long way from a full canopy, but the gap is closing.',
  season2: 'And the monitoring camera has him back in this part of the forest.',
  season3: 'One careful run did not change the climate, and I would not claim it did. It did get help to one animal and a little healing to one forest. Those add up when many people do them.',
};

/**
 * The NLEX missions. Navie speaks in the first person; nobody gives Navie a he or a she.
 * The places are made-up versions, and the traffic, waste and energy numbers are game
 * assumptions, as each briefing says.
 */
export const NLEX_LINES = {
  welcome1: 'Welcome to the SmartFlow NLEX Eco Command Center! I am Navie. I keep an eye on the roads and send help where it is needed.',
  welcome2: 'The Wasteworks has been busy: jammed toll plazas, rubbish in the creeks, engines left running. All of that burns fuel or harms the places nearby.',
  welcome3: 'Pick a mission on the Operations Board, and I will brief you. Wildlife expeditions leave from here too.',
  idle: 'Ready when you are. The Operations Board shows every mission on the line.',
  incoming: 'Incoming call! Come over to my station.',
  noMission: 'All quiet for now. Check the Operations Board for what is open.',

  gridCall1: 'Alert from Bocaue! The Wasteworks has jammed the toll plaza. Only two lanes are working, and the queue keeps growing.',
  gridCall2: 'Every car in that queue sits with its engine running. That burns fuel and goes nowhere.',
  gridCall3: 'Then let us get it moving. Safely.',
  gridCall4: 'Use the service walkways, never the lanes. I will guide you from here.',
  gridArrive: 'Lanes jammed, engines idling. Let me scan from the overlook first.',
  gridScan1: 'Three faults. A lane signal controller up on the canopy, a cut cable at the junction box, and a strange box by booth 6.',
  gridScan2: 'That box has the Wasteworks logo on it!',
  gridScan3: 'That is a jammer. Get it out of there, and the lanes can be switched back on.',
  gridSignalDayo: 'Signal controller reset. The lane lights are back.',
  gridSignalAwit: 'Reset it from up here! The lane lights are back on.',
  gridCableBaging: 'Stre-e-tch... and the two ends are joined!',
  gridCableDayo: 'Spliced in a new length of cable. Power is back to the booths.',
  gridJammer: 'Jammer out. The Wasteworks will not like that.',
  gridRepaired: 'All three fixed. Now set the lanes at the console in the control room.',
  gridReady: 'Lanes are set. Open the plaza when you are ready.',
  gridOpen1: 'Look at that: the lines are moving!',
  gridOpen2: 'Same cars, same journey. Far less fuel burned standing still.',
  gridLaneHintCash: 'Paying cash takes four times as long at the booth as a toll tag. Count how many pay cash.',
  gridLaneHintTruck: 'Trucks only fit the wide lanes at each end. Both kinds of truck need one.',
  gridLaneHintRepair: 'Lane 4 is coned off. Someone is working there, so it stays closed.',
  gridLaneHintStaff: 'Three toll collectors are on shift: three cash lanes at most.',

  riverCall1: 'A barangay in Valenzuela needs help. Rubbish has blocked their creek, and the water has stopped flowing.',
  riverCall2: 'Kagawad Paz is waiting at the barangay hall. They collect biodegradable, recyclable and residual waste separately, so sorting matters.',
  riverMeet1: 'Salamat sa pagpunta! The trash rack under the road is clogged, and the creek has backed up.',
  riverMeet2: 'Collect what you find and sort it into the bins by the hall. Anything that looks dangerous, leave to Engr. Bautista.',
  riverScan1: 'Eight pieces of rubbish along the banks, two of them floating. And a drum by the culvert is leaking oil.',
  riverScan2: 'Oil is not a job for us. That is one for the specialist.',
  riverHazard1: 'Good call not touching it. I have the right gloves and absorbent pads. Stand back, please.',
  riverHazard2: 'Done. It goes off for proper hazardous-waste handling.',
  riverRackDayo: 'Trash rack clear!',
  riverRackBaging: 'Reached all of it from the bank!',
  riverGate1: 'Listen: it is flowing again.',
  riverPlan: 'Now the collection run. Every plan has to keep the waste sorted and finish before the afternoon rain.',
  riverDone1: 'Thank you, Guardians. We will keep the sorting bins by the hall.',
  riverDone2: 'One creek cleared and flowing, and the waste sorted for collection. The transport numbers are a separate result.',

  ecoCall1: 'San Fernando calling. An expressway maintenance depot uses far more power than it should, and the Wasteworks left it that way.',
  ecoCall2: 'Chief Ramos has asked for an energy audit. Bring Sukat.',
  ecoMeet1: 'Welcome! Our bill keeps climbing and the trucks keep idling. Find out where the energy goes.',
  ecoAudit1: 'Three energy leaks: yard lights on in broad daylight, an air leak keeping the compressor running, and three trucks idling in the yard.',
  ecoAudit2: 'Fix those first. Then we can choose upgrades for the installers.',
  ecoSensorDayo: 'Someone taped over the daylight sensor. The Wasteworks again! Fixed.',
  ecoSensorAwit: 'Got it from up here. The daylight sensor was taped over!',
  ecoLeakBaging: 'Found the hiss behind the compressor. Sealed!',
  ecoLeakDayo: 'Tightened the fitting. No more hiss.',
  ecoDriver: 'Sure thing. No point burning fuel while I wait.',
  ecoRepaired: 'Engines off, lights off in the daytime, compressor quiet. Now choose the upgrades at the office.',
  ecoPlanHint: 'Look at what each hour of the crew’s work saves. The day has 8 hours.',
  ecoPlan: 'Now get the upgrades and the installers here. Same rules as always: on time, and less burned on the way.',
  ecoInstall: 'Everything is here. Install each upgrade where the markers are.',
  ecoDone1: 'Look at that: lamps off in daylight, and the new kit in place.',
  ecoDone2: 'That is one ordinary day, simulated with game assumptions. The sums are one tap away.',

  celebrate: 'Mission complete! Great teamwork, Guardians.',
  backToCenter: 'Head back to the Command Center whenever you are ready.',
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
