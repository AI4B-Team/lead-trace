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
      activity_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          ref_id: string | null
          ref_type: string | null
          summary: string
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ref_id?: string | null
          ref_type?: string | null
          summary: string
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          ref_id?: string | null
          ref_type?: string | null
          summary?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      adapter_requests: {
        Row: {
          county: string | null
          created_at: string
          desired_fields: string[]
          frequency: string
          geo: string | null
          id: string
          login_required: string
          notes: string | null
          notified_at: string | null
          outreach_level: string | null
          outreach_note: string | null
          record_type: string | null
          requested_by: string | null
          risk_tier: string
          screening_reason: string | null
          source_label: string | null
          status: string
          target_url: string | null
          template_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          county?: string | null
          created_at?: string
          desired_fields?: string[]
          frequency?: string
          geo?: string | null
          id?: string
          login_required?: string
          notes?: string | null
          notified_at?: string | null
          outreach_level?: string | null
          outreach_note?: string | null
          record_type?: string | null
          requested_by?: string | null
          risk_tier?: string
          screening_reason?: string | null
          source_label?: string | null
          status?: string
          target_url?: string | null
          template_id?: string | null
          type?: string
          workspace_id: string
        }
        Update: {
          county?: string | null
          created_at?: string
          desired_fields?: string[]
          frequency?: string
          geo?: string | null
          id?: string
          login_required?: string
          notes?: string | null
          notified_at?: string | null
          outreach_level?: string | null
          outreach_note?: string | null
          record_type?: string | null
          requested_by?: string | null
          risk_tier?: string
          screening_reason?: string | null
          source_label?: string | null
          status?: string
          target_url?: string | null
          template_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adapter_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_column_maps: {
        Row: {
          agency_id: string
          column_map: Json
          created_at: string
          created_by: string | null
          id: string
          record_type: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          column_map?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          record_type?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          column_map?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          record_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_column_maps_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_contacts: {
        Row: {
          agency_name: string
          avg_turnaround_days: number | null
          contact_name: string | null
          contact_title: string | null
          county_name: string | null
          created_at: string
          department: string | null
          email: string | null
          fips: string | null
          id: string
          jurisdiction: string | null
          notes: string | null
          phone: string | null
          record_types: string[]
          response_format: string | null
          responsive: boolean
          state: string
          updated_at: string
        }
        Insert: {
          agency_name: string
          avg_turnaround_days?: number | null
          contact_name?: string | null
          contact_title?: string | null
          county_name?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          fips?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          phone?: string | null
          record_types?: string[]
          response_format?: string | null
          responsive?: boolean
          state: string
          updated_at?: string
        }
        Update: {
          agency_name?: string
          avg_turnaround_days?: number | null
          contact_name?: string | null
          contact_title?: string | null
          county_name?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          fips?: string | null
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          phone?: string | null
          record_types?: string[]
          response_format?: string | null
          responsive?: boolean
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_proposals: {
        Row: {
          agent_id: string | null
          agent_key: string | null
          created_at: string
          current_value: Json | null
          evidence_refs: Json
          expires_at: string
          id: string
          proposal_type: string
          proposed_value: Json | null
          rationale: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_field: string | null
          target_id: string | null
          target_table: string | null
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_key?: string | null
          created_at?: string
          current_value?: Json | null
          evidence_refs?: Json
          expires_at?: string
          id?: string
          proposal_type: string
          proposed_value?: Json | null
          rationale: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_field?: string | null
          target_id?: string | null
          target_table?: string | null
          workspace_id: string
        }
        Update: {
          agent_id?: string | null
          agent_key?: string | null
          created_at?: string
          current_value?: Json | null
          evidence_refs?: Json
          expires_at?: string
          id?: string
          proposal_type?: string
          proposed_value?: Json | null
          rationale?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_field?: string | null
          target_id?: string | null
          target_table?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_proposals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string | null
          agent_key: string | null
          error: string | null
          finished_at: string | null
          id: string
          items_actioned: number
          items_examined: number
          items_flagged: number
          started_at: string
          status: string
          summary: string | null
          workspace_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_key?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          items_actioned?: number
          items_examined?: number
          items_flagged?: number
          started_at?: string
          status?: string
          summary?: string | null
          workspace_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_key?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          items_actioned?: number
          items_examined?: number
          items_flagged?: number
          started_at?: string
          status?: string
          summary?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_counters: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          detail: Json
          id: string
          kind: string
          requested_by: string
          status: string
          summary: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          detail?: Json
          id?: string
          kind: string
          requested_by: string
          status?: string
          summary: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          detail?: Json
          id?: string
          kind?: string
          requested_by?: string
          status?: string
          summary?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      background_agents: {
        Row: {
          agent_key: string
          config: Json
          consecutive_failures: number
          created_at: string
          enabled: boolean
          id: string
          interval_minutes: number
          last_run_at: string | null
          mode: string
          next_run_at: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          agent_key: string
          config?: Json
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes: number
          last_run_at?: string | null
          mode?: string
          next_run_at?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          agent_key?: string
          config?: Json
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_run_at?: string | null
          mode?: string
          next_run_at?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "background_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_knowledge: {
        Row: {
          brand_id: string | null
          campaign_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          source_type: string
          source_url: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          brand_id?: string | null
          campaign_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          source_type?: string
          source_url?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          brand_id?: string | null
          campaign_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          source_type?: string
          source_url?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_knowledge_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_knowledge_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_profile_versions: {
        Row: {
          assembled_prompt: string | null
          change_kind: string
          change_note: string | null
          change_source: string
          changed_by: string | null
          created_at: string
          id: string
          profile_id: string
          proposal_id: string | null
          snapshot: Json
          version: number
          workspace_id: string
        }
        Insert: {
          assembled_prompt?: string | null
          change_kind?: string
          change_note?: string | null
          change_source?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          profile_id: string
          proposal_id?: string | null
          snapshot: Json
          version: number
          workspace_id: string
        }
        Update: {
          assembled_prompt?: string | null
          change_kind?: string
          change_note?: string | null
          change_source?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          proposal_id?: string | null
          snapshot?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_profile_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "agent_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_profile_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_profiles: {
        Row: {
          banned_topics: string[]
          context_framing: string | null
          created_at: string
          default_campaign_id: string | null
          dispositions: string[]
          escalation_triggers: string[]
          faqs: Json
          id: string
          is_default: boolean
          name: string
          objections: Json
          opener: string
          record_type: string | null
          screening_questions: Json
          template_id: string | null
          tone: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          banned_topics?: string[]
          context_framing?: string | null
          created_at?: string
          default_campaign_id?: string | null
          dispositions?: string[]
          escalation_triggers?: string[]
          faqs?: Json
          id?: string
          is_default?: boolean
          name: string
          objections?: Json
          opener: string
          record_type?: string | null
          screening_questions?: Json
          template_id?: string | null
          tone?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          banned_topics?: string[]
          context_framing?: string | null
          created_at?: string
          default_campaign_id?: string | null
          dispositions?: string[]
          escalation_triggers?: string[]
          faqs?: Json
          id?: string
          is_default?: boolean
          name?: string
          objections?: Json
          opener?: string
          record_type?: string | null
          screening_questions?: Json
          template_id?: string | null
          tone?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_profiles_default_campaign_id_fkey"
            columns: ["default_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      campaign_drops: {
        Row: {
          campaign_id: string
          created_at: string
          drop_index: number
          id: string
          scheduled_at: string
          sent_count: number
          size: number
          status: string
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          drop_index: number
          id?: string
          scheduled_at: string
          sent_count?: number
          size?: number
          status?: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          drop_index?: number
          id?: string
          scheduled_at?: string
          sent_count?: number
          size?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_drops_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_drops_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_steps: {
        Row: {
          active: boolean | null
          campaign_id: string
          delay_minutes: number
          id: string
          message_variants: string[]
          step_order: number
        }
        Insert: {
          active?: boolean | null
          campaign_id: string
          delay_minutes: number
          id?: string
          message_variants: string[]
          step_order: number
        }
        Update: {
          active?: boolean | null
          campaign_id?: string
          delay_minutes?: number
          id?: string
          message_variants?: string[]
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          bot_config: Json
          bot_enabled: boolean
          brand_id: string | null
          created_at: string
          daily_cap: number | null
          drop_size: number
          drop_times: string[]
          duplicate_policy: string
          forward_calls_to: string | null
          id: string
          list_job_id: string | null
          name: string
          regulated_vertical: boolean
          send_window: Json | null
          status: string | null
          tag_id: string | null
          workspace_id: string
        }
        Insert: {
          bot_config?: Json
          bot_enabled?: boolean
          brand_id?: string | null
          created_at?: string
          daily_cap?: number | null
          drop_size?: number
          drop_times?: string[]
          duplicate_policy?: string
          forward_calls_to?: string | null
          id?: string
          list_job_id?: string | null
          name: string
          regulated_vertical?: boolean
          send_window?: Json | null
          status?: string | null
          tag_id?: string | null
          workspace_id: string
        }
        Update: {
          bot_config?: Json
          bot_enabled?: boolean
          brand_id?: string | null
          created_at?: string
          daily_cap?: number | null
          drop_size?: number
          drop_times?: string[]
          duplicate_policy?: string
          forward_calls_to?: string | null
          id?: string
          list_job_id?: string | null
          name?: string
          regulated_vertical?: boolean
          send_window?: Json | null
          status?: string | null
          tag_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_list_job_id_fkey"
            columns: ["list_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          case_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "foreclosure_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_observations: {
        Row: {
          case_id: string
          created_at: string
          extracted: Json
          id: string
          match_confidence: number | null
          match_key_used: string | null
          observed_at: string
          raw: Json
          source_class: string
          source_id: string | null
          source_url: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          extracted?: Json
          id?: string
          match_confidence?: number | null
          match_key_used?: string | null
          observed_at?: string
          raw?: Json
          source_class: string
          source_id?: string | null
          source_url?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          extracted?: Json
          id?: string
          match_confidence?: number | null
          match_key_used?: string | null
          observed_at?: string
          raw?: Json
          source_class?: string
          source_id?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_observations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "foreclosure_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_events: {
        Row: {
          created_at: string
          detail: Json
          id: string
          lead_id: string | null
          path: string
          phone: string | null
          reason: string
          thread_key: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          lead_id?: string | null
          path?: string
          phone?: string | null
          reason: string
          thread_key?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          lead_id?: string | null
          path?: string
          phone?: string | null
          reason?: string
          thread_key?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_outcomes: {
        Row: {
          anchor_days_remaining: number | null
          bot_profile_id: string | null
          campaign_step_id: string | null
          case_id: string | null
          confidence: number | null
          flagged: boolean
          id: string
          labeled_at: string
          labeler_version: string
          last_message_at: string | null
          lead_id: string | null
          objection_category: string | null
          outcome: string
          record_type: string | null
          sentiment: string | null
          superseded_at: string | null
          thread_id: string | null
          thread_key: string | null
          touches_before_outcome: number | null
          variant_hash: string | null
          workspace_id: string
        }
        Insert: {
          anchor_days_remaining?: number | null
          bot_profile_id?: string | null
          campaign_step_id?: string | null
          case_id?: string | null
          confidence?: number | null
          flagged?: boolean
          id?: string
          labeled_at?: string
          labeler_version?: string
          last_message_at?: string | null
          lead_id?: string | null
          objection_category?: string | null
          outcome: string
          record_type?: string | null
          sentiment?: string | null
          superseded_at?: string | null
          thread_id?: string | null
          thread_key?: string | null
          touches_before_outcome?: number | null
          variant_hash?: string | null
          workspace_id: string
        }
        Update: {
          anchor_days_remaining?: number | null
          bot_profile_id?: string | null
          campaign_step_id?: string | null
          case_id?: string | null
          confidence?: number | null
          flagged?: boolean
          id?: string
          labeled_at?: string
          labeler_version?: string
          last_message_at?: string | null
          lead_id?: string | null
          objection_category?: string | null
          outcome?: string
          record_type?: string | null
          sentiment?: string | null
          superseded_at?: string | null
          thread_id?: string | null
          thread_key?: string | null
          touches_before_outcome?: number | null
          variant_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_outcomes_bot_profile_id_fkey"
            columns: ["bot_profile_id"]
            isOneToOne: false
            referencedRelation: "bot_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_outcomes_campaign_step_id_fkey"
            columns: ["campaign_step_id"]
            isOneToOne: false
            referencedRelation: "campaign_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_outcomes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_outcomes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      county_coverage: {
        Row: {
          access_path: string
          county_name: string
          created_at: string
          fips: string | null
          id: string
          notes: string | null
          source_type: string
          state: string
          status: string
          tos_prohibits_automation: boolean
          updated_at: string
        }
        Insert: {
          access_path?: string
          county_name: string
          created_at?: string
          fips?: string | null
          id?: string
          notes?: string | null
          source_type?: string
          state: string
          status?: string
          tos_prohibits_automation?: boolean
          updated_at?: string
        }
        Update: {
          access_path?: string
          county_name?: string
          created_at?: string
          fips?: string | null
          id?: string
          notes?: string | null
          source_type?: string
          state?: string
          status?: string
          tos_prohibits_automation?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      credit_balances: {
        Row: {
          balance: number
          kind: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          kind: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          kind?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_balances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          actor_user_id: string | null
          created_at: string
          delta: number
          id: string
          job_id: string | null
          kind: string
          reason: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          delta: number
          id?: string
          job_id?: string | null
          kind: string
          reason?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          job_id?: string | null
          kind?: string
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_credentials: {
        Row: {
          created_at: string
          key: string
          secret: string
        }
        Insert: {
          created_at?: string
          key: string
          secret?: string
        }
        Update: {
          created_at?: string
          key?: string
          secret?: string
        }
        Relationships: []
      }
      cron_locks: {
        Row: {
          consecutive_failures: number
          key: string
          last_detail: string | null
          last_duration_ms: number | null
          last_finished_at: string | null
          last_status: string | null
          last_success_at: string | null
          last_tick_at: string | null
          locked_at: string
        }
        Insert: {
          consecutive_failures?: number
          key: string
          last_detail?: string | null
          last_duration_ms?: number | null
          last_finished_at?: string | null
          last_status?: string | null
          last_success_at?: string | null
          last_tick_at?: string | null
          locked_at?: string
        }
        Update: {
          consecutive_failures?: number
          key?: string
          last_detail?: string | null
          last_duration_ms?: number | null
          last_finished_at?: string | null
          last_status?: string | null
          last_success_at?: string | null
          last_tick_at?: string | null
          locked_at?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          consecutive_failures: number
          county_name: string | null
          crawl_interval_minutes: number
          created_at: string
          dataset_id: string | null
          discovered_at: string
          domain: string
          entity_name: string | null
          fetch_config: Json
          field_map: Json
          fips: string | null
          id: string
          jurisdiction: string | null
          last_error: string | null
          last_success_at: string | null
          last_verified_at: string | null
          platform: string
          precedence: number
          record_type: string
          resource_url: string | null
          row_estimate: number | null
          source_class: string
          state: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          county_name?: string | null
          crawl_interval_minutes?: number
          created_at?: string
          dataset_id?: string | null
          discovered_at?: string
          domain: string
          entity_name?: string | null
          fetch_config?: Json
          field_map?: Json
          fips?: string | null
          id?: string
          jurisdiction?: string | null
          last_error?: string | null
          last_success_at?: string | null
          last_verified_at?: string | null
          platform: string
          precedence?: number
          record_type: string
          resource_url?: string | null
          row_estimate?: number | null
          source_class?: string
          state?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          county_name?: string | null
          crawl_interval_minutes?: number
          created_at?: string
          dataset_id?: string | null
          discovered_at?: string
          domain?: string
          entity_name?: string | null
          fetch_config?: Json
          field_map?: Json
          fips?: string | null
          id?: string
          jurisdiction?: string | null
          last_error?: string | null
          last_success_at?: string | null
          last_verified_at?: string | null
          platform?: string
          precedence?: number
          record_type?: string
          resource_url?: string | null
          row_estimate?: number | null
          source_class?: string
          state?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      distress_feed_views: {
        Row: {
          created_at: string
          fips: string
          id: string
          last_viewed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fips: string
          id?: string
          last_viewed_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fips?: string
          id?: string
          last_viewed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      distress_guides: {
        Row: {
          county: string
          created_at: string
          created_by: string | null
          fields: Json
          fips: string
          id: string
          intro: string | null
          notes: string | null
          portal_url: string
          published: boolean
          record_type: string
          slug: string
          state: string
          steps: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          county: string
          created_at?: string
          created_by?: string | null
          fields?: Json
          fips: string
          id?: string
          intro?: string | null
          notes?: string | null
          portal_url: string
          published?: boolean
          record_type: string
          slug: string
          state: string
          steps?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          county?: string
          created_at?: string
          created_by?: string | null
          fields?: Json
          fips?: string
          id?: string
          intro?: string | null
          notes?: string | null
          portal_url?: string
          published?: boolean
          record_type?: string
          slug?: string
          state?: string
          steps?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      distress_pulls: {
        Row: {
          bytes_downloaded: number
          county: string
          created_at: string
          error: string | null
          finished_at: string | null
          fips: string
          http_status: number | null
          id: string
          record_type: string
          records_added: number
          records_found: number
          started_at: string
          state: string
          status: string
        }
        Insert: {
          bytes_downloaded?: number
          county: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          fips: string
          http_status?: number | null
          id?: string
          record_type: string
          records_added?: number
          records_found?: number
          started_at?: string
          state: string
          status?: string
        }
        Update: {
          bytes_downloaded?: number
          county?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          fips?: string
          http_status?: number | null
          id?: string
          record_type?: string
          records_added?: number
          records_found?: number
          started_at?: string
          state?: string
          status?: string
        }
        Relationships: []
      }
      distress_records: {
        Row: {
          amount: number | null
          auction_date: string | null
          company_entity: string | null
          county: string
          created_at: string
          doc_number: string
          estimated: boolean
          filed_date: string | null
          fips: string
          id: string
          mailing_address: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          owner_first: string | null
          owner_last: string | null
          parcel_apn: string | null
          property_address: string | null
          property_city: string | null
          property_state: string | null
          property_zip: string | null
          pulled_date: string
          raw: Json
          record_type: string
          sold_to: string | null
          source_url: string | null
          state: string
          status: string | null
          surplus_amount: number | null
          surplus_basis: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          auction_date?: string | null
          company_entity?: string | null
          county: string
          created_at?: string
          doc_number: string
          estimated?: boolean
          filed_date?: string | null
          fips: string
          id?: string
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          owner_first?: string | null
          owner_last?: string | null
          parcel_apn?: string | null
          property_address?: string | null
          property_city?: string | null
          property_state?: string | null
          property_zip?: string | null
          pulled_date?: string
          raw?: Json
          record_type: string
          sold_to?: string | null
          source_url?: string | null
          state: string
          status?: string | null
          surplus_amount?: number | null
          surplus_basis?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          auction_date?: string | null
          company_entity?: string | null
          county?: string
          created_at?: string
          doc_number?: string
          estimated?: boolean
          filed_date?: string | null
          fips?: string
          id?: string
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          owner_first?: string | null
          owner_last?: string | null
          parcel_apn?: string | null
          property_address?: string | null
          property_city?: string | null
          property_state?: string | null
          property_zip?: string | null
          pulled_date?: string
          raw?: Json
          record_type?: string
          sold_to?: string | null
          source_url?: string | null
          state?: string
          status?: string | null
          surplus_amount?: number | null
          surplus_basis?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_error: string | null
          id: string
          payload: Json
          type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_error?: string | null
          id?: string
          payload?: Json
          type: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_error?: string | null
          id?: string
          payload?: Json
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      export_events: {
        Row: {
          actor_user_id: string
          created_at: string
          file_type: string
          id: string
          ref_id: string | null
          row_count: number
          scope: string
          watermark: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          file_type?: string
          id?: string
          ref_id?: string | null
          row_count?: number
          scope: string
          watermark?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          file_type?: string
          id?: string
          ref_id?: string | null
          row_count?: number
          scope?: string
          watermark?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          screenshot_url: string | null
          user_id: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          screenshot_url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          screenshot_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      foreclosure_cases: {
        Row: {
          address_hash: string
          attorney_firm: string | null
          attorney_name: string | null
          attorney_phone: string | null
          auction_date: string | null
          auction_time: string | null
          case_number: string | null
          case_number_normalized: string | null
          case_status: string
          company_entity: string | null
          county: string | null
          created_at: string
          field_provenance: Json
          filed_date: string | null
          fips: string
          first_seen_at: string
          first_seen_source_id: string | null
          id: string
          last_observed_at: string
          loan_balance: number | null
          mortgagee: string | null
          opening_bid: number | null
          original_mortgage: number | null
          owner_first: string | null
          owner_last: string | null
          parcel_apn: string | null
          property_address: string | null
          property_city: string | null
          property_state: string | null
          property_zip: string | null
          record_type: string
          servicer: string | null
          stage: string | null
          state: string
          updated_at: string
        }
        Insert: {
          address_hash: string
          attorney_firm?: string | null
          attorney_name?: string | null
          attorney_phone?: string | null
          auction_date?: string | null
          auction_time?: string | null
          case_number?: string | null
          case_number_normalized?: string | null
          case_status?: string
          company_entity?: string | null
          county?: string | null
          created_at?: string
          field_provenance?: Json
          filed_date?: string | null
          fips: string
          first_seen_at?: string
          first_seen_source_id?: string | null
          id?: string
          last_observed_at?: string
          loan_balance?: number | null
          mortgagee?: string | null
          opening_bid?: number | null
          original_mortgage?: number | null
          owner_first?: string | null
          owner_last?: string | null
          parcel_apn?: string | null
          property_address?: string | null
          property_city?: string | null
          property_state?: string | null
          property_zip?: string | null
          record_type: string
          servicer?: string | null
          stage?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          address_hash?: string
          attorney_firm?: string | null
          attorney_name?: string | null
          attorney_phone?: string | null
          auction_date?: string | null
          auction_time?: string | null
          case_number?: string | null
          case_number_normalized?: string | null
          case_status?: string
          company_entity?: string | null
          county?: string | null
          created_at?: string
          field_provenance?: Json
          filed_date?: string | null
          fips?: string
          first_seen_at?: string
          first_seen_source_id?: string | null
          id?: string
          last_observed_at?: string
          loan_balance?: number | null
          mortgagee?: string | null
          opening_bid?: number | null
          original_mortgage?: number | null
          owner_first?: string | null
          owner_last?: string | null
          parcel_apn?: string | null
          property_address?: string | null
          property_city?: string | null
          property_state?: string | null
          property_zip?: string | null
          record_type?: string
          servicer?: string | null
          stage?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foreclosure_cases_first_seen_source_id_fkey"
            columns: ["first_seen_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "industries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          count: number | null
          created_at: string
          id: string
          job_id: string
          message: string
          stage: string
          workspace_id: string
        }
        Insert: {
          count?: number | null
          created_at?: string
          id?: string
          job_id: string
          message: string
          stage: string
          workspace_id: string
        }
        Update: {
          count?: number | null
          created_at?: string
          id?: string
          job_id?: string
          message?: string
          stage?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          auto_launch: boolean
          channel: string
          created_at: string
          created_by: string | null
          custom_interval_minutes: number | null
          data_provenance: string
          error: string | null
          failed_at: string | null
          failed_stage: string | null
          id: string
          idempotency_key: string | null
          last_run_at: string | null
          name: string | null
          net_new_count: number
          next_run_at: string | null
          params: Json
          parent_job_id: string | null
          provenance_banner_dismissed: boolean
          record_type: string
          rows_deduped: number | null
          rows_enriched: number | null
          rows_in: number | null
          rows_skiptraced: number | null
          schedule: string
          schedule_active: boolean
          source_type: string
          status: string
          workspace_id: string
        }
        Insert: {
          auto_launch?: boolean
          channel?: string
          created_at?: string
          created_by?: string | null
          custom_interval_minutes?: number | null
          data_provenance?: string
          error?: string | null
          failed_at?: string | null
          failed_stage?: string | null
          id?: string
          idempotency_key?: string | null
          last_run_at?: string | null
          name?: string | null
          net_new_count?: number
          next_run_at?: string | null
          params?: Json
          parent_job_id?: string | null
          provenance_banner_dismissed?: boolean
          record_type?: string
          rows_deduped?: number | null
          rows_enriched?: number | null
          rows_in?: number | null
          rows_skiptraced?: number | null
          schedule?: string
          schedule_active?: boolean
          source_type: string
          status?: string
          workspace_id: string
        }
        Update: {
          auto_launch?: boolean
          channel?: string
          created_at?: string
          created_by?: string | null
          custom_interval_minutes?: number | null
          data_provenance?: string
          error?: string | null
          failed_at?: string | null
          failed_stage?: string | null
          id?: string
          idempotency_key?: string | null
          last_run_at?: string | null
          name?: string | null
          net_new_count?: number
          next_run_at?: string | null
          params?: Json
          parent_job_id?: string | null
          provenance_banner_dismissed?: boolean
          record_type?: string
          rows_deduped?: number | null
          rows_enriched?: number | null
          rows_in?: number | null
          rows_skiptraced?: number | null
          schedule?: string
          schedule_active?: boolean
          source_type?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_parent_job_id_fkey"
            columns: ["parent_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_imports: {
        Row: {
          column_map: Json
          created_at: string
          created_by: string | null
          error: string | null
          filename: string
          id: string
          job_id: string | null
          rows_imported: number
          rows_total: number
          status: string
          workspace_id: string
        }
        Insert: {
          column_map?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          filename: string
          id?: string
          job_id?: string | null
          rows_imported?: number
          rows_total?: number
          status?: string
          workspace_id: string
        }
        Update: {
          column_map?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          filename?: string
          id?: string
          job_id?: string | null
          rows_imported?: number
          rows_total?: number
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_imports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          lead_record_id: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_record_id: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_record_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_record_id_fkey"
            columns: ["lead_record_id"]
            isOneToOne: false
            referencedRelation: "lead_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_outcomes: {
        Row: {
          id: string
          lead_record_id: string | null
          reason: string | null
          result_id: string | null
          set_by: string
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          id?: string
          lead_record_id?: string | null
          reason?: string | null
          result_id?: string | null
          set_by?: string
          status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          id?: string
          lead_record_id?: string | null
          reason?: string | null
          result_id?: string | null
          set_by?: string
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_outcomes_lead_record_id_fkey"
            columns: ["lead_record_id"]
            isOneToOne: false
            referencedRelation: "lead_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_outcomes_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "scan_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_outcomes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_records: {
        Row: {
          address: string | null
          business_name: string | null
          city: string | null
          created_at: string
          data_provenance: string
          dedupe_key: string
          disposition: string
          email: string | null
          engagement: string | null
          first_seen_at: string
          first_seen_job_id: string | null
          followers: string | null
          full_name: string | null
          handle: string | null
          id: string
          is_new: boolean
          last_seen_at: string
          last_seen_job_id: string | null
          list_count: number
          nominated_at: string | null
          nominated_by: string | null
          nominated_reason: string | null
          nominated_score: number | null
          phone: string | null
          phone_type: string | null
          platform: string | null
          record_types: string[]
          socials: Json
          source_meta: Json
          source_types: string[]
          state: string | null
          updated_at: string
          website: string | null
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          data_provenance?: string
          dedupe_key: string
          disposition?: string
          email?: string | null
          engagement?: string | null
          first_seen_at?: string
          first_seen_job_id?: string | null
          followers?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          is_new?: boolean
          last_seen_at?: string
          last_seen_job_id?: string | null
          list_count?: number
          nominated_at?: string | null
          nominated_by?: string | null
          nominated_reason?: string | null
          nominated_score?: number | null
          phone?: string | null
          phone_type?: string | null
          platform?: string | null
          record_types?: string[]
          socials?: Json
          source_meta?: Json
          source_types?: string[]
          state?: string | null
          updated_at?: string
          website?: string | null
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          data_provenance?: string
          dedupe_key?: string
          disposition?: string
          email?: string | null
          engagement?: string | null
          first_seen_at?: string
          first_seen_job_id?: string | null
          followers?: string | null
          full_name?: string | null
          handle?: string | null
          id?: string
          is_new?: boolean
          last_seen_at?: string
          last_seen_job_id?: string | null
          list_count?: number
          nominated_at?: string | null
          nominated_by?: string | null
          nominated_reason?: string | null
          nominated_score?: number | null
          phone?: string | null
          phone_type?: string | null
          platform?: string | null
          record_types?: string[]
          socials?: Json
          source_meta?: Json
          source_types?: string[]
          state?: string | null
          updated_at?: string
          website?: string | null
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sequence_state: {
        Row: {
          anchor_date: string | null
          anchor_type: string
          campaign_id: string
          created_at: string
          current_step: number
          disposition: string | null
          id: string
          last_sent_at: string | null
          lead_id: string
          next_send_at: string | null
          paused_reason: string | null
          paused_until: string | null
          sends_count: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          anchor_date?: string | null
          anchor_type?: string
          campaign_id: string
          created_at?: string
          current_step?: number
          disposition?: string | null
          id?: string
          last_sent_at?: string | null
          lead_id: string
          next_send_at?: string | null
          paused_reason?: string | null
          paused_until?: string | null
          sends_count?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          anchor_date?: string | null
          anchor_type?: string
          campaign_id?: string
          created_at?: string
          current_step?: number
          disposition?: string | null
          id?: string
          last_sent_at?: string | null
          lead_id?: string
          next_send_at?: string | null
          paused_reason?: string | null
          paused_until?: string | null
          sends_count?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sequence_state_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sequence_state_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sequence_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          tag_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          tag_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          tag_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          business_name: string | null
          case_id: string | null
          city: string | null
          created_at: string
          data_provenance: string
          email: string | null
          full_name: string | null
          id: string
          job_id: string
          phone: string | null
          phone_type: string | null
          quality_flags: Json | null
          scrub_status: string | null
          source_meta: Json | null
          state: string | null
          workspace_id: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          case_id?: string | null
          city?: string | null
          created_at?: string
          data_provenance?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_id: string
          phone?: string | null
          phone_type?: string | null
          quality_flags?: Json | null
          scrub_status?: string | null
          source_meta?: Json | null
          state?: string | null
          workspace_id: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          case_id?: string | null
          city?: string | null
          created_at?: string
          data_provenance?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_id?: string
          phone?: string | null
          phone_type?: string | null
          quality_flags?: Json | null
          scrub_status?: string | null
          source_meta?: Json | null
          state?: string | null
          workspace_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "foreclosure_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          attributes: Json
          category: string | null
          created_at: string
          currency: string
          description: string | null
          dismissed_at: string | null
          distance_miles: number | null
          duplicate_confidence: number | null
          duplicate_group: string | null
          external_id: string | null
          first_seen_at: string
          id: string
          listing_url: string
          location_text: string | null
          match_breakdown: Json
          match_score: number
          photos: string[]
          posted_at: string | null
          posted_at_reliable: boolean
          price: number | null
          saved_at: string | null
          saved_lead_id: string | null
          search_id: string | null
          seller: Json
          source: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attributes?: Json
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          dismissed_at?: string | null
          distance_miles?: number | null
          duplicate_confidence?: number | null
          duplicate_group?: string | null
          external_id?: string | null
          first_seen_at?: string
          id?: string
          listing_url: string
          location_text?: string | null
          match_breakdown?: Json
          match_score?: number
          photos?: string[]
          posted_at?: string | null
          posted_at_reliable?: boolean
          price?: number | null
          saved_at?: string | null
          saved_lead_id?: string | null
          search_id?: string | null
          seller?: Json
          source: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attributes?: Json
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          dismissed_at?: string | null
          distance_miles?: number | null
          duplicate_confidence?: number | null
          duplicate_group?: string | null
          external_id?: string | null
          first_seen_at?: string
          id?: string
          listing_url?: string
          location_text?: string | null
          match_breakdown?: Json
          match_score?: number
          photos?: string[]
          posted_at?: string | null
          posted_at_reliable?: boolean
          price?: number | null
          saved_at?: string | null
          saved_lead_id?: string | null
          search_id?: string | null
          seller?: Json
          source?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "marketplace_searches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_searches: {
        Row: {
          alert_threshold: number
          attention_note: string | null
          category: string
          created_at: string
          created_by: string
          criteria: Json
          id: string
          last_checked_at: string | null
          location: string | null
          matches_found: number
          name: string
          next_check_at: string | null
          notify_email: boolean
          notify_in_app: boolean
          prompt: string
          radius_miles: number | null
          sources: string[]
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          alert_threshold?: number
          attention_note?: string | null
          category: string
          created_at?: string
          created_by?: string
          criteria?: Json
          id?: string
          last_checked_at?: string | null
          location?: string | null
          matches_found?: number
          name: string
          next_check_at?: string | null
          notify_email?: boolean
          notify_in_app?: boolean
          prompt?: string
          radius_miles?: number | null
          sources?: string[]
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          alert_threshold?: number
          attention_note?: string | null
          category?: string
          created_at?: string
          created_by?: string
          criteria?: Json
          id?: string
          last_checked_at?: string | null
          location?: string | null
          matches_found?: number
          name?: string
          next_check_at?: string | null
          notify_email?: boolean
          notify_in_app?: boolean
          prompt?: string
          radius_miles?: number | null
          sources?: string[]
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_searches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      member_limits: {
        Row: {
          approval_threshold_credits: number | null
          created_at: string
          export_approval_threshold_rows: number | null
          monthly_credit_cap: number | null
          monthly_export_row_cap: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          approval_threshold_credits?: number | null
          created_at?: string
          export_approval_threshold_rows?: number | null
          monthly_credit_cap?: number | null
          monthly_export_row_cap?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          approval_threshold_credits?: number | null
          created_at?: string
          export_approval_threshold_rows?: number | null
          monthly_credit_cap?: number | null
          monthly_export_row_cap?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          call_event: string | null
          campaign_id: string | null
          carrier: string | null
          channel: string
          created_at: string
          direction: string
          error_code: string | null
          handoff_reason: string | null
          id: string
          is_bot: boolean
          is_optout: boolean | null
          lead_id: string | null
          provider_sid: string | null
          read_at: string | null
          recording_seconds: number | null
          recording_url: string | null
          sending_number_id: string | null
          status: string | null
          thread_key: string | null
          transcript: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          call_event?: string | null
          campaign_id?: string | null
          carrier?: string | null
          channel?: string
          created_at?: string
          direction: string
          error_code?: string | null
          handoff_reason?: string | null
          id?: string
          is_bot?: boolean
          is_optout?: boolean | null
          lead_id?: string | null
          provider_sid?: string | null
          read_at?: string | null
          recording_seconds?: number | null
          recording_url?: string | null
          sending_number_id?: string | null
          status?: string | null
          thread_key?: string | null
          transcript?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          call_event?: string | null
          campaign_id?: string | null
          carrier?: string | null
          channel?: string
          created_at?: string
          direction?: string
          error_code?: string | null
          handoff_reason?: string | null
          id?: string
          is_bot?: boolean
          is_optout?: boolean | null
          lead_id?: string | null
          provider_sid?: string | null
          read_at?: string | null
          recording_seconds?: number | null
          recording_url?: string | null
          sending_number_id?: string | null
          status?: string | null
          thread_key?: string | null
          transcript?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sending_number_id_fkey"
            columns: ["sending_number_id"]
            isOneToOne: false
            referencedRelation: "sending_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      monitor_subscriptions: {
        Row: {
          active: boolean
          alert_on: Json
          cadence: string
          created_at: string
          created_by: string
          id: string
          last_run_at: string | null
          list_id: string | null
          next_run_at: string | null
          scan_job_id: string | null
          vertical: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          alert_on?: Json
          cadence?: string
          created_at?: string
          created_by?: string
          id?: string
          last_run_at?: string | null
          list_id?: string | null
          next_run_at?: string | null
          scan_job_id?: string | null
          vertical?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          alert_on?: Json
          cadence?: string
          created_at?: string
          created_by?: string
          id?: string
          last_run_at?: string | null
          list_id?: string | null
          next_run_at?: string | null
          scan_job_id?: string | null
          vertical?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitor_subscriptions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_subscriptions_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitor_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      municipalities: {
        Row: {
          city: string | null
          county: string
          id: number
          state: string
        }
        Insert: {
          city?: string | null
          county: string
          id?: number
          state: string
        }
        Update: {
          city?: string | null
          county?: string
          id?: number
          state?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: string
          read_at: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          read_at?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          read_at?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      number_carrier_stats: {
        Row: {
          carrier: string
          delivered_count: number
          failed_count: number
          id: string
          sending_number_id: string
          sent_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          carrier?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          sending_number_id: string
          sent_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          carrier?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          sending_number_id?: string
          sent_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_carrier_stats_sending_number_id_fkey"
            columns: ["sending_number_id"]
            isOneToOne: false
            referencedRelation: "sending_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_carrier_stats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_conditions: {
        Row: {
          apn: string
          boolean_detections: Json
          condition_confidence: number | null
          condition_vector: Json
          confidence_vector: Json
          distress_score: number
          fips: string
          id: string
          imagery_date: string
          imagery_source: string
          lat: number | null
          lng: number | null
          model_version: string
          rationale: Json | null
          scored_at: string
        }
        Insert: {
          apn: string
          boolean_detections?: Json
          condition_confidence?: number | null
          condition_vector?: Json
          confidence_vector?: Json
          distress_score?: number
          fips: string
          id?: string
          imagery_date: string
          imagery_source: string
          lat?: number | null
          lng?: number | null
          model_version: string
          rationale?: Json | null
          scored_at?: string
        }
        Update: {
          apn?: string
          boolean_detections?: Json
          condition_confidence?: number | null
          condition_vector?: Json
          confidence_vector?: Json
          distress_score?: number
          fips?: string
          id?: string
          imagery_date?: string
          imagery_source?: string
          lat?: number | null
          lng?: number | null
          model_version?: string
          rationale?: Json | null
          scored_at?: string
        }
        Relationships: []
      }
      portal_sessions: {
        Row: {
          captured_at: string
          captured_by: string | null
          cookies_encrypted: string | null
          county_name: string | null
          created_at: string
          expires_at: string | null
          id: string
          needs_reauth: boolean
          notes: string | null
          portal_key: string
          portal_url: string | null
          state: string | null
          tos_allows_automation: boolean
          tos_checked_at: string | null
          updated_at: string
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          cookies_encrypted?: string | null
          county_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          needs_reauth?: boolean
          notes?: string | null
          portal_key: string
          portal_url?: string | null
          state?: string | null
          tos_allows_automation?: boolean
          tos_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          cookies_encrypted?: string | null
          county_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          needs_reauth?: boolean
          notes?: string | null
          portal_key?: string
          portal_url?: string | null
          state?: string | null
          tos_allows_automation?: boolean
          tos_checked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_alerts: {
        Row: {
          created_at: string
          email: string
          id: string
          notified_at: string | null
          provider_key: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          provider_key: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          provider_key?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_status: {
        Row: {
          key: string
          message: string | null
          state: string
          updated_at: string
        }
        Insert: {
          key: string
          message?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          key?: string
          message?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          title: string
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          title: string
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      record_types: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      records_request_files: {
        Row: {
          agency_id: string
          detected_columns: string[]
          file_type: string | null
          filename: string
          id: string
          parse_error: string | null
          parse_status: string
          raw_text: string | null
          received_at: string
          request_id: string | null
          rows_parsed: number
          rows_total: number
          sample_rows: Json
          storage_path: string | null
        }
        Insert: {
          agency_id: string
          detected_columns?: string[]
          file_type?: string | null
          filename: string
          id?: string
          parse_error?: string | null
          parse_status?: string
          raw_text?: string | null
          received_at?: string
          request_id?: string | null
          rows_parsed?: number
          rows_total?: number
          sample_rows?: Json
          storage_path?: string | null
        }
        Update: {
          agency_id?: string
          detected_columns?: string[]
          file_type?: string | null
          filename?: string
          id?: string
          parse_error?: string | null
          parse_status?: string
          raw_text?: string | null
          received_at?: string
          request_id?: string | null
          rows_parsed?: number
          rows_total?: number
          sample_rows?: Json
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "records_request_files_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agency_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "records_request_files_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "records_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      records_requests: {
        Row: {
          agency_id: string
          body: string | null
          cadence: string
          created_at: string
          date_range_days: number
          id: string
          last_error: string | null
          last_received_at: string | null
          last_sent_at: string | null
          next_send_at: string | null
          record_types: string[]
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          body?: string | null
          cadence?: string
          created_at?: string
          date_range_days?: number
          id?: string
          last_error?: string | null
          last_received_at?: string | null
          last_sent_at?: string | null
          next_send_at?: string | null
          record_types?: string[]
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          body?: string | null
          cadence?: string
          created_at?: string
          date_range_days?: number
          id?: string
          last_error?: string | null
          last_received_at?: string | null
          last_sent_at?: string | null
          next_send_at?: string | null
          record_types?: string[]
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "records_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agency_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          brand_status: string | null
          campaign_status: string | null
          provider_refs: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand_status?: string | null
          campaign_status?: string | null
          provider_refs?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand_status?: string | null
          campaign_status?: string | null
          provider_refs?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_jobs: {
        Row: {
          areas: Json
          buy_box: Json
          completed_at: string | null
          created_at: string
          created_by: string
          credits_charged: number | null
          credits_quoted: number | null
          credits_refunded: number | null
          example_parcels: Json
          failed_reason: string | null
          id: string
          images_per: number
          match_threshold: number
          mode: string
          name: string | null
          parcels_filtered: number | null
          parcels_in_area: number | null
          parcels_matched: number | null
          parcels_scanned: number | null
          prompt: string | null
          source_list_id: string | null
          status: string
          vertical: string
          workspace_id: string
        }
        Insert: {
          areas?: Json
          buy_box?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          credits_charged?: number | null
          credits_quoted?: number | null
          credits_refunded?: number | null
          example_parcels?: Json
          failed_reason?: string | null
          id?: string
          images_per?: number
          match_threshold?: number
          mode?: string
          name?: string | null
          parcels_filtered?: number | null
          parcels_in_area?: number | null
          parcels_matched?: number | null
          parcels_scanned?: number | null
          prompt?: string | null
          source_list_id?: string | null
          status?: string
          vertical?: string
          workspace_id: string
        }
        Update: {
          areas?: Json
          buy_box?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string
          credits_charged?: number | null
          credits_quoted?: number | null
          credits_refunded?: number | null
          example_parcels?: Json
          failed_reason?: string | null
          id?: string
          images_per?: number
          match_threshold?: number
          mode?: string
          name?: string | null
          parcels_filtered?: number | null
          parcels_in_area?: number | null
          parcels_matched?: number | null
          parcels_scanned?: number | null
          prompt?: string | null
          source_list_id?: string | null
          status?: string
          vertical?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jobs_source_list_id_fkey"
            columns: ["source_list_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_results: {
        Row: {
          address: string | null
          apn: string | null
          city: string | null
          condition_confidence: number | null
          created_at: string
          distress_score: number | null
          enriched_at: string | null
          id: string
          job_id: string
          match_reason: string | null
          matched: boolean
          parcel_condition_id: string | null
          refunded: boolean
          refusal_code: string | null
          scored_image_date: string | null
          scored_image_src: string | null
          scored_image_url: string | null
          skip_traced_at: string | null
          state: string | null
          sv_heading: number | null
          sv_lat: number | null
          sv_lng: number | null
          sv_pano_id: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          apn?: string | null
          city?: string | null
          condition_confidence?: number | null
          created_at?: string
          distress_score?: number | null
          enriched_at?: string | null
          id?: string
          job_id: string
          match_reason?: string | null
          matched?: boolean
          parcel_condition_id?: string | null
          refunded?: boolean
          refusal_code?: string | null
          scored_image_date?: string | null
          scored_image_src?: string | null
          scored_image_url?: string | null
          skip_traced_at?: string | null
          state?: string | null
          sv_heading?: number | null
          sv_lat?: number | null
          sv_lng?: number | null
          sv_pano_id?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          apn?: string | null
          city?: string | null
          condition_confidence?: number | null
          created_at?: string
          distress_score?: number | null
          enriched_at?: string | null
          id?: string
          job_id?: string
          match_reason?: string | null
          matched?: boolean
          parcel_condition_id?: string | null
          refunded?: boolean
          refusal_code?: string | null
          scored_image_date?: string | null
          scored_image_src?: string | null
          scored_image_url?: string | null
          skip_traced_at?: string | null
          state?: string | null
          sv_heading?: number | null
          sv_lat?: number | null
          sv_lng?: number | null
          sv_pano_id?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scan_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_results_parcel_condition_id_fkey"
            columns: ["parcel_condition_id"]
            isOneToOne: false
            referencedRelation: "parcel_conditions"
            referencedColumns: ["id"]
          },
        ]
      }
      scrub_runs: {
        Row: {
          clean_count: number | null
          created_at: string
          dnc_count: number | null
          id: string
          job_id: string | null
          litigator_count: number | null
          proof: Json | null
          provider: string | null
          total: number | null
          workspace_id: string
        }
        Insert: {
          clean_count?: number | null
          created_at?: string
          dnc_count?: number | null
          id?: string
          job_id?: string | null
          litigator_count?: number | null
          proof?: Json | null
          provider?: string | null
          total?: number | null
          workspace_id: string
        }
        Update: {
          clean_count?: number | null
          created_at?: string
          dnc_count?: number | null
          id?: string
          job_id?: string | null
          litigator_count?: number | null
          proof?: Json | null
          provider?: string | null
          total?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrub_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrub_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_revocations: {
        Row: {
          created_at: string
          id: string
          revoked_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          revoked_by?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          revoked_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_revocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sending_numbers: {
        Row: {
          activated_at: string
          area_code: string | null
          auto_pause_reason: string | null
          auto_paused_at: string | null
          created_at: string
          daily_cap_override: number | null
          delivered_count: number
          delivery_rate: number | null
          failed_count: number
          forward_calls_to: string | null
          health_score: number | null
          id: string
          min_delivery_rate: number
          optout_rate: number | null
          phone: string
          provider_sid: string | null
          recording_disclosure: boolean
          recording_enabled: boolean
          region: string | null
          status: string | null
          voicemail_greeting: string | null
          workspace_id: string
        }
        Insert: {
          activated_at?: string
          area_code?: string | null
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          created_at?: string
          daily_cap_override?: number | null
          delivered_count?: number
          delivery_rate?: number | null
          failed_count?: number
          forward_calls_to?: string | null
          health_score?: number | null
          id?: string
          min_delivery_rate?: number
          optout_rate?: number | null
          phone: string
          provider_sid?: string | null
          recording_disclosure?: boolean
          recording_enabled?: boolean
          region?: string | null
          status?: string | null
          voicemail_greeting?: string | null
          workspace_id: string
        }
        Update: {
          activated_at?: string
          area_code?: string | null
          auto_pause_reason?: string | null
          auto_paused_at?: string | null
          created_at?: string
          daily_cap_override?: number | null
          delivered_count?: number
          delivery_rate?: number | null
          failed_count?: number
          forward_calls_to?: string | null
          health_score?: number | null
          id?: string
          min_delivery_rate?: number
          optout_rate?: number | null
          phone?: string
          provider_sid?: string | null
          recording_disclosure?: boolean
          recording_enabled?: boolean
          region?: string | null
          status?: string | null
          voicemail_greeting?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sending_numbers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      source_coverage: {
        Row: {
          county_name: string | null
          created_at: string
          fips: string
          id: string
          last_success_at: string | null
          record_type: string
          sample_row_count: number | null
          source_id: string | null
          state: string
          status: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          county_name?: string | null
          created_at?: string
          fips: string
          id?: string
          last_success_at?: string | null
          record_type: string
          sample_row_count?: number | null
          source_id?: string | null
          state: string
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          county_name?: string | null
          created_at?: string
          fips?: string
          id?: string
          last_success_at?: string | null
          record_type?: string
          sample_row_count?: number | null
          source_id?: string | null
          state?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "source_coverage_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_cursors: {
        Row: {
          cycles: number
          key: string
          last_label: string | null
          position: number
          updated_at: string
        }
        Insert: {
          cycles?: number
          key: string
          last_label?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          cycles?: number
          key?: string
          last_label?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      state_guides: {
        Row: {
          created_at: string
          faqs: Json
          how_pros_use_body: string | null
          id: string
          intro: string | null
          law_claim_window: string | null
          law_local_terminology: string | null
          law_notes: string | null
          law_public_records_statute: string | null
          law_records_holder: string | null
          law_sale_type: string | null
          published: boolean
          record_type_slug: string
          state: string
          steps: Json
          title: string | null
          updated_at: string
          what_is_body: string | null
        }
        Insert: {
          created_at?: string
          faqs?: Json
          how_pros_use_body?: string | null
          id?: string
          intro?: string | null
          law_claim_window?: string | null
          law_local_terminology?: string | null
          law_notes?: string | null
          law_public_records_statute?: string | null
          law_records_holder?: string | null
          law_sale_type?: string | null
          published?: boolean
          record_type_slug: string
          state: string
          steps?: Json
          title?: string | null
          updated_at?: string
          what_is_body?: string | null
        }
        Update: {
          created_at?: string
          faqs?: Json
          how_pros_use_body?: string | null
          id?: string
          intro?: string | null
          law_claim_window?: string | null
          law_local_terminology?: string | null
          law_notes?: string | null
          law_public_records_statute?: string | null
          law_records_holder?: string | null
          law_sale_type?: string | null
          published?: boolean
          record_type_slug?: string
          state?: string
          steps?: Json
          title?: string | null
          updated_at?: string
          what_is_body?: string | null
        }
        Relationships: []
      }
      suppression: {
        Row: {
          created_at: string
          note: string | null
          phone: string
          reason: string | null
          source: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          phone: string
          reason?: string | null
          source?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          phone?: string
          reason?: string | null
          source?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppression_signals: {
        Row: {
          case_id: string
          created_at: string
          detail: Json
          detected_at: string
          id: string
          signal_type: string
          source: string
        }
        Insert: {
          case_id: string
          created_at?: string
          detail?: Json
          detected_at?: string
          id?: string
          signal_type: string
          source: string
        }
        Update: {
          case_id?: string
          created_at?: string
          detail?: Json
          detected_at?: string
          id?: string
          signal_type?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppression_signals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "foreclosure_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      surplus_confirmations: {
        Row: {
          case_number: string | null
          claim_deadline: string | null
          claim_status: string
          claimant_name: string | null
          confirmed_amount: number | null
          confirmed_as_of: string
          county_name: string
          created_at: string
          deadline_from_clerk: boolean
          derived_amount: number | null
          derived_record_id: string | null
          id: string
          match_is_fuzzy: boolean
          match_method: string | null
          needs_review: boolean
          parcel_apn: string | null
          property_address: string | null
          raw: Json
          sale_date: string | null
          sale_kind: string
          source_id: string | null
          source_url: string | null
          state: string
          updated_at: string
          variance_pct: number | null
          workspace_id: string | null
        }
        Insert: {
          case_number?: string | null
          claim_deadline?: string | null
          claim_status?: string
          claimant_name?: string | null
          confirmed_amount?: number | null
          confirmed_as_of: string
          county_name: string
          created_at?: string
          deadline_from_clerk?: boolean
          derived_amount?: number | null
          derived_record_id?: string | null
          id?: string
          match_is_fuzzy?: boolean
          match_method?: string | null
          needs_review?: boolean
          parcel_apn?: string | null
          property_address?: string | null
          raw?: Json
          sale_date?: string | null
          sale_kind: string
          source_id?: string | null
          source_url?: string | null
          state: string
          updated_at?: string
          variance_pct?: number | null
          workspace_id?: string | null
        }
        Update: {
          case_number?: string | null
          claim_deadline?: string | null
          claim_status?: string
          claimant_name?: string | null
          confirmed_amount?: number | null
          confirmed_as_of?: string
          county_name?: string
          created_at?: string
          deadline_from_clerk?: boolean
          derived_amount?: number | null
          derived_record_id?: string | null
          id?: string
          match_is_fuzzy?: boolean
          match_method?: string | null
          needs_review?: boolean
          parcel_apn?: string | null
          property_address?: string | null
          raw?: Json
          sale_date?: string | null
          sale_kind?: string
          source_id?: string | null
          source_url?: string | null
          state?: string
          updated_at?: string
          variance_pct?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surplus_confirmations_derived_record_id_fkey"
            columns: ["derived_record_id"]
            isOneToOne: false
            referencedRelation: "distress_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_confirmations_derived_record_id_fkey"
            columns: ["derived_record_id"]
            isOneToOne: false
            referencedRelation: "surplus_records_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_confirmations_derived_record_id_fkey"
            columns: ["derived_record_id"]
            isOneToOne: false
            referencedRelation: "surplus_records_visible"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_confirmations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "surplus_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surplus_confirmations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      surplus_county_pages: {
        Row: {
          claim_process_md: string | null
          clerk_address_line1: string | null
          clerk_address_line2: string | null
          clerk_city: string | null
          clerk_office_name: string | null
          clerk_phone: string | null
          clerk_postal_code: string | null
          county_fips: string
          county_name: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          official_list_url: string | null
          published: boolean
          slug: string
          state: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          claim_process_md?: string | null
          clerk_address_line1?: string | null
          clerk_address_line2?: string | null
          clerk_city?: string | null
          clerk_office_name?: string | null
          clerk_phone?: string | null
          clerk_postal_code?: string | null
          county_fips: string
          county_name: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          official_list_url?: string | null
          published?: boolean
          slug: string
          state: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          claim_process_md?: string | null
          clerk_address_line1?: string | null
          clerk_address_line2?: string | null
          clerk_city?: string | null
          clerk_office_name?: string | null
          clerk_phone?: string | null
          clerk_postal_code?: string | null
          county_fips?: string
          county_name?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          official_list_url?: string | null
          published?: boolean
          slug?: string
          state?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      surplus_faqs: {
        Row: {
          answer_md: string
          county_fips: string | null
          created_at: string
          id: string
          published: boolean
          question: string
          sort_order: number
          state: string
          updated_at: string
        }
        Insert: {
          answer_md: string
          county_fips?: string | null
          created_at?: string
          id?: string
          published?: boolean
          question: string
          sort_order?: number
          state: string
          updated_at?: string
        }
        Update: {
          answer_md?: string
          county_fips?: string | null
          created_at?: string
          id?: string
          published?: boolean
          question?: string
          sort_order?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      surplus_sources: {
        Row: {
          consecutive_failures: number
          county_name: string
          created_at: string
          fetch_config: Json
          handler: string
          id: string
          last_checked_at: string | null
          last_success_at: string | null
          notes: string | null
          refresh_cadence: string
          sale_kind: string
          source_url: string | null
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          county_name: string
          created_at?: string
          fetch_config?: Json
          handler: string
          id?: string
          last_checked_at?: string | null
          last_success_at?: string | null
          notes?: string | null
          refresh_cadence?: string
          sale_kind: string
          source_url?: string | null
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          county_name?: string
          created_at?: string
          fetch_config?: Json
          handler?: string
          id?: string
          last_checked_at?: string | null
          last_success_at?: string | null
          notes?: string | null
          refresh_cadence?: string
          sale_kind?: string
          source_url?: string | null
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      surplus_state_pages: {
        Row: {
          clerk_title: string | null
          created_at: string
          last_verified_at: string | null
          notes: string | null
          overview_md: string | null
          owner_record_date: string | null
          primary_term: string | null
          published: boolean
          state: string
          term_aliases: string[]
          updated_at: string
        }
        Insert: {
          clerk_title?: string | null
          created_at?: string
          last_verified_at?: string | null
          notes?: string | null
          overview_md?: string | null
          owner_record_date?: string | null
          primary_term?: string | null
          published?: boolean
          state: string
          term_aliases?: string[]
          updated_at?: string
        }
        Update: {
          clerk_title?: string | null
          created_at?: string
          last_verified_at?: string | null
          notes?: string | null
          overview_md?: string | null
          owner_record_date?: string | null
          primary_term?: string | null
          published?: boolean
          state?: string
          term_aliases?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      surplus_statutes: {
        Row: {
          assignment_permitted: boolean | null
          claim_window_days: number | null
          created_at: string
          escheat_days: number | null
          escheat_destination: string | null
          escheat_starts_from: string | null
          fee_cap_pct: number | null
          id: string
          notes: string | null
          published: boolean
          recovery_permitted: boolean
          requires_finder_license: boolean | null
          sale_kind: string
          source_url: string | null
          state: string
          statute_citation: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          window_starts_from: string | null
        }
        Insert: {
          assignment_permitted?: boolean | null
          claim_window_days?: number | null
          created_at?: string
          escheat_days?: number | null
          escheat_destination?: string | null
          escheat_starts_from?: string | null
          fee_cap_pct?: number | null
          id?: string
          notes?: string | null
          published?: boolean
          recovery_permitted?: boolean
          requires_finder_license?: boolean | null
          sale_kind: string
          source_url?: string | null
          state: string
          statute_citation: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          window_starts_from?: string | null
        }
        Update: {
          assignment_permitted?: boolean | null
          claim_window_days?: number | null
          created_at?: string
          escheat_days?: number | null
          escheat_destination?: string | null
          escheat_starts_from?: string | null
          fee_cap_pct?: number | null
          id?: string
          notes?: string | null
          published?: boolean
          recovery_permitted?: boolean
          requires_finder_license?: boolean | null
          sale_kind?: string
          source_url?: string | null
          state?: string
          statute_citation?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          window_starts_from?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_health: {
        Row: {
          baseline: Json
          consecutive_failures: number
          created_at: string
          eta: string | null
          field_fill_rates: Json
          last_check_at: string | null
          last_healthy_at: string | null
          notes: string | null
          row_count: number
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          baseline?: Json
          consecutive_failures?: number
          created_at?: string
          eta?: string | null
          field_fill_rates?: Json
          last_check_at?: string | null
          last_healthy_at?: string | null
          notes?: string | null
          row_count?: number
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          baseline?: Json
          consecutive_failures?: number
          created_at?: string
          eta?: string | null
          field_fill_rates?: Json
          last_check_at?: string | null
          last_healthy_at?: string | null
          notes?: string | null
          row_count?: number
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_health_events: {
        Row: {
          created_at: string
          detail: Json
          from_status: string | null
          id: string
          refunded_jobs: number
          row_count: number | null
          template_id: string
          to_status: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          from_status?: string | null
          id?: string
          refunded_jobs?: number
          row_count?: number | null
          template_id: string
          to_status: string
        }
        Update: {
          created_at?: string
          detail?: Json
          from_status?: string | null
          id?: string
          refunded_jobs?: number
          row_count?: number | null
          template_id?: string
          to_status?: string
        }
        Relationships: []
      }
      thread_states: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          created_at: string
          id: string
          lead_id: string | null
          starred: boolean
          status: string | null
          status_set_at: string | null
          status_set_by: string | null
          thread_key: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          starred?: boolean
          status?: string | null
          status_set_at?: string | null
          status_set_by?: string | null
          thread_key: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          starred?: boolean
          status?: string | null
          status_set_at?: string | null
          status_set_by?: string | null
          thread_key?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_states_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prefs: {
        Row: {
          checklist_collapsed: boolean
          first_run_dismissed: boolean
          real_elite_user_id: string | null
          reviewed_clean_list: boolean
          theme: string
          tour_status: string | null
          updated_at: string
          user_id: string
          welcome_dismissed: boolean
        }
        Insert: {
          checklist_collapsed?: boolean
          first_run_dismissed?: boolean
          real_elite_user_id?: string | null
          reviewed_clean_list?: boolean
          theme?: string
          tour_status?: string | null
          updated_at?: string
          user_id: string
          welcome_dismissed?: boolean
        }
        Update: {
          checklist_collapsed?: boolean
          first_run_dismissed?: boolean
          real_elite_user_id?: string | null
          reviewed_clean_list?: boolean
          theme?: string
          tour_status?: string | null
          updated_at?: string
          user_id?: string
          welcome_dismissed?: boolean
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
      webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          duration_ms: number | null
          endpoint_id: string | null
          error: string | null
          event_id: string | null
          event_type: string
          gave_up: boolean
          id: string
          next_retry_at: string | null
          ok: boolean
          request_body: string | null
          status_code: number | null
          url: string
          workspace_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          endpoint_id?: string | null
          error?: string | null
          event_id?: string | null
          event_type: string
          gave_up?: boolean
          id?: string
          next_retry_at?: string | null
          ok?: boolean
          request_body?: string | null
          status_code?: number | null
          url: string
          workspace_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          endpoint_id?: string | null
          error?: string | null
          event_id?: string | null
          event_type?: string
          gave_up?: boolean
          id?: string
          next_retry_at?: string | null
          ok?: boolean
          request_body?: string | null
          status_code?: number | null
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          event_types: string[]
          id: string
          secret: string
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          event_types?: string[]
          id?: string
          secret?: string
          updated_at?: string
          url: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          event_types?: string[]
          id?: string
          secret?: string
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      worklist_nominations: {
        Row: {
          agent_id: string | null
          cold_start: boolean
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          lead_id: string
          nominated_at: string
          reasons: string[]
          record_types: string[]
          score: number
          scout_version: string | null
          signals: string[]
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_id?: string | null
          cold_start?: boolean
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          lead_id: string
          nominated_at?: string
          reasons?: string[]
          record_types?: string[]
          score?: number
          scout_version?: string | null
          signals?: string[]
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_id?: string | null
          cold_start?: boolean
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          lead_id?: string
          nominated_at?: string
          reasons?: string[]
          record_types?: string[]
          score?: number
          scout_version?: string | null
          signals?: string[]
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worklist_nominations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "background_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worklist_nominations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worklist_nominations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          last_visit_at: string | null
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          last_visit_at?: string | null
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          last_visit_at?: string | null
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_onboarding: {
        Row: {
          created_at: string
          first_run_dismissed: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          first_run_dismissed?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          first_run_dismissed?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_onboarding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          billing_plan: string
          card_on_file: boolean
          created_at: string
          free_records_used: number
          human_pause_days: number
          id: string
          industry: string | null
          is_demo_workspace: boolean
          monthly_sms_cap: number | null
          name: string
          negative_keywords: string[]
          plan: string
          plan_grant_amount: number
          plan_period_start: string
          real_elite_linked_at: string | null
          real_elite_org_id: string | null
          refund_email_threshold: number
        }
        Insert: {
          billing_plan?: string
          card_on_file?: boolean
          created_at?: string
          free_records_used?: number
          human_pause_days?: number
          id?: string
          industry?: string | null
          is_demo_workspace?: boolean
          monthly_sms_cap?: number | null
          name: string
          negative_keywords?: string[]
          plan?: string
          plan_grant_amount?: number
          plan_period_start?: string
          real_elite_linked_at?: string | null
          real_elite_org_id?: string | null
          refund_email_threshold?: number
        }
        Update: {
          billing_plan?: string
          card_on_file?: boolean
          created_at?: string
          free_records_used?: number
          human_pause_days?: number
          id?: string
          industry?: string | null
          is_demo_workspace?: boolean
          monthly_sms_cap?: number | null
          name?: string
          negative_keywords?: string[]
          plan?: string
          plan_grant_amount?: number
          plan_period_start?: string
          real_elite_linked_at?: string | null
          real_elite_org_id?: string | null
          refund_email_threshold?: number
        }
        Relationships: []
      }
    }
    Views: {
      surplus_records_public: {
        Row: {
          confirmed_at: string | null
          county_fips: string | null
          county_name: string | null
          county_slug: string | null
          escheat_date: string | null
          first_seen_at: string | null
          id: string | null
          sale_date: string | null
          sale_type: string | null
          source_url: string | null
          state_code: string | null
          surplus_amount: number | null
        }
        Relationships: []
      }
      surplus_records_visible: {
        Row: {
          assignment_permitted: boolean | null
          case_number: string | null
          claim_deadline: string | null
          confidence: string | null
          confirmed_at: string | null
          county_fips: string | null
          county_name: string | null
          days_to_escheat: number | null
          deadline_from_clerk: boolean | null
          disbursement_status: string | null
          escheat_date: string | null
          escheat_destination: string | null
          fee_cap_citation: string | null
          fee_cap_percent: number | null
          first_seen_at: string | null
          id: string | null
          judgment_amount: number | null
          opening_bid: number | null
          owner_of_record: string | null
          parcel_id: string | null
          property_address: string | null
          property_city: string | null
          property_zip: string | null
          recovery_permitted: boolean | null
          sale_date: string | null
          sale_type: string | null
          source_registry: string | null
          source_url: string | null
          state_code: string | null
          surplus_amount: number | null
          surplus_basis: string | null
          variance_pct: number | null
          winning_bid: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surplus_confirmations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adapter_demand: {
        Args: never
        Returns: {
          desired_fields: string[]
          display_label: string
          first_requested_at: string
          frequencies: string[]
          last_requested_at: string
          logins: string[]
          needs_review: number
          queued: number
          requests: number
          sample_url: string
          screened_out: number
          source_key: string
          workspaces: number
        }[]
      }
      adapter_request_notify_list: {
        Args: { _source_key: string }
        Returns: {
          email: string
          frequency: string
          notified_at: string
          request_id: string
          requested_at: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      apply_credit_delta: {
        Args: {
          _actor_user_id?: string
          _delta: number
          _job_id?: string
          _kind: string
          _reason: string
          _workspace_id: string
        }
        Returns: number
      }
      bump_api_rate: {
        Args: { _bucket: string; _window_seconds: number }
        Returns: number
      }
      claim_cron_tick: {
        Args: { _key: string; _min_interval?: string }
        Returns: boolean
      }
      distress_county_preview: {
        Args: { _county: string; _limit?: number; _state: string }
        Returns: {
          amount: number
          filed_date: string
          owner_masked: string
          property_city: string
          property_zip: string
          record_type: string
          status: string
        }[]
      }
      distress_county_summary: {
        Args: { _state: string }
        Returns: {
          county: string
          fips: string
          last_pull_at: string
          new_this_week: number
          record_types: string[]
          total_records: number
        }[]
      }
      distress_feed_totals: {
        Args: never
        Returns: {
          added_this_week: number
          counties: number
          last_pull_at: string
          states: number
          total_records: number
        }[]
      }
      distress_state_summary: {
        Args: never
        Returns: {
          counties: number
          last_pull_at: string
          new_this_week: number
          state: string
          total_records: number
        }[]
      }
      distress_state_type_counties: {
        Args: { _record_type: string; _state: string }
        Returns: {
          county: string
          last_pull_at: string
          latest_filed: string
          records: number
        }[]
      }
      distress_state_type_stats: {
        Args: { _record_type: string; _state: string }
        Returns: {
          amount_records: number
          counties_covered: number
          last_pull_at: string
          latest_filed: string
          records: number
          total_amount: number
        }[]
      }
      distress_surplus_preview: {
        Args: { _county: string; _limit?: number; _state: string }
        Returns: {
          auction_date: string
          claim_deadline: string
          claim_status: string
          confirmation_source_url: string
          confirmed_amount: number
          confirmed_as_of: string
          deadline_from_clerk: boolean
          doc_number: string
          estimated: boolean
          owner_masked: string
          property_city: string
          property_zip: string
          sold_to: string
          source_consecutive_failures: number
          source_status: string
          surplus_amount: number
          surplus_basis: string
          variance_pct: number
        }[]
      }
      distress_top_counties: {
        Args: { _limit?: number }
        Returns: {
          county: string
          state: string
          total_records: number
        }[]
      }
      record_dlr_outcome: {
        Args: {
          _carrier: string
          _delivered: boolean
          _sending_number_id: string
          _workspace_id: string
        }
        Returns: undefined
      }
      surplus_public_county_aggregate: {
        Args: { p_county_fips: string }
        Returns: {
          by_sale_type: Json
          data_as_of: string
          max_sale_date: string
          min_sale_date: string
          record_count: number
          total_amount: number
        }[]
      }
      surplus_public_nearby_counties: {
        Args: { p_county_fips: string; p_limit?: number }
        Returns: {
          county_fips: string
          county_name: string
          county_slug: string
          record_count: number
          state_code: string
          total_amount: number
        }[]
      }
      surplus_public_state_aggregate: {
        Args: { p_state: string }
        Returns: {
          by_sale_type: Json
          county_count: number
          data_as_of: string
          max_sale_date: string
          min_sale_date: string
          record_count: number
          total_amount: number
        }[]
      }
      surplus_public_state_counties: {
        Args: { p_state: string }
        Returns: {
          clerk_office_name: string
          county_fips: string
          county_name: string
          county_slug: string
          official_list_url: string
          record_count: number
          total_amount: number
          verified_at: string
        }[]
      }
      surplus_public_urls: {
        Args: never
        Returns: {
          county_slug: string
          last_modified: string
          state_code: string
        }[]
      }
      sync_data_backed_coverage: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "super_admin" | "owner" | "admin" | "member"
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
      app_role: ["super_admin", "owner", "admin", "member"],
    },
  },
} as const
