// Network cities → region code. Kept in sync with the mobile app's served city
// list (constants/cities.ts) so the web offers exactly the same destinations.
export const CITIES: Record<string, string> = {
  // Ontario
  "Ottawa": "ON", "Toronto": "ON", "Kingston": "ON", "Sudbury": "ON", "London": "ON",
  "Acton": "ON", "Ajax": "ON", "Angus": "ON", "Arnprior": "ON", "Aurora": "ON", "Bancroft": "ON",
  "Barrie": "ON", "Belleville": "ON", "Bracebridge": "ON", "Bradford": "ON", "Brampton": "ON",
  "Brantford": "ON", "Burlington": "ON", "Cambridge": "ON", "Carleton Place": "ON", "Deep River": "ON",
  "Elmvale": "ON", "Gravenhurst": "ON", "Guelph": "ON", "Kitchener": "ON", "Markham": "ON",
  "Mississauga": "ON", "Newmarket": "ON", "Niagara Falls": "ON", "North Bay": "ON", "Orillia": "ON",
  "Oshawa": "ON", "Pembroke": "ON", "Peterborough": "ON", "Pickering": "ON", "Quinte West": "ON",
  "Renfrew": "ON", "Richmond Hill": "ON", "Sarnia": "ON", "Stouffville": "ON", "Vaughan": "ON",
  "Waterloo": "ON", "Whitby": "ON", "Woodstock": "ON",
  // Québec
  "Montréal": "QC", "Québec": "QC", "Gatineau": "QC", "Sherbrooke": "QC",
  "Trois-Rivières": "QC", "Chicoutimi": "QC", "Alma": "QC", "Baie-Comeau": "QC", "Baie-Saint-Paul": "QC",
  "Drummondville": "QC", "Forestville": "QC", "Laurier-Station": "QC", "Lévis": "QC", "Longueuil": "QC",
  "Rivière-du-Loup": "QC", "Saint-Constant": "QC", "Tadoussac": "QC",
  // Maritimes
  "Moncton": "NB", "Halifax": "NS",
};
// Alphabetical (fr-aware so accented city names sort naturally).
export const cityList = Object.keys(CITIES).sort((a, b) => a.localeCompare(b, "fr"));
export const regionFor = (city: string) => CITIES[city] || city;
