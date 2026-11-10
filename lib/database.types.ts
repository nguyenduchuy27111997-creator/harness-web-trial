
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "book_shelves": {
                  Row: {
                    "book_id": string,"created_at": string,"shelf_id": string,"user_id": string
                  }
                  Insert: {
                    "book_id": string,"created_at"?: string,"shelf_id": string,"user_id"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"shelf_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_shelves_book_id_user_id_fkey"
      columns: ["book_id","user_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "book_shelves_shelf_id_user_id_fkey"
      columns: ["shelf_id","user_id"]
isOneToOne: false
      referencedRelation: "shelves"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"book_tags": {
                  Row: {
                    "book_id": string,"created_at": string,"tag_id": string,"user_id": string
                  }
                  Insert: {
                    "book_id": string,"created_at"?: string,"tag_id": string,"user_id"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"tag_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_tags_book_id_user_id_fkey"
      columns: ["book_id","user_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "book_tags_tag_id_user_id_fkey"
      columns: ["tag_id","user_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"books": {
                  Row: {
                    "author": string,"created_at": string,"current_page": number | null,"finished_on": string | null,"id": string,"rating": number | null,"review": string | null,"started_on": string | null,"status": string,"title": string,"total_pages": number | null,"user_id": string
                  }
                  Insert: {
                    "author": string,"created_at"?: string,"current_page"?: number | null,"finished_on"?: string | null,"id"?: string,"rating"?: number | null,"review"?: string | null,"started_on"?: string | null,"status"?: string,"title": string,"total_pages"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "author"?: string,"created_at"?: string,"current_page"?: number | null,"finished_on"?: string | null,"id"?: string,"rating"?: number | null,"review"?: string | null,"started_on"?: string | null,"status"?: string,"title"?: string,"total_pages"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notes": {
                  Row: {
                    "body": string,"book_id": string,"created_at": string,"id": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"book_id": string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"book_id"?: string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_book_id_user_id_fkey"
      columns: ["book_id","user_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "display_name": string,"user_id": string
                  }
                  Insert: {
                    "display_name": string,"user_id"?: string
                  }
                  Update: {
                    "display_name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"quotes": {
                  Row: {
                    "body": string,"book_id": string,"created_at": string,"id": string,"page": number | null,"user_id": string
                  }
                  Insert: {
                    "body": string,"book_id": string,"created_at"?: string,"id"?: string,"page"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"book_id"?: string,"created_at"?: string,"id"?: string,"page"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_book_id_user_id_fkey"
      columns: ["book_id","user_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"reading_goals": {
                  Row: {
                    "created_at": string,"goal": number,"user_id": string,"year": number
                  }
                  Insert: {
                    "created_at"?: string,"goal": number,"user_id"?: string,"year": number
                  }
                  Update: {
                    "created_at"?: string,"goal"?: number,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"reads": {
                  Row: {
                    "book_id": string,"created_at": string,"finished_on": string,"id": string,"rating": number | null,"started_on": string | null,"user_id": string
                  }
                  Insert: {
                    "book_id": string,"created_at"?: string,"finished_on": string,"id"?: string,"rating"?: number | null,"started_on"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"finished_on"?: string,"id"?: string,"rating"?: number | null,"started_on"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reads_book_id_user_id_fkey"
      columns: ["book_id","user_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"shelves": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tags": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"up_next": {
                  Row: {
                    "book_id": string,"created_at": string,"position": number,"user_id": string
                  }
                  Insert: {
                    "book_id": string,"created_at"?: string,"position": number,"user_id"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "up_next_book_id_user_id_fkey"
      columns: ["book_id","user_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "import_books":
{ Args: { "p_rows": Json }; Returns: number
                           },
"move_up_next":
{ Args: { "p_book_id": string,"p_up": boolean }; Returns: boolean
                           },
"read_again":
{ Args: { "p_book_id": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
