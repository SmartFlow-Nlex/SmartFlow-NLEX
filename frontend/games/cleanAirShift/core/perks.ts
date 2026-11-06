/**
 * Between waves the player can grab one change for the rest of the shift, without
 * the game stopping. Each is a real way plazas cut idling, so the picks say something
 * as well as help. None may change how many vehicles come: the player and "no manager"
 * have to face the same traffic for the comparison to mean anything.
 */

export type PerkId = 'extraStaff' | 'kiosks' | 'truckSigns' | 'towStandby' | 'engineCampaign' | 'marshals';

export interface Perk {
  id: PerkId;
  /** Fits a small button. */
  title: string;
  blurb: string;
}

export const PERKS: readonly Perk[] = [
  { id: 'extraStaff', title: 'Extra staff', blurb: 'One more booth can be open at a time.' },
  { id: 'kiosks', title: 'Fast booths', blurb: 'Tag reload kiosks mean every booth works 12% faster.' },
  { id: 'truckSigns', title: 'Truck signs', blurb: 'Buses and trucks head for the shortest line by themselves.' },
  { id: 'towStandby', title: 'Crew standby', blurb: 'Tows and repairs take half the time.' },
  { id: 'engineCampaign', title: 'Engine-off drive', blurb: 'One more use of Engines Off.' },
  { id: 'marshals', title: 'Lane marshals', blurb: 'Drivers check the next lanes and take the shorter line, and no-load drivers find the reload lane.' },
];

export const perkById = (id: PerkId): Perk => PERKS.find((p) => p.id === id) as Perk;
