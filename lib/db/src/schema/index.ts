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

export const tollPlazasTable = pgTable("toll_plazas", {
  id: serial("id").primaryKey(),
  plazaId: text("plaza_id").notNull().unique(),
  name: text("name").notNull(),
  route: text("route").default(""),
  location: text("location").default(""),
  operatorId: text("operator_id").default(""),
  operatorName: text("operator_name").default("Unassigned"),
  workerCount: integer("worker_count").default(0),
  activeDevices: integer("active_devices").default(0),
  attendanceToday: integer("attendance_today").default(0),
  attendancePct: integer("attendance_pct").default(0),
  status: text("status").default("inactive"),
  lastSync: text("last_sync").default("Never"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const operatorsTable = pgTable("operators", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  mobile: text("mobile").default(""),
  email: text("email").default(""),
  plazaId: text("plaza_id").default(""),
  plazaName: text("plaza_name").default("Unassigned"),
  status: text("status").default("pending"),
  lastLogin: text("last_login").default("Never"),
  loginCount: integer("login_count").default(0),
  deviceCount: integer("device_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  deviceName: text("device_name").default(""),
  deviceType: text("device_type").default("android"),
  deviceModel: text("device_model").default(""),
  imei: text("imei").default(""),
  operatorId: text("operator_id").default(""),
  operatorName: text("operator_name").default("Unassigned"),
  plazaName: text("plaza_name").default(""),
  status: text("status").default("pending"),
  lastActive: text("last_active").default("Never"),
  unauthorizedAttempts: integer("unauthorized_attempts").default(0),
  allocatedAt: text("allocated_at").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const securityEventsTable = pgTable("security_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  deviceId: text("device_id").default(""),
  operatorId: text("operator_id").default(""),
  operatorName: text("operator_name").default(""),
  severity: text("severity").default("medium"),
  resolved: integer("resolved").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  targetType: text("target_type").default(""),
  targetId: text("target_id").default(""),
  details: text("details").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true });
export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });
export const insertTollPlazaSchema = createInsertSchema(tollPlazasTable).omit({ id: true, createdAt: true });
export const insertOperatorSchema = createInsertSchema(operatorsTable).omit({ id: true, createdAt: true });
export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true });
export const insertSecurityEventSchema = createInsertSchema(securityEventsTable).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });

export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type InsertTollPlaza = z.infer<typeof insertTollPlazaSchema>;
export type InsertOperator = z.infer<typeof insertOperatorSchema>;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type DbWorker = typeof workersTable.$inferSelect;
export type DbAttendance = typeof attendanceTable.$inferSelect;
export type DbTollPlaza = typeof tollPlazasTable.$inferSelect;
export type DbOperator = typeof operatorsTable.$inferSelect;
export type DbDevice = typeof devicesTable.$inferSelect;
export type DbSecurityEvent = typeof securityEventsTable.$inferSelect;
export type DbAuditLog = typeof auditLogsTable.$inferSelect;
