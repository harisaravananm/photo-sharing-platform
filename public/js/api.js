const API = {
  getToken() {
    return localStorage.getItem('trizen_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('trizen_token', token);
    } else {
      localStorage.removeItem('trizen_token');
    }
  },

  getUser() {
    const raw = localStorage.getItem('trizen_user');
    return raw ? JSON.parse(raw) : null;
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('trizen_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('trizen_user');
    }
  },

  async request(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.json) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.json);
    }

    const response = await fetch(endpoint, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status} Error`);
    }
    return data;
  },

  // Auth
  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      json: { email, password }
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  async register(email, password, name, role) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      json: { email, password, name, role }
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  logout() {
    this.setToken('');
    this.setUser(null);
    localStorage.removeItem('gallery_token');
  },

  // Events
  async getEvents() {
    return this.request('/api/events');
  },

  async getEvent(id) {
    return this.request(`/api/events/${id}`);
  },

  async createEvent(eventData) {
    return this.request('/api/events', {
      method: 'POST',
      json: eventData
    });
  },

  async getTeamMembers() {
    return this.request('/api/users/team-members');
  },

  async addTeamMember(eventId, userId) {
    return this.request(`/api/events/${eventId}/members`, {
      method: 'POST',
      json: { user_id: userId }
    });
  },

  // Photos
  async getEventPhotos(eventId) {
    return this.request(`/api/events/${eventId}/photos`);
  },

  async uploadPhotos(eventId, formData) {
    const token = this.getToken();
    const response = await fetch(`/api/events/${eventId}/photos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },

  async selectPhotos(eventId, { photo_ids, selected, select_all }) {
    return this.request(`/api/events/${eventId}/photos/select`, {
      method: 'PATCH',
      json: { photo_ids, selected, select_all }
    });
  },

  // Gallery
  async publishGallery(eventId, pin, access_slug) {
    return this.request(`/api/events/${eventId}/publish`, {
      method: 'POST',
      json: { pin, access_slug }
    });
  },

  // Public Customer Gallery
  async getPublicGalleryMeta(slug) {
    return this.request(`/api/public/gallery/${slug}/meta`);
  },

  async verifyGalleryPin(slug, pin) {
    return this.request(`/api/public/gallery/${slug}/verify`, {
      method: 'POST',
      json: { pin }
    });
  },

  async getPublicGalleryPhotos(slug, galleryToken) {
    return this.request(`/api/public/gallery/${slug}/photos`, {
      headers: {
        'X-Gallery-Token': galleryToken
      }
    });
  }
};
