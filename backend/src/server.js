const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`VBSPU Dashboard API running on http://localhost:${config.port} (${config.env})`);
});
