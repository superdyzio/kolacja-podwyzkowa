/* eslint-disable @typescript-eslint/consistent-indexed-object-style -- mirrors the generated Supabase types shape */
// Hand-written in the shape `supabase gen types typescript` produces (generation would start extra containers).
// Every slice that adds a migration extends `public.Tables` here. multi-tenant-events: every child table's event_id is
// required on insert (no DB default), and every function that touches event data takes p_event_id.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      // multi-tenant-events: a restaurant on the platform; every event belongs to one.
      restaurant: {
        Row: {
          id: number;
          name: string;
          created_at: string;
          // platform-restaurants: null = active, set = switched off by the platform administrator.
          disabled_at: string | null;
          // event-branding (S-18): the owner's brand colour `#rrggbb`, null = none.
          brand_color: string | null;
          // privacy-retention (S-26): days after the event until its guests' data is deleted (1–365, default 30).
          guest_retention_days: number;
        };
        Insert: {
          id?: never;
          name: string;
          created_at?: string;
          disabled_at?: string | null;
          brand_color?: string | null;
          guest_retention_days?: number;
        };
        Update: {
          id?: never;
          name?: string;
          created_at?: string;
          disabled_at?: string | null;
          brand_color?: string | null;
          guest_retention_days?: number;
        };
        Relationships: [];
      };
      event: {
        Row: {
          id: number;
          name: string;
          organizer_key: string;
          tv_key: string;
          created_at: string;
          // S-05: guest links open nothing while false (default).
          guest_access_enabled: boolean;
          // privacy-retention (S-26): when the guests' data was deleted after its term (null = never).
          guest_data_purged_at: string | null;
          // S-06: guests may save or change their guess only while true (default).
          guess_intake_open: boolean;
          // S-06: the correct raise amount in grosze, null until entered.
          correct_amount_grosze: number | null;
          // restaurant-orders: the restaurant link key (/r/<key>), filled by the column default.
          restaurant_key: string;
          // multi-tenant-events: the restaurant the event belongs to.
          restaurant_id: number;
          // restaurant-events: the day of the event (YYYY-MM-DD, Europe/Warsaw; default today there).
          event_date: string;
          // restaurant-events: how many guests the restaurant expects (1–1000), null = not given.
          expected_guests: number | null;
          // restaurant-events: null = active; set = archived (only moves it between the panel's lists).
          archived_at: string | null;
          // client-restaurant-split: „Lokal prowadzi” — true = staff edit in the panel, the organizer link is view-only.
          venue_leads: boolean;
          modules_available: string[];
          modules_enabled: string[];
          modules_unlocked: string[];
          // event-branding (S-18): the client's company or event name (1–80), null = none.
          brand_name: string | null;
          // venue-templates: true = a restaurant's venue template (never opens through a key, never listed or counted).
          is_template: boolean;
          // menu-catalog-courses: off = free-text orders (v1; every event from before), full = the whole catalog,
          // reduced = the items in event_menu_item. Default for new rows: full.
          menu_mode: string;
          // guest-rsvp-menu: null = RSVP off; set = guests answer until this instant (read-only for them afterwards).
          rsvp_deadline: string | null;
        };
        Insert: {
          id?: never;
          restaurant_id: number;
          name: string;
          // multi-tenant-events: the organizer and TV keys are filled by column defaults (like restaurant_key).
          organizer_key?: string;
          tv_key?: string;
          created_at?: string;
          guest_access_enabled?: boolean;
          guest_data_purged_at?: string | null;
          guess_intake_open?: boolean;
          correct_amount_grosze?: number | null;
          restaurant_key?: string;
          event_date?: string;
          expected_guests?: number | null;
          archived_at?: string | null;
          venue_leads?: boolean;
          modules_available?: string[];
          modules_enabled?: string[];
          modules_unlocked?: string[];
          brand_name?: string | null;
          is_template?: boolean;
          menu_mode?: string;
          rsvp_deadline?: string | null;
        };
        Update: {
          id?: never;
          restaurant_id?: number;
          name?: string;
          organizer_key?: string;
          tv_key?: string;
          created_at?: string;
          guest_access_enabled?: boolean;
          guest_data_purged_at?: string | null;
          guess_intake_open?: boolean;
          correct_amount_grosze?: number | null;
          restaurant_key?: string;
          event_date?: string;
          expected_guests?: number | null;
          archived_at?: string | null;
          venue_leads?: boolean;
          modules_available?: string[];
          modules_enabled?: string[];
          modules_unlocked?: string[];
          brand_name?: string | null;
          is_template?: boolean;
          menu_mode?: string;
          rsvp_deadline?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurant";
            referencedColumns: ["id"];
          },
        ];
      };
      guest_group: {
        Row: {
          id: number;
          event_id: number;
          created_at: string;
        };
        Insert: {
          id?: never;
          event_id: number;
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
          // guest-import-diets (S-23): diet and allergy tags (src/lib/diets/DIET_TAGS) and a note ≤ 120; health data.
          diets: string[];
          diet_note: string | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          display_name: string;
          is_absent?: boolean;
          group_id?: number | null;
          created_at?: string;
          access_key?: string;
          diets?: string[];
          diet_note?: string | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          display_name?: string;
          is_absent?: boolean;
          group_id?: number | null;
          created_at?: string;
          access_key?: string;
          diets?: string[];
          diet_note?: string | null;
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
            columns: ["event_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "guest_group";
            referencedColumns: ["event_id", "id"];
          },
        ];
      };
      // privacy-retention (S-26): the lazy sweep's single row (claim_retention_sweep).
      retention_sweep: {
        Row: { id: number; last_run_at: string | null };
        Insert: { id?: number; last_run_at?: string | null };
        Update: { id?: number; last_run_at?: string | null };
        Relationships: [];
      };
      // event-branding (S-18): one logo per restaurant / per event (PNG, JPEG or WebP by magic bytes, ≤ 512 KiB, base64).
      restaurant_logo: {
        Row: { restaurant_id: number; mime_type: string; byte_size: number; image_base64: string; updated_at: string };
        Insert: {
          restaurant_id: number;
          mime_type: string;
          byte_size: number;
          image_base64: string;
          updated_at?: string;
        };
        Update: {
          restaurant_id?: number;
          mime_type?: string;
          byte_size?: number;
          image_base64?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurant_logo_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: true;
            referencedRelation: "restaurant";
            referencedColumns: ["id"];
          },
        ];
      };
      event_logo: {
        Row: { event_id: number; mime_type: string; byte_size: number; image_base64: string; updated_at: string };
        Insert: { event_id: number; mime_type: string; byte_size: number; image_base64: string; updated_at?: string };
        Update: {
          event_id?: number;
          mime_type?: string;
          byte_size?: number;
          image_base64?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_logo_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "event";
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
          // venue-drawing: distance between two chairs as a fraction of the plan width (0.005–0.2).
          chair_pitch: number;
        };
        Insert: {
          event_id: number;
          mime_type: string;
          byte_size: number;
          image_base64: string;
          updated_at?: string;
          chair_pitch?: number;
        };
        Update: {
          event_id?: number;
          mime_type?: string;
          byte_size?: number;
          image_base64?: string;
          updated_at?: string;
          chair_pitch?: number;
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
          // venue-drawing: the room's rectangle as fractions of the plan image; all four null = no outline.
          outline_x: number | null;
          outline_y: number | null;
          outline_w: number | null;
          outline_h: number | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          name: string;
          created_at?: string;
          outline_x?: number | null;
          outline_y?: number | null;
          outline_w?: number | null;
          outline_h?: number | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          name?: string;
          created_at?: string;
          outline_x?: number | null;
          outline_y?: number | null;
          outline_w?: number | null;
          outline_h?: number | null;
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
          // venue-drawing: degrees clockwise 0..359.
          rotation: number;
        };
        Insert: {
          id?: never;
          event_id: number;
          room_id: number;
          name: string;
          seat_count: number;
          shape: string;
          pos_x: number;
          pos_y: number;
          created_at?: string;
          rotation?: number;
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
          rotation?: number;
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
            columns: ["event_id", "room_id"];
            isOneToOne: false;
            referencedRelation: "venue_room";
            referencedColumns: ["event_id", "id"];
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
          event_id: number;
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
            columns: ["event_id", "guest_id"];
            isOneToOne: true;
            referencedRelation: "guest";
            referencedColumns: ["event_id", "id"];
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
            columns: ["event_id", "table_id"];
            isOneToOne: false;
            referencedRelation: "venue_table";
            referencedColumns: ["event_id", "id"];
          },
        ];
      };
      seating_snapshot: {
        Row: {
          id: number;
          event_id: number;
          published_at: string;
          // venue-drawing: the venue's chair pitch at publish time; null = published before (read as the default).
          chair_pitch: number | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          published_at?: string;
          chair_pitch?: number | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          published_at?: string;
          chair_pitch?: number | null;
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
          // venue-drawing: null = published before rotations existed (read as 0).
          rotation: number | null;
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
          rotation?: number | null;
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
          rotation?: number | null;
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
      // venue-drawing: the outlined rooms of a published snapshot.
      seating_snapshot_room: {
        Row: {
          id: number;
          snapshot_id: number;
          room_name: string;
          outline_x: number;
          outline_y: number;
          outline_w: number;
          outline_h: number;
        };
        Insert: {
          id?: never;
          snapshot_id: number;
          room_name: string;
          outline_x: number;
          outline_y: number;
          outline_w: number;
          outline_h: number;
        };
        Update: {
          id?: never;
          snapshot_id?: number;
          room_name?: string;
          outline_x?: number;
          outline_y?: number;
          outline_w?: number;
          outline_h?: number;
        };
        Relationships: [
          {
            foreignKeyName: "seating_snapshot_room_snapshot_id_fkey";
            columns: ["snapshot_id"];
            isOneToOne: false;
            referencedRelation: "seating_snapshot";
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
          // guess-place: the guest's prediction of their own final place, null = none.
          predicted_place: number | null;
          entered_by: string;
          updated_at: string;
        };
        Insert: {
          guest_id: number;
          event_id: number;
          amount_grosze: number;
          predicted_place?: number | null;
          entered_by?: string;
          updated_at?: string;
        };
        Update: {
          guest_id?: number;
          event_id?: number;
          amount_grosze?: number;
          predicted_place?: number | null;
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
          event_id: number;
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
      // 'failed'. The topic text is never stored. ai-spend: model and billed tokens (null when nothing was billed),
      // failure_kind (AiFailureKind) and http_status of a failed attempt.
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
          model: string | null;
          input_tokens: number | null;
          output_tokens: number | null;
          failure_kind: string | null;
          http_status: number | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          requester: string;
          guest_id?: number | null;
          category: string;
          status?: string;
          created_at?: string;
          finished_at?: string | null;
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          failure_kind?: string | null;
          http_status?: number | null;
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
          model?: string | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          failure_kind?: string | null;
          http_status?: number | null;
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
            columns: ["event_id", "guest_id"];
            isOneToOne: false;
            referencedRelation: "guest";
            referencedColumns: ["event_id", "id"];
          },
        ];
      };
      // What the organizer shows on the TV (tv-spotlight); the newest row wins, its id is the TV token's last part.
      order_item: {
        Row: {
          id: number;
          event_id: number;
          name: string;
          note: string | null;
          quantity: number;
          unit_price_grosze: number;
          guest_id: number | null;
          table_id: number | null;
          delivered: boolean;
          created_at: string;
          updated_at: string;
          // menu-catalog-courses: the course at order time (null = free text) and the catalog item (null when free
          // text or deleted from the catalog).
          course: string | null;
          menu_item_id: number | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          name: string;
          note?: string | null;
          quantity: number;
          unit_price_grosze: number;
          guest_id?: number | null;
          table_id?: number | null;
          delivered?: boolean;
          created_at?: string;
          updated_at?: string;
          course?: string | null;
          menu_item_id?: number | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          name?: string;
          note?: string | null;
          quantity?: number;
          unit_price_grosze?: number;
          guest_id?: number | null;
          table_id?: number | null;
          delivered?: boolean;
          created_at?: string;
          updated_at?: string;
          course?: string | null;
          menu_item_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_item_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_item_guest_id_fkey";
            columns: ["event_id", "guest_id"];
            isOneToOne: false;
            referencedRelation: "guest";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "order_item_table_id_fkey";
            columns: ["event_id", "table_id"];
            isOneToOne: false;
            referencedRelation: "venue_table";
            referencedColumns: ["event_id", "id"];
          },
        ];
      };
      // guest-delivered: one delivered piece (1 … quantity) of an order line and who marked it.
      order_piece: {
        Row: {
          order_item_id: number;
          piece: number;
          event_id: number;
          marked_by: string;
          guest_id: number | null;
          marked_at: string;
        };
        Insert: {
          order_item_id: number;
          piece: number;
          event_id: number;
          marked_by: string;
          guest_id?: number | null;
          marked_at?: string;
        };
        Update: {
          order_item_id?: number;
          piece?: number;
          event_id?: number;
          marked_by?: string;
          guest_id?: number | null;
          marked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_piece_order_item_id_fkey";
            columns: ["event_id", "order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_item";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "order_piece_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_piece_guest_id_fkey";
            columns: ["event_id", "guest_id"];
            isOneToOne: false;
            referencedRelation: "guest";
            referencedColumns: ["event_id", "id"];
          },
        ];
      };
      // bill-drinks: drinks on the restaurant's bill (organizer only).
      // menu-catalog-courses: a restaurant's catalog of dishes and drinks with a course and a price.
      menu_item: {
        Row: {
          id: number;
          restaurant_id: number;
          name: string;
          course: string;
          price_grosze: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          restaurant_id: number;
          name: string;
          course: string;
          price_grosze: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          restaurant_id?: number;
          name?: string;
          course?: string;
          price_grosze?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_item_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurant";
            referencedColumns: ["id"];
          },
        ];
      };
      // menu-catalog-courses: the items of an event's reduced menu (written only by set_event_menu).
      event_menu_item: {
        Row: {
          event_id: number;
          restaurant_id: number;
          menu_item_id: number;
        };
        Insert: {
          event_id: number;
          restaurant_id: number;
          menu_item_id: number;
        };
        Update: {
          event_id?: number;
          restaurant_id?: number;
          menu_item_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_menu_item_event_fkey";
            columns: ["event_id", "restaurant_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id", "restaurant_id"];
          },
          {
            foreignKeyName: "event_menu_item_menu_item_fkey";
            columns: ["restaurant_id", "menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_item";
            referencedColumns: ["restaurant_id", "id"];
          },
        ];
      };
      // guest-rsvp-menu: the dishes guests pick from (items of the event's restaurant; shown while the menu offers them).
      event_rsvp_option: {
        Row: {
          event_id: number;
          restaurant_id: number;
          menu_item_id: number;
        };
        Insert: {
          event_id: number;
          restaurant_id: number;
          menu_item_id: number;
        };
        Update: {
          event_id?: number;
          restaurant_id?: number;
          menu_item_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_rsvp_option_event_fkey";
            columns: ["event_id", "restaurant_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id", "restaurant_id"];
          },
          {
            foreignKeyName: "event_rsvp_option_menu_item_fkey";
            columns: ["restaurant_id", "menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_item";
            referencedColumns: ["restaurant_id", "id"];
          },
        ];
      };
      // guest-rsvp-menu: that a guest answered, the dish (null = none or deleted), who and when; attendance itself is
      // guest.is_absent. Written only by save_guest_rsvp.
      guest_rsvp: {
        Row: {
          guest_id: number;
          event_id: number;
          restaurant_id: number;
          menu_item_id: number | null;
          answered_by: string;
          answered_at: string;
        };
        Insert: {
          guest_id: number;
          event_id: number;
          restaurant_id: number;
          menu_item_id?: number | null;
          answered_by: string;
          answered_at?: string;
        };
        Update: {
          guest_id?: number;
          event_id?: number;
          restaurant_id?: number;
          menu_item_id?: number | null;
          answered_by?: string;
          answered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guest_rsvp_guest_fkey";
            columns: ["event_id", "guest_id"];
            isOneToOne: true;
            referencedRelation: "guest";
            referencedColumns: ["event_id", "id"];
          },
          {
            foreignKeyName: "guest_rsvp_event_fkey";
            columns: ["event_id", "restaurant_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id", "restaurant_id"];
          },
          {
            foreignKeyName: "guest_rsvp_menu_item_fkey";
            columns: ["restaurant_id", "menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_item";
            referencedColumns: ["restaurant_id", "id"];
          },
        ];
      };
      drink_item: {
        Row: {
          id: number;
          event_id: number;
          name: string;
          quantity: number;
          unit_price_grosze: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          event_id: number;
          name: string;
          quantity: number;
          unit_price_grosze: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          name?: string;
          quantity?: number;
          unit_price_grosze?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drink_item_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      tv_spotlight: {
        Row: {
          id: number;
          event_id: number;
          kind: string;
          text: string;
          shown_at: string;
        };
        Insert: {
          id?: never;
          event_id: number;
          kind: string;
          text: string;
          shown_at?: string;
        };
        Update: {
          id?: never;
          event_id?: number;
          kind?: string;
          text?: string;
          shown_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tv_spotlight_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "event";
            referencedColumns: ["id"];
          },
        ];
      };
      // staff-accounts (F-03): a staff account (platform admin, owner, manager, waiter); e-mail lowercase, scrypt
      // password hash null until the invitation link is used.
      staff_account: {
        Row: {
          id: number;
          email: string;
          display_name: string | null;
          password_hash: string | null;
          is_platform_admin: boolean;
          created_at: string;
          password_changed_at: string | null;
        };
        Insert: {
          id?: never;
          email: string;
          display_name?: string | null;
          password_hash?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          password_changed_at?: string | null;
        };
        Update: {
          id?: never;
          email?: string;
          display_name?: string | null;
          password_hash?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          password_changed_at?: string | null;
        };
        Relationships: [];
      };
      // staff-accounts: the account's role in a restaurant ('owner' | 'manager' | 'waiter').
      restaurant_member: {
        Row: {
          restaurant_id: number;
          account_id: number;
          role: string;
          created_at: string;
        };
        Insert: {
          restaurant_id: number;
          account_id: number;
          role: string;
          created_at?: string;
        };
        Update: {
          restaurant_id?: number;
          account_id?: number;
          role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurant_member_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurant";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "restaurant_member_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "staff_account";
            referencedColumns: ["id"];
          },
        ];
      };
      // staff-accounts: a login on one device (SHA-256 of the session token, fixed expiry).
      staff_session: {
        Row: {
          id: number;
          account_id: number;
          token_hash: string;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: never;
          account_id: number;
          token_hash: string;
          created_at?: string;
          expires_at: string;
        };
        Update: {
          id?: never;
          account_id?: number;
          token_hash?: string;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_session_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "staff_account";
            referencedColumns: ["id"];
          },
        ];
      };
      // staff-accounts: a one-time link ('invite' | 'reset'), SHA-256 of the token. Two FKs to staff_account: embeds
      // must name staff_account!staff_token_account_id_fkey.
      staff_token: {
        Row: {
          id: number;
          account_id: number;
          kind: string;
          token_hash: string;
          created_at: string;
          expires_at: string;
          used_at: string | null;
          created_by: number | null;
        };
        Insert: {
          id?: never;
          account_id: number;
          kind: string;
          token_hash: string;
          created_at?: string;
          expires_at: string;
          used_at?: string | null;
          created_by?: number | null;
        };
        Update: {
          id?: never;
          account_id?: number;
          kind?: string;
          token_hash?: string;
          created_at?: string;
          expires_at?: string;
          used_at?: string | null;
          created_by?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "staff_token_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "staff_account";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_token_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff_account";
            referencedColumns: ["id"];
          },
        ];
      };
      // staff-accounts: password attempts per typed e-mail (hashed key) for throttling.
      login_attempt: {
        Row: {
          id: number;
          key_hash: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          key_hash: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          key_hash?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      // admin-support-log: a platform administrator's login session in support mode (read-only) in one restaurant.
      support_grant: {
        Row: {
          id: number;
          session_id: number;
          account_id: number;
          restaurant_id: number;
          reason: string;
          started_at: string;
          expires_at: string;
        };
        Insert: {
          id?: never;
          session_id: number;
          account_id: number;
          restaurant_id: number;
          reason: string;
          started_at?: string;
          expires_at: string;
        };
        Update: {
          id?: never;
          session_id?: number;
          account_id?: number;
          restaurant_id?: number;
          reason?: string;
          started_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_grant_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "staff_session";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_grant_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "staff_account";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_grant_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurant";
            referencedColumns: ["id"];
          },
        ];
      };
      // admin-support-log: the append-only record of support access ('enter' | 'access' | 'exit') for the owner;
      // snapshots of the admin and the event, no FK to the grant, session, account or event. Update and delete are
      // refused by a trigger (only the cascade of a deleted restaurant passes).
      support_log: {
        Row: {
          id: number;
          restaurant_id: number;
          grant_id: number;
          account_id: number;
          admin_email: string;
          admin_name: string | null;
          kind: string;
          reason: string | null;
          expires_at: string | null;
          method: string | null;
          path: string | null;
          event_id: number | null;
          event_name: string | null;
          module: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          restaurant_id: number;
          grant_id: number;
          account_id: number;
          admin_email: string;
          admin_name?: string | null;
          kind: string;
          reason?: string | null;
          expires_at?: string | null;
          method?: string | null;
          path?: string | null;
          event_id?: number | null;
          event_name?: string | null;
          module?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          restaurant_id?: number;
          grant_id?: number;
          account_id?: number;
          admin_email?: string;
          admin_name?: string | null;
          kind?: string;
          reason?: string | null;
          expires_at?: string | null;
          method?: string | null;
          path?: string | null;
          event_id?: number | null;
          event_name?: string | null;
          module?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_log_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurant";
            referencedColumns: ["id"];
          },
        ];
      };
      // event-waiter-access (S-21b): per-event waiters — a one-time link and code (SHA-256 only) for one event's floor.
      event_waiter: {
        Row: {
          id: number;
          event_id: number;
          restaurant_id: number;
          display_name: string;
          created_by: number | null;
          created_at: string;
          expires_at: string;
          link_hash: string | null;
          code_hash: string | null;
          session_hash: string | null;
          redeemed_at: string | null;
        };
        Insert: {
          id?: never;
          event_id: number;
          restaurant_id: number;
          display_name: string;
          created_by?: number | null;
          created_at?: string;
          expires_at: string;
          link_hash?: string | null;
          code_hash?: string | null;
          session_hash?: string | null;
          redeemed_at?: string | null;
        };
        Update: {
          id?: never;
          event_id?: number;
          restaurant_id?: number;
          display_name?: string;
          created_by?: number | null;
          created_at?: string;
          expires_at?: string;
          link_hash?: string | null;
          code_hash?: string | null;
          session_hash?: string | null;
          redeemed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // privacy-retention (S-26): deletes the guests' data of one event past its term (never a template); returns
      // { status: "not-found" | "kept" | "clean" | "purged", purgedAt, guests?, groups?, snapshots?, spotlight?,
      // waiters?, notes? }.
      purge_event_guest_data: {
        Args: { p_event_id: number; p_now: string };
        Returns: Json;
      };
      // privacy-retention: ids of events past their term with guest data still (or again) there, oldest first;
      // p_restaurant_id null = every restaurant.
      expired_guest_data_events: {
        Args: { p_now: string; p_restaurant_id: number | null; p_limit: number };
        Returns: { event_id: number }[];
      };
      // privacy-retention: true for exactly one caller per interval (the lazy sweep's claim).
      claim_retention_sweep: {
        Args: { p_now: string; p_interval_seconds: number };
        Returns: boolean;
      };
      // privacy-retention: the rule (event_date + days < the Warsaw day of p_now) and the leftover check.
      guest_data_expired: {
        Args: { p_event_date: string; p_retention_days: number; p_now: string };
        Returns: boolean;
      };
      event_has_guest_data: {
        Args: { p_event_id: number };
        Returns: boolean;
      };
      // menu-catalog-courses: sets an event's menu mode and (reduced) its items in one transaction. Raises
      // EVENT_NOT_FOUND (also templates), INVALID_MODE, ITEM_NOT_FOUND (an item of another restaurant or unknown).
      // guest-rsvp-menu: the guest's own RSVP for the phone's poll (JSON; null while RSVP is off).
      guest_rsvp_state: {
        Args: { p_event_id: number; p_guest_id: number };
        Returns: Json;
      };
      // guest-rsvp-menu: the one writer of answers; raises INVALID_ANSWER, EVENT_NOT_FOUND, GUEST_NOT_FOUND,
      // RSVP_CLOSED (a guest after the deadline or while off) or DISH_NOT_OFFERED.
      save_guest_rsvp: {
        Args: {
          p_event_id: number;
          p_guest_id: number;
          p_attending: boolean | null;
          p_dish: string | null;
          p_by: string;
        };
        Returns: undefined;
      };
      // guest-rsvp-menu: „Zamknij teraz” — deadline = the earlier of p_now and the DB's now(); false = no such event.
      close_event_rsvp: {
        Args: { p_event_id: number; p_now: string };
        Returns: boolean;
      };
      // guest-rsvp-menu: replaces the client's options; raises EVENT_NOT_FOUND or ITEM_NOT_FOUND.
      set_event_rsvp_options: {
        Args: { p_event_id: number; p_item_ids: number[] };
        Returns: undefined;
      };
      set_event_menu: {
        Args: { p_event_id: number; p_mode: string; p_item_ids: number[] };
        Returns: undefined;
      };
      // guest-delivered: the guest's table in the latest published snapshot (venue_table id), or null.
      guest_published_table_id: {
        Args: { p_guest_id: number };
        Returns: number | null;
      };
      // guest-delivered: the guest's own order lines and their table's lines with the marked pieces (JSON, no prices).
      guest_order_lines: {
        Args: { p_guest_id: number };
        Returns: Json;
      };
      // guest-delivered: marks or unmarks pieces (null = all) of a line of the event as delivered by the organizer
      // (p_guest_id null) or a guest; raises ITEM_NOT_FOUND (also another event's line), PIECE_OUT_OF_RANGE or
      // MARKED_BY_ORGANIZER.
      set_order_pieces: {
        Args: {
          p_event_id: number;
          p_item_id: number;
          p_pieces: number[] | null;
          p_delivered: boolean;
          p_guest_id: number | null;
        };
        Returns: undefined;
      };
      // Atomic creation of an inseparable group (2–5 existing, ungrouped guests of the event); returns the group id.
      // Raises GROUP_SIZE, GUEST_NOT_FOUND (also another event's guest) or GUEST_ALREADY_GROUPED.
      create_guest_group: {
        Args: { p_event_id: number; p_guest_ids: number[] };
        Returns: number;
      };
      // Seats a guest of the event on (table, seat): move, swap or replace atomically. Raises GUEST_NOT_FOUND,
      // TABLE_NOT_FOUND, SEAT_OUT_OF_RANGE, GUEST_PINNED or SEAT_PINNED.
      seat_guest: {
        Args: { p_event_id: number; p_guest_id: number; p_table_id: number; p_seat: number };
        Returns: undefined;
      };
      // Freezes the event's working arrangement (present guests) and tables into a new snapshot; returns its id.
      publish_seating: {
        Args: { p_event_id: number };
        Returns: number;
      };
      // Replaces every non-pinned working seat with p_seats ([{ guest_id, table_id, seat }]) atomically (S-04 draft
      // or restore). Constraint violations abort the whole call.
      replace_seating: {
        Args: { p_event_id: number; p_seats: Json };
        Returns: undefined;
      };
      // venue-drawing: applies an accepted drawing proposal ({ tables, newTables, rooms, chairPitch }) atomically;
      // never deletes. Raises TABLE_NOT_FOUND, ROOM_NOT_FOUND, DUPLICATE_NAME, TOO_MANY_TABLES or NO_PLAN.
      apply_venue_layout: {
        Args: { p_event_id: number; p_layout: Json; p_max_tables: number };
        Returns: undefined;
      };
      // venue-templates: a new venue template of the restaurant (empty, or a copy of an event's venue of the same
      // restaurant) → its id. Raises RESTAURANT_NOT_FOUND or SOURCE_NOT_FOUND.
      create_venue_template: {
        Args: { p_restaurant_id: number; p_name: string; p_source_event_id: number | null };
        Returns: number;
      };
      // venue-templates: a new event with a copy of the template's venue → its id. Raises TEMPLATE_NOT_FOUND.
      create_event_from_template: {
        Args: {
          p_restaurant_id: number;
          p_template_id: number;
          p_name: string;
          p_date: string;
          p_expected_guests: number | null;
        };
        Returns: number;
      };
      // venue-templates: „Zaktualizuj z szablonu” → { seatsBefore, seatsAfter, roomsAdded, roomsRemoved, tablesAdded,
      // tablesRemoved, tablesKept }. Raises EVENT_NOT_FOUND or TEMPLATE_NOT_FOUND.
      apply_venue_template: {
        Args: { p_event_id: number; p_template_id: number };
        Returns: Json;
      };
      // S-06: saves or replaces a guest's own guess while intake is open. Raises GUEST_NOT_FOUND or INTAKE_CLOSED.
      save_guest_guess: {
        Args: { p_event_id: number; p_guest_id: number; p_amount_grosze: number };
        Returns: undefined;
      };
      // guess-place: the guest's own amount AND place prediction (null clears it), same intake lock; raises
      // GUEST_NOT_FOUND or INTAKE_CLOSED.
      save_guest_guess_with_place: {
        Args: { p_event_id: number; p_guest_id: number; p_amount_grosze: number; p_predicted_place: number | null };
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
      // ai-spend: billed AI topic tokens of the evening per model (model null = no model recorded).
      ai_topic_tokens: {
        Args: { p_event_id: number };
        Returns: { model: string | null; input_tokens: number; output_tokens: number }[];
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
      // staff-accounts: stores a new one-time link for the account (its unused links are deleted); returns the id.
      // Raises ACCOUNT_NOT_FOUND.
      issue_staff_token: {
        Args: {
          p_account_id: number;
          p_kind: string;
          p_token_hash: string;
          p_expires_at: string;
          p_created_by?: number | null;
        };
        Returns: number;
      };
      // staff-accounts: uses a one-time link (sets the password, ends earlier sessions, opens a new one); returns the
      // account id. Raises TOKEN_INVALID (unknown, used or expired alike).
      redeem_staff_token: {
        Args: { p_token_hash: string; p_password_hash: string; p_session_hash: string; p_session_expires_at: string };
        Returns: number;
      };
      // staff-accounts: new password hash, every other session of the account ends. Raises ACCOUNT_NOT_FOUND.
      change_staff_password: {
        Args: { p_account_id: number; p_keep_session_id: number; p_password_hash: string };
        Returns: undefined;
      };
      // staff-accounts: admits one password attempt for a key (records it) or refuses with retry-after seconds.
      begin_login_attempt: {
        Args: { p_key_hash: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; retry_after_seconds: number }[];
      };
      // platform-restaurants: owners, atomic restaurant creation and the platform's restaurant list.
      add_restaurant_owner: {
        Args: { p_restaurant_id: number; p_email: string; p_display_name?: string | null };
        Returns: { owner_account_id: number; owner_created: boolean; owner_has_password: boolean }[];
      };
      create_restaurant_with_owner: {
        Args: { p_name: string; p_email: string; p_display_name?: string | null };
        Returns: {
          new_restaurant_id: number;
          owner_account_id: number;
          owner_created: boolean;
          owner_has_password: boolean;
        }[];
      };
      platform_restaurant_list: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: number;
          name: string;
          created_at: string;
          disabled_at: string | null;
          event_count: number;
          member_count: number;
          owners: Json;
        }[];
      };
      // restaurant-team: the team's invitations, role changes, removals and one-time links, each within the actor's
      // scope under a lock on the restaurant row (errors NOT_ALLOWED, MEMBER_NOT_FOUND, ALREADY_MEMBER, LAST_OWNER,
      // ELSEWHERE, RESTAURANT_NOT_FOUND, INVALID_ROLE). The team_* helpers are internal and not called by the app.
      add_restaurant_member: {
        Args: {
          p_restaurant_id: number;
          p_actor_id: number;
          p_email: string;
          p_display_name: string | null;
          p_role: string;
        };
        Returns: {
          member_account_id: number;
          member_created: boolean;
          member_has_password: boolean;
          member_exclusive: boolean;
        }[];
      };
      set_restaurant_member_role: {
        Args: { p_restaurant_id: number; p_actor_id: number; p_account_id: number; p_role: string };
        Returns: undefined;
      };
      remove_restaurant_member: {
        Args: { p_restaurant_id: number; p_actor_id: number; p_account_id: number };
        Returns: undefined;
      };
      issue_member_link: {
        Args: {
          p_restaurant_id: number;
          p_actor_id: number;
          p_account_id: number;
          p_token_hash: string;
          p_invite_expires_at: string;
          p_reset_expires_at: string;
        };
        Returns: { link_kind: string; link_expires_at: string }[];
      };
      // admin-support-log: a platform administrator's login session enters support mode in a restaurant (logged).
      begin_support_access: {
        Args: { p_session_id: number; p_restaurant_id: number; p_reason: string; p_minutes: number };
        Returns: { grant_id: number; started_at: string; expires_at: string }[];
      };
      // event-modules: the administrator's unlock of a paid module inside a live support visit of the session.
      set_event_module_unlock: {
        Args: { p_session_id: number; p_event_id: number; p_module: string; p_unlocked: boolean };
        Returns: string;
      };
      // admin-support-log: the guard's check — a live grant → the access is logged and the restaurant (event) returned.
      record_support_access: {
        Args: {
          p_session_id: number;
          p_restaurant_id: number | null;
          p_event_id: number | null;
          p_method: string;
          p_path: string;
        };
        Returns: {
          restaurant_id: number;
          restaurant_name: string;
          restaurant_disabled: boolean;
          event_id: number | null;
          event_name: string | null;
          grant_id: number;
          reason: string;
          started_at: string;
          expires_at: string;
        }[];
      };
      // admin-support-log: ends support mode; true when a live grant ended (logged as exit).
      end_support_access: {
        Args: { p_session_id: number; p_restaurant_id: number };
        Returns: boolean;
      };
      // event-waiter-access (S-21b): adds a per-event waiter under the event row lock → its id and expiry.
      add_event_waiter: {
        Args: {
          p_event_id: number;
          p_restaurant_id: number;
          p_display_name: string;
          p_created_by: number | null;
          p_link_hash: string;
          p_code_hash: string;
          p_max: number;
        };
        Returns: { waiter_id: number; expires_at: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
