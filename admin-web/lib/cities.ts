// Network cities → region code (mirrors the mobile constants/geo for reroute).
export const CITIES: Record<string, string> = {
  "Ottawa": "ON", "Toronto": "ON", "Kingston": "ON", "London": "ON", "Hamilton": "ON",
  "Montréal": "QC", "Québec": "QC", "Gatineau": "QC", "Laval": "QC", "Sherbrooke": "QC",
  "Vancouver": "BC", "Calgary": "AB", "Edmonton": "AB", "Winnipeg": "MB", "Halifax": "NS",
};
export const cityList = Object.keys(CITIES);
export const regionFor = (city: string) => CITIES[city] || city;
