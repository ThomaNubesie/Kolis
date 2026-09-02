// Car imagery — a copy of `utils/vehicleImage.ts` from the LoadQ app ("car-render").
//
// Deliberately identical so the sheet, the driver app and the board show the SAME
// picture for the same car. If the app's version changes, change this to match;
// two implementations that drift is worse than no image at all.
//
// Difference from the app, and the only one: `paintDescription` instead of
// `paintId`. We store colours as English words ("Gray", "Gold", "White") and
// imagin's `paintId` expects its own paint codes, so colour was being dropped.
// `paintDescription` takes plain words.

const CUSTOMER_KEY = process.env.NEXT_PUBLIC_IMAGIN_KEY || "img";

const MODEL_FAMILY_MAP: Record<string, string> = {
  "hiace": "hiace",
  "urvan": "urvan",
  "sprinter": "sprinter",
  "coaster": "coaster",
  "land cruiser": "land-cruiser",
  "prado": "land-cruiser-prado",
  "fortuner": "fortuner",
  "corolla": "corolla",
  "accord": "accord",
  "logan": "logan",
};

export type ImageAngle = "side" | "front" | "rear" | "interior";
const ANGLE_MAP: Record<ImageAngle, string> = {
  side: "01", front: "13", rear: "07", interior: "27",
};

export function getVehicleImageUrl(
  make?: string | null,
  model?: string | null,
  color?: string | null,
  angle: ImageAngle = "side",
  year?: number | null,
): string | null {
  if (!make || !model) return null;
  const url = new URL("https://cdn.imagin.studio/getImage");
  const modelKey = model.toLowerCase().trim();
  const modelFamily = MODEL_FAMILY_MAP[modelKey] || modelKey.split(" ")[0];

  url.searchParams.append("customer", CUSTOMER_KEY);
  url.searchParams.append("make", make.toLowerCase().trim());
  url.searchParams.append("modelFamily", modelFamily);
  url.searchParams.append("zoomType", "fullscreen");
  url.searchParams.append("angle", ANGLE_MAP[angle]);
  if (year) url.searchParams.append("modelYear", String(year));
  if (color) url.searchParams.append("paintDescription", color.toLowerCase().trim());
  return url.toString();
}
