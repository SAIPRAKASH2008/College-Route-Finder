# 🚍 College Bus Route Optimizer with 2FA & Intruder-Alert System

A full-stack, production-grade web application combining **Graph Theory Optimization Algorithms** (Dijkstra's Shortest Path, Prim's Minimum Spanning Tree, and Nearest Neighbour TSP Tour) with an enterprise **Biometric Intruder-Alert & 2FA Security Subsystem** (Google Authenticator TOTP, automated webcam snapshot interception on failed login, Nodemailer email alerts, and live Socket.io visitor monitoring).

---

## 🌟 Key Features

### 1. 🧭 Graph Theory College Bus Route Optimizer
* **Interactive Network Visualizer (Vis.js Network)**:
  * Full physics simulation, node dragging, zooming, fit-to-view, and canvas legends.
  * Node styling distinguishing the **Central Campus Terminal** (hexagonal gold badge) from regular **Pickup Points** (blue sphere vertices).
  * Road connections (undirected weighted edges) labeled with distance in kilometers.
* **Graph Algorithms Engine**:
  * **Dijkstra's Algorithm**: Finds the shortest road path between any two chosen stops, outputting the ordered itinerary and total mileage.
  * **Prim's Minimum Spanning Tree (MST)**: Calculates the optimal road network connecting all reachable pickup points with zero cycles and minimum total distance.
  * **Nearest Neighbour (NN) Heuristic**: Solves the Travelling Salesman bus tour problem, starting from a pickup hub, greedily visiting all stops along the shortest road segments, and returning to the campus terminal.
  * **Disconnected Graph Handling**: Detects unreachable stops and presents clear warning banners.
  * **Algorithm Benchmark Comparison**: Visual progress bars comparing Dijkstra vs. Nearest Neighbour vs. Prim MST distances.
* **Full CRUD Management**:
  * **Pickup Points (Stops)**: Add, edit, delete, mark campus hub, optional GPS coordinates.
  * **Road Connections (Edges)**: Add, edit, delete, positive distance validation, rejection of duplicate edges and self-loops.
  * **Route Library**: Admins can save computed routes; users can inspect itineraries and load paths.

### 2. 🛡️ Advanced 2FA & Intruder-Alert Security System
* **Google Authenticator (2FA / TOTP)**:
  * Uses RFC 6238 TOTP with `speakeasy` and `qrcode`.
  * Dedicated Admin 2FA Setup page generating an instant high-contrast QR code and manual base32 secret.
  * AES-256-CBC encrypted storage of TOTP secrets in the database.
  * Bcrypt password hashing (10 salt rounds).
* **Failed-Login Intruder Capture (Webcam + Nodemailer)**:
  * Clear security notice with optional, user-initiated camera access for failed-login alerts.
  * Captures a webcam photo on an unauthorized admin login attempt only when the user has explicitly enabled camera access.
  * Saves the snapshot to `public/uploads/intruders/` and records the breach in the database.
  * Dispatches an immediate **Nodemailer Security Alert Email** to the administrator with the captured photo attached and embedded inline, containing client IP address, User-Agent, attempt counter, and timestamp.
  * Rate-limiting and temporary lockout (locks terminal for 15 minutes after 5 consecutive failed attempts).
* **Live Visitor Tracking (Socket.io + Web Notifications)**:
  * Real-time WebSocket stream pushing visitor arrival notifications to the Admin Command Center whenever anyone opens any page.
  * Desktop notifications via the browser Web Notifications API.
  * Web Audio synthesizer alert chime for immediate audible deterrence on breaches.

---

## 🏗️ Technology Stack

