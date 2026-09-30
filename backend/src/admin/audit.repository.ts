import { randomUUID } from 'node:crypto';

import type { AuditAction, AuditDetails, AuditEntry, AuditTargetType, Page } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { ADMIN_PAGE_SIZE, offsetOf, toPage } from './paging';

export type NewAuditEntry = {
  adminId: string | null; // null = consola del servidor
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: AuditDetails;
  createdAt: string;
};

type AuditRow = {
  id: string;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: string;
  details: string;
  created_at: string;
  admin_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
};

const toEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  action: r.action,
  admin: r.admin_id === null ? null : { id: r.admin_id, name: r.admin_name ?? '', email: r.admin_email ?? '' },
  targetType: r.target_type,
  targetId: r.target_id,
  details: JSON.parse(r.details) as AuditDetails,
  createdAt: r.created_at,
});

export function auditRepository(db: Db) {
  return {
    // Se llama DENTRO de la transacción de la acción (db.transaction): si no se puede anotar, la acción se deshace (D5).
    async record(entry: NewAuditEntry): Promise<void> {
      await db.query(
        'INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [randomUUID(), entry.adminId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.details), entry.createdAt],
      );
    },

    // Lo más reciente primero; a igual fecha, lo anotado después.
    async list(page: number): Promise<Page<AuditEntry>> {
      const { total } = (await db.one<{ total: number }>('SELECT COUNT(*) AS total FROM admin_audit_log'))!;
      const rows = await db.many<AuditRow>(
        `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
                u.id AS admin_id, u.name AS admin_name, u.email AS admin_email
         FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_id
         ORDER BY a.created_at DESC, a.rowid DESC
         LIMIT $1 OFFSET $2`,
        [ADMIN_PAGE_SIZE, offsetOf(page)],
      );
      return toPage(rows.map(toEntry), page, total);
    },
  };
}
