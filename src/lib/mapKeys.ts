// Map API keys on their own, so pages that only need to know whether the map is configured don't
// pull in the basemap style code.
export const PROTOMAPS_KEY = import.meta.env.VITE_PROTOMAPS_KEY as string | undefined;
export const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
