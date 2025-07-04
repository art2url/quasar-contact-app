# Quasar Contact - Secure End-to-End Encrypted Chat Application

<p align="center">
  <a href="https://quasar.contact/" target="_blank">
    <img src="landing/public/assets/images/preview.png" alt="Lead to Quasar Landing" width="100%">
  </a>
</p>

## 🔐 Overview

Quasar Contact is a privacy-focused, real-time messaging application that implements military-grade
end-to-end encryption. Built with Angular 18, Node.js, and Socket.IO, it ensures that your
conversations remain completely private with zero data logging and client-side encryption.

**🚧 Current Status: Alpha Stage**

## ✨ Key Features

### 🛡️ Security & Privacy

- **End-to-End Encryption**: All messages are encrypted using Web Crypto API (AES-GCM) before
  leaving your device
- **Zero Knowledge Architecture**: Server never has access to decryption keys or plaintext messages
- **Client-Side Key Generation**: RSA-OAEP key pairs generated and stored locally
- **No Data Logging**: Messages are stored encrypted and can only be decrypted by intended
  recipients

### 💬 Messaging Features

- **Real-Time Communication**: Instant message delivery via WebSocket connections
- **Message Status Indicators**: Sent, delivered, and read receipts
- **Typing Indicators**: See when your conversation partner is typing
- **Message Editing & Deletion**: Edit or delete sent messages
- **Online/Offline Status**: Real-time presence tracking
- **Message Queue**: Offline message delivery when users reconnect

### 🎯 User Experience

- **Progressive Web App**: Installable on desktop and mobile devices
- **Responsive Design**: Optimized for all screen sizes
- **Dark Theme**: Modern, eye-friendly interface
- **Auto-Reconnection**: Seamless connection recovery with exponential backoff
- **Search Functionality**: Find users and conversations quickly

## 🏗️ Architecture

### Technology Stack

#### Landing Pages

- **Framework**: Astro 4.0 (Static Site Generator)
- **Pages**: Home, About, FAQ, Legal, Author
- **SEO**: Built-in sitemap generation and meta optimization
- **Performance**: Optimized static builds with minimal JavaScript
- **Styling**: Modern CSS with responsive design

#### Frontend

- **Framework**: Angular 18 (Standalone Components)
- **UI Library**: Angular Material
- **State Management**: RxJS BehaviorSubjects
- **Encryption**: Web Crypto API
- **Real-Time**: Socket.IO Client
- **Styling**: CSS3 with custom animations

#### Backend

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **WebSocket**: Socket.IO
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, CORS, Rate Limiting
- **Password Hashing**: bcrypt

#### Infrastructure

- **Containerization**: Docker (Multi-stage build)
- **Deployment**: Railway/Cloud platforms
- **Build Tools**: TypeScript, Webpack
- **Package Manager**: npm

### Project Structure

```
quasar-contact-app/
├── landing/                # Astro static site generator
│   ├── public/             # Static assets for landing
│   │   └── assets/
│   │       └── images/
│   ├── scripts/            # Build scripts
│   ├── src/
│   │   ├── components/     # Astro components
│   │   ├── layouts/        # Page layouts
│   │   ├── pages/          # Static pages
│   │   ├── scripts/        # Client-side scripts
│   │   └── styles/         # Global styles
│   ├── astro.config.mjs
│   └── package.json
├── frontend/               # Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/       # Core services and models
│   │   │   ├── features/   # Feature modules (auth, chat)
│   │   │   ├── shared/     # Shared components
│   │   │   └── utils/      # Utility functions
│   │   ├── assets/         # Images, icons, fonts
│   │   └── environments/   # Environment configs
│   └── angular.json
├── backend/                # Node.js server
│   ├── src/
│   │   ├── config/         # Server configuration
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.IO handlers
│   │   ├── app.ts          # Express app setup
│   │   └── server.ts       # Server entry point
│   └── package.json
├── public/                 # Generated static files (from Astro)
├── dist/                   # Production build output
├── Dockerfile              # Container configuration
├── nixpacks.toml           # Nixpacks deployment config
└── package.json            # Root package file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- MongoDB instance (local or cloud)
- Git

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/art2url/quasar-contact-app.git
   cd quasar-contact-app
   ```

2. **Install dependencies**

   ```bash
   npm run install:all
   ```

