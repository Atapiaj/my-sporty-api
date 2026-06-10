const db = require('../config/db');

class EquipoController {
    static async index(req, res) {
        try {
            const [equipos] = await db.query('SELECT * FROM equipo');
            return res.json({
                status: 200,
                message: 'Equipos obtenidos correctamente',
                data: { equipos }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener los equipos', data: { detalles: error.message } });
        }
    }

    static async show(req, res) {
        try {
            const id = req.params.id;
            const [equipos] = await db.query('SELECT * FROM equipo WHERE id = ?', [id]);
            const equipo = equipos[0];

            if (equipo) {
                return res.json({ status: 200, message: 'Equipo obtenido correctamente', data: { equipo } });
            } else {
                return res.status(404).json({ status: 404, message: 'Equipo no encontrado', data: null });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener el equipo', data: { detalles: error.message } });
        }
    }

    static async misEquipos(req, res) {
        try {
            const usuarioId = req.query.usuario_id || req.user.id;
            
            const [equiposPropietarios] = await db.query(`
                SELECT e.*,
                    (SELECT COUNT(*) FROM miembros_equipo me WHERE me.equipo_id = e.id AND me.activo = 1) AS total_miembros
                FROM equipo e
                WHERE e.propietario_id = ?
            `, [usuarioId]);

            const [equiposMiembros] = await db.query(`
                SELECT e.*,
                    (SELECT COUNT(*) FROM miembros_equipo me2 WHERE me2.equipo_id = e.id AND me2.activo = 1) AS total_miembros
                FROM equipo e
                INNER JOIN miembros_equipo me ON e.id = me.equipo_id
                WHERE me.usuario_id = ?
            `, [usuarioId]);

            const todosEquipos = [...equiposPropietarios, ...equiposMiembros];
            
            // Remove duplicates by id
            const map = new Map();
            todosEquipos.forEach(eq => map.set(eq.id, eq));
            const equiposUnicos = Array.from(map.values());

            return res.json({
                status: 200,
                message: 'Equipos del usuario obtenidos correctamente',
                data: equiposUnicos
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener los equipos del usuario', data: { detalles: error.message } });
        }
    }

    static async equiposDeAmigos(req, res) {
        try {
            const usuarioId = req.user.id;
            const [equipos] = await db.query(`
                SELECT DISTINCT e.* FROM equipo e
                INNER JOIN miembros_equipo me ON e.id = me.equipo_id
                INNER JOIN amistad a ON (
                    (a.usuario1_id = ? AND me.usuario_id = a.usuario2_id) OR
                    (a.usuario2_id = ? AND me.usuario_id = a.usuario1_id)
                )
                WHERE a.activo = 1
            `, [usuarioId, usuarioId]);

            if (equipos.length === 0) {
                return res.status(404).json({ status: 404, message: 'No se encontraron equipos de amigos', data: null });
            }

            return res.json({ status: 200, message: 'Equipos de amigos obtenidos correctamente', data: equipos });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener los equipos de amigos', data: { detalles: error.message } });
        }
    }

    static async equiposDeAmigosParaCampeonato(req, res) {
        try {
            const usuarioId = req.user.id;
            const campeonatoId = req.params.campeonato_id;

            const [equipos] = await db.query(`
                SELECT DISTINCT e.* FROM equipo e
                INNER JOIN amistad a ON (
                    (a.usuario1_id = ? AND e.propietario_id = a.usuario2_id) OR
                    (a.usuario2_id = ? AND e.propietario_id = a.usuario1_id)
                )
                WHERE a.activo = 1
                AND e.id NOT IN (
                    SELECT equipo_id FROM miembros_campeonatos WHERE campeonato_id = ?
                )
                AND e.id NOT IN (
                    SELECT equipo_id FROM invitacion_campeonatos WHERE campeonato_id = ? AND estado = 'pendiente'
                )
            `, [usuarioId, usuarioId, campeonatoId, campeonatoId]);

            if (equipos.length === 0) {
                return res.status(404).json({ status: 404, message: 'No se encontraron equipos de amigos para invitar', data: null });
            }

            return res.json({ status: 200, message: 'Equipos de amigos obtenidos', data: equipos });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener equipos', data: { detalles: error.message } });
        }
    }

    static async store(req, res) {
        const data = req.body;
        if (!data.nombre || !data.deporte) {
            return res.status(400).json({ status: 400, message: 'Faltan campos obligatorios (nombre, deporte)', data: null });
        }

        try {
            const propietario_id = req.user.id;
            const [result] = await db.query(`
                INSERT INTO equipo (
                    nombre, descripcion, estadio_local,
                    ciudad, pais, url_logo, correo_contacto,
                    telefono_contacto, url_web, propietario_id, deporte
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.nombre, data.descripcion || null, data.estadio_local || null,
                data.ciudad || null, data.pais || null, data.url_logo || null, data.correo_contacto || null,
                data.telefono_contacto || null, data.url_web || null, propietario_id, data.deporte
            ]);

            const [equipos] = await db.query('SELECT * FROM equipo WHERE id = ?', [result.insertId]);
            return res.status(201).json({ status: 201, message: 'Equipo creado exitosamente', data: { equipo: equipos[0] } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al crear el equipo', data: { detalles: error.message } });
        }
    }

    static async update(req, res) {
        const id = req.params.id;
        const data = req.body;

        try {
            const [equipos] = await db.query('SELECT * FROM equipo WHERE id = ?', [id]);
            const equipo = equipos[0];

            if (!equipo) {
                return res.status(404).json({ status: 404, message: 'Equipo no encontrado', data: null });
            }

            if (equipo.propietario_id != req.user.id) {
                return res.status(403).json({ status: 403, message: 'No tienes permiso para editar este equipo', data: null });
            }

            await db.query(`
                UPDATE equipo SET
                    nombre = COALESCE(?, nombre),
                    descripcion = COALESCE(?, descripcion),
                    estadio_local = COALESCE(?, estadio_local),
                    ciudad = COALESCE(?, ciudad),
                    pais = COALESCE(?, pais),
                    url_logo = COALESCE(?, url_logo),
                    correo_contacto = COALESCE(?, correo_contacto),
                    telefono_contacto = COALESCE(?, telefono_contacto),
                    url_web = COALESCE(?, url_web),
                    deporte = COALESCE(?, deporte)
                WHERE id = ?
            `, [
                data.nombre, data.descripcion, data.estadio_local,
                data.ciudad, data.pais, data.url_logo, data.correo_contacto,
                data.telefono_contacto, data.url_web, data.deporte, id
            ]);

            const [updated] = await db.query('SELECT * FROM equipo WHERE id = ?', [id]);
            return res.json({ status: 200, message: 'Equipo actualizado correctamente', data: { equipo: updated[0] } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al actualizar el equipo', data: { detalles: error.message } });
        }
    }

    static async buscarPorNombre(req, res) {
        const nombre = req.body.nombre || '';
        
        if (!nombre) {
            return res.status(400).json({ status: 400, message: 'El campo nombre es obligatorio', data: null });
        }

        try {
            const [equipos] = await db.query('SELECT * FROM equipo WHERE nombre LIKE ?', [`%${nombre}%`]);
            return res.json({ status: 200, message: 'Equipos encontrados', data: { equipos } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al buscar equipos por nombre', data: { detalles: error.message } });
        }
    }

    static async delete(req, res) {
        const id = req.params.id;
        try {
            const [equipos] = await db.query('SELECT * FROM equipo WHERE id = ?', [id]);
            const equipo = equipos[0];

            if (!equipo) {
                return res.status(404).json({ status: 404, message: 'Equipo no encontrado', data: null });
            }

            if (equipo.propietario_id != req.user.id) {
                return res.status(403).json({ status: 403, message: 'No tienes permiso para eliminar este equipo', data: null });
            }

            await db.query('DELETE FROM equipo WHERE id = ?', [id]);
            return res.json({ status: 200, message: 'Equipo eliminado correctamente', data: null });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al eliminar el equipo', data: { detalles: error.message } });
        }
    }
}

module.exports = EquipoController;
