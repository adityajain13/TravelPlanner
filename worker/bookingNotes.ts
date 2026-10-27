/*
 * Imported bookings get their notes in one standard shape, whatever the email or source looked
 * like: one "**Label:** value" line per detail, in a fixed order for the booking type (a flight
 * reads terminal, gate, seat, class, ticket #, baggage…), then anything else after a blank line.
 * The extractor fills `details`; the order and wording come from here, not from the model.
 */

type Kind = "flight" | "hotel" | "train" | "bus" | "car" | "restaurant" | "activity" | "other";

const FIELDS = {
  terminal: { label: "Terminal", hint: 'Flights: departure terminal, with arrival terminal after an arrow when shown, e.g. "3 → 1".' },
  gate: { label: "Gate", hint: "Flights: gate, if printed." },
  coach: { label: "Coach", hint: "Trains/buses: car or coach number." },
  seat: { label: "Seat", hint: 'Seat number(s), e.g. "12A" or "12A, 12B".' },
  cabin: { label: "Class", hint: 'Cabin or fare, e.g. "Economy (Standard)", "Green Car", "Premium Economy".' },
  platform: { label: "Platform", hint: "Trains/buses: platform, track or bay." },
  ticket: { label: "Ticket #", hint: "E-ticket / ticket number (not the booking confirmation)." },
  baggage: { label: "Baggage", hint: 'Allowance, e.g. "1 × 23 kg checked, 1 carry-on".' },
  meal: { label: "Meal", hint: "Meal on board, special meal request." },
  room: { label: "Room", hint: 'Hotels: room type and beds, e.g. "Deluxe Twin, non-smoking".' },
  guests: { label: "Guests", hint: 'Hotels: e.g. "2 adults".' },
  board: { label: "Meals", hint: 'Hotels: e.g. "Breakfast included".' },
  check_in: { label: "Check-in", hint: 'Hotels: check-in window, e.g. "from 15:00". Flights: online check-in or counter closing.' },
  check_out: { label: "Check-out", hint: 'Hotels: e.g. "by 11:00".' },
  vehicle: { label: "Car", hint: 'Rental cars: model or class and transmission, e.g. "Toyota Yaris or similar, automatic".' },
  pickup: { label: "Pick-up", hint: "Rental cars: where/how to collect (desk, shuttle, opening hours)." },
  dropoff: { label: "Drop-off", hint: "Rental cars: return location details, after-hours drop." },
  coverage: { label: "Insurance", hint: "Rental cars: coverage included or bought, deductible/excess." },
  mileage: { label: "Mileage", hint: "Rental cars: unlimited or km allowance." },
  fuel: { label: "Fuel", hint: 'Rental cars: fuel policy, e.g. "Full to full".' },
  extras: { label: "Extras", hint: "Add-ons: child seat, GPS, ETC card, Wi-Fi…" },
  driver: { label: "Driver", hint: "Rental cars: main / additional drivers." },
  party: { label: "Party", hint: 'Restaurants: party size, e.g. "4 people".' },
  seating: { label: "Seating", hint: "Restaurants: table, counter, terrace, course/menu booked." },
  tickets: { label: "Tickets", hint: 'Activities: count and kind, e.g. "2 × Adult".' },
  entry: { label: "Entry", hint: "Activities: entry time / time slot / valid dates." },
  meeting_point: { label: "Meeting point", hint: "Activities/tours: where to meet." },
  duration: { label: "Duration", hint: "Activities/tours: length." },
  dress_code: { label: "Dress code", hint: "If stated." },
  bring: { label: "Bring", hint: "What to bring or show (passport, printed voucher, QR code)." },
  deposit: { label: "Deposit", hint: "Deposit taken or due." },
  payment: { label: "Payment", hint: 'e.g. "Paid", "Pay at hotel", "¥3,000 due at pick-up".' },
  cancellation: { label: "Cancellation", hint: 'Free-cancellation deadline or policy, e.g. "Free until Nov 28, 23:59".' },
  reference: { label: "Reference", hint: "Other booking numbers besides the main confirmation: airline PNR, supplier/hotel confirmation, rental agreement #, booking-site itinerary #. Label them, e.g. \"Hertz: K1234567\"." },
  loyalty: { label: "Loyalty #", hint: "Frequent flyer / hotel loyalty number used." },
  aircraft: { label: "Aircraft", hint: "Flights: aircraft type." },
  phone: { label: "Phone", hint: "Venue/supplier phone number." },
} as const;
type Field = keyof typeof FIELDS;

/** Best order per type: what you need at the counter first. */
const ORDER: Record<Kind, Field[]> = {
  flight: ["terminal", "gate", "seat", "cabin", "ticket", "baggage", "meal", "check_in", "reference", "loyalty", "aircraft", "cancellation"],
  train: ["coach", "seat", "cabin", "platform", "ticket", "baggage", "reference", "cancellation"],
  bus: ["seat", "platform", "ticket", "baggage", "reference", "cancellation"],
  hotel: ["room", "guests", "board", "check_in", "check_out", "payment", "cancellation", "reference", "loyalty", "phone"],
  car: ["vehicle", "pickup", "dropoff", "coverage", "mileage", "fuel", "extras", "driver", "payment", "reference", "cancellation", "phone"],
  restaurant: ["party", "seating", "deposit", "dress_code", "payment", "cancellation", "reference", "phone"],
  activity: ["tickets", "entry", "meeting_point", "duration", "bring", "ticket", "payment", "cancellation", "reference", "phone"],
  other: [],
};
const ALL = Object.keys(FIELDS) as Field[];

/** JSON schema for the extractor's / connector's `details` object. */
export const DETAILS_SCHEMA = {
  type: "object",
  description: "Booking details, each as short text exactly as useful at the counter. Leave out anything not stated. Don't repeat the title, dates, times, from/to, address, cost, confirmation or passenger name here.",
  properties: Object.fromEntries(ALL.map((k) => [k, { type: "string", description: FIELDS[k].hint }])),
};

const KIND: Record<string, Kind> = { lodging: "hotel" };

/** Standard notes: details in the type's order (others after), then free notes after a blank line. */
export function formatBookingNotes(type: string, details: unknown, notes?: string): string | undefined {
  const kind = (KIND[type] ?? type) as Kind;
  const d = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
  const order = [...(ORDER[kind] ?? []), ...ALL.filter((k) => !(ORDER[kind] ?? []).includes(k))];
  const lines = order
    .map((k) => [k, typeof d[k] === "string" ? (d[k] as string).replace(/\s+/g, " ").trim() : ""] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `**${FIELDS[k].label}:** ${v}`);
  const rest = notes?.trim();
  const out = [lines.join("\n"), rest].filter(Boolean).join("\n\n");
  return out || undefined;
}
