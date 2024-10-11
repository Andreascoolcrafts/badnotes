const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cookieParser());

// Pfade zu den JSON-Dateien
const NOTES_FILE = path.join(__dirname, 'notes.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Hilfsfunktion zum Lesen der Notizen
async function readNotes() {
    try {
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading notes:', error);
        return [];
    }
}

// Hilfsfunktion zum Schreiben der Notizen
async function writeNotes(notes) {
    try {
        await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2));
    } catch (error) {
        console.error('Error writing notes:', error);
    }
}

// Hilfsfunktion zum Lesen der Benutzer
async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users:', error);
        return [];
    }
}

// Middleware zur Überprüfung der Authentifizierung
function isAuthenticated(req, res, next) {
    if (req.cookies.authToken) {
        next();
    } else {
        res.status(401).json({ error: 'Nicht authentifiziert' });
    }
}

// Login-Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const users = await readUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        const token = `${username}:${crypto.randomBytes(64).toString('hex')}`;
        res.cookie('authToken', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production'
        });
        res.json({ success: true, username: user.username, profileImage: user.profileImage });
    } else {
        res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
});

// Logout-Route
app.post('/api/logout', (req, res) => {
    res.clearCookie('authToken');
    res.json({ success: true });
});

// GET /api/notes - Alle Notizen abrufen
app.get('/api/notes', isAuthenticated, async (req, res) => {
    const notes = await readNotes();
    res.json(notes);
});

// GET /api/notes/:id - Eine bestimmte Notiz abrufen
app.get('/api/notes/:id', isAuthenticated, async (req, res) => {
    const notes = await readNotes();
    const note = notes.find(n => n.id === parseInt(req.params.id));
    if (note) {
        res.json(note);
    } else {
        res.status(404).json({ error: 'Notiz nicht gefunden' });
    }
});

// POST /api/notes - Neue Notiz erstellen
app.post('/api/notes', isAuthenticated, async (req, res) => {
    const notes = await readNotes();
    const newNote = {
        id: Date.now(),
        title: req.body.title,
        content: req.body.content
    };
    notes.push(newNote);
    await writeNotes(notes);
    res.status(201).json(newNote);
});

// PUT /api/notes/:id - Notiz aktualisieren
app.put('/api/notes/:id', isAuthenticated, async (req, res) => {
    const notes = await readNotes();
    const index = notes.findIndex(n => n.id === parseInt(req.params.id));
    if (index !== -1) {
        notes[index] = { ...notes[index], ...req.body };
        await writeNotes(notes);
        res.json(notes[index]);
    } else {
        res.status(404).json({ error: 'Notiz nicht gefunden' });
    }
});

// DELETE /api/notes/:id - Notiz löschen
app.delete('/api/notes/:id', isAuthenticated, async (req, res) => {
    const notes = await readNotes();
    const filteredNotes = notes.filter(n => n.id !== parseInt(req.params.id));
    if (filteredNotes.length < notes.length) {
        await writeNotes(filteredNotes);
        res.status(204).send();
    } else {
        res.status(404).json({ error: 'Notiz nicht gefunden' });
    }
});

// GET /api/check-auth - Authentifizierungsstatus prüfen
app.get('/api/check-auth', async (req, res) => {
    if (req.cookies.authToken) {
        try {
            const users = await readUsers();
            const username = req.cookies.authToken.split(':')[0]; // Annahme: Token-Format ist "username:randomString"
            const user = users.find(u => u.username === username);

            if (user) {
                res.json({
                    username: user.username,
                    profileImage: user.profileImage
                });
            } else {
                res.status(401).json({ error: 'Benutzer nicht gefunden' });
            }
        } catch (error) {
            console.error('Fehler beim Lesen der Benutzerdaten:', error);
            res.status(500).json({ error: 'Interner Serverfehler' });
        }
    } else {
        res.status(401).json({ error: 'Nicht authentifiziert' });
    }
});

// Netlify Function exportieren
module.exports.handler = async (event, context) => {
    return await new Promise((resolve, reject) => {
        app.handle(event, context, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};
