export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: string
          body: string
          channels: Json
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string
          title: string
        }
        Insert: {
          audience?: string
          body: string
          channels?: Json
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          channels?: Json
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          created_at: string
          id: string
          ip: string | null
          metadata: Json
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hq_location: string | null
          id: string
          kyc_documents: Json
          kyc_status: string
          location: string | null
          logo_url: string | null
          name: string
          project_history: Json
          registration_number: string | null
          source: string
          subscription_plan: string | null
          suspended: boolean
          updated_at: string
          verification_status: Database["public"]["Enums"]["company_verification"]
          verified_at: string | null
          verified_by: string | null
          website: string | null
          years_experience: number | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hq_location?: string | null
          id?: string
          kyc_documents?: Json
          kyc_status?: string
          location?: string | null
          logo_url?: string | null
          name: string
          project_history?: Json
          registration_number?: string | null
          source?: string
          subscription_plan?: string | null
          suspended?: boolean
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["company_verification"]
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
          years_experience?: number | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hq_location?: string | null
          id?: string
          kyc_documents?: Json
          kyc_status?: string
          location?: string | null
          logo_url?: string | null
          name?: string
          project_history?: Json
          registration_number?: string | null
          source?: string
          subscription_plan?: string | null
          suspended?: boolean
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["company_verification"]
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      company_member_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_member_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_team_members: {
        Row: {
          created_at: string
          id: string
          role_in_team: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_in_team?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_in_team?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "company_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      company_teams: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          cover_letter: string | null
          created_at: string
          id: string
          job_id: string
          match_score: number | null
          status: string
          user_id: string
        }
        Insert: {
          cover_letter?: string | null
          created_at?: string
          id?: string
          job_id: string
          match_score?: number | null
          status?: string
          user_id: string
        }
        Update: {
          cover_letter?: string | null
          created_at?: string
          id?: string
          job_id?: string
          match_score?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      job_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      job_edit_history: {
        Row: {
          changes: Json
          created_at: string
          edited_by: string | null
          id: string
          job_id: string
        }
        Insert: {
          changes: Json
          created_at?: string
          edited_by?: string | null
          id?: string
          job_id: string
        }
        Update: {
          changes?: Json
          created_at?: string
          edited_by?: string | null
          id?: string
          job_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          application_email: string | null
          application_url: string | null
          category: string
          category_id: string | null
          company: string
          company_id: string | null
          created_at: string
          currency: string | null
          description: string
          education: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          experience_text: string | null
          experience_years: number
          expires_at: string | null
          has_pending_edit: boolean
          id: string
          location: string
          pending_changes: Json | null
          posted_by: string
          posting_type: Database["public"]["Enums"]["posting_type"]
          requirements: string
          responsibilities: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          salary_max: number | null
          salary_min: number | null
          skills: string[] | null
          status: Database["public"]["Enums"]["job_status"]
          tender_documents: Json
          title: string
          updated_at: string
        }
        Insert: {
          application_email?: string | null
          application_url?: string | null
          category: string
          category_id?: string | null
          company: string
          company_id?: string | null
          created_at?: string
          currency?: string | null
          description: string
          education: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          experience_text?: string | null
          experience_years?: number
          expires_at?: string | null
          has_pending_edit?: boolean
          id?: string
          location: string
          pending_changes?: Json | null
          posted_by: string
          posting_type?: Database["public"]["Enums"]["posting_type"]
          requirements: string
          responsibilities: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[] | null
          status?: Database["public"]["Enums"]["job_status"]
          tender_documents?: Json
          title: string
          updated_at?: string
        }
        Update: {
          application_email?: string | null
          application_url?: string | null
          category?: string
          category_id?: string | null
          company?: string
          company_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          education?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          experience_text?: string | null
          experience_years?: number
          expires_at?: string | null
          has_pending_edit?: boolean
          id?: string
          location?: string
          pending_changes?: Json | null
          posted_by?: string
          posting_type?: Database["public"]["Enums"]["posting_type"]
          requirements?: string
          responsibilities?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[] | null
          status?: Database["public"]["Enums"]["job_status"]
          tender_documents?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "job_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      jobseeker_preferences: {
        Row: {
          min_salary: number | null
          notify_email: boolean
          preferred_categories: string[] | null
          preferred_employment_types:
            | Database["public"]["Enums"]["employment_type"][]
            | null
          preferred_locations: string[] | null
          resume_url: string | null
          skills: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          min_salary?: number | null
          notify_email?: boolean
          preferred_categories?: string[] | null
          preferred_employment_types?:
            | Database["public"]["Enums"]["employment_type"][]
            | null
          preferred_locations?: string[] | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          min_salary?: number | null
          notify_email?: boolean
          preferred_categories?: string[] | null
          preferred_employment_types?:
            | Database["public"]["Enums"]["employment_type"][]
            | null
          preferred_locations?: string[] | null
          resume_url?: string | null
          skills?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          announcement_id: string | null
          channel: string
          created_at: string
          error: string | null
          id: string
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          announcement_id?: string | null
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          announcement_id?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      page_permissions: {
        Row: {
          active: boolean
          created_at: string
          granted_by: string | null
          id: string
          page_key: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          page_key: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          page_key?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          company_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string
          id: string
          method: string
          notes: string | null
          plan_id: string | null
          receipt_url: string | null
          reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          method: string
          notes?: string | null
          plan_id?: string | null
          receipt_url?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          plan_id?: string | null
          receipt_url?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_id: string | null
          created_at: string
          deactivated: boolean
          email: string | null
          email_verified: boolean
          first_name: string | null
          full_name: string | null
          headline: string | null
          id: string
          kyc_documents: Json
          kyc_status: string
          last_login_at: string | null
          last_name: string | null
          location: string | null
          pending_approval: boolean
          phone: string | null
          suspended: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company_id?: string | null
          created_at?: string
          deactivated?: boolean
          email?: string | null
          email_verified?: boolean
          first_name?: string | null
          full_name?: string | null
          headline?: string | null
          id: string
          kyc_documents?: Json
          kyc_status?: string
          last_login_at?: string | null
          last_name?: string | null
          location?: string | null
          pending_approval?: boolean
          phone?: string | null
          suspended?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company_id?: string | null
          created_at?: string
          deactivated?: boolean
          email?: string | null
          email_verified?: boolean
          first_name?: string | null
          full_name?: string | null
          headline?: string | null
          id?: string
          kyc_documents?: Json
          kyc_status?: string
          last_login_at?: string | null
          last_name?: string | null
          location?: string | null
          pending_approval?: boolean
          phone?: string | null
          suspended?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          audience: string
          billing_interval: string
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          audience?: string
          billing_interval: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          audience?: string
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          plan: string
          trial_ends_at: string | null
          updated_at: string
          user_id: string | null
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          plan?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          plan?: string
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          language: string
          region: string
          smart_notifications: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          language?: string
          region?: string
          smart_notifications?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          language?: string
          region?: string
          smart_notifications?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_company_teams_summary: {
        Args: { _company_id: string }
        Returns: {
          member_count: number
          team_id: string
          team_name: string
        }[]
      }
      has_active_subscription: { Args: { _user_id: string }; Returns: boolean }
      has_company_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["company_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_page_permission: {
        Args: { _page_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_in_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employer" | "jobseeker"
      company_role: "owner" | "manager" | "recruiter" | "viewer"
      company_verification: "pending" | "verified" | "rejected"
      employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "remote"
      job_status: "pending" | "approved" | "rejected"
      posting_type: "job" | "tender"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employer", "jobseeker"],
      company_role: ["owner", "manager", "recruiter", "viewer"],
      company_verification: ["pending", "verified", "rejected"],
      employment_type: [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "remote",
      ],
      job_status: ["pending", "approved", "rejected"],
      posting_type: ["job", "tender"],
    },
  },
} as const
