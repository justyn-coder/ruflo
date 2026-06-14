export const AE_TERRITORY: Record<string, { name: string; email: string }> = {
  east: { name: 'Mike Rutski', email: 'mike@inorsa.com' },
  central: { name: 'Nathan Dunn', email: 'nathan@inorsa.com' },
  west: { name: 'Lucas Spencer', email: 'lucas@inorsa.com' },
};

export const STATE_TO_AE: Record<string, string> = {
  CT: 'east', MA: 'east', RI: 'east', NH: 'east', VT: 'east', ME: 'east',
  NY: 'east', NJ: 'east', PA: 'east', DE: 'east', MD: 'east', DC: 'east',
  VA: 'east', WV: 'east', NC: 'east', SC: 'east', GA: 'east', FL: 'east',
  AL: 'east', MS: 'east', TN: 'east', KY: 'east', OH: 'east', IN: 'east', MI: 'east',
  TX: 'central', OK: 'central', KS: 'central', NE: 'central', SD: 'central', ND: 'central',
  MN: 'central', IA: 'central', MO: 'central', AR: 'central', LA: 'central',
  WI: 'central', IL: 'central',
  WA: 'west', OR: 'west', CA: 'west', NV: 'west', AZ: 'west', NM: 'west',
  CO: 'west', UT: 'west', WY: 'west', MT: 'west', ID: 'west', HI: 'west', AK: 'west',
};

export const AE_DETAILS: Record<string, { title: string; phone: string; booking_url: string; photo_url: string }> = {
  'Mike Rutski': { title: 'Sr. Account Executive', phone: '', booking_url: 'https://meetings-na2.hubspot.com/michael-rutski/introduction', photo_url: '/assets/ae/mike-rutski.jpg' },
  'Nathan Dunn': { title: 'Sr. Account Executive', phone: '', booking_url: 'https://meetings-na2.hubspot.com/nathan970/introduction', photo_url: '/assets/ae/nathan-dunn.jpg' },
  'Lucas Spencer': { title: 'Sr. Account Executive', phone: '', booking_url: 'https://meetings-na2.hubspot.com/lucas-spencer/introduction', photo_url: '/assets/ae/lucas-spencer.jpg' },
};

export function resolveAE(state?: string): { name: string; email: string } {
  const stateKey = state?.toUpperCase().trim() || '';
  const territory = STATE_TO_AE[stateKey];
  if (territory) return AE_TERRITORY[territory];
  return AE_TERRITORY.west;
}

export function getAEDetails(aeName: string) {
  return AE_DETAILS[aeName] || AE_DETAILS['Lucas Spencer'];
}
