// Router & View Management
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  renderHeaderNav();
  handleRoute();

  window.addEventListener('popstate', handleRoute);
}

function navigateTo(path) {
  window.history.pushState({}, '', path);
  handleRoute();
}

function handleRoute() {
  const path = window.location.pathname;
  const main = document.getElementById('main-content');

  // Customer Public Gallery URL matching /gallery/:slug
  const galleryMatch = path.match(/^\/gallery\/([^\/]+)$/);
  if (galleryMatch) {
    return renderPublicGalleryView(galleryMatch[1]);
  }

  const user = API.getUser();
  if (!user) {
    return renderLoginView();
  }

  if (user.role === 'ADMIN') {
    if (path.startsWith('/event/')) {
      const eventId = path.split('/')[2];
      return renderAdminEventWorkspaceView(eventId);
    }
    return renderAdminDashboardView();
  } else if (user.role === 'TEAM_MEMBER') {
    if (path.startsWith('/event/')) {
      const eventId = path.split('/')[2];
      return renderTeamUploadWorkspaceView(eventId);
    }
    return renderTeamDashboardView();
  } else {
    return renderLoginView();
  }
}

// ------------------------------------------------------------------
// HEADER NAVIGATION
// ------------------------------------------------------------------
function renderHeaderNav() {
  const container = document.getElementById('user-nav-group');
  const user = API.getUser();

  if (!user) {
    container.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('/login')">Sign In</button>
    `;
    return;
  }

  const roleClass = user.role === 'ADMIN' ? 'admin' : 'team';
  const roleLabel = user.role === 'ADMIN' ? 'Admin Lead' : 'Team Member';

  container.innerHTML = `
    <div class="user-badge">
      <span>${escapeHtml(user.name)}</span>
      <span class="role-pill ${roleClass}">${roleLabel}</span>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="handleLogout()">Logout</button>
  `;
}

function handleLogout() {
  API.logout();
  renderHeaderNav();
  navigateTo('/');
}

// ------------------------------------------------------------------
// VIEW 1: AUTH / LOGIN & REGISTER VIEW
// ------------------------------------------------------------------
function renderLoginView() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h1 class="auth-title">Welcome Back</h1>
        <p class="auth-subtitle">Sign in to access your Photo Sharing Workspace</p>

        <div id="auth-alert" class="hidden"></div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="login-email" class="form-input" placeholder="admin@trizen.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="login-password" class="form-input" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">Sign In</button>
        </form>

        <div class="demo-credentials-box">
          <div class="demo-title">⚡ Quick Demo Evaluation Credentials</div>
          <p>Click any account below to pre-fill login credentials:</p>
          <div class="demo-buttons">
            <button class="btn btn-secondary btn-sm" onclick="fillCredentials('admin@trizen.com', 'admin123')">👑 Admin Lead</button>
            <button class="btn btn-secondary btn-sm" onclick="fillCredentials('team@trizen.com', 'team123')">📷 Team Member</button>
          </div>
        </div>

        <div style="text-align: center; margin-top: 1.5rem; font-size: 0.85rem; color: var(--text-muted);">
          Demo PIN Protected Gallery: <a href="/gallery/abc123" onclick="event.preventDefault(); navigateTo('/gallery/abc123');" style="color: var(--accent); font-weight: 600;">Open Customer Gallery (/gallery/abc123)</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const alertBox = document.getElementById('auth-alert');

    try {
      await API.login(email, password);
      renderHeaderNav();
      navigateTo('/');
    } catch (err) {
      alertBox.className = 'alert alert-error';
      alertBox.textContent = err.message || 'Login failed';
    }
  });
}

function fillCredentials(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
}

// ------------------------------------------------------------------
// VIEW 2: ADMIN DASHBOARD (Events List & Event Creation)
// ------------------------------------------------------------------
async function renderAdminDashboardView() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="dashboard-header">
      <div>
        <h1 class="page-title">Admin Dashboard</h1>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Manage events, team members, and PIN-protected published galleries.</p>
      </div>
      <button class="btn btn-primary" onclick="openCreateEventModal()">+ Create New Event</button>
    </div>

    <div id="events-loading" style="text-align: center; padding: 3rem;">Loading Events...</div>
    <div id="events-grid" class="events-grid hidden"></div>
  `;

  try {
    const data = await API.getEvents();
    const loading = document.getElementById('events-loading');
    const grid = document.getElementById('events-grid');
    loading.classList.add('hidden');
    grid.classList.remove('hidden');

    if (!data.events || data.events.length === 0) {
      grid.innerHTML = `<div class="card" style="grid-column: 1/-1; text-align: center; padding: 3rem;">No events found. Click "+ Create New Event" to get started.</div>`;
      return;
    }

    grid.innerHTML = data.events.map(evt => {
      const isPublished = evt.gallery_status === 'PUBLISHED';
      const statusBadge = isPublished
        ? `<span class="role-pill" style="background: rgba(16,185,129,0.2); color: var(--success);">PUBLISHED</span>`
        : `<span class="role-pill" style="background: rgba(245,158,11,0.2); color: var(--warning);">DRAFT</span>`;

      return `
        <div class="event-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <h3 class="event-title">${escapeHtml(evt.title)}</h3>
            ${statusBadge}
          </div>
          <p class="event-desc">${escapeHtml(evt.description || 'No description provided.')}</p>

          <div class="event-metrics">
            <div class="metric-item">
              <div class="metric-val">${evt.total_photos || 0}</div>
              <div class="metric-lbl">Total Uploads</div>
            </div>
            <div class="metric-item">
              <div class="metric-val" style="color: var(--accent);">${evt.selected_photos || 0}</div>
              <div class="metric-lbl">Selected</div>
            </div>
          </div>

          <div class="event-actions">
            <button class="btn btn-primary btn-sm" style="flex:1;" onclick="navigateTo('/event/${evt.id}')">Manage & Select Photos</button>
            ${evt.access_slug ? `<button class="btn btn-secondary btn-sm" onclick="navigateTo('/gallery/${evt.access_slug}')">View Gallery</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    document.getElementById('events-loading').textContent = 'Failed to load events: ' + err.message;
  }
}

// Create Event Modal
async function openCreateEventModal() {
  let teamMembers = [];
  try {
    const res = await API.getTeamMembers();
    teamMembers = res.teamMembers || [];
  } catch (e) {}

  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-container');

  card.className = 'modal-card';
  card.innerHTML = `
    <h2 style="font-family:'Outfit'; font-size:1.5rem; margin-bottom:1rem;">Create New Event</h2>
    <div id="modal-alert" class="hidden"></div>
    <form id="create-event-form">
      <div class="form-group">
        <label class="form-label">Event Title</label>
        <input type="text" id="evt-title" class="form-input" placeholder="e.g. Royal Palace Wedding 2026" required>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="evt-desc" class="form-textarea" rows="3" placeholder="Event details and instructions..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Event Date</label>
        <input type="date" id="evt-date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label class="form-label">Assign Team Members</label>
        <div style="max-height: 120px; overflow-y: auto; background: rgba(15,23,42,0.5); padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
          ${teamMembers.map(tm => `
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; padding:0.3rem 0; cursor:pointer;">
              <input type="checkbox" name="team_members" value="${tm.id}" checked>
              <span>${escapeHtml(tm.name)} (${escapeHtml(tm.email)})</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div style="display:flex; gap:0.5rem; margin-top:1.5rem; justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Event</button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');

  document.getElementById('create-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('evt-title').value;
    const description = document.getElementById('evt-desc').value;
    const event_date = document.getElementById('evt-date').value;
    const checked = Array.from(document.querySelectorAll('input[name="team_members"]:checked')).map(c => c.value);

    try {
      await API.createEvent({ title, description, event_date, member_ids: checked });
      closeModal();
      renderAdminDashboardView();
    } catch (err) {
      const alertBox = document.getElementById('modal-alert');
      alertBox.className = 'alert alert-error';
      alertBox.textContent = err.message;
    }
  });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ------------------------------------------------------------------
// VIEW 3: ADMIN EVENT WORKSPACE (Review Photos, Selection, Publish)
// ------------------------------------------------------------------
async function renderAdminEventWorkspaceView(eventId) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('/')">&larr; Back to Dashboard</button>
    </div>

    <div id="workspace-header" class="card">Loading event details...</div>

    <div class="photo-workspace-bar">
      <div>
        <h3 style="font-weight: 700;">Uploaded Photos Review</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Select photos to include in the published customer gallery.</p>
      </div>
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer;">
          <input type="checkbox" id="select-all-checkbox" onchange="toggleSelectAll(this, '${eventId}')">
          <span>Select All for Gallery</span>
        </label>
        <button class="btn btn-accent" onclick="openPublishModal('${eventId}')">🚀 Publish Gallery</button>
      </div>
    </div>

    <div id="photos-loading" style="text-align: center; padding: 3rem;">Loading photos...</div>
    <div id="photos-grid" class="photo-grid hidden"></div>
  `;

  loadAdminWorkspaceData(eventId);
}

async function loadAdminWorkspaceData(eventId) {
  try {
    const [evtRes, photosRes] = await Promise.all([
      API.getEvent(eventId),
      API.getEventPhotos(eventId)
    ]);

    const event = evtRes.event;
    const gallery = evtRes.gallery;
    const photos = photosRes.photos || [];

    const header = document.getElementById('workspace-header');
    header.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h1 class="page-title">${escapeHtml(event.title)}</h1>
          <p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(event.description || '')}</p>
        </div>
        <div style="display: flex; gap: 1rem; text-align: right;">
          <div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--primary);">${photos.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Total Uploaded</div>
          </div>
          <div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--accent);" id="selected-counter">
              ${photos.filter(p => p.selected_for_gallery).length}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Selected for Sharing</div>
          </div>
        </div>
      </div>
      ${gallery && gallery.status === 'PUBLISHED' ? `
        <div class="pin-display-box" style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: var(--success);">Gallery Live URL:</strong>
            <a href="/gallery/${gallery.access_slug}" target="_blank" style="color: var(--text-main); font-weight: 600; margin-left: 0.5rem;">
              /gallery/${gallery.access_slug}
            </a>
          </div>
          <div>
            <span style="font-size: 0.85rem; margin-right: 0.5rem;">Configured PIN:</span>
            <span class="pin-code" style="font-size: 1.1rem;">••••••</span>
          </div>
        </div>
      ` : ''}
    `;

    const loading = document.getElementById('photos-loading');
    const grid = document.getElementById('photos-grid');
    loading.classList.add('hidden');
    grid.classList.remove('hidden');

    if (photos.length === 0) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:3rem;">No photos uploaded yet by team members.</div>`;
      return;
    }

    grid.innerHTML = photos.map(photo => {
      const isSelected = photo.selected_for_gallery === 1;
      return `
        <div class="photo-card ${isSelected ? 'selected' : ''}" id="card-${photo.id}">
          <input type="checkbox" class="photo-checkbox" ${isSelected ? 'checked' : ''} onchange="togglePhotoSelection('${eventId}', '${photo.id}', this.checked)">
          <img src="/api/photos/${photo.filename}" class="photo-img" onclick="openLightbox('/api/photos/${photo.filename}', '${escapeHtml(photo.original_name)}')">
          <div class="photo-meta">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${escapeHtml(photo.original_name)}">${escapeHtml(photo.original_name)}</span>
            <span style="color: var(--text-muted);">${(photo.file_size / (1024*1024)).toFixed(1)} MB</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    document.getElementById('workspace-header').textContent = 'Error: ' + err.message;
  }
}

async function togglePhotoSelection(eventId, photoId, selected) {
  try {
    const res = await API.selectPhotos(eventId, { photo_ids: [photoId], selected });
    const card = document.getElementById(`card-${photoId}`);
    if (selected) card.classList.add('selected');
    else card.classList.remove('selected');

    document.getElementById('selected-counter').textContent = res.selected_photos;
  } catch (err) {
    alert('Failed to update selection: ' + err.message);
  }
}

async function toggleSelectAll(checkbox, eventId) {
  const isChecked = checkbox.checked;
  try {
    const res = await API.selectPhotos(eventId, { select_all: isChecked });
    document.getElementById('selected-counter').textContent = res.selected_photos;
    loadAdminWorkspaceData(eventId);
  } catch (err) {
    alert('Failed to select all: ' + err.message);
  }
}

// Publish Gallery Modal
async function openPublishModal(eventId) {
  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-container');

  card.className = 'modal-card';
  card.innerHTML = `
    <h2 style="font-family:'Outfit'; font-size:1.5rem; margin-bottom:0.5rem;">Publish Customer Gallery</h2>
    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.2rem;">Set access credentials for the shareable customer gallery link.</p>
    
    <div id="modal-alert" class="hidden"></div>
    <form id="publish-gallery-form">
      <div class="form-group">
        <label class="form-label">Set 6-Digit Access PIN</label>
        <input type="text" id="pub-pin" class="form-input" value="482917" placeholder="e.g. 482917" maxlength="8" required style="font-family: monospace; font-size: 1.2rem; letter-spacing: 0.1em;">
        <span style="font-size: 0.75rem; color: var(--text-muted);">Customers must enter this PIN to unlock the gallery.</span>
      </div>

      <div class="form-group">
        <label class="form-label">Custom Gallery Link Slug (Optional)</label>
        <input type="text" id="pub-slug" class="form-input" value="abc123" placeholder="abc123">
      </div>

      <div style="display:flex; gap:0.5rem; margin-top:1.5rem; justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-accent">🚀 Publish & Generate Credentials</button>
      </div>
    </form>
  `;

  overlay.classList.remove('hidden');

  document.getElementById('publish-gallery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('pub-pin').value;
    const slug = document.getElementById('pub-slug').value;

    try {
      const res = await API.publishGallery(eventId, pin, slug);
      closeModal();
      alert(`🎉 Gallery Published Successfully!\n\nGallery Link: ${window.location.origin}${res.gallery.gallery_url}\nAccess PIN: ${res.gallery.pin}`);
      renderAdminEventWorkspaceView(eventId);
    } catch (err) {
      const alertBox = document.getElementById('modal-alert');
      alertBox.className = 'alert alert-error';
      alertBox.textContent = err.message;
    }
  });
}

// ------------------------------------------------------------------
// VIEW 4: TEAM MEMBER DASHBOARD & UPLOAD WORKSPACE
// ------------------------------------------------------------------
async function renderTeamDashboardView() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="dashboard-header">
      <div>
        <h1 class="page-title">Team Member Dashboard</h1>
        <p style="color: var(--text-muted); font-size: 0.9rem;">View your assigned events and upload photograph collections.</p>
      </div>
    </div>

    <div id="events-loading" style="text-align: center; padding: 3rem;">Loading Assigned Events...</div>
    <div id="events-grid" class="events-grid hidden"></div>
  `;

  try {
    const data = await API.getEvents();
    const loading = document.getElementById('events-loading');
    const grid = document.getElementById('events-grid');
    loading.classList.add('hidden');
    grid.classList.remove('hidden');

    if (!data.events || data.events.length === 0) {
      grid.innerHTML = `<div class="card" style="grid-column: 1/-1; text-align: center; padding: 3rem;">No events assigned to you yet. Contact your Admin lead.</div>`;
      return;
    }

    grid.innerHTML = data.events.map(evt => `
      <div class="event-card">
        <h3 class="event-title">${escapeHtml(evt.title)}</h3>
        <p class="event-desc">${escapeHtml(evt.description || '')}</p>
        <div class="event-metrics">
          <div class="metric-item">
            <div class="metric-val">${evt.my_uploaded_photos || 0}</div>
            <div class="metric-lbl">My Uploads</div>
          </div>
          <div class="metric-item">
            <div class="metric-val" style="color: var(--text-muted);">${evt.total_photos || 0}</div>
            <div class="metric-lbl">Event Total</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="navigateTo('/event/${evt.id}')">📷 Upload & View Photos</button>
      </div>
    `).join('');

  } catch (err) {
    document.getElementById('events-loading').textContent = 'Error: ' + err.message;
  }
}

async function renderTeamUploadWorkspaceView(eventId) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('/')">&larr; Back to Dashboard</button>
    </div>

    <div id="team-event-header" class="card">Loading event details...</div>

    <div class="card">
      <h3 style="font-weight: 700; margin-bottom: 0.5rem;">Upload Photos to Event</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">Select or drag & drop high-resolution photographs below.</p>
      
      <div id="upload-dropzone" class="dropzone">
        <svg class="dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 0115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.4rem;">Drag & drop photo files here</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Supports JPG, PNG, WEBP, SVG up to 20MB per photo</div>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('file-input').click()">Browse Files</button>
        <input type="file" id="file-input" multiple accept="image/*" class="hidden" onchange="handleFileSelect(this.files, '${eventId}')">
      </div>

      <div id="upload-status" class="hidden"></div>
    </div>

    <div class="photo-workspace-bar">
      <h3 style="font-weight: 700;">My Uploaded Photos</h3>
    </div>

    <div id="photos-loading" style="text-align: center; padding: 2rem;">Loading photos...</div>
    <div id="photos-grid" class="photo-grid hidden"></div>
  `;

  try {
    const evtRes = await API.getEvent(eventId);
    document.getElementById('team-event-header').innerHTML = `
      <h1 class="page-title">${escapeHtml(evtRes.event.title)}</h1>
      <p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(evtRes.event.description || '')}</p>
    `;
  } catch (e) {}

  setupDropzone(eventId);
  loadTeamPhotos(eventId);
}

function setupDropzone(eventId) {
  const dropzone = document.getElementById('upload-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFileSelect(files, eventId);
  });
}

async function handleFileSelect(files, eventId) {
  if (!files || files.length === 0) return;

  const statusBox = document.getElementById('upload-status');
  statusBox.className = 'alert alert-success';
  statusBox.textContent = `Uploading ${files.length} photo(s)... Please wait.`;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('photos', files[i]);
  }

  try {
    const res = await API.uploadPhotos(eventId, formData);
    statusBox.textContent = res.message || 'Upload complete!';
    loadTeamPhotos(eventId);
  } catch (err) {
    statusBox.className = 'alert alert-error';
    statusBox.textContent = 'Upload error: ' + err.message;
  }
}

async function loadTeamPhotos(eventId) {
  try {
    const res = await API.getEventPhotos(eventId);
    const photos = res.photos || [];
    const loading = document.getElementById('photos-loading');
    const grid = document.getElementById('photos-grid');
    loading.classList.add('hidden');
    grid.classList.remove('hidden');

    if (photos.length === 0) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:2rem;">No photos uploaded yet.</div>`;
      return;
    }

    grid.innerHTML = photos.map(photo => `
      <div class="photo-card">
        <img src="/api/photos/${photo.filename}" class="photo-img" onclick="openLightbox('/api/photos/${photo.filename}', '${escapeHtml(photo.original_name)}')">
        <div class="photo-meta">
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${escapeHtml(photo.original_name)}</span>
          <span style="color: var(--text-muted);">${(photo.file_size / (1024*1024)).toFixed(1)} MB</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('photos-loading').textContent = 'Error: ' + err.message;
  }
}

// ------------------------------------------------------------------
// VIEW 5: CUSTOMER PUBLIC PIN-PROTECTED GALLERY
// ------------------------------------------------------------------
async function renderPublicGalleryView(accessSlug) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div id="gallery-hero" class="card" style="text-align: center; padding: 2.5rem; background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(236,72,153,0.1));">
      <h1 class="page-title" id="gal-title">Customer Photo Gallery</h1>
      <p id="gal-desc" style="color: var(--text-muted); margin-top: 0.4rem;">PIN Protected Private Event Gallery</p>
    </div>

    <div id="gallery-content">
      <!-- PIN Prompt or Photos Grid -->
    </div>
  `;

  try {
    const meta = await API.getPublicGalleryMeta(accessSlug);
    document.getElementById('gal-title').textContent = meta.title;
    document.getElementById('gal-desc').textContent = `${meta.description || ''} • ${meta.photo_count} Selected Photos`;

    // Check if gallery PIN token exists in session
    const storedToken = sessionStorage.getItem(`gallery_token_${accessSlug}`);
    if (storedToken) {
      loadPublicPhotos(accessSlug, storedToken);
    } else {
      renderPinPrompt(accessSlug);
    }
  } catch (err) {
    document.getElementById('gallery-content').innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem; color: var(--danger);">
        <h2>Gallery Unavailable</h2>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderPinPrompt(accessSlug) {
  const content = document.getElementById('gallery-content');
  content.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(99,102,241,0.15); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
            <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h2 style="font-family:'Outfit'; font-size: 1.5rem;">Enter Gallery Access PIN</h2>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.3rem;">Please enter the PIN provided by the event host to view photographs.</p>
        </div>

        <div id="pin-alert" class="hidden"></div>

        <form id="pin-form">
          <div class="form-group">
            <input type="text" id="input-pin" class="form-input" placeholder="Enter PIN (e.g. 482917)" maxlength="8" required style="text-align: center; font-size: 1.5rem; font-family: monospace; letter-spacing: 0.2em;">
          </div>
          <button type="submit" class="btn btn-accent" style="width: 100%;">Unlock Gallery</button>
        </form>
        
        <div style="margin-top: 1.2rem; padding: 0.8rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.8rem; text-align: center; color: var(--text-muted);">
          ⚡ Trizen SRD Demo Default PIN: <strong style="color: var(--success);">482917</strong>
        </div>
      </div>
    </div>
  `;

  document.getElementById('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('input-pin').value;
    const alertBox = document.getElementById('pin-alert');

    try {
      const res = await API.verifyGalleryPin(accessSlug, pin);
      sessionStorage.setItem(`gallery_token_${accessSlug}`, res.gallery_token);
      loadPublicPhotos(accessSlug, res.gallery_token);
    } catch (err) {
      alertBox.className = 'alert alert-error';
      alertBox.textContent = err.message || 'Incorrect PIN';
    }
  });
}

async function loadPublicPhotos(accessSlug, token) {
  const content = document.getElementById('gallery-content');
  content.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading Published Photos...</div>`;

  try {
    const res = await API.getPublicGalleryPhotos(accessSlug, token);
    const photos = res.photos || [];

    if (photos.length === 0) {
      content.innerHTML = `<div class="card" style="text-align:center; padding:3rem;">No selected photos published in this gallery yet.</div>`;
      return;
    }

    content.innerHTML = `
      <div class="photo-grid">
        ${photos.map(photo => `
          <div class="photo-card">
            <img src="/api/photos/${photo.filename}" class="photo-img" onclick="openLightbox('/api/photos/${photo.filename}', '${escapeHtml(photo.original_name)}')">
            <div class="photo-meta">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${escapeHtml(photo.original_name)}</span>
              <a href="/api/photos/${photo.filename}" download="${escapeHtml(photo.original_name)}" style="color: var(--primary); text-decoration: none; font-weight: 600;">Download</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    sessionStorage.removeItem(`gallery_token_${accessSlug}`);
    renderPinPrompt(accessSlug);
  }
}

// ------------------------------------------------------------------
// GLOBAL LIGHTBOX PREVIEW
// ------------------------------------------------------------------
function openLightbox(imgSrc, title) {
  const overlay = document.getElementById('modal-overlay');
  const card = document.getElementById('modal-container');

  card.className = 'modal-card lightbox-card';
  card.innerHTML = `
    <div style="position: relative; width: 100%; text-align: center;">
      <button class="btn btn-secondary btn-sm" onclick="closeModal()" style="position: absolute; top: -40px; right: 0;">✕ Close</button>
      <img src="${imgSrc}" class="lightbox-img">
      <div style="margin-top: 1rem; color: var(--text-main); font-weight: 600;">${title}</div>
    </div>
  `;

  overlay.classList.remove('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
