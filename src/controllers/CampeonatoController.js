const db = require('../config/db');

class CampeonatoController {
    static async index(req, res) {
        try {
            const [items] = await db.query('SELECT * FROM campeonato');
            return res.json({ status: 200, message: 'Campeonatos obtenidos', data: items });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonatos', details: error.message });
        }
    }

    static async indexPublicos(req, res) {
        try {
            const [items] = await db.query(`
                SELECT c.*, 
                    e.nombre as campeon_nombre,
                    (SELECT COUNT(*) FROM miembros_campeonatos mc WHERE mc.campeonato_id = c.id AND mc.activo = 1) as equipos_inscritos,
                    -- Check if user has a pending request for any of their teams
                    (SELECT ic.id FROM invitacion_campeonatos ic JOIN equipo eq ON ic.equipo_id = eq.id WHERE ic.campeonato_id = c.id AND eq.propietario_id = ? AND ic.estado = 'pendiente' AND ic.tipo = 'solicitud_union' LIMIT 1) as solicitud_pendiente_id,
                    -- Check if user is already a member OF ANY team inscribed in this championship
                    (SELECT eq.nombre FROM miembros_campeonatos mc 
                     JOIN equipo eq ON mc.equipo_id = eq.id 
                     LEFT JOIN miembros_equipo me ON eq.id = me.equipo_id 
                     WHERE mc.campeonato_id = c.id 
                       AND (eq.propietario_id = ? OR (me.usuario_id = ? AND me.activo = 1)) 
                       AND mc.activo = 1 
                     LIMIT 1) as equipo_inscrito_nombre
                FROM campeonato c
                LEFT JOIN equipo e ON c.campeon_id = e.id
                WHERE c.privacidad = 'publico'
                ORDER BY c.fecha_inicio DESC
            `, [req.user.id, req.user.id, req.user.id]);
            return res.json({ status: 200, message: 'Campeonatos públicos obtenidos', data: items });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonatos públicos', details: error.message });
        }
    }

