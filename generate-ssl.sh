#!/bin/bash

# SSL Certificate Generation Script
# Supports both self-signed certificates and Let's Encrypt

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="./ssl_certs"
CERTBOT_DIR="./certbot_data"
DOMAIN=""
EMAIL=""
CERT_TYPE=""

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
    -t, --type TYPE         Certificate type: 'self-signed' or 'letsencrypt'
    -d, --domain DOMAIN     Domain name (required for Let's Encrypt)
    -e, --email EMAIL       Email address (required for Let's Encrypt)
    -h, --help              Show this help message

Examples:
    # Generate self-signed certificate
    $0 --type self-signed --domain example.com

    # Generate Let's Encrypt certificate
    $0 --type letsencrypt --domain example.com --email admin@example.com

EOF
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            CERT_TYPE="$2"
            shift 2
            ;;
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            ;;
    esac
done

# Validate certificate type
if [[ -z "$CERT_TYPE" ]]; then
    print_error "Certificate type is required"
    show_usage
fi

if [[ "$CERT_TYPE" != "self-signed" && "$CERT_TYPE" != "letsencrypt" ]]; then
    print_error "Invalid certificate type. Use 'self-signed' or 'letsencrypt'"
    exit 1
fi

# Validate domain
if [[ -z "$DOMAIN" ]]; then
    print_error "Domain name is required"
    show_usage
fi

# Function to generate self-signed certificate
generate_self_signed() {
    print_info "Generating self-signed SSL certificate for $DOMAIN"

    # Create SSL directory
    mkdir -p "$SSL_DIR"

    # Generate private key
    print_info "Generating private key..."
    openssl genrsa -out "$SSL_DIR/key.pem" 2048

    # Generate certificate signing request
    print_info "Generating certificate signing request..."
    openssl req -new -key "$SSL_DIR/key.pem" -out "$SSL_DIR/csr.pem" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

    # Generate self-signed certificate (valid for 365 days)
    print_info "Generating self-signed certificate (valid for 365 days)..."
    openssl x509 -req -days 365 \
        -in "$SSL_DIR/csr.pem" \
        -signkey "$SSL_DIR/key.pem" \
        -out "$SSL_DIR/cert.pem" \
        -extfile <(printf "subjectAltName=DNS:$DOMAIN,DNS:www.$DOMAIN")

    # Clean up CSR
    rm -f "$SSL_DIR/csr.pem"

    # Set proper permissions
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"

    print_info "Self-signed certificate generated successfully!"
    print_info "Certificate: $SSL_DIR/cert.pem"
    print_info "Private Key: $SSL_DIR/key.pem"
    print_warn "Self-signed certificates are NOT trusted by browsers. Use for testing only!"

    # Show certificate details
    echo ""
    print_info "Certificate details:"
    openssl x509 -in "$SSL_DIR/cert.pem" -noout -subject -dates
}

# Function to generate Let's Encrypt certificate
generate_letsencrypt() {
    print_info "Generating Let's Encrypt certificate for $DOMAIN"

    # Validate email
    if [[ -z "$EMAIL" ]]; then
        print_error "Email is required for Let's Encrypt certificates"
        exit 1
    fi

    # Create directories
    mkdir -p "$SSL_DIR"
    mkdir -p "$CERTBOT_DIR"

    # Check if docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check if nginx is running
    if docker ps | grep -q webrtc_nginx; then
        print_info "Nginx container is running"
    else
        print_warn "Nginx container is not running. Starting it now..."
        docker-compose -f docker-compose.prod.yml up -d nginx
        sleep 5
    fi

    print_info "Requesting certificate from Let's Encrypt..."
    print_info "Domain: $DOMAIN"
    print_info "Email: $EMAIL"

    # Run certbot
    docker run --rm \
        --network webrtc_prod \
        -v "$(pwd)/$SSL_DIR:/etc/letsencrypt" \
        -v "$(pwd)/$CERTBOT_DIR:/var/www/certbot" \
        certbot/certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        -d "$DOMAIN" \
        -d "www.$DOMAIN"

    # Create symbolic links for nginx
    print_info "Creating symbolic links..."

    if [[ -f "$SSL_DIR/live/$DOMAIN/fullchain.pem" ]]; then
        ln -sf "$(pwd)/$SSL_DIR/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
        ln -sf "$(pwd)/$SSL_DIR/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"

        print_info "Let's Encrypt certificate generated successfully!"
        print_info "Certificate: $SSL_DIR/cert.pem -> live/$DOMAIN/fullchain.pem"
        print_info "Private Key: $SSL_DIR/key.pem -> live/$DOMAIN/privkey.pem"
        print_info "Certificate is valid for 90 days"

        # Show certificate details
        echo ""
        print_info "Certificate details:"
        openssl x509 -in "$SSL_DIR/live/$DOMAIN/fullchain.pem" -noout -subject -dates -issuer

        # Restart nginx to load new certificates
        print_info "Restarting nginx..."
        docker-compose -f docker-compose.prod.yml restart nginx

        print_info "Setup automatic renewal by uncommenting certbot service in docker-compose.prod.yml"
    else
        print_error "Certificate generation failed. Please check the logs above."
        exit 1
    fi
}

# Main execution
echo "================================"
echo "SSL Certificate Generator"
echo "================================"
echo ""

case $CERT_TYPE in
    self-signed)
        generate_self_signed
        ;;
    letsencrypt)
        generate_letsencrypt
        ;;
esac

echo ""
print_info "Next steps:"
if [[ "$CERT_TYPE" == "self-signed" ]]; then
    echo "1. Update nginx.conf with your domain: sed -i 's/your-domain.com/$DOMAIN/g' nginx.conf"
    echo "2. Start services: docker-compose -f docker-compose.prod.yml up -d"
else
    echo "1. Nginx should now be serving your site with HTTPS"
    echo "2. Test your site: curl -I https://$DOMAIN"
    echo "3. Enable automatic renewal in docker-compose.prod.yml"
fi

echo ""
print_info "Done!"
