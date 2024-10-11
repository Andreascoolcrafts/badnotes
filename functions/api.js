const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const NOTES_FILE = path.join(__dirname, 'notes.json');
const USERS_FILE = path.join(__dirname, 'users.json');

async function readNotes() {
    try {
        const data = await fs.readFile(NOTES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading notes:', error);
        return [];
    }
}

async function writeNotes(notes) {
    try {
        await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2));
    } catch (error) {
        console.error('Error writing notes:', error);
    }
}

async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users:', error);
        return [];
    }
}

function isAuthenticated(event) {
    return event.headers.cookie && event.headers.cookie.includes('authToken');
}

exports.handler = async (event, context) => {
    const path = event.path.replace(/^\/\.netlify\/functions\/api/, '');
    const method = event.httpMethod;

    if (path === '/login' && method === 'POST') {
        const { username, password } = JSON.parse(event.body);
        const users = await readUsers();
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            const token = crypto.randomBytes(64).toString('hex');
            return {
                statusCode: 200,
                headers: {
                    'Set-Cookie': `authToken=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`,
                },
                body: JSON.stringify({ success: true, username: user.username, profileImage: user.profileImage }),
            };
        } else {
            return { statusCode: 401, body: JSON.stringify({ error: 'Ungültige Anmeldedaten' }) };
        }
    }

    if (path === '/logout' && method === 'POST') {
        return {
            statusCode: 200,
            headers: {
                'Set-Cookie': 'authToken=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict',
            },
            body: JSON.stringify({ success: true }),
        };
    }

    if (path === '/check-auth' && method === 'GET') {
        if (isAuthenticated(event)) {
            const users = await readUsers();
            const user = users[0]; // Für dieses Beispiel verwenden wir einfach den ersten Benutzer
            return {
                statusCode: 200,
                body: JSON.stringify({ username: user.username, profileImage: user.profileImage }),
            };
        } else {
            return { statusCode: 401, body: JSON.stringify({ error: 'Nicht authentifiziert' }) };
        }
    }

    if (!isAuthenticated(event)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Nicht authentifiziert' }) };
    }

    if (path === '/notes' && method === 'GET') {
        const notes = await readNotes();
        return { statusCode: 200, body: JSON.stringify(notes) };
    }

    if (path.startsWith('/notes/') && method === 'GET') {
        const id = parseInt(path.split('/')[2]);
        const notes = await readNotes();
        const note = notes.find(n => n.id === id);
        if (note) {
            return { statusCode: 200, body: JSON.stringify(note) };
        } else {
            return { statusCode: 404, body: JSON.stringify({ error: 'Note not found' }) };
        }
    }

    if (path === '/notes' && method === 'POST') {
        const notes = await readNotes();
        const newNote = {
            id: Date.now(),
            title: JSON.parse(event.body).title,
            content: JSON.parse(event.body).content,
        };
        notes.push(newNote);
        await writeNotes(notes);
        return { statusCode: 201, body: JSON.stringify(newNote) };
    }

    if (path.startsWith('/notes/') && method === 'PUT') {
        const id = parseInt(path.split('/')[2]);
        const notes = await readNotes();
        const index = notes.findIndex(n => n.id === id);
        if (index !== -1) {
            notes[index] = { ...notes[index], ...JSON.parse(event.body) };
            await writeNotes(notes);
            return { statusCode: 200, body: JSON.stringify(notes[index]) };
        } else {
            return { statusCode: 404, body: JSON.stringify({ error: 'Note not found' }) };
        }
    }

    if (path.startsWith('/notes/') && method === 'DELETE') {
        const id = parseInt(path.split('/')[2]);
        const notes = await readNotes();
        const filteredNotes = notes.filter(n => n.id !== id);
        if (filteredNotes.length < notes.length) {
            await writeNotes(filteredNotes);
            return { statusCode: 204 };
        } else {
            return { statusCode: 404, body: JSON.stringify({ error: 'Note not found' }) };
        }
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
};