import type { Database } from "@/db/database.types";

// Shared entity types (DB rows and DTOs).

export type EventRow = Database["public"]["Tables"]["event"]["Row"];
