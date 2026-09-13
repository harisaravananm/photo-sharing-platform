const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { db } = require('./db');
const { hashPassword, verifyPassword, hashPin, verifyPin, generateToken, verifyToken } = require('./auth');
const { savePhotoFile, getPhotoFilePath, ALLOWED_MIME_TYPES } = require('./storage');

const PORT = process.env.PORT || 3000;

// Helper to send JSON responses
function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// Helper to send static files
function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('File Not Found');
  }

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
}

// Helper to parse JSON request body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 20 * 1024 * 1024) { // 20MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper to parse multipart/form-data for file uploads
function parseMultipartBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return reject(new Error('No boundary found'));
    const boundary = match[1] || match[2];

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const boundaryBuf = Buffer.from('--' + boundary);
      const parts = [];
      
      let start = 0;
      while (start < buffer.length) {
        const boundaryIdx = buffer.indexOf(boundaryBuf, start);
        if (boundaryIdx === -1) break;
        
        const nextBoundaryIdx = buffer.indexOf(boundaryBuf, boundaryIdx + boundaryBuf.length);
        if (nextBoundaryIdx === -1) break;

        const partBuffer = buffer.slice(boundaryIdx + boundaryBuf.length + 2, nextBoundaryIdx - 2);
        start = nextBoundaryIdx;

        const headerEndIdx = partBuffer.indexOf('\r\n\r\n');
        if (headerEndIdx === -1) continue;

        const headerText = partBuffer.slice(0, headerEndIdx).toString('utf8');
        const contentBuffer = partBuffer.slice(headerEndIdx + 4);

        const nameMatch = headerText.match(/name="([^"]+)"/);
        const filenameMatch = headerText.match(/filename="([^"]+)"/);
        const mimeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

        if (nameMatch) {
          parts.push({
            name: nameMatch[1],
            filename: filenameMatch ? filenameMatch[1] : null,
            mimeType: mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream',
            data: contentBuffer
          });
        }
      }
      resolve(parts);
    });
    req.on('error', reject);
  });
}

// Auth Middleware Helper
function authenticate(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  return verifyToken(token);
}

