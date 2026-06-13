const db = require('../config/db');

class MiembrosEquipoController {
    static async index(req, res) {
        try {
            const equipoId = req.query.equipo_id;
            if (!equipoId) return res.status(400).json({ status: 400, message: 'equipo_id es obligatorio' });

            const [miembros] = await db.query(`
                SELECT me.*, u.nombre as usuario_nombre, u.correo 
                FROM miembros_equipo me
                JOIN usuario u ON me.usuario_id = u.id
                WHERE me.equipo_id = ? AND me.activo = 1
            `, [equipoId]);

            return res.json({ status: 200, message: 'Miembros obtenidos', data: { miembros } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', data: { detalles: error.message } });
        }
    }

    static async store(req, res) {
        try {
            const data = req.body;
            if (!data.usuario_id || !data.equipo_id) return res.status(400).json({ status: 400, message: 'Falta usuario_id o equipo_id' });

            const [existente] = await db.query('SELECT * FROM miembros_equipo WHERE usuario_id = ? AND equipo_id = ?', [data.usuario_id, data.equipo_id]);
            
            if (existente.length > 0) {
                if (existente[0].activo == 1) return res.status(409).json({ status: 409, message: 'El usuario ya es miembro' });
                else {
                    await db.query('UPDATE miembros_equipo SET activo = 1, rol_usuario = ? WHERE id = ?', [data.rol_usuario || 'jugador', existente[0].id]);
                    return res.status(201).json({ status: 201, message: 'Agregado' });
                }
            }

            await db.query('INSERT INTO miembros_equipo (usuario_id, equipo_id, rol_usuario, activo) VALUES (?, ?, ?, 1)', [data.usuario_id, data.equipo_id, data.rol_usuario || 'jugador']);
            return res.status(201).json({ status: 201, message: 'Agregado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', data: { detalles: error.message } });
        }
    }

    static async update(req, res) {
        try {
            const data = req.body;
            if (!data.usuario_id || !data.equipo_id || !data.rol_usuario) return res.status(400).json({ status: 400, message: 'Faltan campos' });

            if (data.rol_usuario === 'capitan') {
                await db.query('UPDATE miembros_equipo SET rol_usuario = "jugador" WHERE equipo_id = ? AND rol_usuario = "capitan" AND activo = 1', [data.equipo_id]);
            }

            const [result] = await db.query('UPDATE miembros_equipo SET rol_usuario = ? WHERE usuario_id = ? AND equipo_id = ? AND activo = 1', [data.rol_usuario, data.usuario_id, data.equipo_id]);
            
            if (result.affectedRows > 0) return res.json({ status: 200, message: 'Rol actualizado' });
            return res.status(404).json({ status: 404, message: 'No encontrado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', data: null });
        }
    }

    static async delete(req, res) {
        try {
            const data = req.body;
            if (!data.usuario_id || !data.equipo_id) return res.status(400).json({ status: 400, message: 'Faltan campos' });

            const [result] = await db.query('UPDATE miembros_equipo SET activo = 0 WHERE usuario_id = ? AND equipo_id = ? AND activo = 1', [data.usuario_id, data.equipo_id]);
            if (result.affectedRows > 0) return res.json({ status: 200, message: 'Removido' });
            return res.status(404).json({ status: 404, message: 'No encontrado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', data: null });
        }
    }
}
module.exports = MiembrosEquipoController;
