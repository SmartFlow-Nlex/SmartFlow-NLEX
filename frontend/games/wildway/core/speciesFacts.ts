import { buildRoster, type SpeciesRecord } from './species';

/**
 * Checked species records, laid over the blank roster. Written from source pages read on
 * 2026-11-05. A check by an AI research pass, not yet by a person. Global
 * categories are IUCN citations as carried in GBIF, because iucnredlist.org could not be
 * opened. DAO 2019-09 itself could not be opened either, so a Philippine category appears
 * only where a DENR office or a journal paper states it, and `basis` says which.
 * Unresolved fields stay null, with the reason in `pendingNote`.
 */

export const VERIFIED: readonly Partial<SpeciesRecord>[] = [
  {
    "id": "sp-001",
    "acceptedScientificName": "Pithecophaga jefferyi",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Pithecophaga%20jefferyi",
    "nativeRange": "Philippines only: Luzon, Samar, Leyte and Mindanao",
    "habitat": "Forest-dependent; relies on primary forest to hunt and nest, usually in large dipterocarp trees",
    "habitatReferences": [
      "https://www.philippineeaglefoundation.org/philippine-eagle",
      "http://news.mongabay.com/2018/12/critically-endangered-philippine-eagle-hangs-on-despite-horde-of-threats/",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC12676255/"
    ],
    "relevantThreats": [
      "Deforestation and forest fragmentation",
      "Illegal logging",
      "Shooting and hunting (the Philippine Eagle Foundation says at least one is killed every year)",
      "Conservationist concern about mining"
    ],
    "threatReferences": [
      "https://www.philippineeaglefoundation.org/philippine-eagle",
      "http://news.mongabay.com/2018/12/critically-endangered-philippine-eagle-hangs-on-despite-horde-of-threats/",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC12676255/"
    ],
    "climateEvidence": "Bacus et al. 2025 name climate change among the eagle's major threats, citing Ibanez et al. 2016 and BirdLife 2018. Mongabay 2018 reports satellite-visible forest damage from Typhoon Mangkhut in the eagle's remaining range, with Ibanez saying storms plus fragmentation could 'theoretically' affect populations. This is a named threat, not a measured effect; no climate projection study for the eagle was found.",
    "globalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2025,
      "sourceUrl": "https://api.gbif.org/v1/species/176613698/verbatim"
    },
    "nationalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2019,
      "sourceUrl": "https://www.gmanetwork.com/regionaltv/news/104392/philippine-eagle-sighted-in-cotabato/story",
      "instrument": "DENR Administrative Order 2019-09",
      "basis": "DENR-12 statement quoted by GMA, 7 Oct 2024; the order itself was not read"
    },
    "assessmentDates": "Global 2025; Philippine list 2019",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": null,
    "card": "The Philippine eagle lives only in forests on Luzon, Samar, Leyte and Mindanao. Losing its forest home and being shot are its biggest dangers.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-002",
    "acceptedScientificName": "Carlito syrichta",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Carlito%20syrichta",
    "nativeRange": "Southeastern Philippines: mainly Bohol, Samar, Leyte and Mindanao, plus smaller nearby islands such as Maripipi, Siargao, Basilan and Dinagat",
    "habitat": "Forest from sea level to about 700 m, including secondary, karst and beach forest; favours dense low vegetation; active at night",
    "habitatReferences": [
      "https://en.wikipedia.org/wiki/Philippine_tarsier",
      "https://smujo.id/biodiv/article/download/12450/6560/1075415"
    ],
    "relevantThreats": [
      "Habitat loss",
      "Illegal wildlife collection",
      "Poaching for the pet trade"
    ],
    "threatReferences": [
      "https://tribune.net.ph/amp/story/2026/06/16/tarsier-rescued-in-kidapawan-city",
      "https://en.wikipedia.org/wiki/Philippine_tarsier"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Near Threatened",
      "year": 2020,
      "sourceUrl": "https://api.gbif.org/v1/species/176662946/verbatim"
    },
    "nationalConservationAssessment": {
      "category": "Other Threatened Species",
      "year": 2019,
      "sourceUrl": "https://www.gmanetwork.com/regionaltv/news/100295/tarsier-rescued-in-zamboanga-del-norte/story",
      "instrument": "DENR Administrative Order 2019-09",
      "basis": "DENR-9 statement quoted by GMA, 30 Jan 2024; also Tribune 16 Jun 2026 and the table in Gamalo et al. 2023 (Biodiversitas). The order itself was not read"
    },
    "assessmentDates": "Global 2020; Philippine list 2019",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": null,
    "card": "The Philippine tarsier lives on Bohol, Samar, Leyte, Mindanao and nearby islands, and is active at night. Losing its forest and being collected illegally are threats to it.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-003",
    "acceptedScientificName": "Bubalus mindorensis",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Bubalus%20mindorensis",
    "nativeRange": "Only on the island of Mindoro, now confined to a few sites",
    "habitat": "Grassland and forest edges; historically open grassland, forest glades, bamboo thickets and marshy valleys; now remote areas above 200 m",
    "habitatReferences": [
      "https://threatenedtaxa.org/index.php/JoTT/article/download/9647/10320?inline=1",
      "https://www.esabii.biodic.go.jp/database/mammal/cetartiodactyla/bubalus_mindorensis.html"
    ],
    "relevantThreats": [
      "Land conversion and farming",
      "Illegal logging",
      "Hunting and illegal capture",
      "Pasture burning and agricultural fires",
      "Disease from livestock"
    ],
    "threatReferences": [
      "https://threatenedtaxa.org/index.php/JoTT/article/download/9647/10320?inline=1",
      "https://www.esabii.biodic.go.jp/database/mammal/cetartiodactyla/bubalus_mindorensis.html"
    ],
    "climateEvidence": "A 2025 camera-trap study at one wallowing site found temperature to be a direct driver of tamaraw wallowing. The authors call this preliminary: one site, with climate data from a station in San Jose City that may differ in elevation from the study site. It shows a behavioural link to temperature, not population harm from climate change.",
    "globalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2016,
      "sourceUrl": "https://api.gbif.org/v1/species/176669974/verbatim"
    },
    "nationalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2019,
      "sourceUrl": "https://threatenedtaxa.org/index.php/JoTT/article/download/9647/10320?inline=1",
      "instrument": "DENR Administrative Order 2019-09",
      "basis": "Peer-reviewed paper (J. Threatened Taxa 2025) citing the order, plus PENRO Negros Occidental via Negros Now Daily 2022. The order itself was not read"
    },
    "assessmentDates": "Global 2016; Philippine list 2019",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": null,
    "card": "The tamaraw lives only on the island of Mindoro, in a few patches of grassland and forest. Land clearing, illegal logging and hunting all put it at risk.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-004",
    "acceptedScientificName": "Manis culionensis",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Manis%20culionensis",
    "nativeRange": "Palawan province only, including Palawan and Culion",
    "habitat": "Primary and secondary forest and surrounding grassland; semi-arboreal and nocturnal, mostly staying in the tree canopy",
    "habitatReferences": [
      "https://en.wikipedia.org/wiki/Philippine_pangolin",
      "https://news.mongabay.com/2021/01/its-not-too-late-yet-to-save-the-philippine-pangolin-study-finds/"
    ],
    "relevantThreats": [
      "Hunting for meat, blood and scales",
      "International trafficking to East Asia",
      "Deforestation from illegal logging and agriculture"
    ],
    "threatReferences": [
      "https://news.mongabay.com/2019/04/the-extinction-clock-ticks-for-the-little-known-philippine-pangolin/",
      "https://news.mongabay.com/2021/01/its-not-too-late-yet-to-save-the-philippine-pangolin-study-finds/"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2019,
      "sourceUrl": "https://api.gbif.org/v1/species/176661695/verbatim"
    },
    "nationalConservationAssessment": null,
    "assessmentDates": "Global 2019",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": "Philippine status: sources conflict, so it is not shown until checked against the order itself.",
    "card": "The Philippine pangolin lives only in Palawan province and spends much of its time in trees. People hunt and traffic it for its meat and scales.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-005",
    "acceptedScientificName": "Sus cebifrons",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Sus%20cebifrons",
    "nativeRange": "West Visayan islands; survives in fragments on Negros and Panay, possibly Masbate; the Cebu subspecies is extinct",
    "habitat": "Mainly forest above 800 m; can use densely covered fragmented habitat such as cogon grassland. Originally sea level to 1,600 m",
    "habitatReferences": [
      "https://www.iucn-wpsg.org/visayan-warty-pig",
      "https://www.esabii.biodic.go.jp/database/mammal/cetartiodactyla/sus_cebifrons.html"
    ],
    "relevantThreats": [
      "Habitat loss from logging and slash-and-burn farming",
      "Hunting for food",
      "Retaliatory hunting for crop damage",
      "Hybridisation with domestic pigs"
    ],
    "threatReferences": [
      "https://www.iucn-wpsg.org/visayan-warty-pig",
      "https://www.esabii.biodic.go.jp/database/mammal/cetartiodactyla/sus_cebifrons.html"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2017,
      "sourceUrl": "https://api.gbif.org/v1/species/176668634/verbatim"
    },
    "nationalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2019,
      "sourceUrl": "https://negrosnowdaily.com/public-reminded-on-wildlife-possession-hunting/",
      "instrument": "DENR Administrative Order 2019-09",
      "basis": "PENRO Negros Occidental as reported by Negros Now Daily, 26 Jul 2022. The order itself was not read"
    },
    "assessmentDates": "Global 2017; Philippine list 2019",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": null,
    "card": "The Visayan warty pig now survives only in scattered forest on Negros and Panay, and possibly Masbate. Forest loss, hunting and breeding with farm pigs threaten it.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-006",
    "acceptedScientificName": "Rusa alfredi",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Rusa%20alfredi",
    "nativeRange": "Panay and Negros; formerly also Cebu, Guimaras, Leyte, Masbate and Samar",
    "habitat": "Now mostly steep, rugged slopes of dipterocarp forest; also dense cogon grassland and secondary forest",
    "habitatReferences": [
      "https://www.esabii.biodic.go.jp/database/mammal/cetartiodactyla/rusa_alfredi.html",
      "https://en.wikipedia.org/wiki/Visayan_spotted_deer"
    ],
    "relevantThreats": [
      "Habitat conversion to farmland",
      "Logging, including illegal logging",
      "Hunting for meat and trophies",
      "Live capture for the pet trade"
    ],
    "threatReferences": [
      "https://www.esabii.biodic.go.jp/database/mammal/cetartiodactyla/rusa_alfredi.html",
      "https://en.wikipedia.org/wiki/Visayan_spotted_deer"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Endangered",
      "year": 2016,
      "sourceUrl": "https://api.gbif.org/v1/species/176669200/verbatim"
    },
    "nationalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2019,
      "sourceUrl": "https://negrosnowdaily.com/public-reminded-on-wildlife-possession-hunting/",
      "instrument": "DENR Administrative Order 2019-09",
      "basis": "PENRO Negros Occidental as reported by Negros Now Daily, 26 Jul 2022, and Wikipedia's table (listed as Cervus alfredi). The order itself was not read"
    },
    "assessmentDates": "Global 2016; Philippine list 2019",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": null,
    "card": "The Visayan spotted deer now lives mainly on Panay and Negros, after vanishing from other islands. Forest clearing, hunting and the pet trade are the main threats.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-007",
    "acceptedScientificName": "Crocodylus mindorensis",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Crocodylus%20mindorensis",
    "nativeRange": "Philippines only; surviving populations in northern Luzon, Dalupiri Island and Mindanao (including Ligawasan Marsh); gone from several islands where it once occurred",
    "habitat": "Freshwater: small wetlands, ponds, marshes, shallow creeks and fast rivers up to 850 m in northern Luzon",
    "habitatReferences": [
      "https://www.iucncsg.org/365_docs/attachments/protarea/13_C-511712ed.pdf"
    ],
    "relevantThreats": [
      "Killing by people",
      "Habitat destruction",
      "Destructive fishing, including dynamite fishing"
    ],
    "threatReferences": [
      "https://en.wikipedia.org/wiki/Philippine_crocodile"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2016,
      "sourceUrl": "https://api.gbif.org/v1/species/176712900/verbatim"
    },
    "nationalConservationAssessment": null,
    "assessmentDates": "Global 2016",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": "Philippine status: only secondary sources were found, so it is not shown until checked against the order itself.",
    "card": "The Philippine crocodile is a freshwater crocodile found only in the Philippines, mainly in northern Luzon and Mindanao today. People killing it and damaging its wetlands have made it very rare.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-008",
    "acceptedScientificName": "Cacatua haematuropygia",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Cacatua%20haematuropygia",
    "nativeRange": "Philippines; Palawan is the stronghold and holds most of the wild population, including Rasa Island; small remnant populations elsewhere",
    "habitat": "Lowland forest mostly below 50 m, in or next to riverine and coastal areas with mangroves",
    "habitatReferences": [
      "https://en.wikipedia.org/wiki/Red-vented_cockatoo",
      "https://www.chesterzoo.org/conservation-science-education/global-conservation-programmes/south-east-asian-islands/philippine-cockatoos-in-crisis",
      "https://www.philippinecockatoo.org/"
    ],
    "relevantThreats": [
      "Trapping for the cage-bird trade",
      "Loss of coastal and lowland habitat",
      "Persecution as a crop pest",
      "Severe weather"
    ],
    "threatReferences": [
      "https://en.wikipedia.org/wiki/Red-vented_cockatoo",
      "https://www.chesterzoo.org/conservation-science-education/global-conservation-programmes/south-east-asian-islands/philippine-cockatoos-in-crisis"
    ],
    "climateEvidence": "Chester Zoo says 'climate disasters have contributed to their decline', citing a 2021 mega-typhoon that depressed numbers despite recovery efforts. The Katala Foundation reports a chick rescued in 2016 from starvation during extreme dry months. Wikipedia reports droughts on Rasa Island causing up to 60% nest fatality, but its source was not read.",
    "globalConservationAssessment": {
      "category": "Critically Endangered",
      "year": 2017,
      "sourceUrl": "https://api.gbif.org/v1/species/176621786/verbatim"
    },
    "nationalConservationAssessment": null,
    "assessmentDates": "Global 2017",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": "Philippine status: only secondary sources were found, so it is not shown until checked against the order itself.",
    "card": "The Philippine cockatoo lives in lowland forest and mangroves, and Palawan is its stronghold. Trapping for the pet trade, habitat loss and a huge typhoon have all cut its numbers.",
    "publicationState": "facts-verified"
  },
  {
    "id": "sp-009",
    "acceptedScientificName": "Buceros hydrocorax",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Buceros%20hydrocorax",
    "nativeRange": "Northern Philippines: Luzon and Marinduque (Wikipedia says now extinct on Marinduque)",
    "habitat": "Primary evergreen dipterocarp forest, also some mature secondary forest; lowlands up to 400 m with records to 760 m on Luzon",
    "habitatReferences": [
      "https://iucnhornbills.org/northern-rufous-hornbill/",
      "https://www.oiseaux.net/en/oiseaux/rufous.hornbill.html",
      "https://en.wikipedia.org/wiki/Rufous_hornbill"
    ],
    "relevantThreats": [
      "Hunting for food and sport",
      "Capture of adults and chicks from nest trees for illegal trade",
      "Habitat loss from logging and farming",
      "Shortage of suitable nest trees"
    ],
    "threatReferences": [
      "https://en.wikipedia.org/wiki/Rufous_hornbill",
      "http://news.mongabay.com/2019/10/philippines-races-to-save-its-increasingly-endangered-hornbills/"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Vulnerable",
      "year": 2020,
      "sourceUrl": "https://api.gbif.org/v1/species/176610460/verbatim"
    },
    "nationalConservationAssessment": null,
    "assessmentDates": "Global 2020",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": "Philippine status: only secondary sources were found, so it is not shown until checked against the order itself.",
    "card": "The rufous hornbill, called kalaw, is a large forest bird of Luzon with a red bill and a white tail. Hunting and the loss of its big nesting trees put it at risk.",
    "publicationState": "playable",
    "missionIds": [
      "hornbill-homecoming"
    ],
    "modelAsset": "web/models.ts makeHornbill",
    "animationSet": "web/anim.ts poseBird"
  },
  {
    "id": "sp-010",
    "acceptedScientificName": "Bubo philippensis",
    "taxonomySource": "https://api.gbif.org/v1/species/match?name=Bubo%20philippensis",
    "nativeRange": "Philippines: Luzon, Catanduanes, Samar, Leyte, Bohol, Mindanao and possibly Sibuyan",
    "habitat": "Lowland forest, especially forest edges near streams; roosts in trees by day and hunts at dusk",
    "habitatReferences": [
      "https://en.wikipedia.org/wiki/Philippine_eagle-owl",
      "https://datazone.birdlife.org/species/factsheet/philippine-eagle-owl-bubo-philippensis/text"
    ],
    "relevantThreats": [
      "Lowland deforestation from illegal logging, land conversion and mining",
      "Hunting",
      "Capture for the pet trade",
      "Persecution from the belief that owls bring bad luck"
    ],
    "threatReferences": [
      "https://en.wikipedia.org/wiki/Philippine_eagle-owl",
      "https://datazone.birdlife.org/species/factsheet/philippine-eagle-owl-bubo-philippensis/text"
    ],
    "climateEvidence": null,
    "globalConservationAssessment": {
      "category": "Vulnerable",
      "year": 2025,
      "sourceUrl": "https://api.gbif.org/v1/species/176617763/verbatim"
    },
    "nationalConservationAssessment": null,
    "assessmentDates": "Global 2025",
    "contentReviewedAt": "2026-11-05",
    "pendingNote": "Philippine status: only secondary sources were found, so it is not shown until checked against the order itself.",
    "card": "The Philippine eagle-owl hunts at dusk in lowland forest, often near streams, on several Philippine islands. Forest loss, hunting and the pet trade are its main threats.",
    "publicationState": "facts-verified"
  }
];

export const ROSTER: readonly SpeciesRecord[] = buildRoster(VERIFIED);

export const speciesById = (id: string): SpeciesRecord | null => ROSTER.find((s) => s.id === id) ?? null;

export const countByState = (): Record<SpeciesRecord['publicationState'], number> => {
  const out: Record<SpeciesRecord['publicationState'], number> = { playable: 0, 'facts-verified': 0, registered: 0 };
  for (const s of ROSTER) {
    out[s.publicationState] += 1;
  }
  return out;
};
