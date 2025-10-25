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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bugs: {
        Row: {
          assignee: string | null
          created_at: string
          created_by: string
          description: string
          environment: string | null
          github_issue_number: number | null
          id: string
          jira_issue_key: string | null
          resolved_at: string | null
          screenshots: string[] | null
          severity: string
          status: string
          steps_to_reproduce: string | null
          test_case_id: string | null
          test_run_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          created_by?: string
          description: string
          environment?: string | null
          github_issue_number?: number | null
          id?: string
          jira_issue_key?: string | null
          resolved_at?: string | null
          screenshots?: string[] | null
          severity: string
          status?: string
          steps_to_reproduce?: string | null
          test_case_id?: string | null
          test_run_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          created_by?: string
          description?: string
          environment?: string | null
          github_issue_number?: number | null
          id?: string
          jira_issue_key?: string | null
          resolved_at?: string | null
          screenshots?: string[] | null
          severity?: string
          status?: string
          steps_to_reproduce?: string | null
          test_case_id?: string | null
          test_run_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bugs_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bugs_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          enabled: boolean | null
          id: string
          type: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string
          enabled?: boolean | null
          id?: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          enabled?: boolean | null
          id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          methodology: string | null
          name: string
          phase: string | null
          status: string
          test_coverage: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          methodology?: string | null
          name: string
          phase?: string | null
          status?: string
          test_coverage?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          methodology?: string | null
          name?: string
          phase?: string | null
          status?: string
          test_coverage?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      test_cases: {
        Row: {
          automated: boolean | null
          created_at: string
          created_by: string
          description: string | null
          expected_result: string | null
          id: string
          last_executed_at: string | null
          phase: string
          priority: string
          project_id: string | null
          sprint: string | null
          status: string
          steps: string[]
          story_points: number | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          automated?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          expected_result?: string | null
          id?: string
          last_executed_at?: string | null
          phase: string
          priority: string
          project_id?: string | null
          sprint?: string | null
          status?: string
          steps?: string[]
          story_points?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          automated?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          expected_result?: string | null
          id?: string
          last_executed_at?: string | null
          phase?: string
          priority?: string
          project_id?: string | null
          sprint?: string | null
          status?: string
          steps?: string[]
          story_points?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          duration_ms: number | null
          executed_at: string
          executed_by: string
          github_artifact_url: string | null
          id: string
          jira_attachment_id: string | null
          notes: string | null
          report_url: string | null
          result: string | null
          screenshots: string[] | null
          status: string
          synced_to_github: boolean | null
          synced_to_jira: boolean | null
          test_case_id: string
        }
        Insert: {
          duration_ms?: number | null
          executed_at?: string
          executed_by?: string
          github_artifact_url?: string | null
          id?: string
          jira_attachment_id?: string | null
          notes?: string | null
          report_url?: string | null
          result?: string | null
          screenshots?: string[] | null
          status: string
          synced_to_github?: boolean | null
          synced_to_jira?: boolean | null
          test_case_id: string
        }
        Update: {
          duration_ms?: number | null
          executed_at?: string
          executed_by?: string
          github_artifact_url?: string | null
          id?: string
          jira_attachment_id?: string | null
          notes?: string | null
          report_url?: string | null
          result?: string | null
          screenshots?: string[] | null
          status?: string
          synced_to_github?: boolean | null
          synced_to_jira?: boolean | null
          test_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_test_case_id_fkey"
            columns: ["test_case_id"]
            isOneToOne: false
            referencedRelation: "test_cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_phase_stats: { Args: never; Returns: Json }
      get_project_stats: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
