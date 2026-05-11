const db = require('./db');

const tables = [
  {
    name: 'usuario',
    query: `
      CREATE TABLE IF NOT EXISTS usuario (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        cedula VARCHAR(50) NOT NULL UNIQUE,
        sexo ENUM('M', 'F', 'Otro') NOT NULL,
        fecha_nacimiento DATE NOT NULL,
        estado_salud TEXT,
        correo VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        telefono VARCHAR(50),
        direccion TEXT,
        ciudad VARCHAR(100),
        pais VARCHAR(100),
        url_foto_perfil TEXT,
        rol ENUM('player', 'owner', 'admin') DEFAULT 'player',
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        ultimo_login DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'amistad',
    query: `
      CREATE TABLE IF NOT EXISTS amistad (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario1_id INT NOT NULL,
        usuario2_id INT NOT NULL,
        activo TINYINT(1) DEFAULT 1,
        fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario1_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario2_id) REFERENCES usuario(id) ON DELETE CASCADE,
        UNIQUE KEY unique_friendship (usuario1_id, usuario2_id)
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'solicitud_amistad',
    query: `
      CREATE TABLE IF NOT EXISTS solicitud_amistad (
        id INT AUTO_INCREMENT PRIMARY KEY,
        de_usuario_id INT NOT NULL,
        para_usuario_id INT NOT NULL,
        estado ENUM('pendiente', 'aceptado', 'rechazado') DEFAULT 'pendiente',
        fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_respuesta DATETIME,
        FOREIGN KEY (de_usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (para_usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'equipo',
    query: `
      CREATE TABLE IF NOT EXISTS equipo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        estadio_local VARCHAR(255),
        ciudad VARCHAR(100),
        pais VARCHAR(100),
        url_logo TEXT,
        correo_contacto VARCHAR(255),
        telefono_contacto VARCHAR(50),
        url_web TEXT,
        propietario_id INT NOT NULL,
        deporte VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (propietario_id) REFERENCES usuario(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'miembros_equipo',
    query: `
      CREATE TABLE IF NOT EXISTS miembros_equipo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        equipo_id INT NOT NULL,
        rol_usuario ENUM('jugador', 'capitan', 'entrenador') DEFAULT 'jugador',
        activo TINYINT(1) DEFAULT 1,
        fecha_union DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE,
        UNIQUE KEY unique_member (usuario_id, equipo_id)
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'invitacion_equipo',
    query: `
      CREATE TABLE IF NOT EXISTS invitacion_equipo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        de_usuario_id INT NOT NULL,
        para_usuario_id INT NOT NULL,
        equipo_id INT NOT NULL,
        mensaje TEXT,
        estado ENUM('pendiente', 'aceptado', 'rechazado') DEFAULT 'pendiente',
        fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (de_usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (para_usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'campeonato',
    query: `
      CREATE TABLE IF NOT EXISTS campeonato (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        telefono_contacto VARCHAR(50),
        estado ENUM('borrador', 'activo', 'programado', 'finalizado', 'cancelado') DEFAULT 'borrador',
        inscripciones_abiertas TINYINT(1) DEFAULT 1,
        fecha_inicio DATE,
        fecha_fin DATE,
        deporte VARCHAR(100),
        numero_jugadores INT,
        numero_suplentes INT,
        numero_equipos INT,
        propietario_id INT NOT NULL,
        privacidad ENUM('publico', 'privado') DEFAULT 'publico',
        campeon_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (propietario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (campeon_id) REFERENCES equipo(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'miembros_campeonatos',
    query: `
      CREATE TABLE IF NOT EXISTS miembros_campeonatos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campeonato_id INT NOT NULL,
        equipo_id INT NOT NULL,
        activo TINYINT(1) DEFAULT 1,
        fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campeonato_id) REFERENCES campeonato(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE,
        UNIQUE KEY unique_entry (campeonato_id, equipo_id)
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'invitacion_campeonatos',
    query: `
      CREATE TABLE IF NOT EXISTS invitacion_campeonatos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campeonato_id INT NOT NULL,
        equipo_id INT NOT NULL,
        de_usuario_id INT NOT NULL,
        para_usuario_id INT NOT NULL,
        mensaje TEXT,
        estado ENUM('pendiente', 'aceptado', 'rechazado') DEFAULT 'pendiente',
        tipo ENUM('invitacion', 'solicitud_union') DEFAULT 'invitacion',
        fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campeonato_id) REFERENCES campeonato(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE,
        FOREIGN KEY (de_usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (para_usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'fases',
    query: `
      CREATE TABLE IF NOT EXISTS fases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campeonato_id INT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        orden INT DEFAULT 1,
        tipo ENUM('fase_grupos', 'eliminatoria', 'liga') DEFAULT 'fase_grupos',
        estado ENUM('activo', 'finalizado', 'pendiente') DEFAULT 'activo',
        fecha_inicio DATE,
        fecha_fin DATE,
        numero_equipos INT,
        numero_grupos INT,
        tamano_grupo INT,
        clasificados_por_grupo INT,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (campeonato_id) REFERENCES campeonato(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'escenarios_deportivos',
    query: `
      CREATE TABLE IF NOT EXISTS escenarios_deportivos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        capacidad_espectadores INT,
        tamano VARCHAR(100),
        activa TINYINT(1) DEFAULT 1,
        horario_operacion TEXT,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'partidos',
    query: `
      CREATE TABLE IF NOT EXISTS partidos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fase_id INT NOT NULL,
        fecha DATETIME,
        escenario_id INT,
        equipo_local_id INT,
        equipo_visitante_id INT,
        puntos_local INT DEFAULT 0,
        puntos_visitante INT DEFAULT 0,
        lugar TEXT,
        jornada INT DEFAULT 1,
        estado ENUM('programado', 'en_curso', 'finalizado', 'cancelado') DEFAULT 'programado',
        partido_siguiente_id INT DEFAULT NULL,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (fase_id) REFERENCES fases(id) ON DELETE CASCADE,
        FOREIGN KEY (escenario_id) REFERENCES escenarios_deportivos(id) ON DELETE SET NULL,
        FOREIGN KEY (equipo_local_id) REFERENCES equipo(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_visitante_id) REFERENCES equipo(id) ON DELETE CASCADE,
        FOREIGN KEY (partido_siguiente_id) REFERENCES partidos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'mensajes',
    query: `
      CREATE TABLE IF NOT EXISTS mensajes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        emisor_id INT NOT NULL,
        receptor_id INT NULL,
        equipo_id INT NULL,
        campeonato_id INT NULL,
        mensaje TEXT NOT NULL,
        leido TINYINT(1) DEFAULT 0,
        fecha_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (emisor_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (receptor_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE,
        FOREIGN KEY (campeonato_id) REFERENCES campeonato(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'equipo_chat_lecturas',
    query: `
      CREATE TABLE IF NOT EXISTS equipo_chat_lecturas (
        usuario_id INT NOT NULL,
        equipo_id INT NOT NULL,
        ultima_lectura DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usuario_id, equipo_id),
        FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (equipo_id) REFERENCES equipo(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  },
  {
    name: 'campeonato_chat_lecturas',
    query: `
      CREATE TABLE IF NOT EXISTS campeonato_chat_lecturas (
        usuario_id INT NOT NULL,
        campeonato_id INT NOT NULL,
        ultima_lectura DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (usuario_id, campeonato_id),
        FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
        FOREIGN KEY (campeonato_id) REFERENCES campeonato(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `
  }
];

async function initDb() {
  console.log('Iniciando verificación de base de datos...');
  for (const table of tables) {
    try {
      await db.query(table.query);
      console.log('✅ Tabla "' + table.name + '" verificada/creada.');
    } catch (error) {
      console.error('❌ Error al crear tabla "' + table.name + '":', error.message);
    }
  }
  console.log('✅ Proceso de creación de tablas finalizado.');

  console.log('Iniciando migraciones incrementales...');
  const migrations = [
    {
      name: 'Add campeon_id to campeonato',
      query: 'ALTER TABLE campeonato ADD COLUMN IF NOT EXISTS campeon_id INT NULL'
    },
    {
      name: 'Add fk_campeon_equipo to campeonato',
      query: 'ALTER TABLE campeonato ADD CONSTRAINT fk_campeon_equipo FOREIGN KEY (campeon_id) REFERENCES equipo(id) ON DELETE SET NULL',
      ignoreError: true
    },
    {
      name: 'Add tipo to invitacion_campeonatos',
      query: "ALTER TABLE invitacion_campeonatos ADD COLUMN IF NOT EXISTS tipo ENUM('invitacion', 'solicitud_union') DEFAULT 'invitacion'"
    },
    {
      name: 'Add lugar to partidos',
      query: 'ALTER TABLE partidos ADD COLUMN IF NOT EXISTS lugar TEXT'
    },
    {
      name: 'Add jornada to partidos',
      query: 'ALTER TABLE partidos ADD COLUMN IF NOT EXISTS jornada INT DEFAULT 1'
    },
    {
      name: 'Add creado_en to partidos',
      query: 'ALTER TABLE partidos ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    {
      name: 'Add grupo_numero to partidos',
      query: 'ALTER TABLE partidos ADD COLUMN IF NOT EXISTS grupo_numero INT DEFAULT NULL'
    },
    {
      name: 'Add push_token to usuario',
      query: 'ALTER TABLE usuario ADD COLUMN IF NOT EXISTS push_token VARCHAR(255) NULL'
    },
    {
      name: 'Add campeonato_id to mensajes',
      query: 'ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS campeonato_id INT NULL'
    },
    {
      name: 'Add fk_campeonato_mensajes to mensajes',
      query: 'ALTER TABLE mensajes ADD CONSTRAINT fk_campeonato_mensajes FOREIGN KEY (campeonato_id) REFERENCES campeonato(id) ON DELETE CASCADE',
      ignoreError: true
    }
  ];

  for (const m of migrations) {
    try {
      await db.query(m.query);
      console.log('✅ Migración "' + m.name + '" aplicada o ya existente.');
    } catch (error) {
      if (!m.ignoreError) {
        console.warn('⚠️ Advertencia en migración "' + m.name + '":', error.message);
      }
    }
  }

  console.log('🚀 Todo el proceso de base de datos ha finalizado.');
}

if (require.main === module) {
  initDb().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = initDb;
