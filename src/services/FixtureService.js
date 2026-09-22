const db = require('../config/db');

class FixtureService {
    static async regenerate(campeonato_id) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query('DELETE FROM partidos WHERE fase_id IN (SELECT id FROM fases WHERE campeonato_id = ?)', [campeonato_id]);

            const [fases] = await connection.query('SELECT * FROM fases WHERE campeonato_id = ? ORDER BY orden ASC', [campeonato_id]);
            
            const [equipos] = await connection.query('SELECT equipo_id FROM miembros_campeonatos WHERE campeonato_id = ? AND activo = 1', [campeonato_id]);
            const teamIds = equipos.map(e => e.equipo_id);

            let currentTeams = [...teamIds];

            for (const fase of fases) {
                if (currentTeams.length < 2) continue;

                const tipoFase = (fase.tipo || 'liga').toLowerCase();

                if (tipoFase === 'liga') {
                    const matches = this.generateRoundRobin(currentTeams);
                    for (const match of matches) {
                        await connection.query(`
                            INSERT INTO partidos (fase_id, equipo_local_id, equipo_visitante_id, jornada, estado) 
                            VALUES (?, ?, ?, ?, 'programado')
                        `, [fase.id, match.local, match.visitante, match.jornada]);
                    }
                } else if (tipoFase === 'eliminatoria') {
                    // generateKnockoutTree already handles odd teams via byes (nextPowerOf2)
                    await this.generateKnockoutTree(connection, fase.id, currentTeams);
                    // For logic simplicity without complex progression simulated yet: 
                    // currentTeams = advance logic...
                } else if (tipoFase === 'fase_grupos' || tipoFase === 'grupos') {
                    // Validar que tengamos los campos necesarios para fases de grupos
                    if (!fase.numero_grupos || !fase.tamano_grupo) {
                        throw new Error(`Fase de grupos ${fase.nombre} requiere numero_grupos y tamano_grupo`);
                    }
                    
                    const matches = this.generateGroups(currentTeams, fase.numero_grupos, fase.tamano_grupo);
                    for (const match of matches) {
                        await connection.query(`
                            INSERT INTO partidos (fase_id, equipo_local_id, equipo_visitante_id, jornada, estado, grupo_numero) 
                            VALUES (?, ?, ?, ?, 'programado', ?)
                        `, [fase.id, match.local, match.visitante, match.jornada, match.grupo]);
                    }
                    
                    // Calcular equipos que pasan a la siguiente fase
                    const equiposQuePasan = fase.clasificados_por_grupo ? fase.numero_grupos * fase.clasificados_por_grupo : fase.numero_grupos;
                    // Simplificación: tomar los primeros N equipos (en un sistema real, esto se basaría en resultados)
                    currentTeams = currentTeams.slice(0, Math.min(equiposQuePasan, currentTeams.length));
                }
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            console.error('FixtureService error:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    static generateRoundRobin(teamsList) {
        let teams = [...teamsList];
        if (teams.length % 2 !== 0) {
            teams.push(null); // 'DESCANSO'
        }

        const matches = [];
        const numTeams = teams.length;
        const numDays = numTeams - 1;
        const halfSize = numTeams / 2;

        let currentTeams = [...teams];

        for (let day = 0; day < numDays; day++) {
            for (let i = 0; i < halfSize; i++) {
                const team1 = currentTeams[i];
                const team2 = currentTeams[numTeams - 1 - i];

                if (team1 !== null && team2 !== null) {
                    matches.push({
                        jornada: day + 1,
                        local: team1,
                        visitante: team2
                    });
                }
            }

            // Rotate array: keep first fixed, shift others right
            currentTeams.splice(1, 0, currentTeams.pop());
        }

        return matches;
    }

    static async generateKnockoutTree(connection, fase_id, teams) {
        // Calculate Byes
        const n = teams.length;
        const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(n)));
        const numByes = nextPowerOf2 - n;
        const numFirstRoundMatches = (n - numByes) / 2;

        // Shuffle teams simply for randomized matching
        const shuffled = [...teams].sort(() => 0.5 - Math.random());

        // We build the tree bottom-up. But since we need partido_siguiente_id, 
        // we should actually build it top-down in the DB (Final -> Semis -> Quarters)
        let totalRounds = Math.log2(nextPowerOf2);
        
        let currentRoundMatchesIds = []; 
        let nextRoundMatchesIds = [];

        // Top-down: create the Final first.
        let matchIndex = 0;
        let matchIdsByLevel = []; // level 0 = final, level 1 = semis, etc.

        for (let level = 0; level < totalRounds; level++) {
            const matchesInLevel = Math.pow(2, level);
            const levelIds = [];
            for (let i = 0; i < matchesInLevel; i++) {
                // If it's final (level 0), no parent. Otherwise parent is in previous level.
                let parentId = null;
                if (level > 0) {
                    parentId = matchIdsByLevel[level - 1][Math.floor(i / 2)];
                }

                const [result] = await connection.query(`
                    INSERT INTO partidos (fase_id, estado, partido_siguiente_id, jornada) 
                    VALUES (?, 'programado', ?, ?)
                `, [fase_id, parentId, totalRounds - level]); 
                levelIds.push(result.insertId);
            }
            matchIdsByLevel.push(levelIds);
        }

        // The leaves (bottom round) are matchIdsByLevel[totalRounds - 1].
        const leafMatches = matchIdsByLevel[totalRounds - 1];

        // Now we allocate teams to the leaves. 
        // First we have numFirstRoundMatches where two teams play. 
        // The remaining leaves get 1 team + 1 null (Bye).
        
        // Let's allocate 'shuffled' into the leaves
        let teamIdx = 0;
        for (let i = 0; i < leafMatches.length; i++) {
            let local = null;
            let visitante = null;

            if (i < numFirstRoundMatches) {
                local = shuffled[teamIdx++];
                visitante = shuffled[teamIdx++];
            } else {
                local = shuffled[teamIdx++];
                // visitante remains null (Bye)
            }

            await connection.query(`
                UPDATE partidos 
                SET equipo_local_id = ?, equipo_visitante_id = ? 
                WHERE id = ?
            `, [local, visitante, leafMatches[i]]);
        }
    }

    static generateGroups(teams, numeroGrupos, tamanoGrupo) {
        const matches = [];
        
        // Distribuir equipos en grupos
        const groups = [];
        for (let i = 0; i < numeroGrupos; i++) {
            groups.push([]);
        }
        
        // Distribución round-robin de equipos en grupos
        teams.forEach((team, index) => {
            const groupIndex = index % numeroGrupos;
            if (groups[groupIndex].length < tamanoGrupo) {
                groups[groupIndex].push(team);
            }
        });
        
        // Generar partidos para cada grupo
        groups.forEach((groupTeams, groupIndex) => {
            if (groupTeams.length >= 2) {
                const groupMatches = this.generateRoundRobin(groupTeams);
                // Agregar información del grupo a cada partido
                const matchesWithGroup = groupMatches.map(match => ({
                    ...match,
                    grupo: groupIndex + 1 // Grupos numerados desde 1
                }));
                matches.push(...matchesWithGroup);
            }
        });
        
        return matches;
    }
}

module.exports = FixtureService;
