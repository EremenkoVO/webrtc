#!/bin/bash

# Generate self-signed SSL certificate for localhost development

set -e

SSL_DIR="./ssl_certs"

echo "================================"
echo "Generating SSL certificate for localhost"
echo "================================"
echo ""

# Create SSL directory
mkdir -p "$SSL_DIR"

# Generate private key
echo "Generating private key..."
openssl genrsa -out "$SSL_DIR/key.pem" 2048

# Generate certificate signing request
echo "Generating certificate signing request..."
openssl req -new -key "$SSL_DIR/key.pem" -out "$SSL_DIR/csr.pem" \
    -subj "/C=US/ST=State/L=City/O=Localhost/CN=localhost"

# Generate self-signed certificate (valid for 365 days)
echo "Generating self-signed certificate (valid for 365 days)..."
openssl x509 -req -days 365 \
    -in "$SSL_DIR/csr.pem" \
    -signkey "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -extfile <(printf "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1")

# Clean up CSR
rm -f "$SSL_DIR/csr.pem"

# Set proper permissions
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"

echo ""
echo "✓ Self-signed certificate generated successfully!"
echo "  Certificate: $SSL_DIR/cert.pem"
echo "  Private Key: $SSL_DIR/key.pem"
echo ""
echo "Certificate details:"
openssl x509 -in "$SSL_DIR/cert.pem" -noout -subject -dates
echo ""
echo "Note: You may need to accept the self-signed certificate in your browser"
echo "      when accessing https://localhost:5001"
