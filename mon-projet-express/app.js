const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const db = require('./db');
const upload = require('./multer-config');
const parseCV = require('./parseCV');
const expressLayouts = require('express-ejs-layouts');
const router = express.Router();
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');


const app = express();
const methodOverride = require('method-override');
app.use(express.urlencoded({extended: true}));
app.use(methodOverride('_method'));
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production';


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Middleware journalisation simple
app.use((req, res, next) => {
    console.log(`Requête reçue : ${req.method} ${req.url}`);
    next();
});

// Sécurité HTTP headers
app.use(helmet());

// Rate limiter pour login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Trop de tentatives, réessayez plus tard',
    standardHeaders: true,
    legacyHeaders: false,
});

// Analyse des corps de requêtes
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Setup EJS & layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);

// Session
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24h
    }
}));

// Middleware pour injecter user et titre dans toutes les vues
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.title = 'ATS';  // Titre par défaut
    next();
});

// Middleware logs avec date ISO
app.use((req, res, next) => {
    console.log(`[HTTP] ${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Fonction d'échappement HTML pour affichage sécurisé
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Middleware d’authentification
function authRequired(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

// --- ROUTES ---

// Page d'accueil
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('index');
});

// Login GET
app.get('/login', (req, res) => {
    const error = req.session.error || '';
    req.session.error = null;
    res.render('login', {error});
});

// Login POST avec rate limiter
app.post('/login', loginLimiter, async (req, res) => {
    const {username, password} = req.body;
    if (!username || !password || username.length > 50) {
        req.session.error = 'Données invalides';
        return res.redirect('/login');
    }

    try {
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            req.session.error = 'Nom d\'utilisateur ou mot de passe incorrect';
            return res.redirect('/login');
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            req.session.error = 'Nom d\'utilisateur ou mot de passe incorrect';
            return res.redirect('/login');
        }

        req.session.regenerate(err => {
            if (err) {
                req.session.error = 'Erreur serveur';
                return res.redirect('/login');
            }
            req.session.user = {username: user.username, role: user.role};
            res.redirect('/dashboard');
        });
    } catch {
        req.session.error = 'Erreur serveur, réessayez plus tard';
        res.redirect('/login');
    }
});

// Dashboard (auth)
app.get('/dashboard', authRequired, (req, res) => {
    res.locals.title = 'Tableau de bord';
    res.render('dashboard', {user: req.session.user});
});

// Logout
app.get('/logout', authRequired, (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// Upload CV form (auth)
app.get('/upload', authRequired, (req, res) => {
    res.locals.title = 'Upload CV';
    res.render('upload');
});

// Upload CV POST
app.post('/upload', authRequired, upload.single('cv'), async (req, res) => {
    let filePath = null;

    try {
        if (!req.file) {
            return res.status(400).send('Aucun fichier reçu');
        }

        filePath = req.file.path;
        console.log(`[UPLOAD] Fichier reçu : ${req.file.originalname}`);

        await parseCV(filePath);

        res.render('upload-success', {
            filename: req.file.filename
        });

    } catch (err) {
        console.error('[UPLOAD] Erreur analyse CV:', err);
        res.status(500).send(`Erreur lors de l'analyse du CV: ${err.message}`);
    } finally {
        if (filePath) {
            try {
                await fs.unlink(filePath);
                console.log(`[CLEANUP] Fichier supprimé : ${filePath}`);
            } catch (cleanupErr) {
                console.warn(`[CLEANUP] Erreur suppression fichier : ${cleanupErr.message}`);
            }
        }
    }
});

// Liste candidats (auth)
app.get('/candidates', authRequired, (req, res) => {
    // Modified query to include application information
    // This assumes candidates are linked to users by email or you need to create a relationship
    const query = `
        SELECT c.*,
               CASE
                   WHEN EXISTS (SELECT 1
                                    FROM candidatures cu
                                             INNER JOIN users u ON cu.username = u.username
                                    WHERE u.username = c.email
                                       OR u.username = c.name) THEN 1
                   ELSE 0
                   END                         AS has_application,
               (SELECT COUNT(*)
                    FROM candidatures cu
                             INNER JOIN users u ON cu.username = u.username
                    WHERE u.username = c.email
                       OR u.username = c.name) AS application_count
            FROM candidates c
            ORDER BY c.upload_date DESC
    `;

    db.all(query, [], (err, candidates) => {
        if (err) {
            console.error('❌ Erreur récupération candidats :', err.message);
            return res.status(500).send('Erreur serveur');
        }

        // Convert has_application to boolean for easier template handling
        candidates = candidates.map(c => ({
            ...c,
            has_application: Boolean(c.has_application),
            application_count: c.application_count || 0
        }));

        res.render('candidates', {
            candidates,
            user: req.session.user
        });
    });
});

// Suppression candidat (auth)
app.post('/candidates/delete/:id', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).send('ID invalide');

    db.run('DELETE FROM candidates WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Erreur suppression candidat :', err);
            return res.status(500).send('Erreur base de données');
        }
        res.redirect('/candidates');
    });
});

