import type * as Y from "yjs";
import { useEffect, useRef } from "react";
import { locateBooking } from "../lib/locate";
import { distanceKm } from "../lib/geocode";
import { autocomplete, GOOGLE_KEY, suggestionPlace } from "../lib/google";
import { searchPlaces } from "../lib/photon";
import { AUTO, edit, matchTraveler, readTrip, removeItem, saveReservation, setItemImage, updateItem, updateMeta } from "../lib/trips";
import type { TripState } from "../lib/trips";
import { googlePhotos, coverFor, firstPhoto, sameSubject } from "../lib/images";
import { needsTidy, tidyNotes } from "../lib/tidyNotes";
import { cleanTitle } from "../lib/inbox";
import { zoneAt } from "../lib/airports";

export interface UpkeepArgs {
  doc: Y.Doc | null | undefined;
  state: TripState | null | undefined;
  readOnly: boolean;
  lite: boolean;
  auth: string;
}

export function useMoveEmailActivities(a: UpkeepArgs) {
  const { lite, doc, state, readOnly } = a;
  // Tickets/activities from email used to be added as stops; they're reservations ("Other") now.
  // Move the old ones over once, keeping their time, pin, cost and notes (then tidied below).
  useEffect(() => {
    if (lite || !doc || !state || readOnly) return;
    const old = state.items.filter((i) => i.kind === "place" && i.inboxId && (i.category === "activity" || i.category === "other"));
    if (!old.length) return;
    edit(
      doc,
      () => {
        for (const it of old) {
          const lines = (it.notes ?? "").split("\n");
          const conf = lines.map((l) => /^Confirmation:\s*(.+)$/.exec(l)?.[1]).find(Boolean);
          const rest = lines.filter((l) => !/^Confirmation:/.test(l)).join("\n").trim();
          const date = it.section.startsWith("day:") ? it.section.slice(4) : undefined;
          saveReservation(
            doc,
            {
              type: "other",
              ...cleanTitle(it.name, conf),
              startDate: date,
              startTime: it.startTime,
              endTime: it.endTime,
              address: it.address,
              lat: it.lat,
              lng: it.lng,
              notes: rest || undefined,
              cost: it.cost,
              costCurrency: it.costCurrency,
              inboxId: it.inboxId,
            },
            { by: "email" },
          );
          removeItem(doc, it.id, { by: "email" });
        }
      },
      { by: "email" },
    );
  }, [lite, doc, state, readOnly]);
}

export function useTidyImportedNotes(a: UpkeepArgs) {
  const { lite, doc, state, readOnly, auth } = a;
  // Bookings imported by email before notes had a standard layout: sort their notes into it once
  // ("**Seat:** 12A" lines in a fixed order), so every traveller's copy reads the same
  const tidyTried = useRef(new Set<string>());
  useEffect(() => {
    if (lite || !doc || !state || readOnly || !navigator.onLine || auth !== "in") return;
    const todo = state.reservations.filter((r) => needsTidy(r) && !tidyTried.current.has(r.id));
    if (!todo.length) return;
    todo.forEach((r) => tidyTried.current.add(r.id));
    void tidyNotes(doc, todo);
  }, [doc, state, readOnly, auth]);
}

export function usePinBookings(a: UpkeepArgs) {
  const { lite, doc, state, readOnly } = a;
  // Hotels (and restaurants) booked without a pin — e.g. an email address the map search didn't
  // know — get located in the background, so legs to/from the hotel and their pins appear.
  const pinTried = useRef(new Set<string>());
  useEffect(() => {
    if (lite || !doc || !state || readOnly || !navigator.onLine) return;
    const todo = state.reservations.filter((r) => (r.type === "lodging" || r.type === "restaurant" || (r.type === "other" && !!r.address)) && r.lat == null && !pinTried.current.has(r.id));
    if (!todo.length) return;
    todo.forEach((r) => pinTried.current.add(r.id));
    (async () => {
      for (const r of todo) {
        const q = [r.title, r.address].filter(Boolean).join(", ");
        let hit: { lat: number; lng: number; address?: string } | null = null;
        if (GOOGLE_KEY) {
          const [sug] = await autocomplete(q, state.meta.center).catch(() => []);
          if (sug) hit = await suggestionPlace(sug.placeId).catch(() => null);
        }
        if (!hit) hit = (await searchPlaces(q, state.meta.center).catch(() => []))[0] ?? null;
        if (!hit && r.address) hit = (await searchPlaces(r.address, state.meta.center).catch(() => []))[0] ?? null;
        const cur = readTrip(doc).reservations.find((x) => x.id === r.id);
        if (hit && cur && cur.lat == null) saveReservation(doc, { ...cur, lat: hit.lat, lng: hit.lng, address: cur.address || hit.address }, AUTO);
      }
    })();
  }, [doc, state, readOnly]);
}

export function useRelocateImportedStops(a: UpkeepArgs) {
  const { lite, doc, state, readOnly } = a;
  // Stops imported from emails before the careful lookup existed could be pinned on a namesake
  // (a "Nintendo" shop instead of the Nintendo Museum): look each up once more, and move the pin
  // when the better match is somewhere else
  const relocTried = useRef(new Set<string>());
  useEffect(() => {
    if (lite || !doc || !state || readOnly || !navigator.onLine) return;
    const todo = state.items.filter((i) => i.kind === "place" && i.inboxId && !i.located && !i.googlePlaceId && !relocTried.current.has(i.id));
    if (!todo.length) return;
    todo.forEach((i) => relocTried.current.add(i.id));
    (async () => {
      for (const it of todo) {
        const hit = await locateBooking(it.name, it.address, state.meta.center).catch(() => null);
        const cur = readTrip(doc).items.find((x) => x.id === it.id);
        if (!cur) continue;
        const far = hit && (cur.lat == null || cur.lng == null || distanceKm([cur.lng, cur.lat], [hit.lng, hit.lat]) > 0.5);
        updateItem(doc, it.id, far ? { lat: hit!.lat, lng: hit!.lng, googlePlaceId: hit!.googlePlaceId, osmId: hit!.osmId, located: true } : { located: true }, AUTO);
      }
    })();
  }, [doc, state, readOnly]);
}

