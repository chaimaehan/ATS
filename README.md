♟️ ATS - Applicant Tracking System  
Application web intelligente de gestion et d’optimisation du recrutement  

 📖 Description  
ATS est une solution complète de suivi des candidatures (Applicant Tracking System) développée en Node.js / Express.  
Elle permet :  
- la gestion centralisée des candidats et des offres 
- l’analyse automatique des CVs (extraction infos clés : nom, email, compétences, langues…)  
- un matching prédictif basé sur IA pour scorer les candidatures  
- un chatbot RH pour accompagner recruteurs et candidats  
- la génération de rapports (PDF, Excel, CSV, JSON)  



 ⭐ Fonctionnalités principales  
- Authentification sécurisée avec rôles (Admin, Recruteur, Candidat)  
- Tableau de bord et statistiques en temps réel  
- Upload CV (PDF/TXT) + parsing et nettoyage auto  
- Matching prédictif (scan ATS personnalisé par mots-clés)  
- Gestion des offres d’emploi (CRUD)  
- Postulation publique avec CV + message personnalisé  
- Module Analytics avec graphiques interactifs  
- Génération de rapports :  
  - 📄 PDF (activité mensuelle)  
  - 📊 Excel (performance des offres, tendances)  
  - 📑 CSV/JSON (statistiques de recrutement)  
- Formulaire Contact + gestion des messages  
- Sécurité renforcée : Helmet, bcrypt, sessions, rate limiter  



 🏗 Architecture  

 Composants  

Couche Frontend :  
- Vues dynamiques avec EJS  
- Interface responsive avec Bootstrap 5  
- Intégration chatbot RH  

Couche Backend :  
- Express.js (Node.js) pour la logique métier et API REST  
- Sécurité : Helmet, bcrypt, express-session, rate-limit  
- Parsing CV : pdf-parse, mammoth  
- Génération de rapports : PDFKit, ExcelJS  

Couche Données :  
- SQLite3 / MySQL  
- Tables principales :  
  - `users`  
  - `candidates`  
  - `offres`  
  - `candidatures`  
  - `messages`  

---

 ⚙️ Stack technique  

Backend  
- Node.js 18+  
- Express.js 5.1.0  
- pdf-parse, mammoth (analyse CV)  
- PDFKit, ExcelJS (rapports)  

Frontend  
- EJS  
- Bootstrap 5  

Base de données  
- SQLite3 (dev)  
- MySQL (prod)  

Sécurité  
- bcrypt  
- Helmet  
- express-session  
- express-rate-limit  

Outils  
- Postman (tests API)  
- Git/GitHub  
- VS Code  




