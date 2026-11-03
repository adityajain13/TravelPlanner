/** What the trip map shows right now (centre, zoom, and how far its edges are), for "near the map" searches. Last view is kept when the map is hidden. */
export interface MapView { center: [number, number]; zoom: number; radiusKm: number }
let view: MapView | null = null;
export const setMapView = (v: MapView | null) => { view = v; };
export const getMapView = () => view;
