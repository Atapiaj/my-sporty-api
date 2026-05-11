const db = require('../config/db');

exports.getHistorialAmigo = async (req, res) => {
    try {
        const userId = req.user.id;
        const amigoId = req.params.amigoId;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        const [rows] = await db.query(`
            SELECT m.*, u.nombre as emisor_nombre
            FROM mensajes m
            JOIN usuario u ON m.emisor_id = u.id
            WHERE (m.emisor_id = ? AND m.receptor_id = ?)
               OR (m.emisor_id = ? AND m.receptor_id = ?)
            ORDER BY m.fecha_envio DESC
            LIMIT ? OFFSET ?
        `, [userId, amigoId, amigoId, userId, limit, offset]);

        res.json({
            error: false,
            data: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: true, message: 'Error al obtener historial' });
    }
};

exports.getHistorialEquipo = async (req, res) => {
    try {
        const equipoId = req.params.equipoId;

        // Optionally, check if req.user.id is a member of the team here

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        const [rows] = await db.query(`
            SELECT m.*, u.nombre as emisor_nombre, u.url_foto_perfil
            FROM mensajes m
            JOIN usuario u ON m.emisor_id = u.id
            WHERE m.equipo_id = ?
            ORDER BY m.fecha_envio DESC
            LIMIT ? OFFSET ?
        `, [equipoId, limit, offset]);

        res.json({
            error: false,
            data: rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: true, message: 'Error al obtener historial grupal' });
    }
};

exports.getResumen = async (req, res) => {
    try {
        const userId = req.user.id;

        const [amigosMensajes] = await db.query(`
            SELECT 
                CASE WHEN m.emisor_id = ? THEN m.receptor_id ELSE m.emisor_id END AS id,
                SUM(CASE WHEN m.receptor_id = ? AND m.leido = 0 THEN 1 ELSE 0 END) as unread_count,
                MAX(m.id) as last_msg_id
            FROM mensajes m
            WHERE (m.emisor_id = ? AND m.receptor_id IS NOT NULL) 
               OR (m.receptor_id = ? AND m.emisor_id IS NOT NULL)
            GROUP BY id
        `, [userId, userId, userId, userId]);

        const [equiposMensajes] = await db.query(`
            SELECT 
                m.equipo_id as id,
                SUM(CASE WHEN m.fecha_envio > IFNULL(ecl.ultima_lectura, '2000-01-01') AND m.emisor_id != ? THEN 1 ELSE 0 END) as unread_count,
                MAX(m.id) as last_msg_id
            FROM mensajes m
            LEFT JOIN equipo_chat_lecturas ecl ON m.equipo_id = ecl.equipo_id AND ecl.usuario_id = ?
            WHERE m.equipo_id IN (
                SELECT id FROM equipo WHERE propietario_id = ?
                UNION
                SELECT equipo_id FROM miembros_equipo WHERE usuario_id = ? AND activo = 1
            )
            GROUP BY m.equipo_id
        `, [userId, userId, userId, userId]);

        const [campeonatosMensajes] = await db.query(`
            SELECT 
                m.campeonato_id as id,
                SUM(CASE WHEN m.fecha_envio > IFNULL(ccl.ultima_lectura, '2000-01-01') AND m.emisor_id != ? THEN 1 ELSE 0 END) as unread_count,
                MAX(m.id) as last_msg_id
            FROM mensajes m
            LEFT JOIN campeonato_chat_lecturas ccl ON m.campeonato_id = ccl.campeonato_id AND ccl.usuario_id = ?
            WHERE m.campeonato_id IN (
                SELECT id FROM campeonato WHERE propietario_id = ?
                UNION
                SELECT mc.campeonato_id FROM miembros_campeonatos mc 
                JOIN equipo e ON mc.equipo_id = e.id 
                WHERE e.propietario_id = ? AND mc.activo = 1
            )
            GROUP BY m.campeonato_id
        `, [userId, userId, userId, userId]);

        let resumenAmigos = {};
        for (const meta of amigosMensajes) {
            if (meta.last_msg_id) {
                const [lastMsgRows] = await db.query('SELECT mensaje, fecha_envio FROM mensajes WHERE id = ?', [meta.last_msg_id]);
                resumenAmigos[meta.id] = {
                    unread_count: Number(meta.unread_count) || 0,
                    ultimo_mensaje: lastMsgRows[0] ? lastMsgRows[0].mensaje : null,
                    fecha_ultimo_mensaje: lastMsgRows[0] ? lastMsgRows[0].fecha_envio : null
                };
            }
        }

        let resumenEquipos = {};
        for (const meta of equiposMensajes) {
            if (meta.last_msg_id) {
                const [lastMsgRows] = await db.query('SELECT mensaje, fecha_envio FROM mensajes WHERE id = ?', [meta.last_msg_id]);
                resumenEquipos[meta.id] = {
                    unread_count: Number(meta.unread_count) || 0,
                    ultimo_mensaje: lastMsgRows[0] ? lastMsgRows[0].mensaje : null,
                    fecha_ultimo_mensaje: lastMsgRows[0] ? lastMsgRows[0].fecha_envio : null
                };
            }
        }

        let resumenCampeonatos = {};
        for (const meta of campeonatosMensajes) {
            if (meta.last_msg_id) {
                const [lastMsgRows] = await db.query('SELECT mensaje, fecha_envio FROM mensajes WHERE id = ?', [meta.last_msg_id]);
                resumenCampeonatos[meta.id] = {
                    unread_count: Number(meta.unread_count) || 0,
                    ultimo_mensaje: lastMsgRows[0] ? lastMsgRows[0].mensaje : null,
                    fecha_ultimo_mensaje: lastMsgRows[0] ? lastMsgRows[0].fecha_envio : null
                };
            }
        }

        res.json({
            error: false,
            data: {
                amigos: resumenAmigos,
                equipos: resumenEquipos,
                campeonatos: resumenCampeonatos
            }
        });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: true, message: 'Error al obtener resumen de chats' });
    }
};

