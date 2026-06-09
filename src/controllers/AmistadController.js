const db = require('../config/db');

class AmistadController {
    static async index(req, res) {
        try {
            const usuarioId = req.query.usuario_id || req.user.id;
            const [amigos] = await db.query(`
                SELECT u.id, u.nombre, u.correo, u.url_foto_perfil
                FROM amistad a
                JOIN usuario u ON (
                    (a.usuario1_id = ? AND u.id = a.usuario2_id)
                    OR
                    (a.usuario2_id = ? AND u.id = a.usuario1_id)
                )
                WHERE a.activo = 1
            `, [usuarioId, usuarioId]);

            return res.json({ status: 200, message: 'Amigos obtenidos correctamente', data: { amigos } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener amistades', data: { detalles: error.message } });
        }
    }

    static async equipos(req, res) {
        try {
            const usuarioId = req.user.id;
            const [equipos] = await db.query(`
                SELECT DISTINCT e.id, e.nombre, e.descripcion, e.url_logo
                FROM amistad a
                JOIN usuario u ON (
                    (a.usuario1_id = ? AND u.id = a.usuario2_id)
                    OR
                    (a.usuario2_id = ? AND u.id = a.usuario1_id)
                )
                JOIN equipo e ON u.id = e.propietario_id
                WHERE a.activo = 1
            `, [usuarioId, usuarioId]);

            if (equipos.length === 0) {
                return res.status(404).json({ status: 404, message: 'No tienes equipos de amigos', data: null });
            }

            return res.json({ status: 200, message: 'Equipos de amigos obtenidos correctamente', data: equipos });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener equipos de amistades', details: error.message });
        }
    }

    static async store(req, res) {
        const data = req.body;
        if (!data.usuario_id) {
            return res.status(400).json({ status: 400, message: 'Falta el ID del otro usuario', data: null });
        }

        const usuarioIdA = req.user.id;
        const usuarioIdB = parseInt(data.usuario_id, 10);

        if (usuarioIdA === usuarioIdB) {
            return res.status(400).json({ status: 400, message: 'No puedes ser amigo de ti mismo', data: null });
        }

        const u1 = Math.min(usuarioIdA, usuarioIdB);
        const u2 = Math.max(usuarioIdA, usuarioIdB);

        try {
            const [existente] = await db.query('SELECT id FROM amistad WHERE usuario1_id = ? AND usuario2_id = ? AND activo = 1', [u1, u2]);
            if (existente.length > 0) {
                return res.status(409).json({ status: 409, message: 'La amistad ya existe', data: null });
            }

            // Also check if they had a previous inactive friendship to reactivate, else insert
            const [inactiva] = await db.query('SELECT id FROM amistad WHERE usuario1_id = ? AND usuario2_id = ?', [u1, u2]);
            if (inactiva.length > 0) {
                await db.query('UPDATE amistad SET activo = 1 WHERE id = ?', [inactiva[0].id]);
            } else {
                await db.query('INSERT INTO amistad (usuario1_id, usuario2_id) VALUES (?, ?)', [u1, u2]);
            }

            return res.status(201).json({ status: 201, message: 'Amistad creada exitosamente', data: null });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al crear amistad', data: { detalles: error.message } });
        }
    }

    static async delete(req, res) {
        const id = parseInt(req.params.id, 10);
        const usuarioIdA = req.user.id;
        const usuarioIdB = id;

        const u1 = Math.min(usuarioIdA, usuarioIdB);
        const u2 = Math.max(usuarioIdA, usuarioIdB);

        try {
            const [result] = await db.query('UPDATE amistad SET activo = 0 WHERE usuario1_id = ? AND usuario2_id = ? AND activo = 1', [u1, u2]);
            if (result.affectedRows > 0) {
                return res.json({ status: 200, message: 'Amistad eliminada correctamente', data: null });
            } else {
                return res.status(404).json({ status: 404, message: 'Amistad no encontrada', data: null });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al eliminar amistad', data: { detalles: error.message } });
        }
    }
}

module.exports = AmistadController;
