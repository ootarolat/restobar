/**
 * ootarolat
 */

// Tablas de datos de negocio (se sincronizan con la app)
var TABLES = ['meta', 'mesas', 'categorias', 'productos', 'comandas', 'cuentas', 'sesiones', 'movimientos'];
// La tabla 'usuarios' se maneja aparte (nunca se envía al cliente con hashes)
var USERS_SHEET = 'usuarios';

function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('spreadsheetId');
    if (id) {
      ss = SpreadsheetApp.openById(id);
    } else {
      ss = SpreadsheetApp.create('Restobar Data');
      props.setProperty('spreadsheetId', ss.getId());
    }
  }
  return ss;
}

function getSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(['id', 'data']);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 400);
  }
  return sheet;
}

/** Ejecuta esta función una vez para crear la hoja, pestañas y admin por defecto */
function setup() {
  var ss = getSpreadsheet();
  for (var i = 0; i < TABLES.length; i++) {
    getSheet(TABLES[i]);
  }
  getSheet(USERS_SHEET);
  ensureDefaultAdmin();
  Logger.log('Setup completo. Hoja: ' + ss.getUrl());
  return ss.getUrl();
}

// ===== Utilidades de seguridad =====

function sha256(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

function makeSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hashPassword(password, salt) {
  return sha256(salt + ':' + password);
}

function makeToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

// ===== Gestión de usuarios en la hoja =====

function readUsers() {
  var sheet = getSheet(USERS_SHEET);
  var values = sheet.getDataRange().getValues();
  var users = [];
  var rowById = {};
  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) {
      try {
        var u = JSON.parse(values[i][1]);
        users.push(u);
        rowById[u.id] = i + 1;
      } catch (err) { /* fila inválida */ }
    }
  }
  return { users: users, rowById: rowById, sheet: sheet };
}

function writeUser(user) {
  var data = readUsers();
  if (data.rowById[user.id]) {
    data.sheet.getRange(data.rowById[user.id], 1, 1, 2).setValues([[user.id, JSON.stringify(user)]]);
  } else {
    data.sheet.appendRow([user.id, JSON.stringify(user)]);
  }
}

function ensureDefaultAdmin() {
  var data = readUsers();
  if (data.users.length > 0) return;
  createAdmin('admin', 'admin', 'Administrador');
}

function createAdmin(username, password, name) {
  var salt = makeSalt();
  var user = {
    id: 'user-' + makeSalt().slice(0, 12),
    username: username,
    name: name || username,
    role: 'admin',
    salt: salt,
    hash: hashPassword(password, salt),
    active: true,
    updatedAt: Date.now(),
  };
  writeUser(user);
  return user;
}

/**
 * Ejecuta esta función manualmente si no puedes iniciar sesión.
 * Crea (o recrea) el usuario admin con contraseña "admin".
 * Si ya existe un usuario "admin", le resetea la contraseña a "admin".
 */
function resetAdmin() {
  var data = readUsers();
  var existing = null;
  for (var i = 0; i < data.users.length; i++) {
    if (data.users[i].username === 'admin') { existing = data.users[i]; break; }
  }
  if (existing) {
    existing.salt = makeSalt();
    existing.hash = hashPassword('admin', existing.salt);
    existing.role = 'admin';
    existing.active = true;
    existing.updatedAt = Date.now();
    writeUser(existing);
    Logger.log('Admin existente reseteado. usuario=admin, contrasena=admin');
  } else {
    createAdmin('admin', 'admin', 'Administrador');
    Logger.log('Admin creado. usuario=admin, contrasena=admin');
  }
  // Verificación inmediata
  var check = readUsers();
  Logger.log('Total usuarios ahora: ' + check.users.length);
  return 'OK — usuario: admin / contrasena: admin';
}

// Quita campos sensibles antes de enviar al cliente
function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active };
}

// ===== Tokens de sesión =====

function storeToken(token, userId) {
  var cache = CacheService.getScriptCache();
  cache.put('tok_' + token, userId, 21600); // 6 horas
}

function validateToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var userId = cache.get('tok_' + token);
  if (!userId) return null;
  var data = readUsers();
  for (var i = 0; i < data.users.length; i++) {
    if (data.users[i].id === userId && data.users[i].active) return data.users[i];
  }
  return null;
}

