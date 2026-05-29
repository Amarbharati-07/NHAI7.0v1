import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  workerId: text("worker_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").default(""),
  department: text("department").default(""),
  contractorName: text("contractor_name").default(""),
  employeeType: text("employee_type").default(""),
  siteLocation: text("site_location").default(""),
  plazaId: text("plaza_id").default(""),
  operatorId: text("operator_id").default(""),
  deviceToken: text("device_token").default(""),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  mobileWorkerId: integer("mobile_worker_id").notNull(),
  workerIdCode: text("worker_id_code").default(""),
  date: text("date").notNull(),
  time: text("time").notNull(),
  status: text("status").default("present"),
  plazaId: text("plaza_id").default(""),
  operatorId: text("operator_id").default(""),
  deviceToken: text("device_token").default(""),
  latitude: text("latitude").default(""),
  longitude: text("longitude").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true });
export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });

export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type DbWorker = typeof workersTable.$inferSelect;
export type DbAttendance = typeof attendanceTable.$inferSelect;