// Request Handler
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // -------------------------------------------------------------
    // AUTH ROUTES
    // -------------------------------------------------------------

    // POST /api/auth/register (Admin or Team Member registration)
    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseJsonBody(req);
      const { email, password, name, role } = body;

      if (!email || !password || !name) {
        return sendJson(res, 400, { error: 'Email, password, and name are required.' });
      }

      const assignedRole = role === 'ADMIN' ? 'ADMIN' : 'TEAM_MEMBER';
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) {
        return sendJson(res, 400, { error: 'Email is already registered.' });
      }

      const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
      const pwdHash = hashPassword(password);

      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, email.toLowerCase().trim(), pwdHash, name.trim(), assignedRole);

      const token = generateToken({ userId, email, role: assignedRole, name });
      return sendJson(res, 201, {
        message: 'Registration successful',
        user: { id: userId, email, name, role: assignedRole },
        token
      });
    }

    // POST /api/auth/login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseJsonBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      });

      return sendJson(res, 200, {
        message: 'Login successful',
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token
      });
    }

    // GET /api/auth/me
    if (method === 'GET' && pathname === '/api/auth/me') {
      const auth = authenticate(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

      const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(auth.userId);
      if (!user) return sendJson(res, 404, { error: 'User not found' });

      return sendJson(res, 200, { user });
    }

    // GET /api/users/team-members (Admin only)
    if (method === 'GET' && pathname === '/api/users/team-members') {
      const auth = authenticate(req);
      if (!auth || auth.role !== 'ADMIN') {
        return sendJson(res, 403, { error: 'Forbidden: Admin access required.' });
      }

      const teamMembers = db.prepare(`
        SELECT id, email, name, role, created_at
        FROM users
        WHERE role = 'TEAM_MEMBER'
        ORDER BY name ASC
      `).all();

      return sendJson(res, 200, { teamMembers });
    }

    // -------------------------------------------------------------
    // EVENT ROUTES
    // -------------------------------------------------------------

    // GET /api/events
    if (method === 'GET' && pathname === '/api/events') {
      const auth = authenticate(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

      let events = [];
      if (auth.role === 'ADMIN') {
        events = db.prepare(`
          SELECT e.*, u.name as creator_name,
            (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id) as total_photos,
            (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id AND p.selected_for_gallery = 1) as selected_photos,
            g.access_slug, g.status as gallery_status
          FROM events e
          JOIN users u ON e.created_by = u.id
          LEFT JOIN galleries g ON e.id = g.event_id
          ORDER BY e.created_at DESC
        `).all();
      } else {
        // Team member assigned events
        events = db.prepare(`
          SELECT e.*, u.name as creator_name,
            (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id) as total_photos,
            (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id AND p.uploaded_by = ?) as my_uploaded_photos
          FROM events e
          JOIN event_members em ON e.id = em.event_id
          JOIN users u ON e.created_by = u.id
          WHERE em.user_id = ?
          ORDER BY e.created_at DESC
        `).all(auth.userId, auth.userId);
      }

      return sendJson(res, 200, { events });
    }

    // POST /api/events (Admin only)
    if (method === 'POST' && pathname === '/api/events') {
      const auth = authenticate(req);
      if (!auth || auth.role !== 'ADMIN') {
        return sendJson(res, 403, { error: 'Forbidden: Only Admins can create events.' });
      }

      const body = await parseJsonBody(req);
      const { title, description, event_date, member_ids } = body;

      if (!title) {
        return sendJson(res, 400, { error: 'Event title is required.' });
      }

      const eventId = 'evt_' + crypto.randomBytes(8).toString('hex');
      
      db.prepare(`
        INSERT INTO events (id, title, description, event_date, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, title.trim(), description || '', event_date || null, auth.userId);

      // Assign team members if provided
      if (Array.isArray(member_ids) && member_ids.length > 0) {
        const stmt = db.prepare('INSERT OR IGNORE INTO event_members (id, event_id, user_id) VALUES (?, ?, ?)');
        member_ids.forEach(uid => {
          stmt.run('em_' + crypto.randomBytes(6).toString('hex'), eventId, uid);
        });
      }

      const newEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      return sendJson(res, 201, { message: 'Event created successfully', event: newEvent });
    }

    // GET /api/events/:id
    const eventMatch = pathname.match(/^\/api\/events\/([^\/]+)$/);
    if (method === 'GET' && eventMatch) {
      const auth = authenticate(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

      const eventId = eventMatch[1];
      const event = db.prepare(`
        SELECT e.*, u.name as creator_name,
          (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id) as total_photos,
          (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id AND p.selected_for_gallery = 1) as selected_photos,
          g.access_slug, g.status as gallery_status
        FROM events e
        JOIN users u ON e.created_by = u.id
        LEFT JOIN galleries g ON e.id = g.event_id
        WHERE e.id = ?
      `).get(eventId);

      if (!event) return sendJson(res, 404, { error: 'Event not found' });

      // Check access permission
      if (auth.role !== 'ADMIN') {
        const member = db.prepare('SELECT id FROM event_members WHERE event_id = ? AND user_id = ?').get(eventId, auth.userId);
        if (!member) {
          return sendJson(res, 403, { error: 'Forbidden: You are not assigned to this event.' });
        }
      }

      // Get assigned team members
      const members = db.prepare(`
        SELECT u.id, u.name, u.email, em.assigned_at
        FROM event_members em
        JOIN users u ON em.user_id = u.id
        WHERE em.event_id = ?
      `).all(eventId);

      // Get gallery details if admin
      let gallery = null;
      if (auth.role === 'ADMIN') {
        gallery = db.prepare('SELECT id, event_id, access_slug, status, published_at, created_at FROM galleries WHERE event_id = ?').get(eventId);
      }

      return sendJson(res, 200, { event, members, gallery });
    }

    // POST /api/events/:id/members (Admin adds team members)
    const addMemberMatch = pathname.match(/^\/api\/events\/([^\/]+)\/members$/);
    if (method === 'POST' && addMemberMatch) {
      const auth = authenticate(req);
      if (!auth || auth.role !== 'ADMIN') {
        return sendJson(res, 403, { error: 'Forbidden: Only Admins can add team members.' });
      }

      const eventId = addMemberMatch[1];
      const body = await parseJsonBody(req);
      const { user_id } = body;

      if (!user_id) return sendJson(res, 400, { error: 'user_id is required.' });

      const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'TEAM_MEMBER'").get(user_id);
      if (!user) return sendJson(res, 404, { error: 'Team member user not found.' });

      const memberId = 'em_' + crypto.randomBytes(6).toString('hex');
      try {
        db.prepare('INSERT INTO event_members (id, event_id, user_id) VALUES (?, ?, ?)').run(memberId, eventId, user_id);
      } catch (err) {
        return sendJson(res, 400, { error: 'User is already assigned to this event.' });
      }

      return sendJson(res, 200, { message: 'Team member added to event successfully.' });
    }

    // -------------------------------------------------------------
    // PHOTO ROUTES
    // -------------------------------------------------------------

    // GET /api/events/:id/photos
    const photosMatch = pathname.match(/^\/api\/events\/([^\/]+)\/photos$/);
    if (method === 'GET' && photosMatch) {
      const auth = authenticate(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

      const eventId = photosMatch[1];

      // Check access permission
      if (auth.role !== 'ADMIN') {
        const member = db.prepare('SELECT id FROM event_members WHERE event_id = ? AND user_id = ?').get(eventId, auth.userId);
        if (!member) {
          return sendJson(res, 403, { error: 'Forbidden: You are not assigned to this event.' });
        }
      }

      const photos = db.prepare(`
        SELECT p.*, u.name as uploader_name, u.email as uploader_email
        FROM photos p
        JOIN users u ON p.uploaded_by = u.id
        WHERE p.event_id = ?
        ORDER BY p.created_at DESC
      `).all(eventId);

      return sendJson(res, 200, { photos });
    }

    // POST /api/events/:id/photos (Upload photos)
    if (method === 'POST' && photosMatch) {
      const auth = authenticate(req);
      if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

      const eventId = photosMatch[1];

      // Check access permission
      if (auth.role !== 'ADMIN') {
        const member = db.prepare('SELECT id FROM event_members WHERE event_id = ? AND user_id = ?').get(eventId, auth.userId);
        if (!member) {
          return sendJson(res, 403, { error: 'Forbidden: You are not assigned to this event.' });
        }
      }

      const contentType = req.headers['content-type'] || '';
      const uploadedPhotos = [];

      if (contentType.includes('multipart/form-data')) {
        const parts = await parseMultipartBody(req);
        const fileParts = parts.filter(p => p.filename && p.data && p.data.length > 0);

        if (fileParts.length === 0) {
          return sendJson(res, 400, { error: 'No photo files uploaded.' });
        }

        const insertPhoto = db.prepare(`
          INSERT INTO photos (id, event_id, uploaded_by, filename, original_name, storage_location, file_size, mime_type, selected_for_gallery)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        for (const filePart of fileParts) {
          const saved = savePhotoFile({
            fileBuffer: filePart.data,
            originalName: filePart.filename,
            mimeType: filePart.mimeType
          });

          insertPhoto.run(
            saved.photoId,
            eventId,
            auth.userId,
            saved.filename,
            saved.originalName,
            saved.storageLocation,
            saved.fileSize,
            saved.mimeType
          );

          uploadedPhotos.push({
            id: saved.photoId,
            filename: saved.filename,
            original_name: saved.originalName,
            file_size: saved.fileSize,
            mime_type: saved.mimeType
          });
        }
      } else {
        // Fallback Base64 JSON upload support for batch client APIs
        const body = await parseJsonBody(req);
        const { photos: jsonPhotos } = body;
        if (!Array.isArray(jsonPhotos) || jsonPhotos.length === 0) {
          return sendJson(res, 400, { error: 'No photos payload provided.' });
        }

        const insertPhoto = db.prepare(`
          INSERT INTO photos (id, event_id, uploaded_by, filename, original_name, storage_location, file_size, mime_type, selected_for_gallery)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        for (const item of jsonPhotos) {
          const fileBuffer = Buffer.from(item.base64Data, 'base64');
          const saved = savePhotoFile({
            fileBuffer,
            originalName: item.filename || 'photo.jpg',
            mimeType: item.mimeType || 'image/jpeg'
          });

          insertPhoto.run(
            saved.photoId,
            eventId,
            auth.userId,
            saved.filename,
            saved.originalName,
            saved.storageLocation,
            saved.fileSize,
            saved.mimeType
          );

          uploadedPhotos.push({
            id: saved.photoId,
            filename: saved.filename,
            original_name: saved.originalName,
            file_size: saved.fileSize,
            mime_type: saved.mimeType
          });
        }
      }

      return sendJson(res, 201, {
        message: `Successfully uploaded ${uploadedPhotos.length} photo(s).`,
        photos: uploadedPhotos
      });
    }

    // PATCH /api/events/:id/photos/select (Admin selects/unselects photos for gallery)
    const selectMatch = pathname.match(/^\/api\/events\/([^\/]+)\/photos\/select$/);
    if (method === 'PATCH' && selectMatch) {
      const auth = authenticate(req);
      if (!auth || auth.role !== 'ADMIN') {
        return sendJson(res, 403, { error: 'Forbidden: Only Admins can select photos for gallery.' });
      }

      const eventId = selectMatch[1];
      const body = await parseJsonBody(req);
      const { photo_ids, selected, select_all } = body;

      if (select_all !== undefined) {
        const val = select_all ? 1 : 0;
        db.prepare('UPDATE photos SET selected_for_gallery = ? WHERE event_id = ?').run(val, eventId);
      } else if (Array.isArray(photo_ids)) {
        const val = selected ? 1 : 0;
        const stmt = db.prepare('UPDATE photos SET selected_for_gallery = ? WHERE id = ? AND event_id = ?');
        photo_ids.forEach(pid => stmt.run(val, pid, eventId));
      } else {
        return sendJson(res, 400, { error: 'Specify photo_ids array or select_all boolean.' });
      }

      const counts = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN selected_for_gallery = 1 THEN 1 ELSE 0 END) as selected
        FROM photos WHERE event_id = ?
      `).get(eventId);

      return sendJson(res, 200, {
        message: 'Photo selection updated',
        total_photos: counts.total,
        selected_photos: counts.selected || 0
      });
    }

    // -------------------------------------------------------------
    // GALLERY MANAGEMENT ROUTES
    // -------------------------------------------------------------

    // POST /api/events/:id/publish (Admin publishes gallery)
    const publishMatch = pathname.match(/^\/api\/events\/([^\/]+)\/publish$/);
    if (method === 'POST' && publishMatch) {
      const auth = authenticate(req);
      if (!auth || auth.role !== 'ADMIN') {
        return sendJson(res, 403, { error: 'Forbidden: Only Admins can publish galleries.' });
      }

      const eventId = publishMatch[1];
      const body = await parseJsonBody(req);
      let { pin, access_slug } = body;

      if (!pin || String(pin).trim().length < 4) {
        return sendJson(res, 400, { error: 'Access PIN must be at least 4 digits.' });
      }

      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!event) return sendJson(res, 404, { error: 'Event not found' });

      const selectedCount = db.prepare('SELECT COUNT(*) as cnt FROM photos WHERE event_id = ? AND selected_for_gallery = 1').get(eventId);
      if (selectedCount.cnt === 0) {
        return sendJson(res, 400, { error: 'Cannot publish gallery without selecting at least 1 photo.' });
      }

      if (!access_slug) {
        access_slug = 'gal_' + crypto.randomBytes(4).toString('hex');
      }

      const pinHash = hashPin(String(pin).trim());
      const now = new Date().toISOString();

      const existingGallery = db.prepare('SELECT id FROM galleries WHERE event_id = ?').get(eventId);
      let galleryId = '';

      if (existingGallery) {
        galleryId = existingGallery.id;
        db.prepare(`
          UPDATE galleries
          SET access_slug = ?, pin_hash = ?, status = 'PUBLISHED', published_at = ?
          WHERE id = ?
        `).run(access_slug, pinHash, now, galleryId);
      } else {
        galleryId = 'gal_' + crypto.randomBytes(6).toString('hex');
        db.prepare(`
          INSERT INTO galleries (id, event_id, access_slug, pin_hash, status, published_at)
          VALUES (?, ?, ?, ?, 'PUBLISHED', ?)
        `).run(galleryId, eventId, access_slug, pinHash, now);
      }

      const galleryUrl = `/gallery/${access_slug}`;

      return sendJson(res, 200, {
        message: 'Gallery published successfully!',
        gallery: {
          id: galleryId,
          event_id: eventId,
          access_slug,
          gallery_url: galleryUrl,
          pin: String(pin).trim(),
          published_at: now,
          selected_photos: selectedCount.cnt
        }
      });
    }

    // -------------------------------------------------------------
    // CUSTOMER PUBLIC GALLERY ROUTES
    // -------------------------------------------------------------

    // GET /api/public/gallery/:slug/meta (Get public gallery metadata)
    const publicMetaMatch = pathname.match(/^\/api\/public\/gallery\/([^\/]+)\/meta$/);
    if (method === 'GET' && publicMetaMatch) {
      const slug = publicMetaMatch[1];
      const gallery = db.prepare(`
        SELECT g.access_slug, g.status, e.title as event_title, e.description as event_description, e.event_date,
          (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id AND p.selected_for_gallery = 1) as photo_count
        FROM galleries g
        JOIN events e ON g.event_id = e.id
        WHERE g.access_slug = ?
      `).get(slug);

      if (!gallery || gallery.status !== 'PUBLISHED') {
        return sendJson(res, 404, { error: 'Gallery not found or not published.' });
      }

      return sendJson(res, 200, {
        title: gallery.event_title,
        description: gallery.event_description,
        event_date: gallery.event_date,
        photo_count: gallery.photo_count,
        access_slug: gallery.access_slug
      });
    }

    // POST /api/public/gallery/:slug/verify (Verify PIN and return PIN session token)
    const publicVerifyMatch = pathname.match(/^\/api\/public\/gallery\/([^\/]+)\/verify$/);
    if (method === 'POST' && publicVerifyMatch) {
      const slug = publicVerifyMatch[1];
      const body = await parseJsonBody(req);
      const { pin } = body;

      if (!pin) return sendJson(res, 400, { error: 'PIN is required.' });

      const gallery = db.prepare("SELECT * FROM galleries WHERE access_slug = ? AND status = 'PUBLISHED'").get(slug);
      if (!gallery) {
        return sendJson(res, 404, { error: 'Gallery not found or not published.' });
      }

      if (!verifyPin(String(pin).trim(), gallery.pin_hash)) {
        return sendJson(res, 401, { error: 'Incorrect PIN. Access denied.' });
      }

      // Generate gallery PIN session token (valid 12 hours)
      const token = generateToken({
        type: 'GALLERY_ACCESS',
        galleryId: gallery.id,
        accessSlug: slug
      }, 43200);

      return sendJson(res, 200, {
        message: 'PIN verified successfully.',
        gallery_token: token
      });
    }

    // GET /api/public/gallery/:slug/photos (Fetch published photos using PIN session token)
    const publicPhotosMatch = pathname.match(/^\/api\/public\/gallery\/([^\/]+)\/photos$/);
    if (method === 'GET' && publicPhotosMatch) {
      const slug = publicPhotosMatch[1];
      const token = req.headers['x-gallery-token'] || parsedUrl.searchParams.get('token');

      const verified = verifyToken(token);
      if (!verified || verified.type !== 'GALLERY_ACCESS' || verified.accessSlug !== slug) {
        return sendJson(res, 401, { error: 'Unauthorized: Invalid or expired gallery PIN token.' });
      }

      const gallery = db.prepare("SELECT event_id FROM galleries WHERE access_slug = ? AND status = 'PUBLISHED'").get(slug);
      if (!gallery) {
        return sendJson(res, 404, { error: 'Gallery not found or unpublished.' });
      }

      const photos = db.prepare(`
        SELECT id, filename, original_name, file_size, mime_type, created_at
        FROM photos
        WHERE event_id = ? AND selected_for_gallery = 1
        ORDER BY created_at ASC
      `).all(gallery.event_id);

      return sendJson(res, 200, { photos });
    }

    // Serve uploaded photo files: GET /api/photos/:filename
    const photoFileMatch = pathname.match(/^\/api\/photos\/([^\/]+)$/);
    if (method === 'GET' && photoFileMatch) {
      const filename = photoFileMatch[1];
      const filePath = getPhotoFilePath(filename);
      if (!filePath) {
        return sendJson(res, 404, { error: 'Photo file not found' });
      }

      const ext = path.extname(filename).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.svg') contentType = 'image/svg+xml';

      return sendFile(res, filePath, contentType);
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING & CLIENT ROUTING
    // -------------------------------------------------------------

    const publicDir = path.join(__dirname, 'public');
    let targetFilePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
      const ext = path.extname(targetFilePath).toLowerCase();
      let mime = 'text/html';
      if (ext === '.css') mime = 'text/css';
      else if (ext === '.js') mime = 'application/javascript';
      else if (ext === '.json') mime = 'application/json';
      else if (ext === '.svg') mime = 'image/svg+xml';
      else if (ext === '.png') mime = 'image/png';
      else if (ext === '.jpg') mime = 'image/jpeg';

      return sendFile(res, targetFilePath, mime);
    }

    // SPA Fallback for client side routing
    const indexHtmlPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      return sendFile(res, indexHtmlPath, 'text/html');
    }

    return sendJson(res, 404, { error: 'Route not found' });

  } catch (err) {
    console.error('Server Internal Error:', err);
    return sendJson(res, 500, { error: 'Internal Server Error', details: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Photo Sharing Platform server running on http://localhost:${PORT}`);
  });
}

module.exports = server;