| Component | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 (Modern Glassmorphism & Responsive Design), Vanilla JavaScript (ES6+), Vis.js Network |
| **Backend** | Node.js, Express.js |
| **Real-time WebSockets** | Socket.io |
| **Database** | SQLite (using `sqlite3` with Promise wrappers) |
| **Two-Factor Authentication** | `speakeasy` (TOTP RFC 6238) & `qrcode` |
| **Cryptography** | `bcryptjs` (Password Hashing), Node.js `crypto` (AES-256-CBC for Secret Encryption) |
| **Email Alerts** | `nodemailer` (SMTP / Gmail / Ethereal) |
| **Security Hardening** | `helmet` (CSP & Security Headers), `cors`, Rate Limiting & Account Lockout |

---

## 📁 Project Directory Structure

```
dm pp/
├── .env.example               # Template for environment variables
├── .env                       # Active environment configuration
├── package.json               # Node.js project manifest & dependencies
├── server.js                  # Express & Socket.io server entry point
├── database.sqlite            # Auto-generated SQLite database
├── test-system.js             # Automated verification suite for algorithms & crypto
├── config/
│   ├── db.js                  # Database connection, schema creation, seed data & AES encryption
│   └── email.js               # Nodemailer dispatcher for intruder alerts with photo attachments
├── middleware/
│   ├── auth.js                # JWT verification & role authorization (ADMIN / USER)
│   ├── rateLimiter.js         # Failed attempt lockout and IP rate limiter
│   └── visitorTracker.js      # Visitor tracking middleware emitting Socket.io events
├── algorithms/
│   ├── graph.js               # Graph adjacency list and connectivity analysis
│   ├── dijkstra.js            # Dijkstra shortest path algorithm with segment reconstruction
│   ├── primMST.js             # Prim's Minimum Spanning Tree algorithm
│   └── nearestNeighbour.js    # Travelling Salesman Nearest Neighbour heuristic
├── routes/
│   ├── auth.js                # Sign-in, registration, 2FA setup/verify, intruder capture
│   ├── stops.js               # CRUD endpoints for pickup points
│   ├── edges.js               # CRUD endpoints for road distances
│   ├── graphData.js           # Vis.js node and edge formatting endpoint
│   ├── route.js               # Route computation and saved routes management
│   └── security.js            # Intruder logs, visitor feeds, and dashboard statistics
└── public/
    ├── css/
    │   ├── style.css          # Design system, glassmorphism cards, tables, badges & toasts
    │   └── dashboard.css      # Security center, intruder gallery & map layout styling
    ├── js/
    │   ├── common.js          # Authenticated fetch wrapper, JWT, Web Audio chime & notifications
    │   ├── auth.js            # Login form, webcam stream acquisition & snapshot capture
    │   ├── 2fa-setup.js       # Google Authenticator QR rendering & code verification
    │   ├── dashboard.js       # Live visitor feed, intruder alert cards & zoom modal
    │   ├── stops.js           # Pickup points CRUD UI with live search
    │   ├── edges.js           # Road distances CRUD UI with dropdown selectors
    │   ├── graph.js           # Vis.js interactive canvas renderer & route path highlighter
    │   ├── route.js           # Algorithm parameter selector & itinerary breakdown
    │   └── saved.js           # Saved routes library & algorithm comparison modal
    ├── img/
    │   ├── bus-icon.svg       # Bus SVG icon
    │   └── no-photo.svg       # Photo fallback asset
    ├── uploads/
    │   └── intruders/         # Storage directory for captured intruder webcam photos
    ├── index.html             # Login portal with camera security notice
    ├── register.html          # Account registration page
    ├── setup-2fa.html         # Admin Google Authenticator setup page
    ├── dashboard.html         # Security Command Center & live visitor feed
    ├── stops.html             # Pickup points management page
    ├── edges.html             # Road connections management page
    ├── route.html             # Interactive route optimizer & graph visualizer
    └── saved.html             # Saved bus routes library
```

---

## 🚀 Setup & Run Instructions

