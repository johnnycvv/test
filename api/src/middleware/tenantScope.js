const db = require('../db/postgres');

/**
 * Attaches a tenant-scoped query helper to req.db.
 * Every query is automatically filtered to the authenticated tenant.
 */
module.exports = function tenantScope(req, res, next) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: 'Not authenticated' });

  req.tenantId = tenantId;
  req.db = {
    /** Raw query with tenant injection */
    query: (text, params = []) => db.query(text, params),

    /** SELECT * FROM table WHERE tenant_id = ? [AND extra conditions] */
    async find(table, where = {}, orderBy = 'created_at DESC') {
      const keys = Object.keys(where);
      const vals = [tenantId, ...Object.values(where)];
      const cond = keys.map((k, i) => `"${k}" = $${i + 2}`).join(' AND ');
      const sql = `SELECT * FROM "${table}" WHERE tenant_id = $1${cond ? ' AND ' + cond : ''} ORDER BY ${orderBy}`;
      const result = await db.query(sql, vals);
      return result.rows;
    },

    /** SELECT * FROM table WHERE tenant_id = ? AND id = ? */
    async findOne(table, id) {
      const result = await db.query(
        `SELECT * FROM "${table}" WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );
      return result.rows[0] || null;
    },

    /** INSERT INTO table (cols...) VALUES (...) RETURNING * */
    async insert(table, data) {
      const payload = { ...data, tenant_id: tenantId };
      const keys = Object.keys(payload);
      const vals = Object.values(payload);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const result = await db.query(
        `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      return result.rows[0];
    },

    /** UPDATE table SET ... WHERE tenant_id = ? AND id = ? RETURNING * */
    async update(table, id, data) {
      const keys = Object.keys(data);
      const vals = [...Object.values(data), tenantId, id];
      const set = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
      const result = await db.query(
        `UPDATE "${table}" SET ${set}, updated_at = now() WHERE tenant_id = $${keys.length + 1} AND id = $${keys.length + 2} RETURNING *`,
        vals
      );
      return result.rows[0] || null;
    },

    /** DELETE FROM table WHERE tenant_id = ? AND id = ? */
    async delete(table, id) {
      const result = await db.query(
        `DELETE FROM "${table}" WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenantId, id]
      );
      return result.rowCount > 0;
    },
  };

  next();
};