// ===== Rutas HTTP =====

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getAll';

  if (action === 'test') {
    return jsonOut({ success: true, message: 'Conexion OK', time: Date.now() });
  }

  // Diagnóstico: confirma que el código NUEVO está desplegado y
  // cuántos usuarios existen (sin exponer hashes ni contraseñas)
  if (action === 'diag') {
    var data = readUsers();
    var usernames = data.users.map(function (u) {
      return { username: u.username, role: u.role, active: u.active, hasHash: !!u.hash };
    });
    return jsonOut({
      success: true,
      version: 'auth-v1',
      totalUsuarios: data.users.length,
      usuarios: usernames,
    });
  }

  if (action === 'getAll') {
    var result = {};
    for (var t = 0; t < TABLES.length; t++) {
      var name = TABLES[t];
      var sheet = getSheet(name);
      var values = sheet.getDataRange().getValues();
      var records = [];
      for (var i = 1; i < values.length; i++) {
        if (values[i][0]) {
          try { records.push(JSON.parse(values[i][1])); } catch (err) { /* skip */ }
        }
      }
      result[name] = records;
    }
    return jsonOut({ success: true, data: result });
  }

  return jsonOut({ success: false, error: 'Accion desconocida: ' + action });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || 'sync';

    // --- Autenticación ---
    if (action === 'login') return handleLogin(body);
    if (action === 'listUsers') return handleListUsers(body);
    if (action === 'saveUser') return handleSaveUser(body);
    if (action === 'deleteUser') return handleDeleteUser(body);
    if (action === 'changePassword') return handleChangePassword(body);

    // --- Sincronización de datos (compatibilidad con app) ---
    var store = body.store;
    if (store && TABLES.indexOf(store) !== -1) {
      return handleSync(store, body.records || []);
    }

    return jsonOut({ success: false, error: 'Accion invalida' });
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

// ===== Handlers de autenticación =====

function handleLogin(body) {
  var username = (body.username || '').trim().toLowerCase();
  var password = body.password || '';
  if (!username || !password) {
    return jsonOut({ success: false, error: 'Faltan credenciales' });
  }
  var data = readUsers();
  for (var i = 0; i < data.users.length; i++) {
    var u = data.users[i];
    if ((u.username || '').toLowerCase() === username && u.active) {
      if (u.salt && u.hash && hashPassword(password, u.salt) === u.hash) {
        var token = makeToken();
        storeToken(token, u.id);
        return jsonOut({ success: true, token: token, user: publicUser(u) });
      }
      break;
    }
  }
  return jsonOut({ success: false, error: 'Usuario o contrasena incorrectos' });
}

function requireAdmin(body) {
  var user = validateToken(body.token);
  if (!user) return { ok: false, resp: jsonOut({ success: false, error: 'Sesion invalida', needLogin: true }) };
  if (user.role !== 'admin') return { ok: false, resp: jsonOut({ success: false, error: 'Requiere administrador' }) };
  return { ok: true, user: user };
}

function handleListUsers(body) {
  var auth = requireAdmin(body);
  if (!auth.ok) return auth.resp;
  var data = readUsers();
  var list = data.users.map(publicUser);
  return jsonOut({ success: true, users: list });
}