export function useMatchTravelers(a: UpkeepArgs) {
  const { doc, state, readOnly } = a;
  // Bookings whose passenger is a printed name ("Mr Vishal Monteiro") that clearly is one of the
  // trip's people: use that person, so budget splits and chips line up
  useEffect(() => {
    if (!doc || !state || readOnly) return;
    const people = state.meta.travelers ?? [];
    if (!people.length) return;
    for (const r of state.reservations) {
      if (!r.traveler || people.includes(r.traveler)) continue;
      const who = matchTraveler(r.traveler, people, state.meta.travelerAliases);
      if (who && who !== r.traveler && people.includes(who)) saveReservation(doc, { ...r, traveler: who }, AUTO);
    }
  }, [doc, state, readOnly]);
}

export function useFixWikiPhotos(a: UpkeepArgs) {
  const { lite, doc, state, readOnly } = a;
  // Photos auto-picked from a Wikipedia article about something else (the district a shop is
  // named after): swap for the place's own Google photo, else a fresh pick, else none
  const photoChecked = useRef(new Set<string>());
  useEffect(() => {
    if (lite || !doc || !state || readOnly || !navigator.onLine) return;
    const bad = state.items.filter((i) => !i.waypoint && i.image?.source === "wikipedia" && !i.image.manual && i.image.title && !sameSubject(i.name, i.image.title) && !photoChecked.current.has(i.id));
    if (!bad.length) return;
    bad.forEach((i) => photoChecked.current.add(i.id));
    (async () => {
      for (const it of bad) {
        const coords: [number, number] | undefined = it.lat != null && it.lng != null ? [it.lng, it.lat] : undefined;
        const g = it.googlePlaceId ? (await googlePhotos({ placeId: it.googlePlaceId, name: it.name }).catch(() => []))[0] : undefined;
        const next = g ?? (await firstPhoto(it.name, coords, state.meta.destination).catch(() => null));
        const cur = readTrip(doc).items.find((x) => x.id === it.id);
        if (cur?.image?.url === it.image!.url) setItemImage(doc, it.id, next ?? undefined, AUTO);
      }
    })();
  }, [doc, state, readOnly]);
}

export function useLocateTravelEnds(a: UpkeepArgs) {
  const { lite, doc, state, readOnly } = a;
  // Trains, buses and car rentals: find where they leave from / arrive at, with the time zone,
  // so a cross-country ride sorts by real time (saved on the booking; redone if the text changes)
  const endsTried = useRef(new Set<string>());
  useEffect(() => {
    if (lite || !doc || !state || readOnly || !navigator.onLine) return;
    const jobs: { id: string; side: "fromAt" | "toAt"; q: string }[] = [];
    for (const r of state.reservations) {
      if (r.type !== "train" && r.type !== "car") continue;
      for (const [side, text] of [["fromAt", r.from], ["toAt", r.to]] as const) {
        const q = (text ?? "").trim();
        const key = `${r.id}|${side}|${q}`;
        if (q && r[side]?.q !== q && !endsTried.current.has(key)) (endsTried.current.add(key), jobs.push({ id: r.id, side, q }));
      }
    }
    if (!jobs.length) return;
    (async () => {
      for (const j of jobs) {
        const res = readTrip(doc).reservations.find((x) => x.id === j.id);
        const careful = res?.type === "car" ? await locateBooking(j.q, undefined, state.meta.center).catch(() => null) : null;
        const hit = careful ?? (await searchPlaces(j.q, state.meta.center).catch(() => []))[0];
        if (!hit) continue;
        const tz = await zoneAt(hit.lat, hit.lng);
        const cur = readTrip(doc).reservations.find((x) => x.id === j.id);
        if (cur && (cur[j.side === "fromAt" ? "from" : "to"] ?? "").trim() === j.q) saveReservation(doc, { ...cur, [j.side]: { q: j.q, lat: hit.lat, lng: hit.lng, tz } }, AUTO);
      }
    })();
  }, [doc, state, readOnly]);
}

export function useSuggestCover(a: UpkeepArgs) {
  const { lite, doc, state, readOnly } = a;
  // Suggest a cover photo once, for editable trips that don't have one
  const coverTried = useRef(false);
  useEffect(() => {
    // Older auto-covers could be a namesake article ("Iceland (supermarket)"); treat those as missing
    const badAuto = (c = state?.meta.cover) => c?.source === "wikipedia" && /\(.+\)$/.test(c.title ?? "");
    if (lite || !doc || !state || readOnly || (state.meta.cover && !badAuto()) || coverTried.current || !navigator.onLine) return;
    const dest = state.meta.destination || state.meta.title;
    if (!dest) return;
    coverTried.current = true;
    coverFor(dest).then((cover) => {
      const cur = readTrip(doc).meta.cover;
      if (cover && (!cur || badAuto(cur))) updateMeta(doc, { cover }, AUTO);
    });
  }, [doc, state, readOnly]);
}

/** Background fix-ups for an open trip (each one pauses in travel mode and on view-only trips). */
export function useTripUpkeep(a: UpkeepArgs) {
  useMoveEmailActivities(a);
  useTidyImportedNotes(a);
  usePinBookings(a);
  useRelocateImportedStops(a);
  useMatchTravelers(a);
  useFixWikiPhotos(a);
  useLocateTravelEnds(a);
  useSuggestCover(a);
}
