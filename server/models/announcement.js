const pool = require('../config/database');

const Announcement = {
  async create({ title, content, type, status, startDate, endDate }) {
    const [result] = await pool.query(
      `INSERT INTO announcements (title, content, type, status, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, content, type || 'popup', status || 'active', startDate || null, endDate || null]
    );
    return result.insertId;
  },

  async update(id, fields) {
    const sets = [];
    const values = [];
    if (fields.title !== undefined) { sets.push('title = ?'); values.push(fields.title); }
    if (fields.content !== undefined) { sets.push('content = ?'); values.push(fields.content); }
    if (fields.type !== undefined) { sets.push('type = ?'); values.push(fields.type); }
    if (fields.status !== undefined) { sets.push('status = ?'); values.push(fields.status); }
    if (fields.startDate !== undefined) { sets.push('start_date = ?'); values.push(fields.startDate); }
    if (fields.endDate !== undefined) { sets.push('end_date = ?'); values.push(fields.endDate); }
    if (sets.length === 0) return;
    values.push(id);
    await pool.query(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`, values);
  },

  async delete(id) {
    await pool.query('DELETE FROM announcements WHERE id = ?', [id]);
  },

  async republish(id) {
    await pool.query(
      'UPDATE announcements SET publish_version = publish_version + 1, updated_at = NOW() WHERE id = ?',
      [id]
    );
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM announcements WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findAll({ page = 1, pageSize = 20, keyword = '', status = '' } = {}) {
    const conditions = [];
    const values = [];
    if (keyword) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM announcements ${where}`, values);
    const total = countRows[0].total;

    const offset = (page - 1) * pageSize;
    const [rows] = await pool.query(
      `SELECT * FROM announcements ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, Number(pageSize), Number(offset)]
    );
    return { list: rows, total, page: Number(page), pageSize: Number(pageSize) };
  },

  async findActive() {
    const now = new Date();
    const [rows] = await pool.query(
      `SELECT * FROM announcements
       WHERE status = 'active'
         AND (start_date IS NULL OR start_date <= ?)
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY created_at DESC`,
      [now, now]
    );
    return rows;
  }
};

module.exports = Announcement;