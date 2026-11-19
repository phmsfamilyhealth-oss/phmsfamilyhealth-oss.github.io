/** Screen inventory only. Does not imply live LINE handler integration. */
export const REFILL_32_SCREENS=Object.freeze([
  {
    "id": "REF-01",
    "key": "menu",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-02",
    "key": "person",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-03",
    "key": "medication",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-04",
    "key": "multi_medication",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-05",
    "key": "unregistered_medication",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-06",
    "key": "datetime",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-07",
    "key": "hospital",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-08",
    "key": "pickup_location",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-09",
    "key": "appointment_document",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-10",
    "key": "preparation_tasks",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-11",
    "key": "hospital_conditions",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-12",
    "key": "review",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-13",
    "key": "saved",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-14",
    "key": "detail",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-15",
    "key": "reminder",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-16",
    "key": "received",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-17",
    "key": "partial",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-18",
    "key": "not_received",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-19",
    "key": "received_quantities",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-20",
    "key": "lot_expiry",
    "theme": "medication",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-21",
    "key": "stock_intake",
    "theme": "medication",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-22",
    "key": "container_codes",
    "theme": "medication",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-23",
    "key": "labels",
    "theme": "medication",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-24",
    "key": "expenses",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-25",
    "key": "receipt_summary",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-26",
    "key": "history",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-27",
    "key": "empty",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-28",
    "key": "pending",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-29",
    "key": "denied",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-30",
    "key": "error",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-31",
    "key": "session_expired",
    "theme": "appointment",
    "status": "NOT_WIRED"
  },
  {
    "id": "REF-32",
    "key": "cancel_reschedule",
    "theme": "appointment",
    "status": "NOT_WIRED"
  }
]);
export function assertRefillRegistry(){if(REFILL_32_SCREENS.length!==32||new Set(REFILL_32_SCREENS.map(x=>x.id)).size!==32)throw Error("REFILL_REGISTRY_INCOMPLETE");return true;}
