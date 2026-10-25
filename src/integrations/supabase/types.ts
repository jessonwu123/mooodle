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
      ai_credit_usage: {
        Row: {
          actor_kind: string
          actor_name: string
          actor_user_id: string
          cached_input_tokens: number | null
          estimated_credits: number | null
          feature: string
          finished_at: string | null
          gateway_run_id: string | null
          http_status: number | null
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          pricing_snapshot: Json | null
          started_at: string
          status: string
          student_id: string | null
          teacher_user_id: string | null
        }
        Insert: {
          actor_kind: string
          actor_name: string
          actor_user_id: string
          cached_input_tokens?: number | null
          estimated_credits?: number | null
          feature: string
          finished_at?: string | null
          gateway_run_id?: string | null
          http_status?: number | null
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          pricing_snapshot?: Json | null
          started_at?: string
          status?: string
          student_id?: string | null
          teacher_user_id?: string | null
        }
        Update: {
          actor_kind?: string
          actor_name?: string
          actor_user_id?: string
          cached_input_tokens?: number | null
          estimated_credits?: number | null
          feature?: string
          finished_at?: string | null
          gateway_run_id?: string | null
          http_status?: number | null
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          pricing_snapshot?: Json | null
          started_at?: string
          status?: string
          student_id?: string | null
          teacher_user_id?: string | null
        }
        Relationships: []
      }
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
          kind: string
          lesson_at: string
          student_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lesson_at: string
          student_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lesson_at?: string
          student_id?: string | null
        }
        Relationships: []
      }
      imported_lessons: {
        Row: {
          archive_student_id: string | null
          class_name: string
          created_at: string
          created_by: string
          end_time: string
          id: string
          lesson_date: string
          start_time: string
        }
        Insert: {
          archive_student_id?: string | null
          class_name: string
          created_at?: string
          created_by: string
          end_time: string
          id?: string
          lesson_date: string
          start_time: string
        }
        Update: {
          archive_student_id?: string | null
          class_name?: string
          created_at?: string
          created_by?: string
          end_time?: string
          id?: string
          lesson_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_lessons_archive_student_id_fkey"
            columns: ["archive_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
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
      math_question_answer_change_log: {
        Row: {
          batch_key: string
          changed_at: string
          id: string
          new_answer: string
          old_answer: string
          question_id: string
          reason: string
          stem_snapshot: string
        }
        Insert: {
          batch_key: string
          changed_at?: string
          id?: string
          new_answer: string
          old_answer: string
          question_id: string
          reason: string
          stem_snapshot: string
        }
        Update: {
          batch_key?: string
          changed_at?: string
          id?: string
          new_answer?: string
          old_answer?: string
          question_id?: string
          reason?: string
          stem_snapshot?: string
        }
        Relationships: []
      }
      math_question_content_change_log: {
        Row: {
          batch_key: string
          changed_at: string
          id: string
          new_answer: string
          new_stem: string
          old_answer: string
          old_stem: string
          question_id: string
          reason: string
        }
        Insert: {
          batch_key: string
          changed_at?: string
          id?: string
          new_answer: string
          new_stem: string
          old_answer: string
          old_stem: string
          question_id: string
          reason: string
        }
        Update: {
          batch_key?: string
          changed_at?: string
          id?: string
          new_answer?: string
          new_stem?: string
          old_answer?: string
          old_stem?: string
          question_id?: string
          reason?: string
        }
        Relationships: []
      }
      math_question_hint_generation_batches: {
        Row: {
          batch_key: string
          created_at: string
          generated_hints: Json
        }
        Insert: {
          batch_key: string
          created_at?: string
          generated_hints: Json
        }
        Update: {
          batch_key?: string
          created_at?: string
          generated_hints?: Json
        }
        Relationships: []
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
          practice_hint: string | null
          practice_hint_generated_at: string | null
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
          practice_hint?: string | null
          practice_hint_generated_at?: string | null
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
          practice_hint?: string | null
          practice_hint_generated_at?: string | null
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
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "math_tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "math_tags"
            referencedColumns: ["id"]
          },
        ]
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
      practice_ai_access_state: {
        Row: {
          created_at: string
          id: string
          message: string
          status: number
        }
        Insert: {
          created_at?: string
          id: string
          message: string
          status: number
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: number
        }
        Relationships: []
      }
      practice_ai_daily_usage: {
        Row: {
          usage_day: string
          used: number
          user_id: string
        }
        Insert: {
          usage_day: string
          used?: number
          user_id: string
        }
        Update: {
          usage_day?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      practice_ai_feedback: {
        Row: {
          content: string
          created_at: string
          error_message: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          error_message?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          error_message?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_ai_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "student_practice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_ai_lifetime_usage: {
        Row: {
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      practice_hint_daily_views: {
        Row: {
          created_at: string
          question_id: string
          usage_day: string
          user_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          usage_day: string
          user_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          usage_day?: string
          user_id?: string
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
          teacher_name: string | null
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
          teacher_name?: string | null
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
          teacher_name?: string | null
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
      student_lesson_notes: {
        Row: {
          created_at: string
          id: string
          lesson_ref: string
          note: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_ref: string
          note?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_ref?: string
          note?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_lesson_notes_student_id_fkey"
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
          hint_question_ids: string[] | null
          id: string
          mode: string
          paper_id: string | null
          question_ids: string[]
          score: number | null
          student_id: string | null
          tag_ids: string[] | null
          total: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correct?: number
          created_at?: string
          hint_question_ids?: string[] | null
          id?: string
          mode: string
          paper_id?: string | null
          question_ids?: string[]
          score?: number | null
          student_id?: string | null
          tag_ids?: string[] | null
          total?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correct?: number
          created_at?: string
          hint_question_ids?: string[] | null
          id?: string
          mode?: string
          paper_id?: string | null
          question_ids?: string[]
          score?: number | null
          student_id?: string | null
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
          {
            foreignKeyName: "student_practice_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          access_level: string
          account_created_by: string | null
          archive_kind: string
          auth_user_id: string | null
          created_at: string
          created_by: string | null
          hourly_rate: number | null
          hours_per_lesson: number | null
          id: string
          institution_class_key: string | null
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
          access_level?: string
          account_created_by?: string | null
          archive_kind?: string
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          hourly_rate?: number | null
          hours_per_lesson?: number | null
          id?: string
          institution_class_key?: string | null
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
          access_level?: string
          account_created_by?: string | null
          archive_kind?: string
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          hourly_rate?: number | null
          hours_per_lesson?: number | null
          id?: string
          institution_class_key?: string | null
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
      teacher_invitations: {
        Row: {
          created_at: string
          invite_code: string
          invitee_user_id: string
          inviter_user_id: string
        }
        Insert: {
          created_at?: string
          invite_code: string
          invitee_user_id: string
          inviter_user_id: string
        }
        Update: {
          created_at?: string
          invite_code?: string
          invitee_user_id?: string
          inviter_user_id?: string
        }
        Relationships: []
      }
      teacher_invite_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_org_rates: {
        Row: {
          base_salary: number
          created_at: string
          group_rate: number
          one_on_one_rate: number
          package_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          group_rate?: number
          one_on_one_rate?: number
          package_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          group_rate?: number
          one_on_one_rate?: number
          package_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_question_bank_permissions: {
        Row: {
          can_edit: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_xngj_credentials: {
        Row: {
          created_at: string
          password: string
          tenant_name: string
          updated_at: string
          user_id: string
          username: string
          xngj_user_id: string | null
        }
        Insert: {
          created_at?: string
          password: string
          tenant_name?: string
          updated_at?: string
          user_id: string
          username: string
          xngj_user_id?: string | null
        }
        Update: {
          created_at?: string
          password?: string
          tenant_name?: string
          updated_at?: string
          user_id?: string
          username?: string
          xngj_user_id?: string | null
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
      ai_credit_usage_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      can_edit_question_bank: { Args: never; Returns: boolean }
      claim_limited_practice_ai_analysis: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
      }
      claim_practice_ai_analysis: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: number
      }
      claim_practice_hint_view: {
        Args: { p_limit: number; p_question_id: string; p_user_id: string }
        Returns: boolean
      }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_effective_folder_permission: {
        Args: { _folder_id: string; _subject_id: string; _subject_type: string }
        Returns: Database["public"]["Enums"]["folder_permission_level"]
      }
      get_my_student_profile: {
        Args: never
        Returns: {
          auth_user_id: string
          created_by: string
          hourly_rate: number
          hours_per_lesson: number
          id: string
          knowledge_updated_at: string
          learning_quality_updated_at: string
          name: string
          schedule_end_time: string
          schedule_frequency_weeks: number
          schedule_slots: Json
          schedule_start_date: string
          schedule_start_time: string
          schedule_weekday: number
          thinking_updated_at: string
          total_hours: number
          username: string
        }[]
      }
      get_my_teacher_info: {
        Args: never
        Returns: {
          display_name: string
          email: string
          teacher_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_my_student_row: { Args: { _student_id: string }; Returns: boolean }
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
      list_teacher_display_info: {
        Args: { _user_ids: string[] }
        Returns: {
          display_name: string
          email: string
          user_id: string
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
      set_teacher_question_bank_permission: {
        Args: { _can_edit: boolean; _user_id: string }
        Returns: undefined
      }
      student_login_email: { Args: { _username: string }; Returns: string }
      user_can_read_paper: { Args: { _paper_id: string }; Returns: boolean }
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
