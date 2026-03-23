// This file is a placeholder for Supabase generated types.
// To generate proper types, run:
//   npx supabase gen types typescript --project-id <your-project-id> > app/types/database.types.ts
//
// For now, we export a stub to prevent TypeScript compilation errors.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: Record<string, unknown>
    Views: Record<string, unknown>
    Functions: Record<string, unknown>
    Enums: Record<string, unknown>
    CompositeTypes: Record<string, unknown>
  }
}