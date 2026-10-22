FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    DEBUG=False

WORKDIR /app

# Install system dependencies needed for compiling and building
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . /app/

# Collect static files
RUN python manage.py collectstatic --noinput

# Create persistent data directories
RUN mkdir -p /app/data/uploads /app/data/indexes

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate && gunicorn evidencedebug.wsgi:application --bind 0.0.0.0:${PORT} --workers 2 --timeout 120"]
