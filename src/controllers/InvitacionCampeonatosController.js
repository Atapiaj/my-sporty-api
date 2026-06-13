const db = require('../config/db');
const FixtureService = require('../services/FixtureService');
const socketManager = require('../sockets/socketManager');

class InvitacionCampeonatosController {
    static async index(req, res) {
        try {
            const [invitaciones] = await db.query(`
                SELECT ic.*, u.nombre as de_usuario_nombre, c.nombre as campeonato_nombre 
                FROM invitacion_campeonatos ic 
                JOIN usuario u ON ic.de_usuario_id = u.id 
                JOIN campeonato c ON ic.campeonato_id = c.id 
                WHERE ic.para_usuario_id = ? AND ic.estado = 'pendiente' AND ic.tipo = 'invitacion'
            `, [req.user.id]);
            return res.json({ status: 200, message: 'Invitaciones obtenidas', data: invitaciones });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }

    static async store(req, res) {
        try {
            const data = req.body;
            if (!data.id_campeonato || !data.id_usuario || !data.equipo_id) {
                return res.status(400).json({ status: 400, message: 'Faltan campos' });
            }

            const [existente] = await db.query("SELECT * FROM invitacion_campeonatos WHERE para_usuario_id = ? AND campeonato_id = ? AND estado = 'pendiente'", [data.id_usuario, data.id_campeonato]);
            if (existente.length > 0) return res.status(409).json({ status: 409, message: 'La invitación ya existe', data: null });

            await db.query(`
                INSERT INTO invitacion_campeonatos (campeonato_id, equipo_id, de_usuario_id, para_usuario_id, mensaje, estado, tipo, fecha_envio) 
                VALUES (?, ?, ?, ?, ?, 'pendiente', 'invitacion', NOW())
            `, [data.id_campeonato, data.equipo_id, req.user.id, data.id_usuario, data.mensaje || null]);

            socketManager.notifyUser(data.id_usuario, 'nueva_notificacion');

            return res.status(201).json({ status: 201, message: 'Creado' });
        } catch (error) {
            console.error('[Error InvitacionCampeonatos store]', error);
            return res.status(500).json({ status: 500, message: 'Error', details: error.message, code: error.code });
        }
    }

    static async update(req, res) {
        const connection = await db.getConnection();
        try {
            const id = req.params.id;
            const data = req.body;
            const estado = data.estado;

            if (!['aceptado', 'rechazado'].includes(estado)) {
                return res.status(400).json({ status: 400, message: 'Estado inválido' });
            }

            await connection.beginTransaction();

            const [invCheck] = await connection.query('SELECT * FROM invitacion_campeonatos WHERE id = ?', [id]);
            if (!invCheck[0]) {
                await connection.rollback();
                return res.status(404).json({ status: 404, message: 'No encontrado' });
            }

            if (estado === 'aceptado') {
                const [miembroExistente] = await connection.query('SELECT * FROM miembros_campeonatos WHERE equipo_id = ? AND campeonato_id = ?', [invCheck[0].equipo_id, invCheck[0].campeonato_id]);
                if (miembroExistente.length > 0) {
                    await connection.query('UPDATE miembros_campeonatos SET activo = 1 WHERE id = ?', [miembroExistente[0].id]);
                } else {
                    await connection.query('INSERT INTO miembros_campeonatos (campeonato_id, equipo_id, activo, fecha_ingreso) VALUES (?, ?, 1, NOW())', [invCheck[0].campeonato_id, invCheck[0].equipo_id]);
                }

                // Check if championship is now full, and close inscriptions if so
                const [campData] = await connection.query('SELECT numero_equipos, tipo_actividad FROM campeonato WHERE id = ?', [invCheck[0].campeonato_id]);
                const [countData] = await connection.query("SELECT COUNT(*) as total FROM miembros_campeonatos WHERE campeonato_id = ? AND activo = 1", [invCheck[0].campeonato_id]);
                const maxEquipos = campData[0]?.numero_equipos;
                
                if (campData[0]?.tipo_actividad === 'partido') {
                    // Update the match with the away team
                    const [partidos] = await connection.query(`
                        SELECT p.id FROM partidos p 
                        JOIN fases f ON p.fase_id = f.id 
                        WHERE f.campeonato_id = ?
                    `, [invCheck[0].campeonato_id]);
                    if (partidos.length > 0) {
                        await connection.query('UPDATE partidos SET equipo_visitante_id = ? WHERE id = ?', [invCheck[0].equipo_id, partidos[0].id]);
                    }
                    // A match only has 2 teams
                    if (countData[0].total >= 2) {
                        await connection.query('UPDATE campeonato SET inscripciones_abiertas = 0 WHERE id = ?', [invCheck[0].campeonato_id]);
                    }
                    await connection.query('DELETE FROM invitacion_campeonatos WHERE id = ?', [id]);
                    await connection.commit();
                    return res.json({ status: 200, message: 'Actualizado y partido programado' });
                } else {
                    if (maxEquipos != null && maxEquipos > 0 && countData[0].total >= maxEquipos) {
                        await connection.query('UPDATE campeonato SET inscripciones_abiertas = 0 WHERE id = ?', [invCheck[0].campeonato_id]);
                    }

                    await connection.query('DELETE FROM invitacion_campeonatos WHERE id = ?', [id]);

                    // Regenerate fixture due to new team
                    await connection.commit(); // commit current changes first since regenerate creates its own transaction
                    await FixtureService.regenerate(invCheck[0].campeonato_id);
                    return res.json({ status: 200, message: 'Actualizado y fixture regenerado' });
                }
            }

            await connection.query('DELETE FROM invitacion_campeonatos WHERE id = ?', [id]);
            
            await connection.commit();
            return res.json({ status: 200, message: 'Actualizado' });
        } catch (error) {
            await connection.rollback();
            console.error('[Error update InvitacionCampeonatos]', error);
            return res.status(500).json({ status: 500, message: 'Error', details: error.message, code: error.code });
        } finally {
            connection.release();
        }
    }

    static async delete(req, res) {
        try {
            const [result] = await db.query('DELETE FROM invitacion_campeonatos WHERE id = ? AND para_usuario_id = ?', [req.params.id, req.user.id]);
            if (result.affectedRows > 0) return res.json({ status: 200, message: 'Eliminado' });
            return res.status(404).json({ status: 404, message: 'No encontrado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }

    /**
     * User requests to join a public championship with one of their teams.
     * The invitation "para_usuario_id" is set to the championship owner so THEY receive it.
     * Campo tipo = 'solicitud_union' distinguishes it from an owner-to-user invitation.
     */
    static async storeSolicitudUnion(req, res) {
        try {
            const { campeonato_id, equipo_id } = req.body;
            if (!campeonato_id || !equipo_id) {
                return res.status(400).json({ status: 400, message: 'campeonato_id y equipo_id son requeridos' });
            }

            // Check championship exists, is public, and has slots
            const [camps] = await db.query('SELECT * FROM campeonato WHERE id = ?', [campeonato_id]);
            const camp = camps[0];
            if (!camp) return res.status(404).json({ status: 404, message: 'Campeonato no encontrado' });
            if (camp.inscripciones_abiertas != 1) return res.status(409).json({ status: 409, message: 'Las inscripciones no están abiertas' });

            // VALIDATION: Sport match
            const [equipos] = await db.query('SELECT * FROM equipo WHERE id = ?', [equipo_id]);
            const equipo = equipos[0];
            if (!equipo) return res.status(404).json({ status: 404, message: 'Equipo no encontrado' });
            if (equipo.deporte !== camp.deporte) {
                return res.status(422).json({ status: 422, message: `El deporte del equipo (${equipo.deporte}) no coincide con el del campeonato (${camp.deporte})` });
            }

            // VALIDATION: User already in ANY inscribed team in this championship (as owner or member)
            const [alreadyInscribed] = await db.query(`
                SELECT mc.id FROM miembros_campeonatos mc
                JOIN equipo eq ON mc.equipo_id = eq.id
                LEFT JOIN miembros_equipo me ON eq.id = me.equipo_id
                WHERE mc.campeonato_id = ? 
                  AND (eq.propietario_id = ? OR (me.usuario_id = ? AND me.activo = 1)) 
                  AND mc.activo = 1
            `, [campeonato_id, req.user.id, req.user.id]);
            if (alreadyInscribed.length > 0) {
                return res.status(409).json({ status: 409, message: 'Ya eres parte de este campeonato con uno de tus equipos.' });
            }

            // VALIDATION: User already has any PENDING request for this championship (any of their owned teams)
            const [anyPending] = await db.query(`
                SELECT ic.id FROM invitacion_campeonatos ic
                JOIN equipo e ON ic.equipo_id = e.id
                WHERE ic.campeonato_id = ? AND e.propietario_id = ? AND ic.estado = 'pendiente' AND ic.tipo = 'solicitud_union'
            `, [campeonato_id, req.user.id]);
            if (anyPending.length > 0) {
                return res.status(409).json({ status: 409, message: 'Ya tienes una solicitud de unión pendiente para este campeonato.' });
            }

            const [miembros] = await db.query("SELECT COUNT(*) as total FROM miembros_campeonatos WHERE campeonato_id = ? AND activo = 1", [campeonato_id]);
            if (miembros[0].total >= camp.numero_equipos) {
                return res.status(409).json({ status: 409, message: 'No hay cupos disponibles' });
            }

            await db.query(`
                INSERT INTO invitacion_campeonatos (campeonato_id, equipo_id, de_usuario_id, para_usuario_id, mensaje, estado, tipo, fecha_envio)
                VALUES (?, ?, ?, ?, ?, 'pendiente', 'solicitud_union', NOW())
            `, [campeonato_id, equipo_id, req.user.id, camp.propietario_id, req.body.mensaje || null]);

            socketManager.notifyUser(camp.propietario_id, 'nueva_notificacion');

            return res.status(201).json({ status: 201, message: 'Solicitud de unión enviada' });
        } catch (error) {
            console.error('[Error storeSolicitudUnion]', error);
            return res.status(500).json({ status: 500, message: 'Error', details: error.message, code: error.code });
        }
    }

    /**
     * Championship owners fetch pending join requests for their championships.
     */
    static async indexSolicitudesRecibidas(req, res) {
        try {
            const [items] = await db.query(`
                SELECT ic.*, u.nombre as de_usuario_nombre, e.nombre as equipo_nombre, c.nombre as campeonato_nombre
                FROM invitacion_campeonatos ic
                JOIN usuario u ON ic.de_usuario_id = u.id
                JOIN equipo e ON ic.equipo_id = e.id
                JOIN campeonato c ON ic.campeonato_id = c.id
                WHERE ic.para_usuario_id = ? AND ic.estado = 'pendiente' AND ic.tipo = 'solicitud_union'
                ORDER BY ic.fecha_envio DESC
            `, [req.user.id]);
            return res.json({ status: 200, message: 'Solicitudes obtenidas', data: items });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }
}
module.exports = InvitacionCampeonatosController;
