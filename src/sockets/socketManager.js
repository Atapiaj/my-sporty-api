const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../config/db'); // Needed to interact with the database if we want to save chat history directly via socket
const { enviarPushNotification } = require('../utils/pushService');

let io;
// We map user IDs to socket IDs to easily lookup individual sockets (for Amigos or Notifications)
const connectedUsers = new Map(); 

const init = (server) => {
    io = socketIo(server, {
        cors: {
            origin: "*", // Adjust for production
            methods: ["GET", "POST", "PATCH"]
        }
    });

    // Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }
        try {
            const secret = process.env.JWT_SECRET || 'clave_predeterminada_segura';
            const decoded = jwt.verify(token, secret);
            socket.user = {
                id: decoded.sub || decoded.id,
                ...decoded
            };
            next();
        } catch (err) {
            next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        console.log(`[Sockets] Usuario conectado: ${userId} (${socket.id})`);
        
        connectedUsers.set(userId, socket.id);

        // When a user enters the app, we can subscribe them to the chat rooms of all their teams
        socket.on('join_teams', async () => {
             try {
                // Fetch user's teams (both owned and memberships)
                const [owned] = await db.query('SELECT id FROM equipo WHERE propietario_id = ?', [userId]);
                const [memberships] = await db.query('SELECT equipo_id as id FROM miembros_equipo WHERE usuario_id = ? AND activo = 1', [userId]);
                
                const allTeamIds = new Set([...owned.map(r => r.id), ...memberships.map(r => r.id)]);
                
                 allTeamIds.forEach(teamId => {
                    socket.join(`team_${teamId}`);
                    console.log(`[Sockets] Usuario ${userId} se unió al room: team_${teamId}`);
                });
             } catch (err) {
                 console.error('[Sockets] Error uniéndose a los equipos:', err);
             }
        });

        socket.on('join_campeonatos', async () => {
            try {
               const [owned] = await db.query('SELECT id FROM campeonato WHERE propietario_id = ?', [userId]);
               const [participating] = await db.query(`
                   SELECT mc.campeonato_id as id 
                   FROM miembros_campeonatos mc 
                   JOIN equipo e ON mc.equipo_id = e.id 
                   WHERE e.propietario_id = ? AND mc.activo = 1
               `, [userId]);
               
               const allChampIds = new Set([...owned.map(r => r.id), ...participating.map(r => r.id)]);
               
               allChampIds.forEach(id => {
                   socket.join(`campeonato_${id}`);
                   console.log(`[Sockets] Usuario ${userId} se unió al room: campeonato_${id}`);
               });
            } catch (err) {
                console.error('[Sockets] Error uniéndose a los campeonatos:', err);
            }
       });

        // Receiving a direct message (Amigos)
        socket.on('send_message_amigo', async (data) => {
            // data obj: { receptor_id, mensaje }
            console.log(`[Sockets] Mensaje amigo: ${userId} -> ${data.receptor_id}`);
            try {
                // Determine if they are friends first (optional validation)
                
                // Save to Database
                const [result] = await db.query(
                    'INSERT INTO mensajes (emisor_id, receptor_id, mensaje) VALUES (?, ?, ?)',
                    [userId, data.receptor_id, data.mensaje]
                );

                const [senderRows] = await db.query('SELECT nombre FROM usuario WHERE id = ?', [userId]);
                const senderName = senderRows[0]?.nombre || 'Usuario';

                const msgObj = {
                    id: result.insertId,
                    emisor_id: userId,
                    emisor_nombre: senderName,
                    receptor_id: data.receptor_id,
                    mensaje: data.mensaje,
                    fecha_envio: new Date()
                };

                // Emit back to sender
                socket.emit('receive_message_amigo', msgObj);

                // Find recipient and emit
                const destSocketId = connectedUsers.get(Number(data.receptor_id)) || connectedUsers.get(data.receptor_id.toString());
                if (destSocketId) {
                    console.log(`[Push] Usuario ${data.receptor_id} está CONECTADO por socket. No se envía push.`);
                    io.to(destSocketId).emit('receive_message_amigo', msgObj);
                } else {
                    // Si no está conectado por socket, enviar PUSH
                    console.log(`[Push] Usuario ${data.receptor_id} DESCONECTADO. Intentando enviar Push Nativo.`);
                    await enviarPushNotification(
                        data.receptor_id, 
                        `Nuevo mensaje de ${senderName}`, 
                        data.mensaje,
                        { type: 'amigo', id: userId, nombre: senderName }
                    );
                }
            } catch (err) {
                console.error('[Sockets] Error en send_message_amigo:', err);
            }
        });

        // Receiving a group message (Equipos)
        socket.on('send_message_equipo', async (data) => {
            // data obj: { equipo_id, mensaje }
            console.log(`[Sockets] Mensaje equipo ${data.equipo_id} de ${userId}`);
            try {
                // Save to Database
                const [result] = await db.query(
                    'INSERT INTO mensajes (emisor_id, equipo_id, mensaje) VALUES (?, ?, ?)',
                    [userId, data.equipo_id, data.mensaje]
                );

                const [userRows] = await db.query('SELECT nombre FROM usuario WHERE id = ?', [userId]);
                const [teamRows] = await db.query('SELECT nombre FROM equipo WHERE id = ?', [data.equipo_id]);
                
                const senderName = userRows[0]?.nombre || 'Usuario';
                const teamName = teamRows[0]?.nombre || 'Equipo';

                const msgObj = {
                    id: result.insertId,
                    emisor_id: userId,
                    emisor_nombre: senderName,
                    equipo_id: data.equipo_id,
                    equipo_nombre: teamName,
                    mensaje: data.mensaje,
                    fecha_envio: new Date()
                };

                // Emit directly to the sender so it reflects immediately
                socket.emit('receive_message_equipo', msgObj);
                
                // Broadcast to the rest of the team room
                socket.to(`team_${data.equipo_id}`).emit('receive_message_equipo', msgObj);

                // --- PUSH NOTIFICATIONS PARA MIEMBROS DESCONECTADOS ---
                // Obtener todos los miembros del equipo (excepto yo)
                const [members] = await db.query(`
                    SELECT usuario_id FROM miembros_equipo WHERE equipo_id = ? AND activo = 1 AND usuario_id != ?
                    UNION
                    SELECT propietario_id as usuario_id FROM equipo WHERE id = ? AND propietario_id != ?
                `, [data.equipo_id, userId, data.equipo_id, userId]);

                for (const member of members) {
                    if (!connectedUsers.has(member.usuario_id) && !connectedUsers.has(member.usuario_id.toString())) {
                        console.log(`[Push] Miembro equipo ${member.usuario_id} desconectado. Enviando Push.`);
                        await enviarPushNotification(
                            member.usuario_id,
                            `Mensaje en ${teamName}`,
                            `${senderName}: ${data.mensaje}`,
                            { type: 'equipo', id: data.equipo_id, nombre: teamName }
                        );
                    }
                }
            } catch (err) {
                console.error('[Sockets] Error en send_message_equipo:', err);
            }
        });

        // Receiving an event message (Campeonatos)
        socket.on('send_message_campeonato', async (data) => {
            // data obj: { campeonato_id, mensaje }
            console.log(`[Sockets] Mensaje campeonato ${data.campeonato_id} de ${userId}`);
            try {
                // Save to Database
                const [result] = await db.query(
                    'INSERT INTO mensajes (emisor_id, campeonato_id, mensaje) VALUES (?, ?, ?)',
                    [userId, data.campeonato_id, data.mensaje]
                );

                const [userRows] = await db.query('SELECT nombre FROM usuario WHERE id = ?', [userId]);
                const [campRows] = await db.query('SELECT nombre FROM campeonato WHERE id = ?', [data.campeonato_id]);
                
                const senderName = userRows[0]?.nombre || 'Usuario';
                const campName = campRows[0]?.nombre || 'Campeonato';

                const msgObj = {
                    id: result.insertId,
                    emisor_id: userId,
                    emisor_nombre: senderName,
                    campeonato_id: data.campeonato_id,
                    campeonato_nombre: campName,
                    mensaje: data.mensaje,
                    fecha_envio: new Date()
                };

                // Emit back to sender
                socket.emit('receive_message_campeonato', msgObj);
                
                // Broadcast to the rest of the campeonato room
                socket.to(`campeonato_${data.campeonato_id}`).emit('receive_message_campeonato', msgObj);

                // --- PUSH NOTIFICATIONS ---
                // Obtener organizador y dueños de equipos
                const [members] = await db.query(`
                    SELECT propietario_id as usuario_id FROM campeonato WHERE id = ? AND propietario_id != ?
                    UNION
                    SELECT e.propietario_id as usuario_id 
                    FROM miembros_campeonatos mc 
                    JOIN equipo e ON mc.equipo_id = e.id 
                    WHERE mc.campeonato_id = ? AND mc.activo = 1 AND e.propietario_id != ?
                `, [data.campeonato_id, userId, data.campeonato_id, userId]);

                for (const member of members) {
                    if (!connectedUsers.has(member.usuario_id) && !connectedUsers.has(member.usuario_id.toString())) {
                        await enviarPushNotification(
                            member.usuario_id,
                            `Mensaje en ${campName}`,
                            `${senderName}: ${data.mensaje}`,
                            { type: 'campeonato', id: data.campeonato_id, nombre: campName }
                        );
                    }
                }
            } catch (err) {
                console.error('[Sockets] Error en send_message_campeonato:', err);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Sockets] Usuario desconectado: ${userId}`);
            // Check if socket.id matches (in case of multiple tabs, map might have the latest socket ID)
            if (connectedUsers.get(userId) === socket.id) {
                connectedUsers.delete(userId);
            }
        });
    });
};

const getIo = () => {
    if (!io) {
        throw new Error("Socket.io is not initialized!");
    }
    return io;
};

const getConnectedUsers = () => connectedUsers;

const notifyUser = async (userId, eventName, data = {}) => {
    if (!io) return;
    const destSocketId = connectedUsers.get(Number(userId));
    if (destSocketId) {
        io.to(destSocketId).emit(eventName, data);
    } else {
        // Opcional: Si es una invitación o algo importante, mandar Push
        if (eventName === 'nueva_notificacion') {
            await enviarPushNotification(
                userId,
                'Nueva notificación en DeportProy',
                'Tienes una nueva solicitud o invitación pendiente.',
                { type: 'notificacion' }
            );
        }
    }
};

module.exports = {
    init,
    getIo,
    getConnectedUsers,
    notifyUser
};