function handleSaveUser(body) {
  var auth = requireAdmin(body);
  if (!auth.ok) return auth.resp;

  var payload = body.user || {};
  var username = (payload.username || '').trim();
  var name = (payload.name || '').trim();
  var role = payload.role === 'admin' ? 'admin' : 'mozo';
  var active = payload.active !== false;

  if (!username || !name) {
    return jsonOut({ success: false, error: 'Faltan nombre y usuario' });
  }

  var data = readUsers();

  // Validar unicidad de username (case-insensitive)
  for (var i = 0; i < data.users.length; i++) {
    if ((data.users[i].username || '').toLowerCase() === username.toLowerCase() && data.users[i].id !== payload.id) {
      return jsonOut({ success: false, error: 'El usuario "' + username + '" ya existe' });
    }
  }

  if (payload.id) {
    // Editar
    var existing = null;
    for (var j = 0; j < data.users.length; j++) {
      if (data.users[j].id === payload.id) { existing = data.users[j]; break; }
    }
    if (!existing) return jsonOut({ success: false, error: 'Usuario no encontrado' });

    // Evitar quedarse sin admins activos
    if (existing.role === 'admin' && (role !== 'admin' || !active)) {
      var otherAdmins = countActiveAdmins(data.users, existing.id);
      if (otherAdmins === 0) return jsonOut({ success: false, error: 'Debe existir al menos un administrador activo' });
    }

    existing.username = username;
    existing.name = name;
    existing.role = role;
    existing.active = active;
    existing.updatedAt = Date.now();
    if (payload.password) {
      existing.salt = makeSalt();
      existing.hash = hashPassword(payload.password, existing.salt);
    }
    writeUser(existing);
    return jsonOut({ success: true, user: publicUser(existing) });
  } else {
    // Crear
    if (!payload.password) return jsonOut({ success: false, error: 'La contrasena es obligatoria' });
    var salt = makeSalt();
    var newUser = {
      id: 'user-' + makeSalt().slice(0, 12),
      username: username,
      name: name,
      role: role,
      active: active,
      salt: salt,
      hash: hashPassword(payload.password, salt),
      updatedAt: Date.now(),
    };
    writeUser(newUser);
    return jsonOut({ success: true, user: publicUser(newUser) });
  }
}

function handleDeleteUser(body) {
  var auth = requireAdmin(body);
  if (!auth.ok) return auth.resp;

  var userId = body.userId;
  if (userId === auth.user.id) {
    return jsonOut({ success: false, error: 'No puedes eliminar tu propia cuenta' });
  }

  var data = readUsers();
  var target = null, targetRow = null;
  for (var i = 0; i < data.users.length; i++) {
    if (data.users[i].id === userId) { target = data.users[i]; targetRow = data.rowById[userId]; break; }
  }
  if (!target) return jsonOut({ success: false, error: 'Usuario no encontrado' });

  if (target.role === 'admin' && countActiveAdmins(data.users, userId) === 0) {
    return jsonOut({ success: false, error: 'Debe existir al menos un administrador activo' });
  }

  data.sheet.deleteRow(targetRow);
  return jsonOut({ success: true });
}

function handleChangePassword(body) {
  var user = validateToken(body.token);
  if (!user) return jsonOut({ success: false, error: 'Sesion invalida', needLogin: true });

  var current = body.currentPassword || '';
  var next = body.newPassword || '';
  if (!next) return jsonOut({ success: false, error: 'Nueva contrasena requerida' });
  if (hashPassword(current, user.salt) !== user.hash) {
    return jsonOut({ success: false, error: 'La contrasena actual es incorrecta' });
  }
  user.salt = makeSalt();
  user.hash = hashPassword(next, user.salt);
  user.updatedAt = Date.now();
  writeUser(user);
  return jsonOut({ success: true });
}

function countActiveAdmins(users, excludeId) {
  var n = 0;
  for (var i = 0; i < users.length; i++) {
    if (users[i].role === 'admin' && users[i].active && users[i].id !== excludeId) n++;
  }
  return n;
}

// ===== Sincronización de datos de negocio =====

function handleSync(store, records) {
  var sheet = getSheet(store);
  var values = sheet.getDataRange().getValues();

  var existing = {};
  for (var i = 1; i < values.length; i++) {
    if (values[i][0]) existing[values[i][0]] = i + 1;
  }

  var upserted = 0, skipped = 0;
  for (var r = 0; r < records.length; r++) {
    var record = records[r];
    var id = record.id;
    var updatedAt = record.updatedAt || 0;

    if (existing[id]) {
      var row = existing[id];
      var existingRecord;
      try { existingRecord = JSON.parse(values[row - 1][1]); } catch (err) { existingRecord = {}; }
      if (updatedAt >= (existingRecord.updatedAt || 0)) {
        sheet.getRange(row, 1, 1, 2).setValues([[id, JSON.stringify(record)]]);
        upserted++;
      } else {
        skipped++;
      }
    } else {
      sheet.appendRow([id, JSON.stringify(record)]);
      existing[id] = sheet.getLastRow();
      upserted++;
    }
  }
  return jsonOut({ success: true, upserted: upserted, skipped: skipped });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
