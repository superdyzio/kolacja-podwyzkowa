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
        };
        Insert: {
          id?: number;
          name?: string;
          organizer_key: string;
          tv_key: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          organizer_key?: string;
          tv_key?: string;
          created_at?: string;
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
        };
        Insert: {
          id?: never;
          event_id?: number;
          display_name: string;
          is_absent?: boolean;
          group_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          display_name?: string;
          is_absent?: boolean;
          group_id?: number | null;
          created_at?: string;
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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