// Edition candidat - form (auth)
app.get('/candidates/edit/:id', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).send('ID invalide');

    db.get('SELECT * FROM candidates WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erreur récupération candidat :', err);
            return res.status(500).send('Erreur base de données');
        }
        if (!row) return res.status(404).send('Candidat non trouvé');
        res.locals.title = 'Modifier candidat';
        res.render('candidate-edit', {c: row});
    });
});

// Edition candidat - POST update (auth)
app.post('/candidates/edit/:id', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).send('ID invalide');

    const {name, email, phone, skills, languages} = req.body;

    db.run(
        `UPDATE candidates
         SET name      = ?,
             email     = ?,
             phone     = ?,
             skills    = ?,
             languages = ?
             WHERE id = ?`,
        [name, email, phone, skills, languages, id],
        function (err) {
            if (err) {
                console.error('Erreur mise à jour candidat :', err);
                return res.status(500).send('Erreur base de données');
            }
            res.redirect('/candidates');
        }
    );
});

// Multer error handling middleware
app.use((error, req, res, next) => {
    if (error && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send('Fichier trop volumineux (max 10MB)');
    }
    if (error && error.message) {
        return res.status(400).send(`Erreur upload: ${error.message}`);
    }
    console.error('Erreur serveur:', error);
    res.status(500).send('Erreur serveur');
});

// Scan ATS personnalisé - POST (auth)
app.post('/scan-custom', authRequired, async (req, res) => {
    const keywords = req.body.keywords;

    if (!keywords) {
        return res.status(400).send('Veuillez saisir au moins un mot-clé.');
    }

    const keywordList = keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);

    try {
        const candidates = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM candidates', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const results = [];

        for (const candidate of candidates) {
            const content = `
        ${candidate.name || ''}
        ${candidate.email || ''}
        ${candidate.phone || ''}
        ${candidate.skills || ''}
        ${candidate.languages || ''}
      `.toLowerCase();

            let matchCount = 0;

            keywordList.forEach(keyword => {
                if (content.includes(keyword)) {
                    matchCount++;
                }
            });

            const score = Math.round((matchCount / keywordList.length) * 100);

            results.push({
                id: candidate.id,
                name: candidate.name,
                email: candidate.email,
                score,
                matchCount,
                totalKeywords: keywordList.length,
                cv_filename: candidate.cv_filename || null // si tu stockes le nom de fichier
            });

        }

        res.render('scan-results', {
            results,
            keywords: keywordList
        });

    } catch (err) {
        console.error('[SCAN CUSTOM] Erreur :', err);
        res.status(500).send('Erreur lors de l’analyse des CVs.');
    }
});

// Formulaire scan ATS personnalisé
app.get('/scan-custom', (req, res) => {
    res.render('scan-form');
});

// Offres d'emploi - création form (auth)
app.get('/offres/new', authRequired, (req, res) => {
    res.render('offre-new');
});

// Offres d'emploi - création POST (auth)
app.post('/offres/new', authRequired, (req, res) => {
    const {titre, description, localisation, mots_cles} = req.body;
    const date_publication = new Date().toISOString().slice(0, 10);

    db.run(`
        INSERT INTO offres (titre, description, date_publication, localisation, mots_cles)
            VALUES (?, ?, ?, ?, ?)
    `, [titre, description, date_publication, localisation, mots_cles], function (err) {
        if (err) {
            console.error('Erreur ajout offre :', err);
            return res.status(500).send('Erreur base de données');
        }
        res.redirect('/offres');
    });
});

// Liste offres
app.get('/offres', (req, res) => {
    db.all('SELECT * FROM offres ORDER BY id DESC', (err, rows) => {
        if (err) {
            console.error('Erreur chargement offres :', err);
            return res.status(500).send('Erreur DB');
        }
        res.render('offres', {offres: rows});
    });
});

// Postuler à une offre - form (auth)
// 🔓 Page publique de postulation à une offre
app.get('/offres/:id/postuler', (req, res) => {
    const offreId = parseInt(req.params.id, 10);
    db.get('SELECT * FROM offres WHERE id = ?', [offreId], (err, offre) => {
        if (err) {
            console.error('Erreur base de données :', err);
            return res.status(500).send('Erreur base de données');
        }
        if (!offre) {
            return res.status(404).send('Offre non trouvée');
        }
        res.render('postuler', {offre});
    });
});

app.post('/offres/:id/edit', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).send('ID invalide');

    const {titre, description, localisation, mots_cles} = req.body;

    db.run(
        'UPDATE offres SET titre = ?, description = ?, localisation = ?, mots_cles = ? WHERE id = ?',
        [titre, description, localisation, mots_cles, id],
        function (err) {
            if (err) {
                console.error('Erreur mise à jour offre :', err);
                return res.status(500).send('Erreur base de données');
            }
            res.redirect('/offres');
        }
    );
});

