const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

// File paths
const NOTES_FILE = path.join(__dirname, 'notes.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure the upload directory exists
async function ensureUploadDir() {
    try {
        await fs.access(UPLOAD_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            console.log('Upload directory created successfully');
        } else {
            console.error('Error accessing the upload directory:', error);
        }
    }
}

// Start the server only after ensuring the upload directory
ensureUploadDir().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(error => {
    console.error('Error starting the server:', error);
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const username = req.body.username || 'unknown';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${username}_${timestamp}${ext}`);
    }
});
const upload = multer({ storage: storage });

// Utility functions for reading and writing files
async function readFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return [];
    }
}

async function writeFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error);
    }
}

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.cookies.authToken) {
        next();
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
}

// Middleware to check if the user is an admin
function isAdmin(req, res, next) {
    const allowedUsers = ['admin', 'Andreas Rittsel'];
    if (req.cookies.authToken && allowedUsers.includes(req.cookies.authToken.split(':')[0])) {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden' });
    }
}

// Login route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await readFile(USERS_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        const token = `${username}:${crypto.randomBytes(64).toString('hex')}`;
        res.cookie('authToken', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production'
        });
        res.json({ success: true, username: user.username, profileImage: user.profileImage });
    } else {
        res.status(401).json({ error: 'Invalid login credentials' });
    }
});

// Logout route
app.post('/api/logout', (req, res) => {
    res.clearCookie('authToken');
    res.json({ success: true });
});

// GET /api/notes - Get all notes (authenticated users)
app.get('/api/notes', isAuthenticated, async (req, res) => {
    const notes = await readFile(NOTES_FILE);
    res.json(notes);
});

// GET /api/notes/:id - Get a specific note by ID (authenticated users)
app.get('/api/notes/:id', isAuthenticated, async (req, res) => {
    const notes = await readFile(NOTES_FILE);
    const note = notes.find(n => n.id === parseInt(req.params.id));
    if (note) {
        res.json(note);
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

// POST /api/notes - Create a new note (authenticated users)
app.post('/api/notes', isAuthenticated, async (req, res) => {
    const notes = await readFile(NOTES_FILE);
    const newNote = {
        id: Date.now(),
        title: req.body.title,
        content: req.body.content,
        createdBy: req.body.createdBy,
        lastEditedBy: req.body.lastEditedBy
    };
    notes.push(newNote);
    await writeFile(NOTES_FILE, notes);
    res.status(201).json(newNote);
});

// PUT /api/notes/:id - Update a note by ID (authenticated users)
app.put('/api/notes/:id', isAuthenticated, async (req, res) => {
    const notes = await readFile(NOTES_FILE);
    const index = notes.findIndex(n => n.id === parseInt(req.params.id));
    if (index !== -1) {
        notes[index] = { ...notes[index], ...req.body };
        await writeFile(NOTES_FILE, notes);
        res.json(notes[index]);
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

// DELETE /api/notes/:id - Delete a note by ID (authenticated users)
app.delete('/api/notes/:id', isAuthenticated, async (req, res) => {
    const notes = await readFile(NOTES_FILE);
    const filteredNotes = notes.filter(n => n.id !== parseInt(req.params.id));
    if (filteredNotes.length < notes.length) {
        await writeFile(NOTES_FILE, filteredNotes);
        res.status(204).send();
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

// GET /api/users - Get all users (admins only)
app.get('/api/users', isAdmin, async (req, res) => {
    const users = await readFile(USERS_FILE);
    res.json(users.map(user => ({ ...user, password: undefined })));
});

// POST /api/users - Create a new user (admins only)
app.post('/api/users', isAdmin, upload.single('profileImage'), async (req, res) => {
    const { username, password } = req.body;
    const users = await readFile(USERS_FILE);
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already taken' });
    }
    const newUser = {
        username,
        password,
        profileImage: req.file ? `/uploads/${req.file.filename}` : null
    };
    users.push(newUser);
    await writeFile(USERS_FILE, users);
    res.status(201).json({ username: newUser.username, profileImage: newUser.profileImage });
});

// PUT /api/users/:username - Update a user by username (admins only)
app.put('/api/users/:username', isAdmin, upload.single('profileImage'), async (req, res) => {
    const { password } = req.body;
    const users = await readFile(USERS_FILE);
    const userIndex = users.findIndex(u => u.username === req.params.username);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    if (password && password.trim() !== '') {
        users[userIndex].password = password;
    }
    if (req.file) {
        users[userIndex].profileImage = `/uploads/${req.file.filename}`;
    }
    await writeFile(USERS_FILE, users);
    res.json({ username: users[userIndex].username, profileImage: users[userIndex].profileImage });
});

// DELETE /api/users/:username - Delete a user by username (admins only)
app.delete('/api/users/:username', isAdmin, async (req, res) => {
    const users = await readFile(USERS_FILE);
    const filteredUsers = users.filter(u => u.username !== req.params.username);
    if (filteredUsers.length < users.length) {
        await writeFile(USERS_FILE, filteredUsers);
        res.status(204).send();
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// PUT /api/users/profile - Update the current user's profile (authenticated users)
app.put('/api/users/profile', isAuthenticated, upload.single('profileImage'), async (req, res) => {
    const { password } = req.body;
    const username = req.cookies.authToken.split(':')[0];
    const users = await readFile(USERS_FILE);
    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    if (password) {
        users[userIndex].password = password;
    }
    if (req.file) {
        users[userIndex].profileImage = `/uploads/${req.file.filename}`;
    }
    await writeFile(USERS_FILE, users);
    res.json({ username: users[userIndex].username, profileImage: users[userIndex].profileImage });
});

// GET /api/check-auth - Check authentication and retrieve user data
app.get('/api/check-auth', isAuthenticated, async (req, res) => {
    const username = req.cookies.authToken.split(':')[0];
    const users = await readFile(USERS_FILE);
    const user = users.find(u => u.username === username);
    if (user) {
        res.json({ username: user.username, profileImage: user.profileImage });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});