3. **Set up environment variables**

   Create `.env` file in the backend directory:

   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database
   MONGO_URI=mongodb://localhost:27017/quasar-chat

   # Security
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d

   # Client URLs
   CLIENT_ORIGIN=http://localhost:4200

   # Email Service (optional)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   EMAIL_FROM=noreply@quasar.contact
   ```

   Create `environment.ts` in frontend/src/environments/:

   ```typescript
   export const environment = {
     production: false,
     apiUrl: 'http://localhost:3000/api',
     wsUrl: 'http://localhost:3000',
   };
   ```

### Development

1. **Start MongoDB** (if running locally)

   ```bash
   mongod
   ```

2. **Run in development mode**

   ```bash

   npm run dev
   ```

3. **Access the application**
   - Landing pages: http://localhost:3000 (in production mode)
   - Landing dev: http://localhost:4321 (in dev mode)
   - Angular app: http://localhost:4200 (dev) or http://localhost:3000/app (production)

### Production Build

1. **Build for production**

   ```bash
   npm run build
   ```

   This will:
   - Build Astro landing pages
   - Build Angular application
   - Copy all assets to public directory
   - Build backend TypeScript

2. **Start production server**

   ```bash
   npm start
   ```

### Docker Deployment

1. **Build Docker image**

   ```bash
   docker build -t quasar-contact-app .
   ```

2. **Run container**

   ```bash
   docker run -p 3000:3000 \
     -e MONGO_URI=your-mongodb-uri \
     -e JWT_SECRET=your-secret \
     -e NG_APP_API_URL=https://your-domain.com/api \
     -e NG_APP_WS_URL=https://your-domain.com \
     quasar-contact-app
   ```

## 📝 API Documentation

### Authentication Endpoints

#### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string",
  "avatarUrl": "string (optional)"
}
```

#### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "string (or email)",
  "password": "string"
}
```

### Key Exchange

#### Upload Public Key

```http
POST /api/keys/upload
Authorization: Bearer <token>

{
  "publicKeyBundle": "string (base64 encoded)"
}
```

#### Get User's Public Key

```http
GET /api/keys/:userId
Authorization: Bearer <token>
```

### Messaging

#### Get Messages

```http
GET /api/messages/:userId
Authorization: Bearer <token>
```

#### Send Message (via WebSocket)

```javascript
socket.emit('send-message', {
  toUserId: 'string',
  ciphertext: 'string (encrypted message)',
  avatarUrl: 'string (optional)',
});
```

## 🔒 Security Implementation

### Encryption Flow

1. **Key Generation** (on user registration)
   - Generate RSA-OAEP key pair
   - Store private key in browser's IndexedDB
   - Upload public key to server

2. **Sending Messages**
   - Generate AES-GCM session key
   - Encrypt message with AES-GCM
   - Encrypt session key with recipient's RSA public key
   - Send encrypted message + encrypted session key

3. **Receiving Messages**
   - Decrypt session key with own RSA private key
   - Decrypt message with decrypted session key
   - Display plaintext message

### Security Features

- **HTTPS Only**: All production traffic must use TLS
- **JWT Authentication**: Stateless authentication with token expiry
- **Rate Limiting**: Protection against brute force attacks
- **CORS Protection**: Strict origin validation
- **Helmet.js**: Security headers for XSS and other attacks
- **Input Validation**: Server-side validation for all inputs
- **Password Requirements**: Minimum 6 characters, hashed with bcrypt

## 🧪 Testing

Currently, the project doesn't include automated tests. Testing implementation is planned for future
releases.

### Manual Testing Checklist

- [ ] User registration and login
- [ ] Key generation and exchange
- [ ] Message encryption/decryption
- [ ] Real-time message delivery
- [ ] Offline message queuing
- [ ] Connection recovery
- [ ] Message editing/deletion
- [ ] User search functionality
- [ ] Landing page navigation
- [ ] SEO meta tags and sitemap

## 🚦 Deployment

### Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy using the included `nixpacks.toml` configuration

### Environment Variables for Production

```env
# Required
NODE_ENV=production
MONGO_URI=mongodb+srv://...
JWT_SECRET=<generate-strong-secret>
NG_APP_API_URL=https://your-domain.com/api
NG_APP_WS_URL=https://your-domain.com

# Optional
EMAIL_HOST=smtp.provider.com
EMAIL_PORT=587
EMAIL_USER=your-email
EMAIL_PASS=your-password
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow Angular style guide for frontend code
- Follow Astro best practices for landing pages
- Use ESLint and Prettier for code formatting
- Write meaningful commit messages
- Add comments for complex logic

### GPL-3.0 License Implications

When contributing to this project, please note:

- Your contributions will also be licensed under GPL-3.0
- Any derivative work must also be open-source under GPL-3.0
- You must preserve copyright notices and license information
- If you distribute a modified version, you must clearly mark it as changed

## 📄 License

This project is licensed under the **GNU General Public License v3.0** - see the LICENSE file for
details.

### What this means:

- ✅ **Freedom to use** - Use for any purpose, including commercial
- ✅ **Freedom to study** - Access and study the source code
- ✅ **Freedom to share** - Copy and distribute the software
- ✅ **Freedom to improve** - Modify and distribute your modifications

### Requirements:

- 📋 Any distributed modifications must also be GPL-3.0
- 📋 Must include original copyright and license notices
- 📋 Must disclose source code when distributing
- 📋 Changes must be documented

## 💡 Acknowledgments

- Astro team for the excellent static site generator
- Angular team for the amazing framework
- Socket.IO for real-time capabilities
- Web Crypto API for client-side encryption
- The open-source community

## 📞 Support

For issues and feature requests, please use the GitHub Issues page.

---

**Note**: This is an alpha release. Use in production at your own risk. The encryption
implementation should be audited by security professionals before deploying in sensitive
environments.
