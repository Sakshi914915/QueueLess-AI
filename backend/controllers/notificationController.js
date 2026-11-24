const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHelper');

/**
 * Get Notifications for Current User
 */
const getNotifications = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, token_id, type, title, message, is_read, channel, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const unreadCount = rows.filter(n => !n.is_read).length;

    return successResponse(res, 'Notifications retrieved.', {
      notifications: rows,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mark Notification as Read
 */
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    return successResponse(res, 'Notification marked as read.');
  } catch (error) {
    next(error);
  }
};

/**
 * Mark All Notifications as Read
 */
const markAllAsRead = async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [req.user.id]
    );

    return successResponse(res, 'All notifications marked as read.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead
};
