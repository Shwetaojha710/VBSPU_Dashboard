# Jenkins setup (GitHub Actions stays as-is)

**Haan — Jenkins alag se install karna padega.**  
GitHub pe push → deploy wala flow (`/.github/workflows/deploy.yml`) pehle jaisa chalta rahega. Jenkins optional / parallel CI hai.

## Option A — Docker (recommended)

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) install karo (Windows).
2. Is folder se:

```bash
cd jenkins
docker compose up -d --build
```

Image mein `git`, `rsync`, `openssh-client` pehle se hain (`Dockerfile`).

3. Browser: http://localhost:8080  
4. Password:

```bash
docker compose exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

5. **Install suggested plugins** → create admin user.

## Option B — Native install (Linux VM)

Ubuntu pe:

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk rsync openssh-client git
# then follow https://www.jenkins.io/doc/book/installing/linux/
```

Windows pe native Jenkins possible hai, lekin Docker simple hai kyunki pipeline Linux `sh` + `rsync` use karti hai.

## Jenkins UI config (ek baar)

### 1) Plugins
Manage Jenkins → Plugins → Available:
- **NodeJS Plugin**
- **Pipeline**
- **Git**
- **Credentials Binding**
- **SSH Agent** (optional)

### 2) Node.js tool
Manage Jenkins → Tools → NodeJS installations → Add:
- Name: **`Node20`** (exact — Jenkinsfile isi naam ko use karta hai)
- Version: NodeJS 20.x
- Save

### 3) Credentials
Manage Jenkins → Credentials → (global) → Add:

| ID | Kind | Value |
|----|------|--------|
| `ssh-deploy-key` | SSH Username with private key | server user + private key (same as GitHub `SSH_PRIVATE_KEY`) |
| `deploy-host` | Secret text | server IP/hostname (GitHub `SSH_HOST`) |
| `deploy-path` | Secret text | e.g. `/var/www/html/vbspu-dashboard.demoquaeretech.in` |

Username SSH key ke andar set karo (ya key credential pe username field).

### 4) Pipeline job
1. New Item → name: `vbspu-dashboard` → **Pipeline**
2. Pipeline → Definition: **Pipeline script from SCM**
3. SCM: Git → repo URL (GitHub)
4. Credentials: GitHub PAT / SSH (private repo ho to)
5. Branch: `*/main`
6. Script Path: `Jenkinsfile`
7. Save → **Build Now**

### 5) Auto trigger (optional)
- GitHub webhook: `http://YOUR_JENKINS_HOST:8080/github-webhook/`  
  ya Poll SCM: `H/5 * * * *`

## Kya chalega build pe
1. Checkout repo  
2. `frontend`: `npm ci` + `npm run build`  
3. rsync frontend + backend (`.env` exclude)  
4. remote: `npm ci --omit=dev` + PM2 delete/start `vbspu-api`

## GitHub Actions vs Jenkins
| | GitHub Actions | Jenkins |
|--|----------------|---------|
| Status | **Already live** | New, parallel |
| Trigger | push to `main` | Build Now / webhook |
| Install needed? | No | **Yes** (Docker or VM) |

Dono ek saath mat chalao auto-trigger pe, warna same server pe double deploy ho sakta hai.  
Suggestion: Actions auto rakho; Jenkins pehle **manual Build Now** se test karo.
