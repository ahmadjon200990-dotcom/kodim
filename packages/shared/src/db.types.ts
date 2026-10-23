// GENERATSIYA QILINGAN — Supabase MCP `generate_typescript_types` (loyiha prkrhitgkjyuwyipqimw). Qo'lda tahrirlamang:
// migratsiyadan keyin qayta generatsiya qiling. (2026-10-23: view/RPC bo'limlari generator chiqishiga mos qisqartirilgan.)
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attempt_files: {
        Row: {
          attempt_id: string
          content: string
          encoding: string | null
          path: string
          sha1: string
          updated_at: string
        }
        Insert: {
          attempt_id: string
          content: string
          encoding?: string | null
          path: string
          sha1?: string
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          content?: string
          encoding?: string | null
          path?: string
          sha1?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_files_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          ai_error: string | null
          ai_result: Json | null
          ai_score: number | null
          connected: boolean
          created_at: string
          device_id: string | null
          ending_at: string | null
          exam_id: string
          extra_minutes: number
          graded_by: Database["public"]["Enums"]["graded_by"]
          id: string
          last_seen_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_name: string
          student_uid: string
          submitted_at: string | null
          teacher_comment: string | null
          teacher_criteria: Json | null
          teacher_score: number | null
        }
        Insert: {
          ai_error?: string | null
          ai_result?: Json | null
          ai_score?: number | null
          connected?: boolean
          created_at?: string
          device_id?: string | null
          ending_at?: string | null
          exam_id: string
          extra_minutes?: number
          graded_by?: Database["public"]["Enums"]["graded_by"]
          id?: string
          last_seen_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_name: string
          student_uid: string
          submitted_at?: string | null
          teacher_comment?: string | null
          teacher_criteria?: Json | null
          teacher_score?: number | null
        }
        Update: {
          ai_error?: string | null
          ai_result?: Json | null
          ai_score?: number | null
          connected?: boolean
          created_at?: string
          device_id?: string | null
          ending_at?: string | null
          exam_id?: string
          extra_minutes?: number
          graded_by?: Database["public"]["Enums"]["graded_by"]
          id?: string
          last_seen_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_name?: string
          student_uid?: string
          submitted_at?: string | null
          teacher_comment?: string | null
          teacher_criteria?: Json | null
          teacher_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          client_allowed: boolean
          severity: Database["public"]["Enums"]["event_severity"]
          type: string
        }
        Insert: {
          client_allowed: boolean
          severity: Database["public"]["Enums"]["event_severity"]
          type: string
        }
        Update: {
          client_allowed?: boolean
          severity?: Database["public"]["Enums"]["event_severity"]
          type?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          attempt_id: string
          created_at: string
          details: Json
          exam_id: string
          id: string
          severity: Database["public"]["Enums"]["event_severity"]
          type: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          details?: Json
          exam_id: string
          id?: string
          severity: Database["public"]["Enums"]["event_severity"]
          type: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          details?: Json
          exam_id?: string
          id?: string
          severity?: Database["public"]["Enums"]["event_severity"]
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["type"]
          },
        ]
      }
      exams: {
        Row: {
          ai_enabled: boolean
          ai_model: string
          allowed_commands: Json
          allowed_packages: Json
          allowed_shells: Json
          code: string | null
          created_at: string
          criteria: Json
          duration_min: number
          ends_at: string | null
          id: string
          readonly_files: Json
          reference_files: Json
          started_at: string | null
          starter_files: Json
          status: Database["public"]["Enums"]["exam_status"]
          teacher_id: string
          template: Database["public"]["Enums"]["exam_template"]
          title: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_model?: string
          allowed_commands?: Json
          allowed_packages?: Json
          allowed_shells?: Json
          code?: string | null
          created_at?: string
          criteria?: Json
          duration_min: number
          ends_at?: string | null
          id?: string
          readonly_files?: Json
          reference_files?: Json
          started_at?: string | null
          starter_files?: Json
          status?: Database["public"]["Enums"]["exam_status"]
          teacher_id: string
          template?: Database["public"]["Enums"]["exam_template"]
          title: string
        }
        Update: {
          ai_enabled?: boolean
          ai_model?: string
          allowed_commands?: Json
          allowed_packages?: Json
          allowed_shells?: Json
          code?: string | null
          created_at?: string
          criteria?: Json
          duration_min?: number
          ends_at?: string | null
          id?: string
          readonly_files?: Json
          reference_files?: Json
          started_at?: string | null
          starter_files?: Json
          status?: Database["public"]["Enums"]["exam_status"]
          teacher_id?: string
          template?: Database["public"]["Enums"]["exam_template"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      figma_caches: {
        Row: {
          data: Json | null
          error: string | null
          fetched_at: string | null
          id: string
          status: string
          teacher_id: string
          updated_at: string
          url: string
        }
        Insert: {
          data?: Json | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          status?: string
          teacher_id: string
          updated_at?: string
          url: string
        }
        Update: {
          data?: Json | null
          error?: string | null
          fetched_at?: string | null
          id?: string
          status?: string
          teacher_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "figma_caches_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      figma_images: {
        Row: {
          cache_id: string
          format: string
          frame_id: string
          scale: number
          storage_path: string
        }
        Insert: {
          cache_id: string
          format?: string
          frame_id: string
          scale?: number
          storage_path: string
        }
        Update: {
          cache_id?: string
          format?: string
          frame_id?: string
          scale?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "figma_images_cache_id_fkey"
            columns: ["cache_id"]
            isOneToOne: false
            referencedRelation: "figma_caches"
            referencedColumns: ["id"]
          },
        ]
      }
      penalties: {
        Row: {
          attempt_id: string
          created_at: string
          event_id: string | null
          id: string
          points: number
          reason: string
          teacher_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          event_id?: string | null
          id?: string
          points: number
          reason: string
          teacher_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
          points?: number
          reason?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "penalties_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalties_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          description: string
          exam_id: string
          expected_output: string | null
          figma_url: string | null
          id: string
          images: Json
          order: number
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          description?: string
          exam_id: string
          expected_output?: string | null
          figma_url?: string | null
          id?: string
          images?: Json
          order: number
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          description?: string
          exam_id?: string
          expected_output?: string | null
          figma_url?: string | null
          id?: string
          images?: Json
          order?: number
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          disabled: boolean
          email: string
          figma_handle: string | null
          figma_secret_id: string | null
          id: string
          last_login_at: string | null
          name: string
          role: Database["public"]["Enums"]["teacher_role"]
        }
        Insert: {
          created_at?: string
          disabled?: boolean
          email: string
          figma_handle?: string | null
          figma_secret_id?: string | null
          id: string
          last_login_at?: string | null
          name: string
          role?: Database["public"]["Enums"]["teacher_role"]
        }
        Update: {
          created_at?: string
          disabled?: boolean
          email?: string
          figma_handle?: string | null
          figma_secret_id?: string | null
          id?: string
          last_login_at?: string | null
          name?: string
          role?: Database["public"]["Enums"]["teacher_role"]
        }
        Relationships: []
      }
    }
    Views: {
      attempt_summaries: {
        Row: {
          ai_error: string | null
          ai_score: number | null
          connected: boolean | null
          created_at: string | null
          exam_id: string | null
          extra_minutes: number | null
          final_score: number | null
          graded_by: Database["public"]["Enums"]["graded_by"] | null
          id: string | null
          last_seen_at: string | null
          penalty_total: number | null
          status: Database["public"]["Enums"]["attempt_status"] | null
          student_name: string | null
          submitted_at: string | null
          teacher_comment: string | null
          teacher_criteria: Json | null
          teacher_score: number | null
          warning_count: number | null
        }
        Relationships: []
      }
      exam_list: {
        Row: {
          attempt_count: number | null
          code: string | null
          created_at: string | null
          duration_min: number | null
          ends_at: string | null
          id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["exam_status"] | null
          task_count: number | null
          teacher_id: string | null
          teacher_name: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_penalty: {
        Args: { p_attempt_id: string; p_event_id?: string; p_points: number; p_reason: string }
        Returns: Database["public"]["Tables"]["penalties"]["Row"]
      }
      annul_attempt: { Args: { p_attempt_id: string }; Returns: Database["public"]["Tables"]["attempts"]["Row"] }
      delete_penalty: { Args: { p_penalty_id: string }; Returns: undefined }
      extend_exam: { Args: { p_attempt_id?: string; p_exam_id: string; p_minutes: number }; Returns: Json }
      final_score: {
        Args: { a: Database["public"]["Tables"]["attempts"]["Row"] }
        Returns: number
      }
      finish_exam: { Args: { p_exam_id: string }; Returns: Database["public"]["Tables"]["exams"]["Row"] }
      grade_attempt: { Args: { p_attempt_id: string; p_input: Json }; Returns: Database["public"]["Tables"]["attempts"]["Row"] }
      open_exam: { Args: { p_exam_id: string }; Returns: string }
      save_exam: { Args: { p_exam: Json; p_exam_id: string | null; p_tasks: Json }; Returns: string }
      start_exam: { Args: { p_exam_id: string }; Returns: Database["public"]["Tables"]["exams"]["Row"] }
      unannul_attempt: { Args: { p_attempt_id: string }; Returns: Database["public"]["Tables"]["attempts"]["Row"] }
    }
    Enums: {
      attempt_status: "JOINED" | "WORKING" | "SUBMITTED" | "ANNULLED"
      event_severity: "INFO" | "WARN" | "DANGER"
      exam_status: "DRAFT" | "LOBBY" | "RUNNING" | "GRADING" | "FINISHED"
      exam_template:
        | "EMPTY"
        | "HTML"
        | "REACT_VITE"
        | "VUE_VITE"
        | "TYPESCRIPT"
        | "NODE"
        | "PYTHON"
        | "CUSTOM"
      graded_by: "AI" | "TEACHER" | "NONE"
      task_type: "EXERCISE" | "FIGMA"
      teacher_role: "ADMIN" | "TEACHER"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      attempt_status: ["JOINED", "WORKING", "SUBMITTED", "ANNULLED"],
      event_severity: ["INFO", "WARN", "DANGER"],
      exam_status: ["DRAFT", "LOBBY", "RUNNING", "GRADING", "FINISHED"],
      exam_template: [
        "EMPTY",
        "HTML",
        "REACT_VITE",
        "VUE_VITE",
        "TYPESCRIPT",
        "NODE",
        "PYTHON",
        "CUSTOM",
      ],
      graded_by: ["AI", "TEACHER", "NONE"],
      task_type: ["EXERCISE", "FIGMA"],
      teacher_role: ["ADMIN", "TEACHER"],
    },
  },
} as const
