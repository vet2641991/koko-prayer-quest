// Row shapes of the tables the dashboard reads (see supabase/migrations).
import type { LessonRow } from '@koko/shared';

export type Status = 'draft' | 'published' | 'archived';
export type WorldRec = { id: string; display_code: string | null; en: string; ar: string; tint: string; ink: string; sort: number; status: Status; extra: Record<string, unknown>; updated_at: string };
export type UnitRec = { id: string; world_id: string; n: string; ar: string; en: string; go_world_id: string | null; sort: number; status: Status; extra: Record<string, unknown>; file_path: string; updated_at: string };
export type LessonRec = LessonRow & { status: Status; updated_at: string; updated_by: string | null };
export type MediaRec = { id: string; path: string; kind: string; lesson_id: string | null; sacred: boolean; approved_by: string | null; approved_by_name: string | null; approved_at: string | null; approval_note: string | null; storage: 'static' | 'supabase'; storage_object: string | null; bytes: number | null; sha256: string | null; updated_at: string };
export type PromoRec = { id: string; text_en: string; url: string; placement: 'after_lesson' | 'map' | 'parents'; active: boolean; sort: number; status: Status; extra: Record<string, unknown>; updated_at: string };
export type AdminRec = { user_id: string; email: string; display_name: string; role: string; active: boolean; created_at: string };
export type RoleRec = { id: string; label_en: string; label_ar: string; can_edit_content: boolean; can_publish: boolean; can_approve_sacred: boolean; can_manage_admins: boolean; sort: number };
export type PublishedRec = { kind: string; id: string; world_id: string | null; sort: number | null; document: Record<string, unknown>; published_at: string };
export type AuditRec = { id: number; at: string; actor_label: string; action: string; event: string | null; table_name: string; row_id: string; changed: string[] | null; old_values: unknown; new_values: unknown };
