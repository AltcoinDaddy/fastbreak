import { Notification } from '@fastbreak/types';
import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  read: boolean;
  created_at: Date;
}

export class NotificationRepository extends BaseRepository<Notification> {
  constructor(db: DatabaseConnection) {
    super(db, 'notifications');
  }

  protected mapRowToEntity(row: NotificationRow): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as 'trade' | 'budget' | 'system' | 'opportunity',
      title: row.title,
      message: row.message,
      priority: row.priority as 'low' | 'medium' | 'high',
      read: row.read,
      createdAt: row.created_at,
    };
  }

  public async createNotification(
    notificationData: Omit<Notification, 'id' | 'createdAt'>
  ): Promise<Notification> {
    const result = await this.db.query(`
      INSERT INTO notifications (user_id, type, title, message, priority, read)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      notificationData.userId,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.priority,
      notificationData.read,
    ]);

    return this.mapRowToEntity(result.rows[0]);
  }

  public async getNotificationsByUser(
    userId: string,
    limit = 50,
    offset = 0,
    unreadOnly = false
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    let whereClause = 'user_id = $1';
    const params: any[] = [userId];

    if (unreadOnly) {
      whereClause += ' AND read = false';
    }

    const [notificationsResult, totalResult, unreadResult] = await Promise.all([
      this.db.query(`
        SELECT * FROM notifications 
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]),
      this.count(whereClause, params),
      this.count('user_id = $1 AND read = false', [userId])
    ]);

    const notifications = notificationsResult.rows.map((row: any) => this.mapRowToEntity(row));

    return {
      notifications,
      total: totalResult,
      unreadCount: unreadResult,
    };
  }

  public async markAsRead(notificationId: string): Promise<Notification | null> {
    const result = await this.db.query(`
      UPDATE notifications 
      SET read = true
      WHERE id = $1
      RETURNING *
    `, [notificationId]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db.query(`
      UPDATE notifications 
      SET read = true
      WHERE user_id = $1 AND read = false
    `, [userId]);

    return result.rowCount || 0;
  }

  public async deleteOldNotifications(daysOld = 30): Promise<number> {
    const result = await this.db.query(`
      DELETE FROM notifications 
      WHERE created_at < NOW() - INTERVAL '$1 days'
    `, [daysOld]);

    return result.rowCount;
  }

  public async getNotificationsByType(
    userId: string,
    type: string,
    limit = 20
  ): Promise<Notification[]> {
    const result = await this.findByCondition(
      'user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3',
      [userId, type, limit]
    );
    return result;
  }

  public async createBulkNotifications(
    notifications: Omit<Notification, 'id' | 'createdAt'>[]
  ): Promise<Notification[]> {
    if (notifications.length === 0) return [];

    const values = notifications.map((_, index) => {
      const baseIndex = index * 6;
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`;
    }).join(', ');

    const params = notifications.flatMap(n => [
      n.userId, n.type, n.title, n.message, n.priority, n.read
    ]);

    const result = await this.db.query(`
      INSERT INTO notifications (user_id, type, title, message, priority, read)
      VALUES ${values}
      RETURNING *
    `, params);

    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }
}