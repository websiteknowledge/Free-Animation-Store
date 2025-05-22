const express = require('express');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const db = new sqlite3.Database('./database.sqlite');
const uploadDir = path.join(__dirname, 'videos');
const PORT = process.env.PORT || 3000;

// Ensure the upload folder exists
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(uploadDir));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite' }),
  secret: process.env.SESSION_SECRET || 'dev-secret', // for local use
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// File upload setup
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Routes
app.get('/', (req, res) => {
  db.all('SELECT * FROM videos', (err, videos) => {
    if (err) return res.send('Error loading videos');
    res.render('index', { videos });
  });
});

app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
    const isAdmin = row.count === 0 ? 1 : 0;
    db.run('INSERT INTO users (username, password, isAdmin) VALUES (?, ?, ?)', [username, hashed, isAdmin], err => {
      if (err) return res.send('Username already exists');
      res.redirect('/login');
    });
  });
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (!user) return res.send('User not found');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Wrong password');
    req.session.user = {
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin === 1
    };
    res.redirect('/');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

function requireAdmin(req, res, next) {
  if (req.session.user?.isAdmin) return next();
  res.status(403).send('Admins only');
}

// Admin dashboard
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  db.all('SELECT * FROM videos', (err, videos) => {
    res.render('admin', { videos });
  });
});

// Upload page
app.get('/admin/upload', requireAdmin, (req, res) => res.render('upload'));

app.post('/admin/upload', requireAdmin, upload.fields([
  { name: 'video' }, { name: 'thumbnail' }
]), (req, res) => {
  const { title, description } = req.body;
  const video = req.files.video?.[0];
  const thumb = req.files.thumbnail?.[0];
  if (!video || !thumb) return res.send('Missing files');
  db.run('INSERT INTO videos (filename, title, description, thumbnail) VALUES (?, ?, ?, ?)',
    [video.filename, title, description, thumb.filename],
    err => {
      if (err) return res.send('Upload error');
      res.sendStatus(200);
    });
});

app.get('/admin/edit/:id', requireAdmin, (req, res) => {
  db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, video) => {
    if (!video) return res.send('Video not found');
    res.render('edit', { video });
  });
});

app.post('/admin/edit/:id', requireAdmin, (req, res) => {
  const { title, description } = req.body;
  db.run('UPDATE videos SET title = ?, description = ? WHERE id = ?', [title, description, req.params.id], err => {
    res.redirect('/admin/dashboard');
  });
});

app.post('/admin/delete/:id', requireAdmin, (req, res) => {
  db.get('SELECT * FROM videos WHERE id = ?', [req.params.id], (err, video) => {
    if (!video) return res.send('Video not found');
    fs.unlinkSync(path.join(uploadDir, video.filename));
    fs.unlinkSync(path.join(uploadDir, video.thumbnail));
    db.run('DELETE FROM videos WHERE id = ?', [req.params.id], () => res.redirect('/admin/dashboard'));
  });
});

// Admin: User management
app.get('/admin/users', requireAdmin, (req, res) => {
  db.all('SELECT id, username, isAdmin FROM users', (err, users) => {
    if (err) return res.send('Error loading users');
    res.render('userlist', { users, userSession: req.session.user });
  });
});

app.post('/admin/toggle-admin/:id', requireAdmin, (req, res) => {
  db.get('SELECT isAdmin FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (!row) return res.send('User not found');
    const newVal = row.isAdmin ? 0 : 1;
    db.run('UPDATE users SET isAdmin = ? WHERE id = ?', [newVal, req.params.id], () => {
      res.redirect('/admin/users');
    });
  });
});

app.post('/admin/delete-user/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], () => {
    res.redirect('/admin/users');
  });
});

// Initialize tables
db.run(`CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  title TEXT,
  description TEXT,
  thumbnail TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  isAdmin INTEGER DEFAULT 0
)`);

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});