// Route pour la liste des postulations
app.get('/postulations', authRequired, (req, res) => {
    res.locals.title = 'Mes postulations';

    // Récupérer les postulations de l'utilisateur connecté
    const sql = `
        SELECT c.*, o.titre AS offre_titre, o.localisation AS offre_localisation
            FROM candidatures c
                     INNER JOIN offres o ON c.offre_id = o.id
            WHERE c.username LIKE ?
            ORDER BY c.date_postulation DESC
    `;

    const usernamePattern = `%${req.session.user.username}%`;

    db.all(sql, [usernamePattern], (err, postulations) => {
        if (err) {
            console.error('Erreur récupération des postulations:', err);
            return res.status(500).render('postulations', {
                error: 'Erreur lors du chargement des postulations',
                postulations: []
            });
        }

        // Si vous n'avez pas de champ 'status' dans votre table, ajoutez un statut par défaut
        const postulationsWithStatus = postulations.map(p => {
            if (!p.status) {
                // Ajouter un statut aléatoire pour la démonstration (à remplacer par vos vraies données)
                const statuses = ['pending', 'pending', 'pending', 'reviewed', 'accepted', 'rejected'];
                p.status = statuses[Math.floor(Math.random() * statuses.length)];
            }
            return p;
        });

        res.render('postulations', {
            postulations: postulationsWithStatus,
            error: null
        });
    });
});

// 📌 Formulaire de modification d'une offre
app.get('/offres/:id/edit', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).send('ID invalide');

    db.get('SELECT * FROM offres WHERE id = ?', [id], (err, offre) => {
        if (err) return res.status(500).send('Erreur base de données');
        if (!offre) return res.status(404).send('Offre introuvable');

        // ✅ Passer 'offre' directement au template EJS
        res.render('edit-offre', {offre});
    });
});


app.put('/offres/:id', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const {titre, description, localisation, mots_cles} = req.body;

    if (!titre || !description || !localisation) {
        return res.status(400).send('Tous les champs obligatoires doivent être remplis');
    }

    db.run(
        'UPDATE offres SET titre = ?, description = ?, localisation = ?, mots_cles = ? WHERE id = ?',
        [titre, description, localisation, mots_cles, id],
        function (err) {
            if (err) {
                console.error('Erreur mise à jour offre :', err);
                return res.status(500).send('Erreur base de données');
            }
            res.redirect('/offres');
        }
    );
});


app.post('/offres/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    console.log('Suppression de l’offre id =', id);
    db.run('DELETE FROM offres WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).send('Erreur suppression');
        res.redirect('/offres'); // doit renvoyer vers la liste
    });
});


// 🔓 Traitement de candidature publique
app.post('/offres/:id/postuler', upload.single('cv'), async (req, res) => {
    const {nom, email, message} = req.body;
    const offreId = parseInt(req.params.id, 10);

    if (!nom || !email || !message || !req.file) {
        return res.status(400).send('Tous les champs sont obligatoires, y compris le CV.');
    }

    const filePath = req.file.path;

    try {
        console.log(`[POSTULATION PUBLIQUE] CV reçu : ${req.file.originalname}`);

        const result = await parseCV(filePath);

        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO candidates (name, email, phone, skills, languages, cv_filename, upload_date)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
                result.name || nom,
                result.email || email,
                result.phone || null,
                result.skills || null,
                result.languages || null,
                req.file.filename
            ], function (err) {
                if (err) reject(err);
                else resolve();
            });
        });

        // On enregistre aussi le message dans la table `candidatures`
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO candidatures (offre_id, username, message)
                    VALUES (?, ?, ?)
            `, [offreId, `${nom} <${email}>`, message], function (err) {
                if (err) reject(err);
                else resolve();
            });
        });

        res.send(`✅ Merci ${nom}, votre candidature a été envoyée avec succès ! <br><br><a href="/offres">⬅ Retour aux offres</a>`);

    } catch (err) {
        console.error('[POSTULATION ERREUR]', err);
        res.status(500).send('Erreur lors du traitement de la candidature.');
    } finally {
        try {
            await fs.unlink(filePath);
        } catch (e) {
            console.warn('[CLEANUP FILE ERROR]', e.message);
        }
    }
});


// Formulaire contact GET


app.get('/contact', async (req, res) => {
    try {
        const messages = await db.all('SELECT * FROM messages ORDER BY id DESC');
        const successMessage = req.session.successMessage || null;
        const errorMessage = req.session.errorMessage || null;

        req.session.successMessage = null;
        req.session.errorMessage = null;

        res.render('contact', {
            successMessage,
            errorMessage,
            messages // 👈 ici on passe bien les messages à la vue
        });
    } catch (err) {
        console.error('Erreur lors de la récupération des messages :', err);
        res.render('contact', {
            successMessage: null,
            errorMessage: 'Erreur lors du chargement des messages.',
            messages: []
        });
    }
});


app.post('/contact', async (req, res) => {
    const {nom, email, message} = req.body;
    if (!nom || !email || !message) {
        req.session.errorMessage = "Tous les champs sont obligatoires.";
        return res.redirect('/contact');
    }

    try {
        await db.run('INSERT INTO messages (nom, email, message) VALUES (?, ?, ?)', [nom, email, message]);
        req.session.successMessage = "Votre message a bien été envoyé !";
    } catch (err) {
        console.error(err);
        req.session.errorMessage = "Erreur lors de l’envoi du message.";
    }

    res.redirect('/contact');
});


app.get('/messages', authRequired, (req, res) => {
    const sql = `SELECT *
                     FROM messages
                     ORDER BY id DESC`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erreur récupération des messages :', err.message);
            return res.render('messages', {
                errorMessage: 'Erreur chargement des messages.',
                successMessage: null,
                messages: []
            });
        }

        res.render('messages', {
            messages: rows,
            successMessage: req.session.successMessage || null,
            errorMessage: req.session.errorMessage || null
        });

        req.session.successMessage = null;
        req.session.errorMessage = null;
    });
});


// Formulaire public pour dépôt de CV (sans authentification)
app.get('/candidature', (req, res) => {
    res.render('candidature');
});

// Traitement de la soumission publique
app.post('/candidature', upload.single('cv'), async (req, res) => {
    if (!req.file) return res.status(400).send("Aucun fichier reçu.");

    const filePath = req.file.path;

    try {
        console.log(`[PUBLIC UPLOAD] CV reçu : ${req.file.originalname}`);

        const result = await parseCV(filePath); // ⚠️ doit retourner { name, email, phone, skills, languages }

        // Insertion en base
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO candidates (name, email, phone, skills, languages, cv_filename, upload_date)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
                result.name || null,
                result.email || null,
                result.phone || null,
                result.skills || null,
                result.languages || null,
                req.file.filename
            ], function (err) {
                if (err) reject(err);
                else resolve();
            });
        });

        res.send(`✅ Merci ! Votre CV a été soumis avec succès. <a href="/">Retour à l'accueil</a>`);
    } catch (err) {
        console.error("[PUBLIC CV ERROR]", err);
        res.status(500).send("Erreur lors du traitement du CV.");
    } finally {
        try {
            await fs.unlink(filePath); // Nettoyage du fichier temporaire
        } catch (e) {
            console.warn("Erreur suppression fichier temporaire :", e.message);
        }
    }
});


