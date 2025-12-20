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
      app_settings: {
        Row: {
          audit_log_retention_days: number | null
          created_at: string
          custom_app_name: string | null
          custom_app_name_color: string
          custom_app_name_enabled: boolean
          custom_app_name_font: string | null
          custom_app_name_size: number
          custom_board_logo_enabled: boolean
          custom_board_logo_size: number
          custom_board_logo_url: string | null
          custom_global_app_name: string | null
          custom_global_app_name_enabled: boolean
          custom_google_button_background_color: string
          custom_google_button_text_color: string
          custom_home_logo_enabled: boolean
          custom_home_logo_size: number
          custom_home_logo_url: string | null
          custom_login_background_color: string
          custom_login_background_enabled: boolean
          custom_login_background_image_url: string | null
          custom_login_background_type: string
          custom_login_box_background_color: string
          custom_login_logo_enabled: boolean
          custom_login_logo_size: string
          custom_login_logo_url: string | null
          custom_tagline: string | null
          custom_tagline_color: string
          custom_tagline_enabled: boolean
          custom_tagline_font: string | null
          custom_tagline_size: number
          id: string
          login_style: string
          updated_at: string
        }
        Insert: {
          audit_log_retention_days?: number | null
          created_at?: string
          custom_app_name?: string | null
          custom_app_name_color?: string
          custom_app_name_enabled?: boolean
          custom_app_name_font?: string | null
          custom_app_name_size?: number
          custom_board_logo_enabled?: boolean
          custom_board_logo_size?: number
          custom_board_logo_url?: string | null
          custom_global_app_name?: string | null
          custom_global_app_name_enabled?: boolean
          custom_google_button_background_color?: string
          custom_google_button_text_color?: string
          custom_home_logo_enabled?: boolean
          custom_home_logo_size?: number
          custom_home_logo_url?: string | null
          custom_login_background_color?: string
          custom_login_background_enabled?: boolean
          custom_login_background_image_url?: string | null
          custom_login_background_type?: string
          custom_login_box_background_color?: string
          custom_login_logo_enabled?: boolean
          custom_login_logo_size?: string
          custom_login_logo_url?: string | null
          custom_tagline?: string | null
          custom_tagline_color?: string
          custom_tagline_enabled?: boolean
          custom_tagline_font?: string | null
          custom_tagline_size?: number
          id?: string
          login_style?: string
          updated_at?: string
        }
        Update: {
          audit_log_retention_days?: number | null
          created_at?: string
          custom_app_name?: string | null
          custom_app_name_color?: string
          custom_app_name_enabled?: boolean
          custom_app_name_font?: string | null
          custom_app_name_size?: number
          custom_board_logo_enabled?: boolean
          custom_board_logo_size?: number
          custom_board_logo_url?: string | null
          custom_global_app_name?: string | null
          custom_global_app_name_enabled?: boolean
          custom_google_button_background_color?: string
          custom_google_button_text_color?: string
          custom_home_logo_enabled?: boolean
          custom_home_logo_size?: number
          custom_home_logo_url?: string | null
          custom_login_background_color?: string
          custom_login_background_enabled?: boolean
          custom_login_background_image_url?: string | null
          custom_login_background_type?: string
          custom_login_box_background_color?: string
          custom_login_logo_enabled?: boolean
          custom_login_logo_size?: string
          custom_login_logo_url?: string | null
          custom_tagline?: string | null
          custom_tagline_color?: string
          custom_tagline_enabled?: boolean
          custom_tagline_font?: string | null
          custom_tagline_size?: number
          id?: string
          login_style?: string
          updated_at?: string
        }
        Relationships: []
      }
      board_member_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          board_id: string
          created_at: string
          id: string
          new_role: string | null
          old_role: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          board_id: string
          created_at?: string
          id?: string
          new_role?: string | null
          old_role?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          board_id?: string
          created_at?: string
          id?: string
          new_role?: string | null
          old_role?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_member_audit_log_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          board_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["board_role"]
          user_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["board_role"]
          user_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["board_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_themes: {
        Row: {
          board_icon_color: string
          card_window_button_color: string
          card_window_button_hover_color: string | null
          card_window_button_hover_text_color: string | null
          card_window_button_text_color: string
          card_window_color: string
          card_window_intelligent_contrast: boolean
          card_window_text_color: string
          column_color: string
          created_at: string
          created_by: string | null
          default_card_color: string | null
          homepage_board_color: string
          id: string
          is_default: boolean
          name: string
          navbar_color: string
          scrollbar_color: string
          scrollbar_track_color: string
          updated_at: string
        }
        Insert: {
          board_icon_color?: string
          card_window_button_color?: string
          card_window_button_hover_color?: string | null
          card_window_button_hover_text_color?: string | null
          card_window_button_text_color?: string
          card_window_color?: string
          card_window_intelligent_contrast?: boolean
          card_window_text_color?: string
          column_color?: string
          created_at?: string
          created_by?: string | null
          default_card_color?: string | null
          homepage_board_color?: string
          id?: string
          is_default?: boolean
          name: string
          navbar_color?: string
          scrollbar_color?: string
          scrollbar_track_color?: string
          updated_at?: string
        }
        Update: {
          board_icon_color?: string
          card_window_button_color?: string
          card_window_button_hover_color?: string | null
          card_window_button_hover_text_color?: string | null
          card_window_button_text_color?: string
          card_window_color?: string
          card_window_intelligent_contrast?: boolean
          card_window_text_color?: string
          column_color?: string
          created_at?: string
          created_by?: string | null
          default_card_color?: string | null
          homepage_board_color?: string
          id?: string
          is_default?: boolean
          name?: string
          navbar_color?: string
          scrollbar_color?: string
          scrollbar_track_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          audit_log_retention_days: number | null
          background_color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          theme_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          audit_log_retention_days?: number | null
          background_color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          theme_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          audit_log_retention_days?: number | null
          background_color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          theme_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "board_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      card_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          card_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          card_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          card_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_assignees_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_attachments: {
        Row: {
          card_id: string
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          card_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          card_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_attachments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      card_labels: {
        Row: {
          card_id: string
          label_id: string
        }
        Insert: {
          card_id: string
          label_id: string
        }
        Update: {
          card_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_labels_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      card_subtasks: {
        Row: {
          card_id: string
          checklist_name: string | null
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          position: number
          title: string
        }
        Insert: {
          card_id: string
          checklist_name?: string | null
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          card_id?: string
          checklist_name?: string | null
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_subtasks_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_subtasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          color: string | null
          column_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          position: number
          priority: string | null
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          column_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          column_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number
          priority?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      columns: {
        Row: {
          board_id: string
          color: string | null
          created_at: string
          id: string
          position: number
          title: string
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fonts: {
        Row: {
          created_at: string
          font_url: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          font_url: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          font_url?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      import_pending_assignees: {
        Row: {
          board_id: string
          card_id: string
          created_at: string
          id: string
          import_source: string
          mapped_user_id: string | null
          original_member_id: string | null
          original_member_name: string
          original_username: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          board_id: string
          card_id: string
          created_at?: string
          id?: string
          import_source?: string
          mapped_user_id?: string | null
          original_member_id?: string | null
          original_member_name: string
          original_username?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          board_id?: string
          card_id?: string
          created_at?: string
          id?: string
          import_source?: string
          mapped_user_id?: string | null
          original_member_id?: string | null
          original_member_name?: string
          original_username?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_pending_assignees_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_pending_assignees_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_pending_assignees_mapped_user_id_fkey"
            columns: ["mapped_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_pending_assignees_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_pending_attachments: {
        Row: {
          board_id: string
          card_id: string
          created_at: string
          id: string
          import_source: string
          original_attachment_id: string | null
          original_name: string
          original_size: number | null
          original_type: string | null
          original_url: string | null
          resolved_at: string | null
          resolved_by: string | null
          uploaded_file_url: string | null
        }
        Insert: {
          board_id: string
          card_id: string
          created_at?: string
          id?: string
          import_source?: string
          original_attachment_id?: string | null
          original_name: string
          original_size?: number | null
          original_type?: string | null
          original_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          uploaded_file_url?: string | null
        }
        Update: {
          board_id?: string
          card_id?: string
          created_at?: string
          id?: string
          import_source?: string
          original_attachment_id?: string | null
          original_name?: string
          original_size?: number | null
          original_type?: string | null
          original_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          uploaded_file_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_pending_attachments_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_pending_attachments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_pending_attachments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          board_id: string
          color: string
          id: string
          name: string
        }
        Insert: {
          board_id: string
          color: string
          id?: string
          name: string
        }
        Update: {
          board_id?: string
          color?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      mysql_config: {
        Row: {
          created_at: string | null
          db_host_encrypted: string | null
          db_name_encrypted: string | null
          db_password_encrypted: string | null
          db_user_encrypted: string | null
          id: string
          is_configured: boolean | null
          iv: string | null
          updated_at: string | null
          verification_query: string | null
        }
        Insert: {
          created_at?: string | null
          db_host_encrypted?: string | null
          db_name_encrypted?: string | null
          db_password_encrypted?: string | null
          db_user_encrypted?: string | null
          id?: string
          is_configured?: boolean | null
          iv?: string | null
          updated_at?: string | null
          verification_query?: string | null
        }
        Update: {
          created_at?: string | null
          db_host_encrypted?: string | null
          db_name_encrypted?: string | null
          db_password_encrypted?: string | null
          db_user_encrypted?: string | null
          id?: string
          is_configured?: boolean | null
          iv?: string | null
          updated_at?: string | null
          verification_query?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      batch_update_board_positions: {
        Args: { _updates: Json; _user_id: string; _workspace_id: string }
        Returns: Json
      }
      batch_update_card_positions: {
        Args: { _updates: Json; _user_id: string }
        Returns: Json
      }
      batch_update_column_positions: {
        Args: { _board_id: string; _updates: Json; _user_id: string }
        Returns: Json
      }
      can_edit_board: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_members: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      cleanup_expired_audit_logs: { Args: never; Returns: number }
      find_user_by_email: {
        Args: { _board_id: string; _email: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
        }[]
      }
      get_auth_page_data: { Args: never; Returns: Json }
      get_board_data: {
        Args: { _board_id: string; _user_id: string }
        Returns: Json
      }
      get_board_deletion_counts: { Args: { _board_id: string }; Returns: Json }
      get_board_member_profiles: {
        Args: { _board_id: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          role: string
          user_id: string
        }[]
      }
      get_board_role: {
        Args: { _board_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["board_role"]
      }
      get_home_data: { Args: { _user_id: string }; Returns: Json }
      get_workspace_deletion_counts: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      is_app_admin: { Args: { _user_id: string }; Returns: boolean }
      is_board_member: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      is_board_member_in_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      move_board_to_workspace: {
        Args: {
          _board_id: string
          _new_position: number
          _new_workspace_id: string
          _user_id: string
        }
        Returns: Json
      }
      shares_board_with: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      shares_workspace_with: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      update_card: {
        Args: {
          _card_id: string
          _clear_due_date?: boolean
          _description?: string
          _due_date?: string
          _title?: string
          _user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      board_role: "admin" | "manager" | "viewer"
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
      board_role: ["admin", "manager", "viewer"],
    },
  },
} as const
