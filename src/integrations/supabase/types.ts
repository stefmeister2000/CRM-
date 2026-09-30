export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      account_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          email: string;
          full_name: string | null;
          id: string;
          status: Database["public"]["Enums"]["account_request_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          email: string;
          full_name?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["account_request_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          email?: string;
          full_name?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["account_request_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      activities: {
        Row: {
          body: string | null;
          channel: Database["public"]["Enums"]["activity_channel"];
          created_at: string;
          direction: string;
          id: string;
          lead_id: string;
          occurred_at: string;
          subject: string | null;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          channel?: Database["public"]["Enums"]["activity_channel"];
          created_at?: string;
          direction?: string;
          id?: string;
          lead_id: string;
          occurred_at?: string;
          subject?: string | null;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          channel?: Database["public"]["Enums"]["activity_channel"];
          created_at?: string;
          direction?: string;
          id?: string;
          lead_id?: string;
          occurred_at?: string;
          subject?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: string;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          campaign: string | null;
          created_at: string;
          created_by: string | null;
          file_name: string;
          id: string;
          imported_count: number;
          row_count: number;
          skipped_count: number;
          source: Database["public"]["Enums"]["lead_source"];
        };
        Insert: {
          campaign?: string | null;
          created_at?: string;
          created_by?: string | null;
          file_name: string;
          id?: string;
          imported_count?: number;
          row_count?: number;
          skipped_count?: number;
          source?: Database["public"]["Enums"]["lead_source"];
        };
        Update: {
          campaign?: string | null;
          created_at?: string;
          created_by?: string | null;
          file_name?: string;
          id?: string;
          imported_count?: number;
          row_count?: number;
          skipped_count?: number;
          source?: Database["public"]["Enums"]["lead_source"];
        };
        Relationships: [];
      };
      leads: {
        Row: {
          campaign: string | null;
          city: string | null;
          company: string;
          contact_name: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: string;
          import_batch_id: string | null;
          job_title: string | null;
          last_touch_at: string | null;
          linkedin_url: string | null;
          next_step: string | null;
          next_step_at: string | null;
          notes: string | null;
          owner_id: string | null;
          phone: string | null;
          priority: number;
          source: Database["public"]["Enums"]["lead_source"];
          stage: Database["public"]["Enums"]["lead_stage"];
          updated_at: string;
          value_estimate: number | null;
          venue: Database["public"]["Enums"]["lead_venue"];
          website: string | null;
        };
        Insert: {
          campaign?: string | null;
          city?: string | null;
          company: string;
          contact_name?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          import_batch_id?: string | null;
          job_title?: string | null;
          last_touch_at?: string | null;
          linkedin_url?: string | null;
          next_step?: string | null;
          next_step_at?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          priority?: number;
          source?: Database["public"]["Enums"]["lead_source"];
          stage?: Database["public"]["Enums"]["lead_stage"];
          updated_at?: string;
          value_estimate?: number | null;
          venue?: Database["public"]["Enums"]["lead_venue"];
          website?: string | null;
        };
        Update: {
          campaign?: string | null;
          city?: string | null;
          company?: string;
          contact_name?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          import_batch_id?: string | null;
          job_title?: string | null;
          last_touch_at?: string | null;
          linkedin_url?: string | null;
          next_step?: string | null;
          next_step_at?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          phone?: string | null;
          priority?: number;
          source?: Database["public"]["Enums"]["lead_source"];
          stage?: Database["public"]["Enums"]["lead_stage"];
          updated_at?: string;
          value_estimate?: number | null;
          venue?: Database["public"]["Enums"]["lead_venue"];
          website?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          team: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          team?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          team?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_admin: { Args: never; Returns: boolean };
      ensure_rep_role: { Args: never; Returns: undefined };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_manager: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      account_request_status: "pending" | "approved" | "declined";
      activity_channel: "email" | "linkedin" | "ads" | "call" | "meeting" | "note";
      app_role: "admin" | "team_leader" | "rep";
      lead_source:
        "email" | "linkedin" | "ads" | "cold_call" | "referral" | "event" | "csv" | "website";
      lead_stage: "new" | "contacted" | "engaged" | "meeting" | "proposal" | "won" | "lost";
      lead_venue: string;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_request_status: ["pending", "approved", "declined"],
      activity_channel: ["email", "linkedin", "ads", "call", "meeting", "note"],
      app_role: ["admin", "team_leader", "rep"],
      lead_source: ["email", "linkedin", "ads", "cold_call", "referral", "event", "csv", "website"],
      lead_stage: ["new", "contacted", "engaged", "meeting", "proposal", "won", "lost"],
      lead_venue: [],
    },
  },
} as const;
