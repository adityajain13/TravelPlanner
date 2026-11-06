export type TripStatus = "planning" | "booked" | "done";
export const STATUSES: TripStatus[] = ["planning", "booked", "done"];
export const STATUS_LABEL: Record<TripStatus, string> = { planning: "Planning", booked: "Booked", done: "Done" };

/** A trip nobody has marked counts as done once its dates have passed, planning before that. */
export function statusOf(status: TripStatus | undefined, endDate: string | undefined, today: string): TripStatus {
  if (status) return status;
  return endDate && endDate < today ? "done" : "planning";
}
