const db = require('../config/db');
const socketManager = require('../sockets/socketManager');

class SolicitudAmistadController {
    static async index(req, res) {
        try {
            const [solicitudes] = await db.query(`
                SELECT sa.*, u.nombre AS nombre_remitente
                FROM solicitud_amistad sa
                JOIN usuario u ON u.id = sa.de_usuario_id
                WHERE sa.para_usuario_id = ? AND sa.estado = 'pendiente'
                ORDER BY sa.fecha_envio DESC
            `, [req.user.id]);

            return res.json({ status: 200, message: 'Solicitudes obtenidas correctamente', data: { solicitudes } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener solicitudes', data: null });
        }
    }

    static async store(req, res) {
        const data = req.body;
        if (!data.para_usuario_id) {
            return res.status(400).json({ status: 400, message: 'Falta el ID del destinatario', data: null });
        }

        const de = req.user.id;
        const para = parseInt(data.para_usuario_id, 10);

        if (de === para) {
            return res.status(400).json({ status: 400, message: 'No puedes enviarte una solicitud a ti mismo', data: null });
        }

        try {
            const [existente] = await db.query(`
                SELECT * FROM solicitud_amistad 
                WHERE ((de_usuario_id = ? AND para_usuario_id = ?) 
                   OR (de_usuario_id = ? AND para_usuario_id = ?))
                  AND estado = 'pendiente'
            `, [de, para, para, de]);

            if (existente.length > 0) {
                return res.status(409).json({ status: 409, message: 'Ya existe una solicitud pendiente entre estos usuarios', data: null });
            }

            await db.query(`
                INSERT INTO solicitud_amistad (de_usuario_id, para_usuario_id, estado, fecha_envio) 
                VALUES (?, ?, 'pendiente', NOW())
            `, [de, para]);

            // Emitir notificación vía Socket
            socketManager.notifyUser(para, 'nueva_notificacion');

            return res.status(201).json({ status: 201, message: 'Solicitud enviada correctamente', data: null });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al enviar solicitud', data: { detalles: error.message } });
        }
    }

    static async update(req, res) {
        const id = req.params.id;
        const data = req.body;
        const validStates = ['aceptado', 'rechazado'];

        if (!validStates.includes(data.estado)) {
            return res.status(400).json({ status: 400, message: 'Estado inválido', data: null });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [updateResult] = await connection.query(`
                UPDATE solicitud_amistad
                SET estado = ?, fecha_respuesta = NOW()
                WHERE id = ? AND para_usuario_id = ?
            `, [data.estado, id, req.user.id]);

            if (updateResult.affectedRows > 0) {
                if (data.estado === 'aceptado') {
                    const [solicitudes] = await connection.query('SELECT de_usuario_id FROM solicitud_amistad WHERE id = ?', [id]);
                    const deUsuarioId = solicitudes[0].de_usuario_id;
                    
                    const u1 = Math.min(req.user.id, deUsuarioId);
                    const u2 = Math.max(req.user.id, deUsuarioId);

                    const [amistadExistente] = await connection.query('SELECT id FROM amistad WHERE usuario1_id = ? AND usuario2_id = ?', [u1, u2]);
                    if (amistadExistente.length > 0) {
                        await connection.query('UPDATE amistad SET activo = 1 WHERE id = ?', [amistadExistente[0].id]);
                    } else {
                        await connection.query('INSERT INTO amistad (usuario1_id, usuario2_id) VALUES (?, ?)', [u1, u2]);
                    }

                    // Notificar al remitente original para que refresque su lista de amigos
                    socketManager.notifyUser(deUsuarioId, 'amistad_aceptada');
                }

                await connection.query('DELETE FROM solicitud_amistad WHERE id = ?', [id]);
                await connection.commit();

                return res.json({ status: 200, message: 'Solicitud procesada y eliminada correctamente', data: null });
            } else {
                await connection.rollback();
                return res.status(404).json({ status: 404, message: 'Solicitud no encontrada o no autorizada', data: null });
            }
        } catch (error) {
            await connection.rollback();
            return res.status(500).json({ status: 500, message: 'Error al actualizar solicitud', data: null });
        } finally {
            connection.release();
        }
    }

    static async delete(req, res) {
        const id = req.params.id;
        try {
            const [result] = await db.query(`
                DELETE FROM solicitud_amistad 
                WHERE id = ? AND (de_usuario_id = ? OR para_usuario_id = ?)
            `, [id, req.user.id, req.user.id]);

            if (result.affectedRows > 0) {
                return res.json({ status: 200, message: 'Solicitud eliminada correctamente', data: null });
            } else {
                return res.status(404).json({ status: 404, message: 'No autorizad@ o solicitud inexistente', data: null });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al eliminar solicitud', data: null });
        }
    }
}

module.exports = SolicitudAmistadController;