function calculateFileScore(fileName, candidat) {
    let score = 0;
    const fileNameLower = fileName.toLowerCase();
    const candidateName = candidat.name ? candidat.name.toLowerCase() : '';
    const candidateEmail = candidat.email ? candidat.email.split('@')[0].toLowerCase() : '';

    console.log(`[SCORE] Calcul pour fichier: ${fileName}, candidat: ${candidat.name}`);

    // Points pour correspondance des mots du nom (priorité haute)
    if (candidateName) {
        const nameWords = candidateName.split(/\s+/);
        nameWords.forEach(word => {
            if (word.length > 2 && fileNameLower.includes(word)) {
                score += 100; // Score élevé pour correspondance de mots du nom
                console.log(`[SCORE] +100 pour mot "${word}" trouvé dans ${fileName}`);
            }
        });
    }

    // Points pour correspondance exacte du nom complet (sans espaces)
    if (candidateName && fileNameLower.includes(candidateName.replace(/\s+/g, ''))) {
        score += 200;
        console.log(`[SCORE] +200 pour nom complet sans espaces`);
    }

    // Points pour correspondance de l'email
    if (candidateEmail && fileNameLower.includes(candidateEmail)) {
        score += 80;
        console.log(`[SCORE] +80 pour email`);
    }

    // Points pour correspondance partielle avec cv_filename stocké
    if (candidat.cv_filename) {
        const storedNameParts = candidat.cv_filename.toLowerCase().split(/[_\s]+/);
        storedNameParts.forEach(part => {
            if (part.length > 2 && fileNameLower.includes(part)) {
                score += 30;
                console.log(`[SCORE] +30 pour partie stockée "${part}"`);
            }
        });
    }

    // Pénalité pour fichiers génériques
    if (fileNameLower.includes('cv1') || fileNameLower.match(/^cv\d*\.pdf$/)) {
        score -= 50;
        console.log(`[SCORE] -50 pour fichier générique`);
    }

    console.log(`[SCORE] Score final pour ${fileName}: ${score}`);
    return score;
}