    static async show(req, res) {
        try {
            const [items] = await db.query('SELECT * FROM campeonato WHERE id = ?', [req.params.id]);
            const item = items[0];
            if (item) {
                return res.json({ status: 200, message: 'Campeonato obtenido', data: item });
            } else {
                return res.status(404).json({ status: 404, message: 'Campeonato no encontrado' });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonato', details: error.message });
        }
    }

    static async showByPropietario(req, res) {
        const propietarioId = parseInt(req.params.id, 10);
        if (propietarioId <= 0 || isNaN(propietarioId)) {
            return res.status(400).json({ status: 400, message: 'ID de propietario inválido' });
        }

        try {
            const [items] = await db.query('SELECT * FROM campeonato WHERE propietario_id = ?', [propietarioId]);
            if (items.length > 0) {
                return res.json({ status: 200, message: 'Campeonatos obtenidos por propietario', data: items });
            } else {
                return res.status(404).json({ status: 404, message: 'No se encontraron campeonatos para este propietario' });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonatos por propietario', details: error.message });
        }
    }

    static async buscarPorNombre(req, res) {
        const nombre = (req.query.nombre || '').trim();
        if (!nombre) {
            return res.status(400).json({ status: 400, message: 'El parámetro "nombre" es requerido' });
        }
        if (nombre.length < 3) {
            return res.status(422).json({ status: 422, message: 'El parámetro "nombre" debe tener al menos 3 caracteres' });
        }
        if (nombre.length > 255) {
            return res.status(422).json({ status: 422, message: 'El parámetro "nombre" excede la longitud permitida' });
        }

        try {
            const [items] = await db.query('SELECT * FROM campeonato WHERE nombre LIKE ?', [`%${nombre}%`]);
            if (items.length > 0) {
                return res.json({ status: 200, message: 'Campeonatos encontrados', data: items });
            } else {
                return res.status(404).json({ status: 404, message: 'No se encontraron campeonatos con ese nombre' });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al buscar campeonatos', details: error.message });
        }
    }

    static async showByEstado(req, res) {
        const estado = req.params.estado;
        if (!estado) {
            return res.status(400).json({ status: 400, message: 'El parámetro "estado" es requerido' });
        }

        const validStates = ['borrador', 'activo', 'programado', 'finalizado', 'cancelado'];
        if (!validStates.includes(estado)) {
            return res.status(422).json({ status: 422, message: 'El estado debe ser uno de los siguientes: ' + validStates.join(', ') });
        }

        try {
            const [items] = await db.query('SELECT * FROM campeonato WHERE estado = ?', [estado]);
            if (items.length > 0) {
                return res.json({ status: 200, message: 'Campeonatos obtenidos por estado', data: items });
            } else {
                return res.status(404).json({ status: 404, message: 'No se encontraron campeonatos para este estado' });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonatos por estado', details: error.message });
        }
    }

    static async showByDeporte(req, res) {
        const deporte = req.params.deporte;
        if (!deporte) {
            return res.status(400).json({ status: 400, message: 'El parámetro "deporte" es requerido' });
        }

        try {
            const [items] = await db.query('SELECT * FROM campeonato WHERE deporte = ?', [deporte]);
            if (items.length > 0) {
                return res.json({ status: 200, message: 'Campeonatos obtenidos por deporte', data: items });
            } else {
                return res.status(404).json({ status: 404, message: 'No se encontraron campeonatos para este deporte' });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonatos por deporte', details: error.message });
        }
    }

    static async store(req, res) {
        try {
            const data = req.body;
            if (!data) return res.status(400).json({ status: 400, message: 'Datos inválidos' });
            
            if (!data.nombre || !data.nombre.trim()) {
                return res.status(422).json({ status: 422, message: 'El campo "nombre" es requerido' });
            }

            // Auto-compute estado from fecha_inicio
            let estadoFinal = data.estado;
            if (!estadoFinal && data.fecha_inicio) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const inicio = new Date(data.fecha_inicio);
                inicio.setHours(0, 0, 0, 0);
                estadoFinal = inicio.getTime() <= today.getTime() ? 'activo' : 'programado';
            }
            estadoFinal = estadoFinal || 'borrador';

            // Default inscripciones_abiertas: public=1, private=0
            let inscripcionesAbiertas = data.inscripciones_abiertas;
            if (inscripcionesAbiertas === undefined || inscripcionesAbiertas === null) {
                inscripcionesAbiertas = (data.privacidad === 'privado') ? 0 : 1;
            }

            // Parse integers robustly — TextInput always sends strings
            const numJugadores  = data.numero_jugadores  != null && data.numero_jugadores  !== '' ? parseInt(data.numero_jugadores,  10) : null;
            const numSuplentes  = data.numero_suplentes  != null && data.numero_suplentes  !== '' ? parseInt(data.numero_suplentes,  10) : null;
            const numEquipos    = data.numero_equipos    != null && data.numero_equipos    !== '' ? parseInt(data.numero_equipos,    10) : null;

            // If inscripciones_abiertas was explicitly sent, honor it; otherwise derive from type
            const inscripcionesInt = (data.inscripciones_abiertas !== undefined && data.inscripciones_abiertas !== null)
                ? parseInt(data.inscripciones_abiertas, 10)
                : (data.privacidad === 'privado' ? 0 : 1);

            const [result] = await db.query(`
                INSERT INTO campeonato (
                    nombre, descripcion, telefono_contacto, estado,
                    inscripciones_abiertas, fecha_inicio, fecha_fin,
                    deporte, numero_jugadores, numero_suplentes, numero_equipos,
                    propietario_id, privacidad, tipo_actividad
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.nombre?.trim() || null,
                data.descripcion || null,
                req.user.telefono || null,
                estadoFinal,
                inscripcionesInt,
                data.fecha_inicio || null,
                data.fecha_fin || null,
                data.deporte || null,
                numJugadores,
                numSuplentes,
                numEquipos,
                req.user.id || null,
                data.privacidad || 'publico',
                data.tipoActividad || 'campeonato'
            ]);

            const campeonatoId = result.insertId;

            if (data.tipoActividad === 'partido') {
                // Generar automáticamente la Fase y el Partido para el Amistoso
                const [faseResult] = await db.query(`
                    INSERT INTO fases (campeonato_id, nombre, orden, tipo, estado, numero_equipos) 
                    VALUES (?, 'Partido Único', 1, 'eliminatoria', 'activo', 2)
                `, [campeonatoId]);

                const faseId = faseResult.insertId;

                await db.query(`
                    INSERT INTO partidos (fase_id, fecha, equipo_local_id, estado) 
                    VALUES (?, ?, ?, 'programado')
                `, [faseId, data.fecha_inicio || null, data.equipo_local_id || null]);
            }

            const [items] = await db.query('SELECT * FROM campeonato WHERE id = ?', [campeonatoId]);
            return res.status(201).json({ status: 201, message: 'Evento creado', data: items[0] });

        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al crear evento', details: error.message });
        }
    }

    static async update(req, res) {
        try {
            const id = req.params.id;
            const data = req.body;
            if (!data) return res.status(400).json({ status: 400, message: 'Datos inválidos' });

            const [items] = await db.query('SELECT * FROM campeonato WHERE id = ?', [id]);
            const campeonato = items[0];

            if (!campeonato) return res.status(404).json({ status: 404, message: 'Campeonato no encontrado' });
            if (campeonato.propietario_id != req.user.id) {
                return res.status(403).json({ status: 403, message: 'No autorizado: solo el propietario puede actualizar el campeonato' });
            }

            if (!data.nombre || !data.nombre.trim()) {
                return res.status(422).json({ status: 422, message: 'El campo "nombre" es requerido' });
            }

            await db.query(`
                UPDATE campeonato SET
                    nombre = COALESCE(?, nombre),
                    descripcion = COALESCE(?, descripcion),
                    telefono_contacto = COALESCE(?, telefono_contacto),
                    estado = COALESCE(?, estado),
                    inscripciones_abiertas = COALESCE(?, inscripciones_abiertas),
                    fecha_inicio = COALESCE(?, fecha_inicio),
                    fecha_fin = COALESCE(?, fecha_fin),
                    deporte = COALESCE(?, deporte),
                    numero_jugadores = COALESCE(?, numero_jugadores),
                    numero_suplentes = COALESCE(?, numero_suplentes),
                    numero_equipos = COALESCE(?, numero_equipos),
                    privacidad = COALESCE(?, privacidad)
                WHERE id = ?
            `, [
                data.nombre, data.descripcion, data.telefono_contacto, data.estado,
                data.inscripciones_abiertas, data.fecha_inicio, data.fecha_fin, data.deporte,
                data.numero_jugadores, data.numero_suplentes, data.numero_equipos,
                data.privacidad, id
            ]);

            const [updatedItems] = await db.query('SELECT * FROM campeonato WHERE id = ?', [id]);
            return res.json({ status: 200, message: 'Campeonato actualizado', data: updatedItems[0] });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al actualizar campeonato', details: error.message });
        }
    }

    static async delete(req, res) {
        const id = parseInt(req.params.id, 10);
        if (id <= 0 || isNaN(id)) {
            return res.status(400).json({ status: 400, message: 'ID inválido' });
        }

        try {
            const [result] = await db.query('DELETE FROM campeonato WHERE id = ?', [id]);
            if (result.affectedRows > 0) {
                return res.json({ status: 200, message: 'Campeonato eliminado' });
            } else {
                return res.status(404).json({ status: 404, message: 'Campeonato no encontrado' });
            }
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al eliminar campeonato', details: error.message });
        }
    }

    static async getParticipando(req, res) {
        const usuarioId = parseInt(req.params.usuario_id, 10);
        if (usuarioId <= 0 || isNaN(usuarioId)) {
            return res.status(400).json({ status: 400, message: 'ID de usuario inválido' });
        }

        try {
            const query = `
                SELECT DISTINCT c.*
                FROM campeonato c
                JOIN miembros_campeonatos mc ON c.id = mc.campeonato_id
                JOIN equipo e ON mc.equipo_id = e.id
                LEFT JOIN miembros_equipo me ON e.id = me.equipo_id
                WHERE (e.propietario_id = ? OR (me.usuario_id = ? AND me.activo = 1))
                  AND mc.activo = 1
            `;
            const [items] = await db.query(query, [usuarioId, usuarioId]);
            
            return res.json({ status: 200, message: 'Campeonatos participando obtenidos', data: items });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error al obtener campeonatos participantes', details: error.message });
        }
    }
}

module.exports = CampeonatoController;
