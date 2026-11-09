import { isStaffRole, type StaffRole } from "@/lib/auth/types";
import type { DbClient } from "@/lib/supabase-client";
import type { RestaurantTeamMemberDto } from "@/types";

// The restaurant panel's overview (platform-restaurants, S-10): how many events the restaurant has and its team.
// Called only after the central guard opened the restaurant for the person (findPanelRestaurant). No ids, keys or
// hashes leave this module. S-11 adds the events, S-12 the team management.

const ROLE_ORDER: Record<StaffRole, number> = { owner: 0, manager: 1, waiter: 2 };

export interface RestaurantOverview {
  eventCount: number;
  team: RestaurantTeamMemberDto[];
}

export async function getRestaurantOverview(db: DbClient, restaurantId: number): Promise<RestaurantOverview> {
  const [events, members] = await Promise.all([
    db.from("event").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    db
      .from("restaurant_member")
      .select("role, staff_account(email, display_name, password_hash)")
      .eq("restaurant_id", restaurantId),
  ]);
  if (events.error) {
    throw new Error(`Panel lokalu (wydarzenia): ${events.error.message}`);
  }
  if (members.error) {
    throw new Error(`Panel lokalu (zespół): ${members.error.message}`);
  }
  const team = members.data
    .filter((row) => isStaffRole(row.role))
    .map((row) => ({
      email: row.staff_account.email,
      displayName: row.staff_account.display_name,
      role: row.role as StaffRole,
      hasPassword: row.staff_account.password_hash !== null,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.email.localeCompare(b.email, "pl"));
  return { eventCount: events.count ?? 0, team };
}
