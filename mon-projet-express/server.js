// server.js
const app = require('./app');
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(` Serveur lancé sur http://localhost:${port}`);
});
