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
      assessment_item_history: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          rating: number | null
          student_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          rating?: number | null
          student_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          rating?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_item_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "assessment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_items: {
        Row: {
          category: Database["public"]["Enums"]["assessment_category"]
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          item_name: string
          rating: number | null
          sort_order: number
          student_id: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["assessment_category"]
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_name: string
          rating?: number | null
          sort_order?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["assessment_category"]
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_name?: string
          rating?: number | null
          sort_order?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      cancelled_lessons: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lesson_at: string
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lesson_at: string
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lesson_at?: string
          student_id?: string
        }
        Relationships: []
      }
      imported_lessons: {
        Row: {
          class_name: string
          created_at: string
          created_by: string
          end_time: string
          id: string
          lesson_date: string
          start_time: string
        }
        Insert: {
          class_name: string
          created_at?: string
          created_by: string
          end_time: string
          id?: string
          lesson_date: string
          start_time: string
        }
        Update: {
          class_name?: string
          created_at?: string
          created_by?: string
          end_time?: string
          id?: string
          lesson_date?: string
          start_time?: string
        }
        Relationships: []
      }
      math_paper_folder_default_permissions: {
        Row: {
          created_at: string
          folder_id: string
          level: Database["public"]["Enums"]["folder_permission_level"]
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          level: Database["public"]["Enums"]["folder_permission_level"]
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          level?: Database["public"]["Enums"]["folder_permission_level"]
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_paper_folder_default_permissions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: true
            referencedRelation: "math_paper_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      math_paper_folder_permissions: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          level: Database["public"]["Enums"]["folder_permission_level"]
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          level: Database["public"]["Enums"]["folder_permission_level"]
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          level?: Database["public"]["Enums"]["folder_permission_level"]
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_paper_folder_permissions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "math_paper_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      math_paper_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_paper_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "math_paper_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      math_papers: {
        Row: {
          answer_pdf_path: string | null
          created_at: string
          folder_id: string | null
          id: string
          kind: string
          name: string
          pdf_path: string | null
          question_count: number
          updated_at: string
          uploaded_by: string | null
          year: number | null
        }
        Insert: {
          answer_pdf_path?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          kind?: string
          name: string
          pdf_path?: string | null
          question_count?: number
          updated_at?: string
          uploaded_by?: string | null
          year?: number | null
        }
        Update: {
          answer_pdf_path?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          kind?: string
          name?: string
          pdf_path?: string | null
          question_count?: number
          updated_at?: string
          uploaded_by?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "math_papers_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "math_paper_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      math_question_tags: {
        Row: {
          assigned_by_ai: boolean
          confidence: number | null
          created_at: string
          id: string
          question_id: string
          tag_id: string
        }
        Insert: {
          assigned_by_ai?: boolean
          confidence?: number | null
          created_at?: string
          id?: string
          question_id: string
          tag_id: string
        }
        Update: {
          assigned_by_ai?: boolean
          confidence?: number | null
          created_at?: string
          id?: string
          question_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_question_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "math_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "math_question_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "math_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      math_questions: {
        Row: {
          answer_type: string
          correct_answer: string | null
          created_at: string
          id: string
          image_path: string | null
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          option_e: string | null
          options_image_path: string | null
          options_render_mode: string
          paper_id: string
          question_number: number
          solution_images: Json
          solution_md: string | null
          solution_md_zh: string | null
          stem: string
          stem_render_mode: string
          tags: string[]
          updated_at: string
          year: number | null
        }
        Insert: {
          answer_type?: string
          correct_answer?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          option_e?: string | null
          options_image_path?: string | null
          options_render_mode?: string
          paper_id: string
          question_number: number
          solution_images?: Json
          solution_md?: string | null
          solution_md_zh?: string | null
          stem: string
          stem_render_mode?: string
          tags?: string[]
          updated_at?: string
          year?: number | null
        }
        Update: {
          answer_type?: string
          correct_answer?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          option_e?: string | null
          options_image_path?: string | null
          options_render_mode?: string
          paper_id?: string
          question_number?: number
          solution_images?: Json
          solution_md?: string | null
          solution_md_zh?: string | null
          stem?: string
          stem_render_mode?: string
          tags?: string[]
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "math_questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "math_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      math_tags: {
        Row: {
          category: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pet_foods: {
        Row: {
          created_at: string
          id: string
          quantity: number
          student_id: string
          tier: Database["public"]["Enums"]["food_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity?: number
          student_id: string
          tier: Database["public"]["Enums"]["food_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number
          student_id?: string
          tier?: Database["public"]["Enums"]["food_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      pets: {
        Row: {
          challenges_date: string | null
          challenges_today: number
          created_at: string
          hatched: boolean
          id: string
          level: number
          species: Database["public"]["Enums"]["pet_species"] | null
          student_id: string
          updated_at: string
          xp: number
        }
        Insert: {
          challenges_date?: string | null
          challenges_today?: number
          created_at?: string
          hatched?: boolean
          id?: string
          level?: number
          species?: Database["public"]["Enums"]["pet_species"] | null
          student_id: string
          updated_at?: string
          xp?: number
        }
        Update: {
          challenges_date?: string | null
          challenges_today?: number
          created_at?: string
          hatched?: boolean
          id?: string
          level?: number
          species?: Database["public"]["Enums"]["pet_species"] | null
          student_id?: string
          updated_at?: string
          xp?: number
        }
        Relationships: []
      }
      progress_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_name: string
          percentage: number
          rating_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_name: string
          percentage: number
          rating_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_name?: string
          percentage?: number
          rating_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "progress_items_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          accuracy: number
          created_at: string
          created_by: string | null
          discipline: number
          focus: number
          id: string
          interaction: number
          lesson_date: string
          lesson_name: string | null
          overall_assessment: number | null
          overall_progress: number | null
          student_id: string
          summary: string | null
        }
        Insert: {
          accuracy: number
          created_at?: string
          created_by?: string | null
          discipline: number
          focus: number
          id?: string
          interaction: number
          lesson_date: string
          lesson_name?: string | null
          overall_assessment?: number | null
          overall_progress?: number | null
          student_id: string
          summary?: string | null
        }
        Update: {
          accuracy?: number
          created_at?: string
          created_by?: string | null
          discipline?: number
          focus?: number
          id?: string
          interaction?: number
          lesson_date?: string
          lesson_name?: string | null
          overall_assessment?: number | null
          overall_progress?: number | null
          student_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      single_lessons: {
        Row: {
          class_name: string | null
          created_at: string
          created_by: string
          end_time: string
          hourly_rate: number | null
          hours_per_lesson: number | null
          id: string
          lesson_date: string
          notes: string | null
          start_time: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          class_name?: string | null
          created_at?: string
          created_by: string
          end_time: string
          hourly_rate?: number | null
          hours_per_lesson?: number | null
          id?: string
          lesson_date: string
          notes?: string | null
          start_time: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          class_name?: string | null
          created_at?: string
          created_by?: string
          end_time?: string
          hourly_rate?: number | null
          hours_per_lesson?: number | null
          id?: string
          lesson_date?: string
          notes?: string | null
          start_time?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "single_lessons_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_learning_analytics: {
        Row: {
          chart_data: Json
          content: string
          generated_at: string
          is_published: boolean
          published_at: string | null
          published_chart_data: Json | null
          published_content: string | null
          student_id: string
          updated_by: string | null
        }
        Insert: {
          chart_data?: Json
          content?: string
          generated_at?: string
          is_published?: boolean
          published_at?: string | null
          published_chart_data?: Json | null
          published_content?: string | null
          student_id: string
          updated_by?: string | null
        }
        Update: {
          chart_data?: Json
          content?: string
          generated_at?: string
          is_published?: boolean
          published_at?: string | null
          published_chart_data?: Json | null
          published_content?: string | null
          student_id?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_learning_analytics_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_learning_analytics_archives: {
        Row: {
          chart_data: Json
          content: string
          created_at: string
          id: string
          published_at: string
          published_by: string | null
          student_id: string
        }
        Insert: {
          chart_data?: Json
          content: string
          created_at?: string
          id?: string
          published_at?: string
          published_by?: string | null
          student_id: string
        }
        Update: {
          chart_data?: Json
          content?: string
          created_at?: string
          id?: string
          published_at?: string
          published_by?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_learning_analytics_archives_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_practice_sessions: {
        Row: {
          completed_at: string | null
          correct: number
          created_at: string
          id: string
          mode: string
          paper_id: string | null
          question_ids: string[]
          score: number | null
          tag_ids: string[] | null
          total: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correct?: number
          created_at?: string
          id?: string
          mode: string
          paper_id?: string | null
          question_ids?: string[]
          score?: number | null
          tag_ids?: string[] | null
          total?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correct?: number
          created_at?: string
          id?: string
          mode?: string
          paper_id?: string | null
          question_ids?: string[]
          score?: number | null
          tag_ids?: string[] | null
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_practice_sessions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "math_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      student_question_attempt_log: {
        Row: {
          answer: string | null
          attempted_at: string
          correct_answer: string | null
          id: string
          is_correct: boolean
          mode: string
          question_id: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          answer?: string | null
          attempted_at?: string
          correct_answer?: string | null
          id?: string
          is_correct: boolean
          mode: string
          question_id: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          answer?: string | null
          attempted_at?: string
          correct_answer?: string | null
          id?: string
          is_correct?: boolean
          mode?: string
          question_id?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_question_attempt_log_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "math_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_question_attempt_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "student_practice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_question_attempts: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_answer: string | null
          last_attempt_at: string
          last_is_correct: boolean | null
          question_id: string
          updated_at: string
          user_id: string
          wrong_count: number
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_answer?: string | null
          last_attempt_at?: string
          last_is_correct?: boolean | null
          question_id: string
          updated_at?: string
          user_id: string
          wrong_count?: number
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_answer?: string | null
          last_attempt_at?: string
          last_is_correct?: boolean | null
          question_id?: string
          updated_at?: string
          user_id?: string
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_question_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "math_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by: string | null
          hourly_rate: number | null
          hours_per_lesson: number | null
          id: string
          knowledge_updated_at: string | null
          learning_quality_updated_at: string | null
          name: string
          schedule_end_time: string | null
          schedule_frequency_weeks: number | null
          schedule_slots: Json | null
          schedule_start_date: string | null
          schedule_start_time: string | null
          schedule_weekday: number | null
          thinking_updated_at: string | null
          total_hours: number | null
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          hourly_rate?: number | null
          hours_per_lesson?: number | null
          id?: string
          knowledge_updated_at?: string | null
          learning_quality_updated_at?: string | null
          name: string
          schedule_end_time?: string | null
          schedule_frequency_weeks?: number | null
          schedule_slots?: Json | null
          schedule_start_date?: string | null
          schedule_start_time?: string | null
          schedule_weekday?: number | null
          thinking_updated_at?: string | null
          total_hours?: number | null
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          hourly_rate?: number | null
          hours_per_lesson?: number | null
          id?: string
          knowledge_updated_at?: string | null
          learning_quality_updated_at?: string | null
          name?: string
          schedule_end_time?: string | null
          schedule_frequency_weeks?: number | null
          schedule_slots?: Json | null
          schedule_start_date?: string | null
          schedule_start_time?: string | null
          schedule_weekday?: number | null
          thinking_updated_at?: string | null
          total_hours?: number | null
          username?: string | null
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
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_effective_folder_permission: {
        Args: { _folder_id: string; _subject_id: string; _subject_type: string }
        Returns: Database["public"]["Enums"]["folder_permission_level"]
      }
      get_my_student_profile: {
        Args: never
        Returns: {
          auth_user_id: string
          id: string
          knowledge_updated_at: string
          learning_quality_updated_at: string
          name: string
          thinking_updated_at: string
          username: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_admin_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      list_all_teachers: {
        Args: never
        Returns: {
          created_at: string
          email: string
          is_admin: boolean
          is_teacher: boolean
          last_sign_in_at: string
          student_count: number
          user_id: string
        }[]
      }
      list_folder_permission_overrides: {
        Args: { _folder_id: string }
        Returns: {
          display_name: string
          id: string
          level: Database["public"]["Enums"]["folder_permission_level"]
          subject_id: string
          subject_type: string
        }[]
      }
      list_student_accessible_folders: {
        Args: { _student_id: string }
        Returns: {
          folder_id: string
          is_ancestor: boolean
          level: Database["public"]["Enums"]["folder_permission_level"]
          name: string
          parent_id: string
        }[]
      }
      list_teacher_students: {
        Args: { _teacher_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          rating_count: number
        }[]
      }
      list_user_login_history: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          action: string
          ip_address: string
          occurred_at: string
        }[]
      }
      student_login_email: { Args: { _username: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "teacher"
      assessment_category: "knowledge" | "thinking" | "learning_quality"
      folder_permission_level:
        | "none"
        | "read"
        | "download"
        | "upload"
        | "manage"
      food_tier: "normal" | "quality" | "elixir"
      pet_species:
        | "baize"
        | "dijiang"
        | "jiuweihu"
        | "jingwei"
        | "zhuyin"
        | "qilin"
        | "qinglong"
        | "baihu"
        | "zhuque"
        | "xuanwu"
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
      app_role: ["admin", "teacher"],
      assessment_category: ["knowledge", "thinking", "learning_quality"],
      folder_permission_level: ["none", "read", "download", "upload", "manage"],
      food_tier: ["normal", "quality", "elixir"],
      pet_species: [
        "baize",
        "dijiang",
        "jiuweihu",
        "jingwei",
        "zhuyin",
        "qilin",
        "qinglong",
        "baihu",
        "zhuque",
        "xuanwu",
      ],
    },
  },
} as const
