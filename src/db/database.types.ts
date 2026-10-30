/* eslint-disable @typescript-eslint/consistent-indexed-object-style -- mirrors the generated Supabase types shape */
// Hand-written in the shape `supabase gen types typescript` produces (generation would start extra containers).
// Every slice that adds a migration extends `public.Tables` here.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      event: {
        Row: {
          id: number;
          name: string;
          organizer_key: string;
          tv_key: string;
          created_at: string;
          // S-05: guest links open nothing while false (default).
          guest_access_enabled: boolean;
          // S-06: guests may save or change their guess only while true (default).
          guess_intake_open: boolean;
          // S-06: the correct raise amount in grosze, null until entered.
          correct_amount_grosze: number | null;
        };
        Insert: {
          id?: number;
          name?: string;
          organizer_key: string;
          tv_key: string;
          created_at?: string;
          guest_access_enabled?: boolean;
          guess_intake_open?: boolean;
          correct_amount_grosze?: number | null;
        };
        Update: {
          id?: number;
          name?: string;
          organizer_key?: string;
          tv_key?: string;
          created_at?: string;
          guest_access_enabled?: boolean;
          guess_intake_open?: boolean;
          correct_amount_grosze?: number | null;
        };
        Relationships: [];
      };
      guest_group: {
        Row: {
          id: number;
          event_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          event_id?: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guest_group_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      guest: {
        Row: {
          id: number;
          event_id: number;
          display_name: string;
          is_absent: boolean;
          group_id: number | null;
          created_at: string;
          // S-05: personal link key (/g/<key>), 24 chars base64url; the DB default generates it.
          access_key: string;
        };
        Insert: {
          id?: never;
          event_id?: number;
          display_name: string;
          is_absent?: boolean;
          group_id?: number | null;
          created_at?: string;
          access_key?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          display_name?: string;
          is_absent?: boolean;
          group_id?: number | null;
          created_at?: string;
          access_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guest_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guest_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "guest_group";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_plan: {
        Row: {
          event_id: number;
          mime_type: string;
          byte_size: number;
          image_base64: string;
          updated_at: string;
        };
        Insert: {
          event_id?: number;
          mime_type: string;
          byte_size: number;
          image_base64: string;
          updated_at?: string;
        };
        Update: {
          event_id?: number;
          mime_type?: string;
          byte_size?: number;
          image_base64?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_plan_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_room: {
        Row: {
          id: number;
          event_id: number;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          event_id?: number;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_room_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_table: {
        Row: {
          id: number;
          event_id: number;
          room_id: number;
          name: string;
          seat_count: number;
          shape: string;
          pos_x: number;
          pos_y: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          event_id?: number;
          room_id: number;
          name: string;
          seat_count: number;
          shape: string;
          pos_x: number;
          pos_y: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          room_id?: number;
          name?: string;
          seat_count?: number;
          shape?: string;
          pos_x?: number;
          pos_y?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_table_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venue_table_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "venue_room";
            referencedColumns: ["id"];
          },
        ];
      };
      seat_assignment: {
        Row: {
          guest_id: number;
          event_id: number;
          table_id: number;
          seat: number;
          is_pinned: boolean;
        };
        Insert: {
          guest_id: number;
          event_id?: number;
          table_id: number;
          seat: number;
          is_pinned?: boolean;
        };
        Update: {
          guest_id?: number;
          event_id?: number;
          table_id?: number;
          seat?: number;
          is_pinned?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "seat_assignment_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: true;
            referencedRelation: "guest";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seat_assignment_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seat_assignment_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "venue_table";
            referencedColumns: ["id"];
          },
        ];
      };
      seating_snapshot: {
        Row: {
          id: number;
          event_id: number;
          published_at: string;
        };
        Insert: {
          id?: never;
          event_id?: number;
          published_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          published_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seating_snapshot_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      seating_snapshot_table: {
        Row: {
          id: number;
          snapshot_id: number;
          table_id: number | null;
          room_name: string;
          name: string;
          seat_count: number;
          shape: string;
          pos_x: number;
          pos_y: number;
        };
        Insert: {
          id?: never;
          snapshot_id: number;
          table_id?: number | null;
          room_name: string;
          name: string;
          seat_count: number;
          shape: string;
          pos_x: number;
          pos_y: number;
        };
        Update: {
          id?: never;
          snapshot_id?: number;
          table_id?: number | null;
          room_name?: string;
          name?: string;
          seat_count?: number;
          shape?: string;
          pos_x?: number;
          pos_y?: number;
        };
        Relationships: [
          {
            foreignKeyName: "seating_snapshot_table_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "seating_snapshot";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_snapshot_table_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "venue_table";
            referencedColumns: ["id"];
          },
        ];
      };
      seating_snapshot_seat: {
        Row: {
          snapshot_id: number;
          snapshot_table_id: number;
          seat: number;
          guest_id: number | null;
          guest_name: string;
        };
        Insert: {
          snapshot_id: number;
          snapshot_table_id: number;
          seat: number;
          guest_id?: number | null;
          guest_name: string;
        };
        Update: {
          snapshot_id?: number;
          snapshot_table_id?: number;
          seat?: number;
          guest_id?: number | null;
          guest_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seating_snapshot_seat_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "seating_snapshot";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_snapshot_seat_snapshot_table_id_fkey";
            columns: ["snapshot_table_id"];
            isOneToOne: false;
            referencedRelation: "seating_snapshot_table";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seating_snapshot_seat_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "guest";
            referencedColumns: ["id"];
          },
        ];
      };
      // S-06: one guess of the final raise amount per guest, in integer grosze (0 … 1 000 000 000).
      guess: {
        Row: {
          guest_id: number;
          event_id: number;
          amount_grosze: number;
          entered_by: string;
          updated_at: string;
        };
        Insert: {
          guest_id: number;
          event_id?: number;
          amount_grosze: number;
          entered_by?: string;
          updated_at?: string;
        };
        Update: {
          guest_id?: number;
          event_id?: number;
          amount_grosze?: number;
          entered_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guess_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: true;
            referencedRelation: "guest";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guess_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      // S-07: conversation questions; category 'kontrowersyjne' | 'generyczne' | 'refleksyjne'; text_key = lower(text)
      // (generated) is unique per event and the on_conflict target of idempotent inserts.
      question: {
        Row: {
          id: number;
          event_id: number;
          category: string;
          text: string;
          text_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          event_id?: number;
          category: string;
          text: string;
          text_key?: never;
          created_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          category?: string;
          text?: string;
          text_key?: never;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      // S-08: one AI topic generation attempt; requester 'guest' | 'organizer', status 'pending' | 'succeeded' |
      // 'failed'. The topic text is never stored.
      ai_topic: {
        Row: {
          id: number;
          event_id: number;
          requester: string;
          guest_id: number | null;
          category: string;
          status: string;
          created_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: never;
          event_id?: number;
          requester: string;
          guest_id?: number | null;
          category: string;
          status?: string;
          created_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          requester?: string;
          guest_id?: number | null;
          category?: string;
          status?: string;
          created_at?: string;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_topic_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_topic_guest_id_fkey";
            columns: ["guest_id"];
            isOneToOne: false;
            referencedRelation: "guest";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // Atomic creation of an inseparable group (2–5 existing, ungrouped guests); returns the group id.
      // Raises GROUP_SIZE, GUEST_NOT_FOUND or GUEST_ALREADY_GROUPED.
      create_guest_group: {
        Args: { p_guest_ids: number[] };
        Returns: number;
      };
      // Seats a guest on (table, seat): move, swap or replace atomically. Raises GUEST_NOT_FOUND, TABLE_NOT_FOUND,
      // SEAT_OUT_OF_RANGE, GUEST_PINNED or SEAT_PINNED.
      seat_guest: {
        Args: { p_guest_id: number; p_table_id: number; p_seat: number };
        Returns: undefined;
      };
      // Freezes the working arrangement (present guests) and every table into a new snapshot; returns its id.
      publish_seating: {
        Args: never;
        Returns: number;
      };
      // Replaces every non-pinned working seat with p_seats ([{ guest_id, table_id, seat }]) atomically (S-04 draft
      // or restore). Constraint violations abort the whole call.
      replace_seating: {
        Args: { p_seats: Json };
        Returns: undefined;
      };
      // S-06: saves or replaces a guest's own guess while intake is open. Raises GUEST_NOT_FOUND or INTAKE_CLOSED.
      save_guest_guess: {
        Args: { p_guest_id: number; p_amount_grosze: number };
        Returns: undefined;
      };
      // S-08: admits one AI topic attempt (p_guest_id null = the organizer) and returns the pending row id. Raises
      // EVENT_NOT_FOUND, GUEST_NOT_FOUND, GUEST_BUSY, GUEST_LIMIT or EVENT_LIMIT.
      reserve_ai_topic: {
        Args: {
          p_event_id: number;
          p_guest_id: number | null;
          p_category: string;
          p_guest_limit: number;
          p_event_limit: number;
        };
        Returns: number;
      };
      // S-08: the evening's attempt counts (and one guest's when p_guest_id is given); stale pending = failed.
      ai_topic_usage: {
        Args: { p_event_id: number; p_guest_id?: number | null };
        Returns: { event_used: number; event_failed: number; guest_used: number; guest_busy: boolean }[];
      };
      // organizer-reset: what a reset would remove (counts and flags as a JSON object, see ResetCountsDto). Raises
      // EVENT_NOT_FOUND.
      reset_counts: {
        Args: { p_event_id: number };
        Returns: Json;
      };
      // organizer-reset: wipes the chosen parts (implied ones added) in one transaction; returns
      // { parts, before, questionsAdded, guestKeysReplaced }. Raises NO_PARTS, UNKNOWN_PART, NO_STARTER_QUESTIONS or
      // EVENT_NOT_FOUND.
      reset_event: {
        Args: { p_event_id: number; p_parts: string[]; p_starter_questions: Json };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
