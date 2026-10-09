export type Place = { place: string; timeZone: string };

/** Cities, west to east. Offsets are not part of the list. */
export const PLACE_GROUPS: Array<{ label: string; places: Place[] }> = [
  {
    label: "West",
    places: [
      { place: "Honolulu", timeZone: "Pacific/Honolulu" },
      { place: "Vancouver", timeZone: "America/Vancouver" },
      { place: "Los Angeles", timeZone: "America/Los_Angeles" },
      { place: "New York", timeZone: "America/New_York" },
      { place: "Orlando", timeZone: "America/New_York" },
      { place: "Reykjavik", timeZone: "Atlantic/Reykjavik" },
    ],
  },
  {
    label: "Europe",
    places: [
      { place: "Tenerife", timeZone: "Atlantic/Canary" },
      { place: "Lisbon", timeZone: "Europe/Lisbon" },
      { place: "Marrakech", timeZone: "Africa/Casablanca" },
      { place: "Madrid", timeZone: "Europe/Madrid" },
      { place: "Paris", timeZone: "Europe/Paris" },
      { place: "Rome", timeZone: "Europe/Rome" },
      { place: "Cape Town", timeZone: "Africa/Johannesburg" },
      { place: "Athens", timeZone: "Europe/Athens" },
      { place: "Istanbul", timeZone: "Europe/Istanbul" },
      { place: "Cyprus", timeZone: "Asia/Nicosia" },
    ],
  },
  {
    label: "East",
    places: [
      { place: "Dubai", timeZone: "Asia/Dubai" },
      { place: "Mauritius", timeZone: "Indian/Mauritius" },
      { place: "Maldives", timeZone: "Indian/Maldives" },
      { place: "Delhi", timeZone: "Asia/Kolkata" },
      { place: "Bangkok", timeZone: "Asia/Bangkok" },
      { place: "Singapore", timeZone: "Asia/Singapore" },
      { place: "Hong Kong", timeZone: "Asia/Hong_Kong" },
      { place: "Bali", timeZone: "Asia/Makassar" },
      { place: "Tokyo", timeZone: "Asia/Tokyo" },
      { place: "Melbourne", timeZone: "Australia/Melbourne" },
      { place: "Sydney", timeZone: "Australia/Sydney" },
      { place: "Auckland", timeZone: "Pacific/Auckland" },
    ],
  },
];

export const PLACES: Place[] = PLACE_GROUPS.flatMap((group) => group.places);
