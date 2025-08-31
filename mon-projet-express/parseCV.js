const fs = require('fs').promises;
const path = require('path');
const db = require('./db');

// Try to require PDF parsing library (optional)
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch (err) {
  console.warn('[PARSE] pdf-parse not installed. Install with: npm install pdf-parse');
}

// Try to require Word document parsing library (optional)
let mammoth;
try {
  mammoth = require('mammoth');
} catch (err) {
  console.warn('[PARSE] mammoth not installed. Install with: npm install mammoth');
}

// Fonction principale d'analyse de CV
async function parseCV(filePath) {
  try {
    console.log(`[PARSE] Début analyse du fichier: ${filePath}`);
    
    // 1. Déterminer le type de fichier
    const fileExtension = path.extname(filePath).toLowerCase();
    let fileContent = '';
    
    // 2. Extraire le texte selon le type de fichier
    if (fileExtension === '.pdf') {
      fileContent = await extractPDFText(filePath);
    } else if (fileExtension === '.docx') {
      fileContent = await extractWordText(filePath);
    } else if (fileExtension === '.txt') {
      fileContent = await fs.readFile(filePath, 'utf8');
    } else {
      // Essayer de lire comme texte simple
      console.warn(`[PARSE] Type de fichier non reconnu (${fileExtension}), tentative de lecture en UTF-8`);
      fileContent = await fs.readFile(filePath, 'utf8');
    }
    
    console.log(`[PARSE] Contenu extrait (${fileContent.length} caractères):`, fileContent.substring(0, 200) + '...');
    
    // 3. Analyser le contenu
    const extractedData = extractCVData(fileContent);
    
    // 4. Générer le nom de fichier basé sur le nom du candidat
    const originalFileName = path.basename(filePath);
    let newFileName = originalFileName;
    
    if (extractedData.name !== 'N/A') {
      // Nettoyer le nom pour créer un nom de fichier valide
      const cleanName = extractedData.name
        .replace(/[^a-zA-Z0-9àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ\s-]/g, '') // Garder les caractères alphanumériques, espaces et tirets
        .replace(/\s+/g, '_') // Remplacer les espaces par des underscores
        .toLowerCase();
      
      newFileName = `CV_${cleanName}${fileExtension}`;
    }
    
    // 5. Sauvegarder en base avec la structure existante
    await saveCandidateToDatabase(extractedData, fileContent, newFileName);
    
    console.log(`[PARSE] Analyse terminée avec succès`);
    return extractedData;
    
  } catch (error) {
    console.error(`[PARSE] Erreur lors de l'analyse:`, error);
    throw new Error(`Impossible d'analyser le CV: ${error.message}`);
  }
}

// Fonction pour extraire le texte d'un PDF
async function extractPDFText(filePath) {
  if (!pdfParse) {
    throw new Error('pdf-parse non installé. Installez avec: npm install pdf-parse');
  }
  
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    console.log(`[PDF] Texte extrait du PDF (${data.text.length} caractères)`);
    return data.text;
  } catch (error) {
    console.error('[PDF] Erreur extraction PDF:', error);
    throw new Error(`Impossible de lire le PDF: ${error.message}`);
  }
}

// Fonction pour extraire le texte d'un document Word
async function extractWordText(filePath) {
  if (!mammoth) {
    throw new Error('mammoth non installé. Installez avec: npm install mammoth');
  }
  
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    console.log(`[WORD] Texte extrait du document Word (${result.value.length} caractères)`);
    return result.value;
  } catch (error) {
    console.error('[WORD] Erreur extraction Word:', error);
    throw new Error(`Impossible de lire le document Word: ${error.message}`);
  }
}

