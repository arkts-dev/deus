#!/bin/sh
# Disposable test container only. The signing key is generated here, not an upstream identity.
set -eu
mkdir -p /root/.ssh /run/sshd /workspace /opt/dexter /test-bin /tmp/test-signing
chmod 700 /root/.ssh /tmp/test-signing
cp /fixture/id_ed25519.pub /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
ssh-keygen -A
cp -R /dexter-source/src /opt/dexter/src
cp /dexter-source/pyproject.toml /dexter-source/README.md /opt/dexter/
python3 -m venv /opt/dexter/.venv
/opt/dexter/.venv/bin/pip install --disable-pip-version-check -e /opt/dexter
export GNUPGHOME=/tmp/test-signing
gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Deus integration fixture <fixture@example.invalid>' ed25519 sign 0
fingerprint=$(gpg --batch --with-colons --list-secret-keys | awk -F: '$1=="fpr" {print $10; exit}')
printf '%s\n' "$fingerprint" > /test-fingerprint
gpg --batch --armor --export "$fingerprint" > /test-public.asc
git config --global user.name 'Deus integration fixture'
git config --global user.email 'fixture@example.invalid'
git -C /opt/dexter init -q
git -C /opt/dexter config user.name 'Deus integration fixture'
git -C /opt/dexter config user.email 'fixture@example.invalid'
git -C /opt/dexter config user.signingkey "$fingerprint"
printf '.venv/\n*.egg-info/\n__pycache__/\n' > /opt/dexter/.gitignore
git -C /opt/dexter add src pyproject.toml README.md .gitignore
git -C /opt/dexter -c commit.gpgsign=true commit -qm 'Local test snapshot of supplied Dexter sources'
# Only key acquisition is redirected to an offline fixture. Signature verification uses real GPG.
cat > /test-bin/gpg <<'WRAPPER'
#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = '--recv-keys' ]; then exec /usr/bin/gpg --batch --import /test-public.asc; fi
done
exec /usr/bin/gpg "$@"
WRAPPER
chmod +x /test-bin/gpg
cat > /usr/local/bin/deus-test-start <<'START'
#!/bin/sh
export PATH=/test-bin:/usr/local/bin:/usr/bin:/bin
export DEXTER_BIN=/opt/dexter/.venv/bin/dexter
export DEUS_DEXTER_TRUSTED_FINGERPRINTS=$(cat /test-fingerprint)
exec /usr/local/bin/node /opt/deus/dist/mcp-cli.js --workspace /workspace
START
chmod +x /usr/local/bin/deus-test-start
# A separate signed fake executable exercises disconnection without running a paid model.
mkdir -p /opt/fixture
cat > /opt/fixture/dexter <<'FIXTURE'
#!/usr/local/bin/node
const fs = require('node:fs');
if (process.argv[2] === '--version') { console.log('fixture, not real Dexter'); process.exit(0); }
fs.appendFileSync('/tmp/fixture-calls', 'started\n');
process.on('SIGTERM', () => { fs.appendFileSync('/tmp/fixture-calls', 'stopped\n'); process.exit(0); });
setInterval(() => {}, 1000);
FIXTURE
chmod +x /opt/fixture/dexter
git -C /opt/fixture init -q
git -C /opt/fixture config user.signingkey "$fingerprint"
git -C /opt/fixture add dexter
git -C /opt/fixture -c commit.gpgsign=true commit -qm 'Explicit fake Dexter cancellation fixture'
sed 's|DEXTER_BIN=/opt/dexter/.venv/bin/dexter|DEXTER_BIN=/opt/fixture/dexter|' /usr/local/bin/deus-test-start > /usr/local/bin/deus-test-hang-start
chmod +x /usr/local/bin/deus-test-hang-start
# Only the test public key can authenticate; the port is bound to loopback by the runner.
exec /usr/sbin/sshd -D -e -o PasswordAuthentication=no -o PermitRootLogin=prohibit-password -o PrintMotd=no
