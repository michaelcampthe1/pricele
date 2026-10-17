
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_audit_log": {
                  Row: {
                    "action": string,"admin_user_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity_id": string | null,"entity_type": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_user_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type": string,"id"?: string
                  }
                  Update: {
                    "action"?: string,"admin_user_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_results": {
                  Row: {
                    "completed_at": string,"created_at": string,"daily_set_id": string,"easy_score": number,"game_date": string,"hard_score": number,"id": string,"medium_score": number,"perfect_guess_count": number,"total_score": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at": string,"created_at"?: string,"daily_set_id": string,"easy_score": number,"game_date": string,"hard_score": number,"id"?: string,"medium_score": number,"perfect_guess_count": number,"total_score": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string,"created_at"?: string,"daily_set_id"?: string,"easy_score"?: number,"game_date"?: string,"hard_score"?: number,"id"?: string,"medium_score"?: number,"perfect_guess_count"?: number,"total_score"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_results_daily_set_id_fkey"
      columns: ["daily_set_id"]
isOneToOne: false
      referencedRelation: "daily_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_set_questions": {
                  Row: {
                    "created_at": string,"daily_set_id": string,"position": number,"question_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"daily_set_id": string,"position": number,"question_id": string
                  }
                  Update: {
                    "created_at"?: string,"daily_set_id"?: string,"position"?: number,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_set_questions_daily_set_id_fkey"
      columns: ["daily_set_id"]
isOneToOne: false
      referencedRelation: "daily_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_set_questions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: true
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_sets": {
                  Row: {
                    "created_at": string,"created_by": string | null,"game_date": string,"id": string,"is_sample": boolean,"notes": string | null,"published_at": string | null,"published_by": string | null,"status": Database["public"]['Enums']["daily_set_status"],"updated_at": string,"went_live_at": string | null,"withdrawn_at": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"game_date": string,"id"?: string,"is_sample"?: boolean,"notes"?: string | null,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["daily_set_status"],"updated_at"?: string,"went_live_at"?: string | null,"withdrawn_at"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"game_date"?: string,"id"?: string,"is_sample"?: boolean,"notes"?: string | null,"published_at"?: string | null,"published_by"?: string | null,"status"?: Database["public"]['Enums']["daily_set_status"],"updated_at"?: string,"went_live_at"?: string | null,"withdrawn_at"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"feedback": {
                  Row: {
                    "contact": string | null,"created_at": string,"id": string,"message": string,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contact"?: string | null,"created_at"?: string,"id"?: string,"message": string,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "contact"?: string | null,"created_at"?: string,"id"?: string,"message"?: string,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"guest_sessions": {
                  Row: {
                    "claimed_at": string | null,"claimed_by": string | null,"created_at": string,"expires_at": string,"id": string,"last_seen_at": string,"revoked_at": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"last_seen_at"?: string,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"last_seen_at"?: string,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"official_attempts": {
                  Row: {
                    "absolute_percentage_error": number,"answer_snapshot": number,"claimed_from_guest_session_id": string | null,"corrected_at": string | null,"created_at": string,"daily_set_id": string,"guess_amount": number,"guest_session_id": string | null,"id": string,"original_answer_snapshot": number | null,"original_score": number | null,"position": number,"question_id": string,"score": number,"scoring_version": string,"submitted_at": string,"user_id": string | null,"voided": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "absolute_percentage_error": number,"answer_snapshot": number,"claimed_from_guest_session_id"?: string | null,"corrected_at"?: string | null,"created_at"?: string,"daily_set_id": string,"guess_amount": number,"guest_session_id"?: string | null,"id"?: string,"original_answer_snapshot"?: number | null,"original_score"?: number | null,"position": number,"question_id": string,"score": number,"scoring_version": string,"submitted_at"?: string,"user_id"?: string | null,"voided"?: boolean
                  }
                  Update: {
                    "absolute_percentage_error"?: number,"answer_snapshot"?: number,"claimed_from_guest_session_id"?: string | null,"corrected_at"?: string | null,"created_at"?: string,"daily_set_id"?: string,"guess_amount"?: number,"guest_session_id"?: string | null,"id"?: string,"original_answer_snapshot"?: number | null,"original_score"?: number | null,"position"?: number,"question_id"?: string,"score"?: number,"scoring_version"?: string,"submitted_at"?: string,"user_id"?: string | null,"voided"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "official_attempts_claimed_from_guest_session_id_fkey"
      columns: ["claimed_from_guest_session_id"]
isOneToOne: false
      referencedRelation: "guest_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "official_attempts_daily_set_id_fkey"
      columns: ["daily_set_id"]
isOneToOne: false
      referencedRelation: "daily_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "official_attempts_guest_session_id_fkey"
      columns: ["guest_session_id"]
isOneToOne: false
      referencedRelation: "guest_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "official_attempts_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "official_attempts_question_in_set"
      columns: ["daily_set_id","question_id"]
isOneToOne: false
      referencedRelation: "daily_set_questions"
      referencedColumns: ["daily_set_id","question_id"]
    }
                  ]
                },"practice_attempts": {
                  Row: {
                    "absolute_percentage_error": number,"answer_snapshot": number,"daily_set_id": string,"guess_amount": number,"guest_session_id": string | null,"id": string,"question_id": string,"score": number,"scoring_version": string,"submitted_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "absolute_percentage_error": number,"answer_snapshot": number,"daily_set_id": string,"guess_amount": number,"guest_session_id"?: string | null,"id"?: string,"question_id": string,"score": number,"scoring_version": string,"submitted_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "absolute_percentage_error"?: number,"answer_snapshot"?: number,"daily_set_id"?: string,"guess_amount"?: number,"guest_session_id"?: string | null,"id"?: string,"question_id"?: string,"score"?: number,"scoring_version"?: string,"submitted_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_attempts_daily_set_id_fkey"
      columns: ["daily_set_id"]
isOneToOne: false
      referencedRelation: "daily_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_attempts_guest_session_id_fkey"
      columns: ["guest_session_id"]
isOneToOne: false
      referencedRelation: "guest_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_attempts_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_attempts_question_in_set"
      columns: ["daily_set_id","question_id"]
isOneToOne: false
      referencedRelation: "daily_set_questions"
      referencedColumns: ["daily_set_id","question_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string | null,"id": string,"is_public": boolean,"suspended_at": string | null,"suspended_reason": string | null,"updated_at": string,"username": string,"username_confirmed": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"is_public"?: boolean,"suspended_at"?: string | null,"suspended_reason"?: string | null,"updated_at"?: string,"username": string,"username_confirmed"?: boolean
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_public"?: boolean,"suspended_at"?: string | null,"suspended_reason"?: string | null,"updated_at"?: string,"username"?: string,"username_confirmed"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"question_answers": {
                  Row: {
                    "answer_amount": number | null,"answer_definition": string | null,"currency": string,"explanation": string | null,"question_id": string,"reference_date": string | null,"reference_period": string | null,"updated_at": string,"verification_notes": string | null,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_amount"?: number | null,"answer_definition"?: string | null,"currency"?: string,"explanation"?: string | null,"question_id": string,"reference_date"?: string | null,"reference_period"?: string | null,"updated_at"?: string,"verification_notes"?: string | null,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "answer_amount"?: number | null,"answer_definition"?: string | null,"currency"?: string,"explanation"?: string | null,"question_id"?: string,"reference_date"?: string | null,"reference_period"?: string | null,"updated_at"?: string,"verification_notes"?: string | null,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: true
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"question_corrections": {
                  Row: {
                    "admin_user_id": string | null,"affected_attempts": number,"created_at": string,"id": string,"kind": string,"new_answer": number | null,"old_answer": number | null,"question_id": string,"reason": string,"source_url": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_user_id"?: string | null,"affected_attempts"?: number,"created_at"?: string,"id"?: string,"kind": string,"new_answer"?: number | null,"old_answer"?: number | null,"question_id": string,"reason": string,"source_url"?: string | null,"status"?: string
                  }
                  Update: {
                    "admin_user_id"?: string | null,"affected_attempts"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"new_answer"?: number | null,"old_answer"?: number | null,"question_id"?: string,"reason"?: string,"source_url"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_corrections_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"question_sources": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"published_at": string | null,"publisher": string,"question_id": string,"reference_date": string | null,"source_url": string,"supporting_excerpt": string | null,"title": string,"verification_notes": string | null,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"published_at"?: string | null,"publisher": string,"question_id": string,"reference_date"?: string | null,"source_url": string,"supporting_excerpt"?: string | null,"title": string,"verification_notes"?: string | null,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"published_at"?: string | null,"publisher"?: string,"question_id"?: string,"reference_date"?: string | null,"source_url"?: string,"supporting_excerpt"?: string | null,"title"?: string,"verification_notes"?: string | null,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_sources_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "ai_assisted": boolean,"approved_at": string | null,"approved_by": string | null,"category_id": string | null,"context": string | null,"corrected_at": string | null,"correction_note": string | null,"created_at": string,"created_by": string | null,"difficulty": Database["public"]['Enums']["difficulty"],"id": string,"image_alt": string | null,"image_credit": string | null,"image_url": string | null,"is_sample": boolean,"prompt": string,"prompt_normalized": string | null,"published_at": string | null,"slug": string | null,"status": Database["public"]['Enums']["question_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_assisted"?: boolean,"approved_at"?: string | null,"approved_by"?: string | null,"category_id"?: string | null,"context"?: string | null,"corrected_at"?: string | null,"correction_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"difficulty": Database["public"]['Enums']["difficulty"],"id"?: string,"image_alt"?: string | null,"image_credit"?: string | null,"image_url"?: string | null,"is_sample"?: boolean,"prompt": string,"prompt_normalized"?: never,"published_at"?: string | null,"slug"?: string | null,"status"?: Database["public"]['Enums']["question_status"],"updated_at"?: string
                  }
                  Update: {
                    "ai_assisted"?: boolean,"approved_at"?: string | null,"approved_by"?: string | null,"category_id"?: string | null,"context"?: string | null,"corrected_at"?: string | null,"correction_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"difficulty"?: Database["public"]['Enums']["difficulty"],"id"?: string,"image_alt"?: string | null,"image_credit"?: string | null,"image_url"?: string | null,"is_sample"?: boolean,"prompt"?: string,"prompt_normalized"?: never,"published_at"?: string | null,"slug"?: string | null,"status"?: Database["public"]['Enums']["question_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_assign_set_question":
{ Args: { "p_admin_id": string,"p_daily_set_id": string,"p_position": number,"p_question_id": string }; Returns: Json
                           },
"admin_correct_answer":
{ Args: { "p_admin_id": string,"p_new_answer": number,"p_public_note": string,"p_question_id": string,"p_reason": string,"p_source_url": string }; Returns: Json
                           },
"admin_publish_daily_set":
{ Args: { "p_admin_id": string,"p_confirm_date": string,"p_daily_set_id": string }; Returns: Json
                           },
"admin_save_question":
{ Args: { "p_admin_id": string,"p_payload": Json,"p_question_id": string }; Returns: Json
                           },
"admin_set_question_status":
{ Args: { "p_admin_id": string,"p_question_id": string,"p_status": string }; Returns: Json
                           },
"admin_set_suspension":
{ Args: { "p_admin_id": string,"p_reason": string,"p_suspend": boolean,"p_user_id": string }; Returns: Json
                           },
"admin_similar_questions":
{ Args: { "p_exclude"?: string,"p_limit"?: number,"p_prompt": string }; Returns: {
              "id": string,"prompt": string,"similarity": number,"status": Database["public"]['Enums']["question_status"]
            }[]
                           },
"admin_unschedule_daily_set":
{ Args: { "p_admin_id": string,"p_daily_set_id": string }; Returns: Json
                           },
"admin_verify_question":
{ Args: { "p_admin_id": string,"p_notes": string,"p_question_id": string }; Returns: Json
                           },
"admin_withdraw_question":
{ Args: { "p_admin_id": string,"p_public_note": string,"p_question_id": string,"p_reason": string }; Returns: Json
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"claim_guest_session":
{ Args: { "p_guest_session_id": string,"p_user_id": string }; Returns: Json
                           },
"get_player_stats":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"leaderboard_alltime":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_username"?: string }; Returns: {
              "avatar_url": string,"best_streak": number,"current_streak": number,"display_name": string,"final_submission_at": string,"games_completed": number,"hard_score": number,"is_public": boolean,"perfect_guesses": number,"rank": number,"total_count": number,"total_score": number,"username": string
            }[]
                           },
"leaderboard_daily":
{ Args: { "p_game_date": string,"p_limit"?: number,"p_offset"?: number,"p_username"?: string }; Returns: {
              "avatar_url": string,"completed_at": string,"display_name": string,"easy_score": number,"hard_score": number,"is_public": boolean,"medium_score": number,"perfect_guesses": number,"rank": number,"total_count": number,"total_score": number,"username": string
            }[]
                           },
"leaderboard_weekly":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_username"?: string,"p_week_start": string }; Returns: {
              "avatar_url": string,"display_name": string,"final_submission_at": string,"games_completed": number,"hard_score": number,"is_public": boolean,"perfect_guesses": number,"rank": number,"total_count": number,"total_score": number,"username": string
            }[]
                           },
"pricele_percentage_error":
{ Args: { "p_answer": number,"p_guess": number }; Returns: number
                           },
"pricele_score":
{ Args: { "p_answer": number,"p_guess": number }; Returns: number
                           },
"run_daily_maintenance":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"submit_official_guess":
{ Args: { "p_guess": number,"p_guest_session_id"?: string,"p_question_id": string,"p_user_id"?: string }; Returns: Json
                           },
"submit_practice_guess":
{ Args: { "p_guess": number,"p_guest_session_id"?: string,"p_question_id": string,"p_user_id"?: string }; Returns: Json
                           },
"validate_daily_set":
{ Args: { "p_daily_set_id": string }; Returns: (string)[]
                           }
          }
          Enums: {
            "app_role": "admin","daily_set_status": "draft"|"scheduled"|"published"|"withdrawn","difficulty": "easy"|"medium"|"hard","question_status": "draft"|"approved"|"published"|"withdrawn"|"archived","verification_status": "unverified"|"verified"|"rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["admin"],"daily_set_status": ["draft", "scheduled", "published", "withdrawn"],"difficulty": ["easy", "medium", "hard"],"question_status": ["draft", "approved", "published", "withdrawn", "archived"],"verification_status": ["unverified", "verified", "rejected"]
          }
        }
} as const