app.get('/candidates/view/:id', authRequired, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).send('ID invalide');

    db.get('SELECT * FROM candidates WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('[CV VIEW] Erreur DB:', err);
            return res.status(500).send('Erreur base de données');
        }
        if (!row) return res.status(404).send('Candidat non trouvé');

        // Vérifier d'abord si cv_filename existe
        if (!row.cv_filename) {
            console.warn(`[CV VIEW] Pas de cv_filename pour le candidat ID: ${id}`);
            return res.status(404).send('Aucun CV disponible');
        }

        // Construire le chemin du fichier CV
        const filePath = path.join(__dirname, 'uploads', row.cv_filename);
        console.log(`[CV VIEW] Tentative d'accès au fichier: ${filePath}`);

        // Vérifier l'existence du fichier
        fs.access(filePath, fs.constants.F_OK)
            .then(() => {
                console.log(`[CV VIEW] Fichier CV trouvé: ${filePath}`);

                // Ajouter le chemin du fichier aux données du candidat
                const candidatWithFile = {
                    ...row,
                    cv_file_path: filePath,
                    cv_file_url: `/uploads/${row.cv_filename}`,
                    cv_exists: true
                };

                return res.render('cv-viewer', {
                    candidat: candidatWithFile,
                    cv_filename: row.cv_filename,
                    cv_url: `/uploads/${row.cv_filename}`
                });
            })
            .catch((accessErr) => {
                console.error(`[CV VIEW] Fichier CV introuvable: ${filePath}`);
                console.error(`[CV VIEW] Erreur d'accès:`, accessErr);

                // Optionnel: essayer de chercher des fichiers similaires
                const uploadsDir = path.join(__dirname, 'uploads');
                fs.readdir(uploadsDir)
                    .then(files => {
                        console.log(`[CV VIEW] Fichiers disponibles dans uploads:`, files);

                        // Chercher un fichier qui pourrait correspondre au candidat
                        const possibleFiles = files.filter(file => {
                            const fileName = file.toLowerCase();
                            const candidateName = row.name ? row.name.toLowerCase() : '';
                            const storedFileName = row.cv_filename ? row.cv_filename.toLowerCase() : '';

                            // Ignorer les dossiers et fichiers système
                            if (file === 'images' || !file.includes('.')) {
                                return false;
                            }

                            console.log(`[FILTER] Test fichier: ${file} pour candidat: ${row.name}`);

                            const nameWords = candidateName.split(/\s+/);
                            const hasNameMatch = nameWords.some(word =>
                                word.length > 2 && fileName.includes(word)
                            );

                            console.log(`[FILTER] Mots du nom: ${nameWords}, correspondance trouvée: ${hasNameMatch}`);

                            return (
                                // Correspondance par mots du nom de candidat (priorité)
                                hasNameMatch ||
                                // Correspondance par nom complet sans espaces
                                (candidateName && fileName.includes(candidateName.replace(/\s+/g, ''))) ||
                                // Correspondance par ID candidat
                                fileName.includes(`candidate_${id}`) ||
                                // Correspondance par email (si disponible)
                                (row.email && fileName.includes(row.email.split('@')[0].toLowerCase())) ||
                                // Correspondance partielle avec le nom stocké
                                (storedFileName && fileName.includes(storedFileName.split('_')[0]))
                            );
                        });

                        console.log(`[CV VIEW] Fichiers correspondants trouvés:`, possibleFiles);

                        if (possibleFiles.length > 0) {
                            // Trier par pertinence (le plus long match en premier)
                            possibleFiles.sort((a, b) => {
                                const aScore = calculateFileScore(a, row);
                                const bScore = calculateFileScore(b, row);
                                return bScore - aScore;
                            });

                            const alternativeFile = possibleFiles[0];
                            const alternativePath = path.join(uploadsDir, alternativeFile);

                            console.log(`[CV VIEW] Utilisation du fichier alternatif: ${alternativeFile}`);

                            const candidatWithAlternativeFile = {
                                ...row,
                                cv_file_path: alternativePath,
                                cv_file_url: `/uploads/${alternativeFile}`,
                                cv_exists: true,
                                cv_filename: alternativeFile // Mettre à jour le nom du fichier
                            };

                            // Mettre à jour la base de données avec le bon nom de fichier
                            db.run('UPDATE candidates SET cv_filename = ? WHERE id = ?',
                                [alternativeFile, id],
                                (updateErr) => {
                                    if (updateErr) {
                                        console.warn('[CV VIEW] Impossible de mettre à jour cv_filename:', updateErr);
                                    } else {
                                        console.log(`[CV VIEW] cv_filename mis à jour vers: ${alternativeFile}`);
                                    }
                                }
                            );

                            return res.render('cv-viewer', {
                                candidat: candidatWithAlternativeFile,
                                cv_filename: alternativeFile,
                                cv_url: `/uploads/${alternativeFile}`,
                                message: 'CV récupéré avec un nom de fichier corrigé'
                            });
                        } else {
                            return res.status(404).send(`
                <h2>CV non trouvé</h2>
                <p>Fichier recherché: ${row.cv_filename}</p>
                <p>Candidat: ${row.name}</p>
                <p>Fichiers disponibles: ${files.join(', ')}</p>
                <a href="/candidates">Retour à la liste</a>
              `);
                        }
                    })
                    .catch(readdirErr => {
                        console.error('[CV VIEW] Impossible de lire le dossier uploads:', readdirErr);
                        return res.status(404).send('CV non trouvé sur le serveur.');
                    });
            });
    });
});

