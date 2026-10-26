import { z } from "zod";
import { opt } from "./zod-helpers";
import { LogicalPositionSchema } from "./document";

export type ReminderScheduleType = "daily" | "weekdays" | "custom" | "once";

export const ReminderScheduleTypeSchema = z.enum(["daily", "weekdays", "custom", "once"]);

export interface Reminder {
  id: string;
  documentId?: string;
  enabled: boolean;
  scheduleType: ReminderScheduleType;
  timeOfDayMin?: number;
  daysOfWeek?: number;
  scheduledAt?: number;
  repeatInterval?: number;
  createdAt: number;
  updatedAt: number;
}

export const ReminderSchema = z.object({
  id: z.string().min(1),
  documentId: opt(z.string()),
  enabled: z.boolean(),
  scheduleType: ReminderScheduleTypeSchema,
  timeOfDayMin: opt(z.number().min(0).max(1439)),
  daysOfWeek: opt(z.number().min(1).max(127)),
  scheduledAt: opt(z.number()),
  repeatInterval: opt(z.number()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export interface ReminderUpsertInput {
  id?: string;
  documentId?: string;
  enabled?: boolean;
  scheduleType: ReminderScheduleType;
  timeOfDayMin?: number;
  daysOfWeek?: number;
  scheduledAt?: number;
  repeatInterval?: number;
}

export const ReminderUpsertInputSchema = z.object({
  id: opt(z.string()),
  documentId: opt(z.string()),
  enabled: opt(z.boolean()),
  scheduleType: ReminderScheduleTypeSchema,
  timeOfDayMin: opt(z.number().min(0).max(1439)),
  daysOfWeek: opt(z.number().min(1).max(127)),
  scheduledAt: opt(z.number().positive()),
  repeatInterval: opt(z.number().positive()),
});

export const NotificationPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  documentId: opt(z.string()),
  position: opt(LogicalPositionSchema),
});
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;
