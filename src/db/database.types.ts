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
    };
    Views: { [_ in never]: never };
    Functions: {
      // Atomic creation of an inseparable group (2–5 existing, ungrouped guests); returns the group id.
      // Raises GROUP_SIZE, GUEST_NOT_FOUND or GUEST_ALREADY_GROUPED.
      create_guest_group: {
        Args: { p_guest_ids: number[] };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
