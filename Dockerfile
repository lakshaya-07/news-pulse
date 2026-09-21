# One image for the Node API and the Python pipeline it spawns (Render free tier).
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pipeline/requirements.txt pipeline/requirements.txt
RUN python3 -m venv /venv \
  && /venv/bin/pip install --no-cache-dir -r pipeline/requirements.txt
ENV PATH="/venv/bin:$PATH" TZ=UTC NODE_ENV=production PYTHON_BIN=python3

COPY backend/package.json backend/package-lock.json* backend/
RUN cd backend && npm install --omit=dev

COPY pipeline pipeline
COPY database database
COPY backend backend

EXPOSE 10000
CMD ["npx", "tsx", "backend/src/index.ts"]