app.get('/uploads/:filename', authRequired, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    console.log(`[FILE SERVE] Demande de fichier: ${filename}`);

    // Vérifier que le fichier existe
    fs.access(filePath, fs.constants.F_OK)
        .then(() => {
            console.log(`[FILE SERVE] Fichier trouvé, envoi: ${filePath}`);

            // Définir le type de contenu basé sur l'extension
            const ext = path.extname(filename).toLowerCase();
            let contentType = 'application/octet-stream';

            switch (ext) {
                case '.pdf':
                    contentType = 'application/pdf';
                    break;
                case '.doc':
                    contentType = 'application/msword';
                    break;
                case '.docx':
                    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    break;
                case '.txt':
                    contentType = 'text/plain';
                    break;
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

            // Envoyer le fichier
            res.sendFile(filePath, (err) => {
                if (err) {
                    console.error('[FILE SERVE] Erreur envoi fichier:', err);
                    res.status(500).send('Erreur lors de l\'envoi du fichier');
                }
            });
        })
        .catch((err) => {
            console.error(`[FILE SERVE] Fichier non trouvé: ${filePath}`, err);
            res.status(404).send('Fichier non trouvé');
        });
});

// Reports dashboard route
app.get('/reports', authRequired, (req, res) => {
    // Get comprehensive statistics for the reports dashboard
    const queries = [
        'SELECT COUNT(*) AS total FROM candidates',
        'SELECT COUNT(*) AS total FROM offres',
        'SELECT COUNT(*) AS total FROM candidatures',
        'SELECT COUNT(*) AS total FROM messages',
        'SELECT COUNT(*) AS total FROM users WHERE role != "admin"',
        'SELECT COUNT(*) AS recent FROM candidates WHERE upload_date >= datetime("now", "-30 days")',
        'SELECT COUNT(*) AS recent FROM candidatures WHERE date_postulation >= datetime("now", "-7 days")',
        'SELECT COUNT(*) AS recent FROM download_logs WHERE download_date >= datetime("now", "-30 days")',
        // Get the most recent candidate upload date
        'SELECT MAX(upload_date) AS last_upload FROM candidates',
        // Get total downloads if tracking exists
        'SELECT COUNT(*) AS total FROM download_logs'
    ];

    Promise.all(queries.map(query =>
        new Promise((resolve, reject) => {
            db.get(query, (err, row) => {
                if (err) {
                    // Handle cases where download_logs table might not exist
                    if (err.message && err.message.includes('no such table: download_logs')) {
                        resolve({total: 0, recent: 0});
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(row);
                }
            });
        })
    )).then(results => {
        const [
            totalCandidates,
            totalJobs,
            totalApplications,
            totalMessages,
            activeUsers,
            recentCandidates,
            recentApplications,
            recentDownloads,
            lastUpload,
            totalDownloads
        ] = results;

        const stats = {
            totalCandidates: totalCandidates.total || 0,
            totalJobs: totalJobs.total || 0,
            totalApplications: totalApplications.total || 0,
            totalMessages: totalMessages.total || 0,
            activeUsers: activeUsers.total || 0,
            recentCandidates: recentCandidates.recent || 0,
            recentApplications: recentApplications.recent || 0,
            recentDownloads: recentDownloads.recent || 0,
            totalDownloads: totalDownloads.total || 0,
            lastUploadDate: lastUpload.last_upload,

            // Calculate estimated reports generated
            estimatedReports: Math.max(
                Math.floor((totalCandidates.total || 0) / 5), // Assume 1 report per 5 candidates
                (recentDownloads.recent || 0) + 10 // Base number plus recent activity
            ),

            // Calculate changes (simplified for initial load)
            candidatesChange: recentCandidates.recent > 0 ?
                Math.min(Math.round((recentCandidates.recent / Math.max(totalCandidates.total - recentCandidates.recent, 1)) * 100), 100) : 0,
            applicationsChange: recentApplications.recent > 0 ?
                Math.round((recentApplications.recent / Math.max(totalApplications.total - recentApplications.recent, 1)) * 100) : 0
        };

        res.render('reports', {stats});
    }).catch(err => {
        console.error('Error fetching stats:', err);
        // Provide fallback stats if database query fails
        const fallbackStats = {
            totalCandidates: 0,
            totalJobs: 0,
            totalApplications: 0,
            totalMessages: 0,
            activeUsers: 0,
            recentCandidates: 0,
            recentApplications: 0,
            estimatedReports: 0,
            totalDownloads: 0,
            candidatesChange: 0,
            applicationsChange: 0
        };
        res.render('reports', {stats: fallbackStats});
    });
});

// Generate Monthly Activity Report (PDF)
app.get('/reports/download/monthly', authRequired, (req, res) => {
    const doc = new PDFDocument();

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="rapport-activite-mensuelle.pdf"');

    // Pipe PDF to response
    doc.pipe(res);

    // Get data for the last 30 days
    const query = `
        SELECT
            DATE (upload_date) AS DATE, COUNT (*) AS candidates_count
            FROM candidates
            WHERE upload_date >= datetime('now', '-30 days')
            GROUP BY DATE (upload_date)
            ORDER BY DATE DESC
    `;

    db.all(query, (err, rows) => {
        if (err) {
            doc.text('Erreur lors de la génération du rapport', 50, 50);
            doc.end();
            return;
        }

        // PDF Header
        doc.fontSize(20).text('Rapport d\'Activité Mensuelle', 50, 50);
        doc.fontSize(12).text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, 50, 80);
        doc.moveDown(2);

        // Summary section
        doc.fontSize(16).text('Résumé du Mois', 50, 120);
        doc.fontSize(12);

        const totalCandidates = rows.reduce((sum, row) => sum + row.candidates_count, 0);
        doc.text(`Total des candidats: ${totalCandidates}`, 50, 150);
        doc.text(`Nombre de jours actifs: ${rows.length}`, 50, 170);
        doc.text(`Moyenne par jour: ${(totalCandidates / Math.max(rows.length, 1)).toFixed(1)}`, 50, 190);

        // Daily breakdown
        doc.moveDown(2);
        doc.fontSize(16).text('Détail par Jour', 50, 230);
        doc.fontSize(10);

        let yPosition = 260;
        rows.forEach(row => {
            doc.text(`${row.date}: ${row.candidates_count} candidat(s)`, 50, yPosition);
            yPosition += 20;

            // Start new page if needed
            if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
            }
        });

        doc.end();
    });
});

