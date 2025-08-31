const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('❌ Erreur ouverture DB :', err.message);
  } else {
    console.log('✅ Connexion à la DB SQLite réussie.');
  }
});

db.run(`ALTER TABLE candidates ADD COLUMN cv_filename TEXT`, (err) => {
  if (err) {
    if (err.message.includes("duplicate column name")) {
      console.log('ℹ️ La colonne "cv_filename" existe déjà.');
    } else {
      console.error('❌ Erreur ajout colonne :', err.message);
    }
  } else {
    console.log('✅ Colonne "cv_filename" ajoutée avec succès.');
  }
});

db.close();
