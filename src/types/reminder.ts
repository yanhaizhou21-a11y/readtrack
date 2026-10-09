import { z } from "zod";
import { LogicalPositionSchema } from "./document";

export type ReminderScheduleType = "daily" | "weekdays" | "custom" | "once";

export const ReminderScheduleTypeSchema = z.enum(["daily", "weekdays", "custom", "once"]);

export interface Reminder {
  id: string;
  documentId: string | null;
  enabled: boolean;
  scheduleType: ReminderScheduleType;
  timeOfDayMin: number | null;
  daysOfWeek: number | null;
  scheduledAt: number | null;
  repeatInterval: number | null;
  createdAt: number;
  updatedAt: number;
}

export const ReminderSchema = z.object({
  id: z.string(),
  documentId: z.string().nullable(),
  enabled: z.boolean(),
  scheduleType: ReminderScheduleTypeSchema,
  timeOfDayMin: z.number().nullable(),
  daysOfWeek: z.number().nullable(),
  scheduledAt: z.number().nullable(),
  repeatInterval: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export interface ReminderUpsertInput {
  id?: string;
  documentId?: string | null;
  enabled?: boolean;
  scheduleType: ReminderScheduleType;
  timeOfDayMin?: number | null;
  daysOfWeek?: number | null;
  scheduledAt?: number | null;
  repeatInterval?: number | null;
}

export const ReminderUpsertInputSchema = z.object({
  id: z.string().optional(),
  documentId: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  scheduleType: ReminderScheduleTypeSchema,
  timeOfDayMin: z.number().min(0).max(1439).nullable().optional(),
  daysOfWeek: z.number().min(1).max(127).nullable().optional(),
  scheduledAt: z.number().positive().nullable().optional(),
  repeatInterval: z.number().positive().nullable().optional(),
});

export const NotificationPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  documentId: z.string().nullable().optional(),
  position: LogicalPositionSchema.nullable().optional(),
});

export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

