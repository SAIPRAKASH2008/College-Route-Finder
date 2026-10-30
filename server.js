const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { initDatabase } = require('./config/db');
const { JWT_SECRET } = require('./middleware/auth');
const trackVisitor = require('./middleware/visitorTracker');

const authRoutes = require('./routes/auth');
const stopsRoutes = require('./routes/stops');
const edgesRoutes = require('./routes/edges');
const graphRoutes = require('./routes/graphData');
const routeRoutes = require('./routes/route');
const securityRoutes = require('./routes/security');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach io instance to express app so routes and middleware can broadcast
app.set('io', io);

// Security Headers (Configured to permit local camera, canvas, vis.js CDN/local, and WebSockets)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*"],
        mediaSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
        workerSrc: ["'self'", "blob:"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());
// Increased limit for webcam snapshot base64 uploads
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Static files (HTML, CSS, JS, Assets, Uploads)
app.use(express.static(path.join(__dirname, 'public')));

// Global Visitor Tracking Middleware
app.use(trackVisitor);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/stops', stopsRoutes);
app.use('/api/edges', edgesRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/security', securityRoutes);

// Socket.io Connection & Room Management
io.on('connection', (socket) => {
  // Join admin room if admin authenticated
  socket.on('admin:join', (token) => {
    try {
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.role === 'ADMIN') {
          socket.join('admin-room');
          socket.emit('admin:joined', { message: 'Connected to Live Security Stream' });
        }
      }
    } catch (e) {
      // Invalid token
    }
  });

  // Client-side page navigation tracking ping
  socket.on('visitor:ping', (data) => {
    const visitorData = {
      page: data.page || '/',
      ip: socket.handshake.address || '127.0.0.1',
      userAgent: data.userAgent || socket.handshake.headers['user-agent'] || 'Unknown',
      referrer: data.referrer || 'Direct',
      timestamp: new Date().toISOString()
    };
    io.to('admin-room').emit('visitor:arrive', visitorData);
  });
});

// Default root redirect
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global 404 handler for HTML navigation
app.use((req, res, next) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error: ' + err.message });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initDatabase();
    server.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚍 College Bus Route Optimizer & Intruder Alert System`);
      console.log(`📡 Server running at: http://localhost:${PORT}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