// Generate Performance Report (Excel)
app.get('/reports/download/performance', authRequired, (req, res) => {
    const workbook = new ExcelJS.Workbook();

    // Get performance data
    const queries = [
        `SELECT o.titre,
                o.localisation,
                COUNT(c.id) AS candidatures_count,
                o.date_publication
             FROM offres o
                      LEFT JOIN candidatures c ON o.id = c.offre_id
             GROUP BY o.id`,
        `SELECT strftime('%Y-%m', upload_date) AS MONTH,
      COUNT(*) AS candidates_count
             FROM candidates
             WHERE upload_date >= datetime('now', '-12 months')
             GROUP BY MONTH
             ORDER BY MONTH`
    ];

    Promise.all(queries.map(query =>
        new Promise((resolve, reject) => {
            db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        })
    )).then(([jobsData, monthlyData]) => {
        // Jobs performance sheet
        const jobsSheet = workbook.addWorksheet('Performance des Offres');
        jobsSheet.addRow(['Titre', 'Localisation', 'Candidatures', 'Date Publication']);

        jobsData.forEach(job => {
            jobsSheet.addRow([
                job.titre,
                job.localisation,
                job.candidatures_count,
                job.date_publication
            ]);
        });

        // Monthly trends sheet
        const trendsSheet = workbook.addWorksheet('Tendances Mensuelles');
        trendsSheet.addRow(['Mois', 'Nombre de Candidats']);

        monthlyData.forEach(month => {
            trendsSheet.addRow([month.month, month.candidates_count]);
        });

        // Style headers
        [jobsSheet, trendsSheet].forEach(sheet => {
            sheet.getRow(1).font = {bold: true};
            sheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {argb: 'FFE6E6FA'}
            };
        });

        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="rapport-performance.xlsx"');

        workbook.xlsx.write(res).then(() => {
            res.end();
        });

    }).catch(err => {
        console.error('Error generating Excel report:', err);
        res.status(500).send('Erreur lors de la génération du rapport');
    });
});

// Generate Recruitment Stats Report (JSON/CSV)
app.get('/reports/download/recruitment', authRequired, (req, res) => {
    const format = req.query.format || 'csv';

    const query = `
        SELECT c.name,
               c.email,
               c.skills,
               c.languages,
               c.upload_date,
               COUNT(ca.id) AS applications_count
            FROM candidates c
                     LEFT JOIN candidatures ca ON c.email = (SELECT username
                                                                 FROM users
                                                                 WHERE username = c.email)
            GROUP BY c.id
            ORDER BY c.upload_date DESC
    `;

    db.all(query, (err, rows) => {
        if (err) {
            return res.status(500).send('Erreur lors de la génération du rapport');
        }

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="rapport-recrutement.json"');
            res.json({
                generated_at: new Date().toISOString(),
                total_candidates: rows.length,
                data: rows
            });
        } else {
            // CSV format
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="rapport-recrutement.csv"');

            // CSV headers
            const headers = ['Nom', 'Email', 'Compétences', 'Langues', 'Date d\'ajout', 'Candidatures'];
            let csvContent = headers.join(',') + '\n';

            // CSV data
            rows.forEach(row => {
                const rowData = [
                    `"${row.name || ''}"`,
                    `"${row.email || ''}"`,
                    `"${row.skills || ''}"`,
                    `"${row.languages || ''}"`,
                    `"${row.upload_date || ''}"`,
                    row.applications_count || 0
                ];
                csvContent += rowData.join(',') + '\n';
            });

            res.send(csvContent);
        }
    });
});

