import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    PORT = int(os.getenv('PORT', 3000))
    HOST = os.getenv('HOST', 'localhost')

    # JWT Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'alksjdbflajkug4lta7utio78^T&^tgosjhdbfl,s')
    JWT_EXPIRES_IN = os.getenv('JWT_EXPIRES_IN', '24h')

    # CORS Configuration
    CORS_ORIGINS = '*'

    # Database Configuration
    DATABASE_FILENAME = os.getenv('DB_FILENAME', 'database.db')

    # SSL Configuration
    SSL_KEYFILE = 'cert/key.pem'
    SSL_CERTFILE = 'cert/cert.pem'

config = Config()