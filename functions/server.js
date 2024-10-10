const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Port von Vercel oder lokal

app.use(express.json());
app.use(express.static('public')); // Statische Dateien bereitstellen

const NOTES_FILE = path.join(__dirname, 'notes.json');

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

// GET /api/notes - Alle Notizen abrufen
app.get('/api/notes', async (req, res) => {
    const notes = await readNotes();
    res.json(notes);
});

// POST /api/notes - Neue Notiz erstellen
app.post('/api/notes', async (req, res) => {
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
app.put('/api/notes/:id', async (req, res) => {
    const notes = await readNotes();
    const index = notes.findIndex(n => n.id === parseInt(req.params.id));
    if (index !== -1) {
        notes[index] = { ...notes[index], ...req.body };
        await writeNotes(notes);
        res.json(notes[index]);
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

// DELETE /api/notes/:id - Notiz löschen
app.delete('/api/notes/:id', async (req, res) => {
    const notes = await readNotes();
    const filteredNotes = notes.filter(n => n.id !== parseInt(req.params.id));
    if (filteredNotes.length < notes.length) {
        await writeNotes(filteredNotes);
        res.status(204).send();
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Export der App für Vercel
module.exports = app;