// API endpoint for real-time stats (for AJAX updates)
app.get('/api/reports/stats', authRequired, (req, res) => {
    const queries = [
        // Basic counts
        'SELECT COUNT(*) AS COUNT FROM candidates',
        'SELECT COUNT(*) AS COUNT FROM candidates WHERE upload_date >= datetime("now", "-7 days")',
        'SELECT COUNT(*) AS COUNT FROM candidates WHERE upload_date >= datetime("now", "-30 days")',
        'SELECT COUNT(*) AS COUNT FROM candidatures',
        'SELECT COUNT(*) AS COUNT FROM candidatures WHERE date_postulation >= datetime("now", "-7 days")',
        'SELECT COUNT(*) AS COUNT FROM offres WHERE date_publication >= datetime("now", "-30 days")',
        'SELECT COUNT(*) AS COUNT FROM users WHERE ROLE != "admin"', // Active users (non-admin)
        // Download tracking (if table exists)
        'SELECT COUNT(*) AS COUNT FROM download_logs WHERE download_date >= datetime("now", "-30 days")',
        'SELECT COUNT(*) AS COUNT FROM download_logs WHERE download_date >= datetime("now", "-7 days")',
        // Previous period comparisons
        'SELECT COUNT(*) AS COUNT FROM candidates WHERE upload_date >= datetime("now", "-60 days") AND upload_date < datetime("now", "-30 days")',
        'SELECT COUNT(*) AS COUNT FROM candidatures WHERE date_postulation >= datetime("now", "-14 days") AND date_postulation < datetime("now", "-7 days")'
    ];

    Promise.all(queries.map(query =>
        new Promise((resolve, reject) => {
            db.get(query, (err, row) => {
                if (err) {
                    // If download_logs table doesn't exist, return 0 for those queries
                    if (err.message && err.message.includes('no such table: download_logs')) {
                        resolve({count: 0});
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(row || {count: 0});
                }
            });
        })
    )).then(results => {
        const [
            totalCandidates,
            newCandidatesWeek,
            newCandidatesMonth,
            totalApplications,
            newApplicationsWeek,
            newJobsMonth,
            activeUsers,
            downloadsMonth,
            downloadsWeek,
            prevCandidatesMonth,
            prevApplicationsWeek
        ] = results.map(r => r.count);

        // Calculate percentage changes
        const candidatesChange = prevCandidatesMonth > 0 ?
            Math.round(((newCandidatesMonth - prevCandidatesMonth) / prevCandidatesMonth) * 100) :
            (newCandidatesMonth > 0 ? 100 : 0);

        const applicationsChange = prevApplicationsWeek > 0 ?
            Math.round(((newApplicationsWeek - prevApplicationsWeek) / prevApplicationsWeek) * 100) :
            (newApplicationsWeek > 0 ? 100 : 0);

        // Estimate reports generated (3 report types × number of times downloaded)
        const estimatedReports = Math.max(downloadsMonth, Math.floor(totalCandidates / 10) + newJobsMonth);

        res.json({
            // Main statistics
            totalCandidates,
            newCandidatesWeek,
            newCandidatesMonth,
            totalApplications,
            newApplicationsWeek,
            newJobsMonth,
            activeUsers,

            // Report-specific stats
            generatedReports: estimatedReports,
            downloads: downloadsMonth,
            downloadsWeek,

            // Percentage changes
            candidatesChange,
            applicationsChange,
            downloadsChange: downloadsWeek > 0 ? Math.round((downloadsWeek / Math.max(downloadsMonth - downloadsWeek, 1)) * 100) : 0,

            // Additional context
            avgCandidatesPerDay: Math.round(newCandidatesMonth / 30 * 10) / 10,
            conversionRate: totalCandidates > 0 ? Math.round((totalApplications / totalCandidates) * 100) : 0
        });
    }).catch(err => {
        console.error('Error fetching API stats:', err);
        res.status(500).json({error: 'Erreur serveur'});
    });
});

// Page Analytiques
// Add this to your /analytics route
app.get('/analytics', authRequired, (req, res) => {
    // Get real data for the pie chart
    const pieChartQueries = [
        'SELECT COUNT(*) as total FROM candidates',
        'SELECT COUNT(*) as total FROM candidatures',
        'SELECT COUNT(*) as total FROM offres',
        'SELECT COUNT(*) as total FROM candidates WHERE cv_filename IS NOT NULL',
        'SELECT COUNT(*) as total FROM candidates WHERE upload_date >= datetime("now", "-30 days")'
    ];

    Promise.all(pieChartQueries.map(query =>
        new Promise((resolve, reject) => {
            db.get(query, (err, row) => {
                if (err) reject(err);
                else resolve(row.total || 0);
            });
        })
    )).then(results => {
        const [totalCandidates, totalApplications, totalOffers, candidatesWithCV, recentCandidates] = results;

        res.render('analytics', {
            pieData: {
                totalCandidates,
                totalApplications,
                totalOffers,
                candidatesWithCV,
                candidatesWithoutCV: totalCandidates - candidatesWithCV,
                recentCandidates,
                olderCandidates: totalCandidates - recentCandidates
            }
        });
    }).catch(err => {
        console.error('Error fetching pie chart data:', err);
        res.render('analytics', { pieData: null });
    });
});

// Page Rapports
app.get('/reports', (req, res) => {
    res.render('reports'); // Va chercher views/reports.ejs
});

// Page Paramètres
app.get('/settings', (req, res) => {
    res.render('settings'); // Va chercher views/settings.ejs
});


// 404 fallback
app.use((req, res) => {
    res.status(404).render('404');
});

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur ATS lancé sur http://localhost:${PORT}`);
});

