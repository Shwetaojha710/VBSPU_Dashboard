/*
 * Adds or updates a dashboard login in backend/.env:
 *   npm run add-user -- someone@example.com
 * The password is asked for without showing it, hashed, and stored in AUTH_USERS. AUTH_SECRET
 * is created on first use. Restart the API afterwards so it picks up the change.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { hashPassword } = require('../src/utils/password');

const ENV_PATH = path.join(__dirname, '..', '.env');
const EMAIL_PATTERN = /^[^\s@,:]+@[^\s@,:]+\.[^\s@,:]+$/;

/** Reads a line from the terminal without echoing it. */
const askHidden = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });

/** Sets KEY=value in the .env text, replacing an existing line or appending one. */
const setVar = (text, key, value) => {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
};

const main = async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    console.error('Usage: npm run add-user -- someone@example.com');
    process.exit(1);
  }

  const password = await askHidden('Password (min 8 characters): ');
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if ((await askHidden('Repeat password: ')) !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const current = (env.match(/^AUTH_USERS=(.*)$/m) || [])[1] || '';
  const others = current
    .replace(/^"|"$/g, '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry.slice(0, entry.indexOf(':')).toLowerCase() !== email);
  const existed = others.length !== current.split(',').filter((e) => e.trim()).length;

  env = setVar(env, 'AUTH_USERS', [...others, `${email}:${hashPassword(password)}`].join(','));
  if (!/^AUTH_SECRET=.+$/m.test(env)) {
    env = setVar(env, 'AUTH_SECRET', crypto.randomBytes(32).toString('hex'));
  }
  fs.writeFileSync(ENV_PATH, env);
  console.log(`${existed ? 'Updated' : 'Added'} login for ${email}. Restart the API to apply it.`);
};

main();
