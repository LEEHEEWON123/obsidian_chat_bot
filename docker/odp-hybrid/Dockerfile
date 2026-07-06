# OpenDataLoader hybrid OCR server (local build — GHCR image may be unavailable)
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl libgl1 libglib2.0-0 && \
    pip install --no-cache-dir "opendataloader-pdf[hybrid]" && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

EXPOSE 5002

HEALTHCHECK --interval=15s --timeout=10s --retries=12 --start-period=300s \
    CMD curl -sf http://localhost:5002/health || exit 1

CMD ["opendataloader-pdf-hybrid", "--port", "5002", "--host", "0.0.0.0", "--force-ocr", "--ocr-lang", "ko,en"]
