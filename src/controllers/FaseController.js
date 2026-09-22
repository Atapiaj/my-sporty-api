const db = require('../config/db');
const FixtureService = require('../services/FixtureService');

class FaseController {
    static mapFaseResponse(dbFase) {
        return {
            id: dbFase.id,
            nombre: dbFase.nombre,
            metodo: dbFase.tipo === 'fase_grupos' ? 'grupos' : dbFase.tipo,
            equiposIniciales: dbFase.numero_equipos,
            equiposRestantes: FaseController.calcularEquiposRestantesFase(dbFase),
            numeroGrupos: dbFase.numero_grupos || '',
            tamanoGrupo: dbFase.tamano_grupo || '',
            clasificadosPorGrupo: dbFase.clasificados_por_grupo || '',
            // Mantener campos originales también por compatibilidad
            campeonato_id: dbFase.campeonato_id,
            orden: dbFase.orden,
            tipo: dbFase.tipo,
            estado: dbFase.estado,
            fecha_inicio: dbFase.fecha_inicio,
            fecha_fin: dbFase.fecha_fin,
            numero_equipos: dbFase.numero_equipos
        };
    }

    static calcularEquiposRestantesFase(dbFase) {
        if (!dbFase.numero_equipos) return 1;
        
        const tipo = (dbFase.tipo || 'liga').toLowerCase();
        
        if (tipo === 'fase_grupos' || tipo === 'grupos') {
            const clasificados = parseInt(dbFase.clasificados_por_grupo, 10);
            const numGrupos = parseInt(dbFase.numero_grupos, 10) || (dbFase.tamano_grupo ? Math.floor(dbFase.numero_equipos / dbFase.tamano_grupo) : 0);
            
            if (clasificados && numGrupos) {
                return clasificados * numGrupos;
            }
            return dbFase.numero_equipos;
        } else if (tipo === 'eliminatoria' || tipo === 'liga') {
            return 1;
        }
        
        return 1;
    }

    static async index(req, res) {
        try {
            const [items] = await db.query('SELECT * FROM fases');
            const mappedItems = items.map(item => FaseController.mapFaseResponse(item));
            return res.json({ status: 200, message: 'Fases obtenidas', data: mappedItems });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }

    static async show(req, res) {
        try {
            const [items] = await db.query('SELECT * FROM fases WHERE id = ?', [req.params.id]);
            if (items[0]) {
                const mapped = FaseController.mapFaseResponse(items[0]);
                return res.json({ status: 200, message: 'Fase obtenida', data: mapped });
            }
            return res.status(404).json({ status: 404, message: 'No encontrado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }

    static async showByCampeonato(req, res) {
        try {
            const [items] = await db.query('SELECT * FROM fases WHERE campeonato_id = ? ORDER BY orden ASC', [req.params.campeonato_id]);
            const mappedItems = items.map(item => FaseController.mapFaseResponse(item));
            return res.json({ status: 200, message: 'Fases obtenidas', data: mappedItems });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }

    static async store(req, res) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const data = req.body;
            const [result] = await connection.query(`
                INSERT INTO fases (campeonato_id, nombre, orden, tipo, estado, fecha_inicio, fecha_fin, numero_equipos, numero_grupos, tamano_grupo, clasificados_por_grupo) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                data.campeonato_id,
                data.nombre,
                data.orden || 1,
                data.tipo || 'fase_grupos',
                data.estado || 'activo',
                data.fecha_inicio || null,
                data.fecha_fin || null,
                data.numero_equipos || null,
                data.numero_grupos || null,
                data.tamano_grupo || null,
                data.clasificados_por_grupo || null
            ]);

            // Regenerate fixture inside the same transaction.
            // If this throws (e.g. odd-team eliminatoria), the INSERT above is rolled back
            // and the phase is never saved, allowing the user to retry with a different type.
            await FixtureService.regenerate(data.campeonato_id, connection);

            await connection.commit();

            const [items] = await connection.query('SELECT * FROM fases WHERE id = ?', [result.insertId]);
            const mapped = FaseController.mapFaseResponse(items[0]);
            return res.status(201).json({ status: 201, message: 'Creado', data: mapped });
        } catch (error) {
            await connection.rollback();
            // Return the specific error message so the client can show it to the user
            return res.status(422).json({ status: 422, message: error.message });
        } finally {
            connection.release();
        }
    }

    static async update(req, res) {
        try {
            const data = req.body;
            const id = req.params.id;
            await db.query(`
                UPDATE fases 
                SET campeonato_id = COALESCE(?, campeonato_id), 
                    nombre = COALESCE(?, nombre), 
                    orden = COALESCE(?, orden), 
                    tipo = COALESCE(?, tipo), 
                    estado = COALESCE(?, estado), 
                    fecha_inicio = COALESCE(?, fecha_inicio), 
                    fecha_fin = COALESCE(?, fecha_fin), 
                    numero_equipos = COALESCE(?, numero_equipos),
                    numero_grupos = COALESCE(?, numero_grupos),
                    tamano_grupo = COALESCE(?, tamano_grupo),
                    clasificados_por_grupo = COALESCE(?, clasificados_por_grupo), 
                    actualizado_en = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                data.campeonato_id, 
                data.nombre, 
                data.orden, 
                data.tipo, 
                data.estado, 
                data.fecha_inicio, 
                data.fecha_fin, 
                data.numero_equipos, 
                data.numero_grupos,
                data.tamano_grupo,
                data.clasificados_por_grupo,
                id
            ]);
            
            const [items] = await db.query('SELECT * FROM fases WHERE id = ?', [id]);
            if (items[0]) {
                const mapped = FaseController.mapFaseResponse(items[0]);
                return res.json({ status: 200, message: 'Actualizado', data: mapped });
            }
            return res.status(404).json({ status: 404, message: 'No encontrado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }

    static async delete(req, res) {
        try {
            const [fase] = await db.query('SELECT campeonato_id FROM fases WHERE id = ?', [req.params.id]);
            if (!fase[0]) return res.status(404).json({ status: 404, message: 'No encontrado' });

            const [result] = await db.query('DELETE FROM fases WHERE id = ?', [req.params.id]);
            if (result.affectedRows > 0) {
                await FixtureService.regenerate(fase[0].campeonato_id);
                return res.json({ status: 200, message: 'Eliminado' });
            }
            return res.status(404).json({ status: 404, message: 'No encontrado' });
        } catch (error) {
            return res.status(500).json({ status: 500, message: 'Error', details: error.message });
        }
    }
}
module.exports = FaseController;