### Step 1: Install Dependencies
Open a terminal in the project directory and install the required packages:
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set `JWT_SECRET` to a unique value with at least 32 characters, `ENCRYPTION_KEY` to exactly 64 hexadecimal characters, and `INITIAL_ADMIN_PASSWORD` to a unique password with at least 12 characters before the first run. Generate the cryptographic values with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run the command separately for `JWT_SECRET` and `ENCRYPTION_KEY`. Keep `.env` private and never commit it. The initial administrator is created as `admin@college.edu` using your configured `INITIAL_ADMIN_PASSWORD`.

If you wish to receive live intruder alert emails directly to your Gmail/inbox:
1. Open `.env`.
2. Set your SMTP settings (e.g. Gmail App Password):
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_smtp_app_password
   ADMIN_ALERT_EMAIL=your_email@gmail.com
   ```
*(Note: If SMTP is left empty, the application runs seamlessly in simulated mode, logging full email alerts and photo paths to the terminal without errors).*

### Step 3: Run the Automated Verification Suite
To verify that all graph algorithms (Dijkstra, Prim MST, Nearest Neighbour) and AES encryption tests pass:
```bash
node test-system.js
```

### Step 4: Start the Web Application
```bash
npm start
# or: node server.js
```
The server will start at: **http://localhost:3000**

---

## 🔑 Initial Accounts

| Role | Email | Password | Privileges |
|---|---|---|---|
| **Admin** | `admin@college.edu` | The unique `INITIAL_ADMIN_PASSWORD` you configure | Full Graph CRUD, Algorithm Runner, 2FA Setup, Intruder Logs, Save Routes |

The application does not use published default account passwords. Public registration creates student accounts only.

---

## 📲 Linking Google Authenticator (Step-by-Step)

1. From the bottom of the Staff & Admin Login page, choose **Set up 2FA with your staff/admin email and password**.
2. Verify your staff/admin email and password, then scan the generated QR code with Google Authenticator (or Authy / 1Password).
3. Enter the current 6-digit code to enable 2FA. The setup session expires after 10 minutes.
4. Sign in with your password and authenticator code.

Administrators who are already signed in can also open **"🛡️ 2FA Security"** from the top navigation bar (or navigate to `/setup-2fa.html`).

---

## 📸 Testing the Intruder Capture Feature

1. Log out or open an Incognito window and navigate to `http://localhost:3000`.
2. To include a photo with failed-login alerts, explicitly select **Enable Camera for Security Capture** and allow access when prompted. Camera access is optional; sign-in remains available without it.
3. Try logging in with the admin email `admin@college.edu` and an **incorrect password** (or incorrect 2FA code).
4. The system will:
   * Instantly capture a photo from your webcam.
   * Play an audible intrusion alert chime.
   * Save the photo under `public/uploads/intruders/`.
   * Trigger an email alert to `ADMIN_ALERT_EMAIL` with the photo attached.
   * Push a real-time event via Socket.io to the Admin Dashboard.
5. Log in with the correct admin credentials and visit `/dashboard.html` to view the **Intercepted Intruder Capture Gallery**. Admins can remove a photo and its associated record using the delete button on each gallery entry.

---

## 🧪 Graph Algorithm Test Verification (Section 12)

The database comes pre-seeded with the exact test graph from **Section 12 of the SRS**:
* **Stops**: `College Main Campus` (ID 1), `Stop A` (ID 2), `Stop B` (ID 3), `Stop C` (ID 4), `Stop D` (ID 5), `Stop E` (ID 6).
* **Edges**: A-B (4 km), A-C (2 km), B-C (1 km), B-D (5 km), C-D (8 km), D-College (3 km), B-College (9 km), C-E (6 km), E-College (7 km).

**Dijkstra Verification**:
* Origin: `Stop A - North Town Circle`
* Destination: `College Main Campus`
* **Computed Path**: `Stop A` ➔ `Stop C` ➔ `Stop B` ➔ `Stop D` ➔ `College Main Campus`
* **Total Distance**: `2 + 1 + 5 + 3 = 11.00 km` (Exact match with theoretical shortest path).