exports.marcarAmigoLeido = async (req, res) => {
    try {
        const userId = req.user.id;
        const amigoId = req.params.amigoId;
        await db.query('UPDATE mensajes SET leido = 1 WHERE emisor_id = ? AND receptor_id = ? AND leido = 0', [amigoId, userId]);
        res.json({ error: false, message: 'Mensajes marcados' });
    } catch (err) {
        res.status(500).json({ error: true, message: 'Error al marcar leído' });
    }
};

exports.marcarEquipoLeido = async (req, res) => {
    try {
        const userId = req.user.id;
        const equipoId = req.params.equipoId;
        await db.query('INSERT INTO equipo_chat_lecturas (usuario_id, equipo_id, ultima_lectura) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE ultima_lectura = NOW()', [userId, equipoId]);
        res.json({ error: false, message: 'Chat grupal marcado' });
    } catch (err) {
        res.status(500).json({ error: true, message: 'Error al marcar equipo' });
    }
};

exports.getHistorialCampeonato = async (req, res) => {
    try {
        const campeonatoId = req.params.campeonatoId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        const [rows] = await db.query(`
            SELECT m.*, u.nombre as emisor_nombre, u.url_foto_perfil
            FROM mensajes m
            JOIN usuario u ON m.emisor_id = u.id
            WHERE m.campeonato_id = ?
              AND EXISTS (
                SELECT 1 FROM campeonato WHERE id = ? AND propietario_id = ?
                UNION
                SELECT 1 FROM miembros_campeonatos mc 
                JOIN equipo e ON mc.equipo_id = e.id 
                WHERE mc.campeonato_id = ? AND e.propietario_id = ? AND mc.activo = 1
              )
            ORDER BY m.fecha_envio DESC
            LIMIT ? OFFSET ?
        `, [campeonatoId, campeonatoId, req.user.id, campeonatoId, req.user.id, limit, offset]);

        res.json({ error: false, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: true, message: 'Error al obtener historial de campeonato' });
    }
};

exports.marcarCampeonatoLeido = async (req, res) => {
    try {
        const userId = req.user.id;
        const campeonatoId = req.params.campeonatoId;

        // Verify permission
        const [perm] = await db.query(`
            SELECT 1 FROM campeonato WHERE id = ? AND propietario_id = ?
            UNION
            SELECT 1 FROM miembros_campeonatos mc 
            JOIN equipo e ON mc.equipo_id = e.id 
            WHERE mc.campeonato_id = ? AND e.propietario_id = ? AND mc.activo = 1
        `, [campeonatoId, userId, campeonatoId, userId]);

        if (perm.length === 0) {
            return res.status(403).json({ error: true, message: 'No tienes permiso para marcar este chat como leído' });
        }

        await db.query('INSERT INTO campeonato_chat_lecturas (usuario_id, campeonato_id, ultima_lectura) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE ultima_lectura = NOW()', [userId, campeonatoId]);
        res.json({ error: false, message: 'Chat de campeonato marcado' });
    } catch (err) {
        res.status(500).json({ error: true, message: 'Error al marcar campeonato' });
    }
};

exports.getChatMembers = async (req, res) => {
    try {
        const { type, id } = req.params;

        if (type === 'equipo') {
            // Get team members + owner
            const [rows] = await db.query(`
                SELECT u.id, u.nombre, u.url_foto_perfil, 'propietario' as rol
                FROM equipo e
                JOIN usuario u ON e.propietario_id = u.id
                WHERE e.id = ?
                UNION
                SELECT u.id, u.nombre, u.url_foto_perfil, me.rol_usuario as rol
                FROM miembros_equipo me
                JOIN usuario u ON me.usuario_id = u.id
                WHERE me.equipo_id = ? AND me.activo = 1
            `, [id, id]);
            return res.json({ error: false, data: rows });
        } else if (type === 'campeonato') {
            // Get championship organizer + team owners
            const [rows] = await db.query(`
                SELECT u.id, u.nombre, u.url_foto_perfil, 'organizador' as rol
                FROM campeonato c
                JOIN usuario u ON c.propietario_id = u.id
                WHERE c.id = ?
                UNION
                SELECT u.id, u.nombre, u.url_foto_perfil, 'dueño equipo' as rol
                FROM miembros_campeonatos mc
                JOIN equipo e ON mc.equipo_id = e.id
                JOIN usuario u ON e.propietario_id = u.id
                WHERE mc.campeonato_id = ? AND mc.activo = 1
            `, [id, id]);
            return res.json({ error: false, data: rows });
        }

        res.status(400).json({ error: true, message: 'Tipo de chat no válido' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: true, message: 'Error al obtener miembros del chat' });
    }
};
