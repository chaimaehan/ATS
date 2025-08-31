const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('❌ Erreur ouverture DB :', err.message);
  } else {
    console.log('✅ Connexion à la DB SQLite réussie.');
  }
});

db.serialize(() => {
  // 📄 Table candidats
  db.run(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      phone TEXT,
      skills TEXT,
      languages TEXT,
      full_text TEXT,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      photo_path TEXT,
       cv_filename TEXT 
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erreur création table candidates :', err.message);
    } else {
      console.log('✅ Table candidates créée ou déjà existante');
    }
  });

  // 👥 Table utilisateurs
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erreur création table users :', err.message);
    } else {
      console.log('✅ Table users créée ou déjà existante');

      // 🔐 Insertion utilisateurs de test
      const adminHash = bcrypt.hashSync('admin123', 10);
      const recruteurHash = bcrypt.hashSync('recruteur123', 10);

      db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', adminHash, 'admin'], function(err) {
        if (err) {
          console.error('❌ Erreur insertion utilisateur admin :', err.message);
        } else if (this.changes === 0) {
          console.log('ℹ️ Utilisateur admin déjà présent, insertion ignorée');
        } else {
          console.log('✅ Utilisateur admin inséré');
        }
      });

      db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['recruteur', recruteurHash, 'recruteur'], function(err) {
        if (err) {
          console.error('❌ Erreur insertion utilisateur recruteur :', err.message);
        } else if (this.changes === 0) {
          console.log('ℹ️ Utilisateur recruteur déjà présent, insertion ignorée');
        } else {
          console.log('✅ Utilisateur recruteur inséré');
        }
      });
    }
  });

  // 💼 Table offres d'emploi
  db.run(`
    CREATE TABLE IF NOT EXISTS offres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      description TEXT NOT NULL,
      date_publication DATETIME DEFAULT CURRENT_TIMESTAMP,
      localisation TEXT NOT NULL,
      mots_cles TEXT
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erreur création table offres :', err.message);
    } else {
      console.log('✅ Table offres créée ou déjà existante');
    }
  });

  // 📑 Table candidatures
  db.run(`
    CREATE TABLE IF NOT EXISTS candidatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offre_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      message TEXT,
      date_postulation DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (offre_id) REFERENCES offres(id) ON DELETE CASCADE,
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erreur création table candidatures :', err.message);
    } else {
      console.log('✅ Table candidatures créée ou déjà existante');
    }
  });

  // 📬 Table messages de contact
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      email TEXT NOT NULL,
      sujet TEXT,
      message TEXT NOT NULL,
      date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erreur création table messages :', err.message);
    } else {
      console.log('✅ Table messages créée ou déjà existante');
    }
  });
});

module.exports = db;
