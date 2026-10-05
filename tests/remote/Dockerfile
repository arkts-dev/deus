FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server git gnupg python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/deus
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY dist ./dist
COPY skills ./skills
COPY prompts ./prompts
COPY skills.lock.json ./
COPY tests/remote/setup.sh /usr/local/bin/deus-test-setup
RUN chmod +x /usr/local/bin/deus-test-setup
ENTRYPOINT ["/usr/local/bin/deus-test-setup"]