// Fonction d'extraction des données
function extractCVData(content) {
  const data = {
    name: 'N/A',
    email: 'N/A',
    phone: 'N/A',
    skills: 'N/A',
    languages: 'N/A'
  };
  
  // Extraction email
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    data.email = emailMatch[0];
  }
  
  // Extraction téléphone pour France, Canada/USA et Maroc
  const countryPhonePatterns = [

    // Maroc (+212)
    {
      patterns: [
        /\+212\s?[5-7][0-9][\s.-]?[0-9]{2}[\s.-]?[0-9]{2}[\s.-]?[0-9]{2}/g,
        /00212\s?[5-7][0-9][\s.-]?[0-9]{2}[\s.-]?[0-9]{2}[\s.-]?[0-9]{2}/g,
        /0[5-7][0-9][\s.-]?[0-9]{2}[\s.-]?[0-9]{2}[\s.-]?[0-9]{2}/g,
        /[5-7][0-9][\s.-]?[0-9]{2}[\s.-]?[0-9]{2}[\s.-]?[0-9]{2}/g
      ],
      code: '+212',
      name: 'Maroc',
      normalize: function(phone) {
        phone = phone.replace(/[\s.-]/g, '');
        if (phone.startsWith('00212')) {
          return '+212' + phone.substring(5);
        } else if (phone.startsWith('0') && phone.length === 10 && /^0[567]/.test(phone)) {
          return '+212' + phone.substring(1);
        } else if (!phone.startsWith('+212') && phone.length === 9 && /^[567]/.test(phone)) {
          return '+212' + phone;
        } else if (phone.startsWith('+212')) {
          return phone;
        }
        return phone;
      }
    }
  ];
  
  let phoneFound = false;
  for (const countryPattern of countryPhonePatterns) {
    if (phoneFound) break;
    
    for (const pattern of countryPattern.patterns) {
      const phoneMatch = content.match(pattern);
      if (phoneMatch) {
        try {
          const normalizedPhone = countryPattern.normalize(phoneMatch[0]);
          data.phone = normalizedPhone;
          phoneFound = true;
          console.log(`[PHONE] Detected ${countryPattern.name} (${countryPattern.code}) number: ${normalizedPhone}`);
          break;
        } catch (error) {
          console.warn(`[PHONE] Error normalizing phone: ${error.message}`);
          continue;
        }
      }
    }
  }
  
  // Extraction nom améliorée avec debug
  const lines = content.split('\n').filter(line => line.trim());
  console.log(`[NAME] Analyzing ${lines.length} lines for name extraction`);
  
  if (lines.length > 0) {
    // Chercher une ligne qui ressemble à un nom dans les 15 premières lignes
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i];
      const cleanLine = line.trim();
      
      console.log(`[NAME] Line ${i}: "${cleanLine}"`);
      
      if (!cleanLine || cleanLine.length < 2) {
        console.log(`[NAME] Line ${i}: Too short, skipping`);
        continue;
      }
      
      // Vérifications d'exclusion
      const exclusions = [
        cleanLine.includes('@'),
        cleanLine.match(/[0-9]{6,}/),
        cleanLine.toLowerCase().includes('cv'),
        cleanLine.toLowerCase().includes('curriculum'),
        cleanLine.toLowerCase().includes('vitae'),
        cleanLine.toLowerCase().includes('resume'),
        cleanLine.toLowerCase().includes('téléphone'),
        cleanLine.toLowerCase().includes('phone'),
        cleanLine.toLowerCase().includes('email'),
        cleanLine.toLowerCase().includes('mail'),
        cleanLine.toLowerCase().includes('adresse'),
        cleanLine.toLowerCase().includes('address'),
        cleanLine.toLowerCase().includes('http'),
        cleanLine.toLowerCase().includes('www'),
        cleanLine.length > 80
      ];
      
      if (exclusions.some(condition => condition)) {
        console.log(`[NAME] Line ${i}: Excluded by filters`);
        continue;
      }
      
      // Vérifier si c'est un nom probable (lettres, espaces, tirets, points, apostrophes)
      const namePattern = /^[a-zA-Z\s\-'.àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŸ]+$/;
      
      if (namePattern.test(cleanLine)) {
        // Vérifier qu'il y a au moins 2 mots ou un mot de plus de 3 lettres
        const words = cleanLine.split(/\s+/).filter(word => word.length > 0);
        
        if (words.length >= 2 || (words.length === 1 && words[0].length > 3)) {
          console.log(`[NAME] Found potential name at line ${i}: "${cleanLine}"`);
          data.name = cleanLine;
          break;
        } else {
          console.log(`[NAME] Line ${i}: Not enough words or too short`);
        }
      } else {
        console.log(`[NAME] Line ${i}: Doesn't match name pattern`);
      }
    }
    
    // Si aucun nom trouvé, essayer une approche plus permissive
    if (data.name === 'N/A') {
      console.log(`[NAME] First pass failed, trying permissive approach`);
      
      for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        const cleanLine = line.trim();
        
        // Approche plus permissive - juste éviter les lignes évidentes
        if (cleanLine && 
            cleanLine.length >= 3 && 
            cleanLine.length <= 100 &&
            !cleanLine.includes('@') &&
            !cleanLine.match(/[0-9]{4,}/) && // Éviter les longs nombres
            !cleanLine.toLowerCase().includes('http') &&
            !cleanLine.toLowerCase().includes('www') &&
            !/^[0-9\s\-\+\(\)\.]+$/.test(cleanLine)) { // Éviter les lignes qui sont juste des numéros
          
          console.log(`[NAME] Permissive match at line ${i}: "${cleanLine}"`);
          data.name = cleanLine;
          break;
        }
      }
    }
    
    // Dernière tentative : utiliser le nom du fichier si disponible
    if (data.name === 'N/A' && typeof fileName !== 'undefined') {
      const fileBaseName = fileName.replace(/\.[^/.]+$/, ''); // Enlever l'extension
      const cleanFileName = fileBaseName
        .replace(/^CV_/i, '') // Enlever le préfixe CV_
        .replace(/_/g, ' ') // Remplacer _ par des espaces
        .replace(/[0-9]+/g, '') // Enlever les nombres
        .trim();
      
      if (cleanFileName.length > 2) {
        console.log(`[NAME] Using filename-based name: "${cleanFileName}"`);
        data.name = cleanFileName;
      }
    }
  }
  
  console.log(`[NAME] Final extracted name: "${data.name}"`);
  
  // Extraction compétences techniques améliorée
  const skillKeywords = [
    // Langages de programmation
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    // Frameworks frontend
    'React', 'Vue', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js',
    // Backend
    'Node.js', 'Express', 'Django', 'Laravel', 'Spring', 'Flask', 'FastAPI',
    // Web
    'HTML', 'HTML5', 'CSS', 'CSS3', 'SASS', 'SCSS', 'Bootstrap', 'Tailwind', 'Material-UI', 'Chakra UI',
    // Bases de données
    'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'Elasticsearch',
    // DevOps et outils
    'Git', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'Linux', 'Jenkins', 'GitLab CI',
    // Design et outils
    'Figma', 'Photoshop', 'Illustrator', 'Adobe XD', 'Sketch',
    // Autres
    'REST API', 'GraphQL', 'Webpack', 'Vite', 'Jest', 'Cypress', 'Selenium'
  ];
  
  const contentLower = content.toLowerCase();
  const foundSkills = [];
  
  for (const skill of skillKeywords) {
    const skillLower = skill.toLowerCase();
    if (contentLower.includes(skillLower)) {
      try {
        // Échapper les caractères spéciaux regex dans le nom de la compétence
        const escapedSkill = skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Vérifier que c'est bien un mot complet (pas une partie d'un autre mot)
        const regex = new RegExp('\\b' + escapedSkill + '\\b', 'i');
        if (regex.test(content)) {
          foundSkills.push(skill);
        }
      } catch (regexError) {
        // Si la regex échoue, utiliser une recherche simple
        console.warn(`[SKILLS] Regex error for skill "${skill}":`, regexError.message);
        if (contentLower.includes(skillLower)) {
          foundSkills.push(skill);
        }
      }
    }
  }
  
  if (foundSkills.length > 0) {
    data.skills = Array.from(new Set(foundSkills)).join(', ');
  }
  
  // Extraction langues améliorée
  const languagePatterns = [
    // Français
    { regex: /\b(?:français|french|francais)\b/gi, name: 'Français' },
    // Anglais
    { regex: /\b(?:anglais|english)\b/gi, name: 'Anglais' },
    // Espagnol
    { regex: /\b(?:espagnol|spanish|español|castellano)\b/gi, name: 'Espagnol' },
    // Allemand
    { regex: /\b(?:allemand|german|deutsch)\b/gi, name: 'Allemand' },
    // Italien
    { regex: /\b(?:italien|italian|italiano)\b/gi, name: 'Italien' },
    // Portugais
    { regex: /\b(?:portugais|portuguese|português)\b/gi, name: 'Portugais' },
    // Autres langues
    { regex: /\b(?:mandarin|chinois|chinese)\b/gi, name: 'Chinois' },
    { regex: /\b(?:japonais|japanese)\b/gi, name: 'Japonais' },
    { regex: /\b(?:coréen|korean)\b/gi, name: 'Coréen' },
    { regex: /\b(?:arabe|arabic)\b/gi, name: 'Arabe' },
    { regex: /\b(?:russe|russian)\b/gi, name: 'Russe' },
    { regex: /\b(?:néerlandais|dutch|nederlands)\b/gi, name: 'Néerlandais' }
  ];
  
  const foundLanguages = [];
  
  for (const langPattern of languagePatterns) {
    if (langPattern.regex.test(content)) {
      foundLanguages.push(langPattern.name);
    }
  }
  
  if (foundLanguages.length > 0) {
    data.languages = Array.from(new Set(foundLanguages)).join(', ');
  }
  
  return data;
}

// Sauvegarde en base de données avec la structure existante
async function saveCandidateToDatabase(extractedData, fullText, fileName) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO candidates (name, email, phone, skills, languages, full_text, cv_filename, upload_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    
    stmt.run([
      extractedData.name,
      extractedData.email,
      extractedData.phone,
      extractedData.skills,
      extractedData.languages,
      fullText,
      fileName || 'CV_unknown.pdf'
    ], function(err) {
      if (err) {
        console.error('[DB] Erreur insertion candidat:', err);
        reject(err);
      } else {
        console.log(`[DB] Candidat sauvegardé avec ID: ${this.lastID}, Fichier: ${fileName}`);
        resolve(this.lastID);
      }
    });
    
    stmt.finalize(); 
  });
}

// IMPORTANT: Exporter la fonction principale
module.exports = parseCV;