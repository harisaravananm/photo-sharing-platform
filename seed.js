const { db, initSchema } = require('./db');
const { hashPassword, hashPin } = require('./auth');
const { savePhotoFile } = require('./storage');
const fs = require('node:fs');
const path = require('node:path');

function generateSampleSvg(title, bgHex, fgHex) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${bgHex}"/>
    <circle cx="400" cy="250" r="120" fill="${fgHex}" opacity="0.8"/>
    <polygon points="400,160 450,280 350,280" fill="#ffffff" opacity="0.9"/>
    <text x="400" y="440" font-family="'Segoe UI', sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle">${title}</text>
    <text x="400" y="480" font-family="'Segoe UI', sans-serif" font-size="20" fill="#ffffff" opacity="0.8" text-anchor="middle">TrizenAI Photo Platform Demo</text>
  </svg>`;
  return Buffer.from(svg);
}

function runSeed() {
  console.log('🌱 Starting database seeding...');
  initSchema();

  // Clear existing data safely
  db.exec('DELETE FROM galleries;');
  db.exec('DELETE FROM photos;');
  db.exec('DELETE FROM event_members;');
  db.exec('DELETE FROM events;');
  db.exec('DELETE FROM users;');

  // 1. Seed Users
  const adminId = 'usr_admin_01';
  const teamMemberId1 = 'usr_team_01';
  const teamMemberId2 = 'usr_team_02';

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertUser.run(adminId, 'admin@trizen.com', hashPassword('admin123'), 'Admin Lead', 'ADMIN');
  insertUser.run(teamMemberId1, 'team@trizen.com', hashPassword('team123'), 'Rahul Photographer', 'TEAM_MEMBER');
  insertUser.run(teamMemberId2, 'priya@trizen.com', hashPassword('team123'), 'Priya Capture', 'TEAM_MEMBER');

  console.log('✅ Users created:');
  console.log('   - Admin: admin@trizen.com / admin123');
  console.log('   - Team Member: team@trizen.com / team123');

  // 2. Seed Event (Arjun & Priya Wedding)
  const eventId = 'evt_wedding_2026';
  const insertEvent = db.prepare(`
    INSERT INTO events (id, title, description, event_date, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertEvent.run(
    eventId,
    'Arjun & Priya Wedding',
    'Grand wedding celebration event in Bengaluru with 1,250 high-resolution photos.',
    '2026-09-12',
    adminId
  );

  // Assign team members
  const insertMember = db.prepare(`
    INSERT INTO event_members (id, event_id, user_id)
    VALUES (?, ?, ?)
  `);
  insertMember.run('em_01', eventId, teamMemberId1);
  insertMember.run('em_02', eventId, teamMemberId2);

  console.log('✅ Event created: Arjun & Priya Wedding (Assigned 2 Team Members)');

  // 3. Create sample physical photos and seed 1,250 photo metadata records (600 selected)
  const sampleThemes = [
    { title: 'Mandap Vows & Ceremony', bg: '#4A154B', fg: '#E01E5A' },
    { title: 'Couple Sunset Portrait', bg: '#2C3E50', fg: '#E74C3C' },
    { title: 'Sangeet Dance Performance', bg: '#8E44AD', fg: '#F1C40F' },
    { title: 'Haldi Ritual Moments', bg: '#D35400', fg: '#F39C12' },
    { title: 'Family Reception Feast', bg: '#16A085', fg: '#2ECC71' },
    { title: 'Bridal Jewelry Closeup', bg: '#2980B9', fg: '#9B59B6' },
    { title: 'Groom Baraat Arrival', bg: '#C0392B', fg: '#E67E22' },
    { title: 'Ring Exchange Ceremony', bg: '#16A085', fg: '#3498DB' }
  ];

  // Save physical SVG images for the sample gallery
  const physicalPhotoIds = [];
  sampleThemes.forEach((theme, idx) => {
    const buf = generateSampleSvg(theme.title, theme.bg, theme.fg);
    const saved = savePhotoFile({
      fileBuffer: buf,
      originalName: `wedding_${idx + 1}.svg`,
      mimeType: 'image/svg+xml'
    });
    physicalPhotoIds.push(saved);
  });

  const insertPhoto = db.prepare(`
    INSERT INTO photos (id, event_id, uploaded_by, filename, original_name, storage_location, file_size, mime_type, selected_for_gallery, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // We seed 1,250 photo records total as specified in SRD Operational State
  // 600 selected for gallery
  db.exec('BEGIN TRANSACTION;');

  for (let i = 1; i <= 1250; i++) {
    const photoId = `photo_seed_${String(i).padStart(4, '0')}`;
    const physicalSample = physicalPhotoIds[(i - 1) % physicalPhotoIds.length];
    const uploader = i % 2 === 0 ? teamMemberId1 : teamMemberId2;
    const isSelected = i <= 600 ? 1 : 0;
    const themeObj = sampleThemes[(i - 1) % sampleThemes.length];
    const originalName = `Arjun_Priya_Wedding_Shot_${i}_${themeObj.title.replace(/\s+/g, '_')}.jpg`;

    insertPhoto.run(
      photoId,
      eventId,
      uploader,
      physicalSample.filename, // Map to physical SVG so image loads in lightbox
      originalName,
      physicalSample.storageLocation,
      Math.floor(2500000 + Math.random() * 3500000), // ~2.5MB to 6MB
      'image/svg+xml',
      isSelected,
      new Date(Date.now() - (1250 - i) * 60000).toISOString()
    );
  }

  db.exec('COMMIT;');
  console.log('✅ 1,250 photos seeded (600 marked as selected for publishing).');

  // 4. Seed Published Gallery (abc123 with PIN 482917)
  const insertGallery = db.prepare(`
    INSERT INTO galleries (id, event_id, access_slug, pin_hash, status, published_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertGallery.run(
    'gal_wedding_01',
    eventId,
    'abc123',
    hashPin('482917'),
    'PUBLISHED',
    new Date().toISOString()
  );

  console.log('✅ Published Gallery created:');
  console.log('   - Gallery Slug: abc123');
  console.log('   - Access PIN: 482917');
  console.log('   - URL path: /gallery/abc123');
  console.log('🌱 Seeding completed successfully!');
}

if (require.main === module) {
  runSeed();
}

module.exports = { runSeed };
