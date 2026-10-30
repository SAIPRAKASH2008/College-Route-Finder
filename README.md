# 🚍 College Bus Route Optimizer with 2FA & Intruder-Alert System

A full-stack web application combining **Graph Theory Optimization Algorithms** (Kruskal's MST-based route planning, Prim's Minimum Spanning Tree, and Nearest Neighbour TSP Tour) with an **Intruder-Alert & 2FA Security Subsystem** (Google Authenticator TOTP, optional webcam snapshots on failed login, SMTP alerts, and live visitor monitoring).

---

## 🌟 Key Features

### 1. 🧭 Graph Theory College Bus Route Optimizer
* **Interactive Network Visualizer (Vis.js Network)**:
  * Full physics simulation, node dragging, zooming, fit-to-view, and canvas legends.
  * Node styling distinguishing the **Central Campus Terminal** (hexagonal gold badge) from regular **Pickup Points** (blue sphere vertices).
  * Road connections (undirected weighted edges) labeled with distance in kilometers.
* **Graph Algorithms Engine**:
  * **Kruskal's Algorithm**: Builds a minimum spanning tree and returns the unique tree path between two chosen stops. This is an MST-based route, not necessarily the shortest path in the full road graph.
  * **Prim's Minimum Spanning Tree (MST)**: Calculates the optimal road network connecting all reachable pickup points with zero cycles and minimum total distance.
  * **Nearest Neighbour (NN) Heuristic**: Solves the Travelling Salesman bus tour problem, starting from a pickup hub, greedily visiting all stops along the shortest road segments, and returning to the campus terminal.
  * **Shortest-path helper**: Dijkstra remains an internal helper for Nearest Neighbour's stop-to-stop transitions; it is no longer the point-to-point route option.
  * **Disconnected Graph Handling**: Detects unreachable stops and presents clear warning banners.
  * **Algorithm Benchmark Comparison**: Visual progress bars comparing the selected Kruskal path vs. Nearest Neighbour vs. Prim MST distances.
* **Full CRUD Management**:
  * **Pickup Points (Stops)**: Add, edit, delete, mark campus hub, optional GPS coordinates.
  * **Road Connections (Edges)**: Add, edit, delete, positive distance validation, rejection of duplicate edges and self-loops.
  * **Route Library**: Admins can save computed routes; users can inspect itineraries and load paths.

### 2. 🛡️ Advanced 2FA & Intruder-Alert Security System
* **Google Authenticator (2FA / TOTP)**:
  * Uses RFC 6238 TOTP and QR-code enrollment.
  * Dedicated Admin 2FA Setup page generating an instant high-contrast QR code and manual base32 secret.
  * AES-256-CBC encrypted storage of TOTP secrets in the database.
  * Bcrypt password hashing (10 salt rounds).
* **Failed-Login Intruder Capture (Webcam + SMTP)**:
  * Clear security notice with optional, user-initiated camera access for failed-login alerts.
  * Captures a webcam photo on an unauthorized admin login attempt only when the user has explicitly enabled camera access.
  * Saves the snapshot to `public/uploads/intruders/` and records the breach in the database.
  * Dispatches an optional SMTP security alert to the administrator with a captured photo attached.
  * Rate-limiting and temporary lockout (locks terminal for 15 minutes after 5 consecutive failed attempts).
* **Live Visitor Tracking (Server-Sent Events + Web Notifications)**:
  * Java-backed Server-Sent Events stream pushes visitor arrival and intruder alerts to authorized Admin dashboards.
  * Desktop notifications via the browser Web Notifications API.
  * Web Audio synthesizer alert chime for immediate audible deterrence on breaches.

---

## 🏗️ Technology Stack

| Component | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 (Modern Glassmorphism & Responsive Design), Vanilla JavaScript (ES6+), Vis.js Network |
| **Backend** | Java 25 LTS, Spring Boot 3, Maven |
| **Real-time Events** | Spring MVC Server-Sent Events (SSE) |
| **Database** | Existing SQLite database via SQLite JDBC |
| **Two-Factor Authentication** | RFC 6238 TOTP & ZXing-generated QR codes |
| **Cryptography** | BCrypt, HS256 JWT, AES-256-CBC encrypted TOTP secrets |
| **Email Alerts** | Jakarta Mail over configured SMTP |
| **Security Hardening** | Security headers, CORS, rate limiting & account lockout |

---

## 📁 Project Directory Structure

```
dm pp/
├── .env.example               # Java backend environment template
├── .env                       # Active environment configuration (keep private)
├── package.json               # Convenience scripts delegating to Maven
├── database.sqlite            # Legacy SQLite database for one-time PostgreSQL import
├── backend/
│   ├── pom.xml                # Spring Boot and backend dependencies
│   └── src/main/java/edu/college/bus/
│       ├── BusApplication.java       # Java application entry point
│       ├── ApiController.java        # API endpoints and authentication
│       ├── DatabaseInitializer.java  # Compatible schema and first-run seeds
│       ├── RouteAlgorithms.java      # Kruskal, Prim, and Nearest Neighbour
│       └── RealtimeHub.java          # Authenticated admin SSE event stream
├── test-system.js             # Legacy Node algorithm/crypto tests; Java is built with Maven
├── config/
│   ├── db.js                  # Legacy Node implementation, not used by Java runtime
│   └── email.js               # Legacy Node implementation, not used by Java runtime
├── middleware/
│   ├── auth.js                # Legacy Node implementation, not used by Java runtime
│   ├── rateLimiter.js         # Legacy Node implementation, not used by Java runtime
│   └── visitorTracker.js      # Legacy Node implementation, not used by Java runtime
├── algorithms/
│   ├── graph.js               # Graph adjacency list and connectivity analysis
│   ├── dijkstra.js            # Shortest-path helper used by Nearest Neighbour
│   ├── kruskal.js             # Kruskal MST-based point-to-point route planner
│   ├── primMST.js             # Prim's Minimum Spanning Tree algorithm
│   └── nearestNeighbour.js    # Travelling Salesman Nearest Neighbour heuristic
├── routes/                    # Legacy Express routes; Java runtime uses backend/
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

### Step 1: Install Java and Maven
Install **Java 25 LTS**. The included Maven Wrapper downloads Maven on first use, so a separate Maven installation is not required. Node.js is not required to run the backend.

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set `JWT_SECRET` to a unique value with at least 32 characters, `ENCRYPTION_KEY` to exactly 64 hexadecimal characters, and `INITIAL_ADMIN_PASSWORD` to a unique password with at least 12 characters before the first run. Generate separate cryptographic values with a trusted random generator (for example `python -c "import secrets; print(secrets.token_hex(32))"`). Keep `.env` private and never commit it. The initial administrator is created as `admin@college.edu` using your configured `INITIAL_ADMIN_PASSWORD`.

The Java backend uses PostgreSQL. Install/start PostgreSQL, create the application database once (`CREATE DATABASE college_route_finder;`), then set `DATABASE_URL`, `DATABASE_USERNAME`, and `DATABASE_PASSWORD` in `.env` to match your local server. The example uses `localhost:5432` and the `postgres` account; set the password required by your PostgreSQL installation.

To keep existing local data, leave `SQLITE_IMPORT_PATH=database.sqlite` set for the first PostgreSQL startup. The importer copies users, stops, edges, saved routes, and audit logs only when the corresponding PostgreSQL tables are empty. It preserves IDs and resets PostgreSQL identity sequences, runs in a transaction, and never modifies or deletes the SQLite source. If the PostgreSQL tables already contain data, the import is skipped. Set `SQLITE_IMPORT_PATH=` to disable the importer. Keep a backup of `database.sqlite` until you have verified the imported data.

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
If SMTP credentials are omitted, login auditing and live alerts continue to work, but email is disabled. Credentials and authentication secrets are never written to application logs.

### Step 3: Build and Start the Java Application
```bash
.\backend\mvnw.cmd -f backend\pom.xml clean package
.\backend\mvnw.cmd -f backend\pom.xml spring-boot:run
```
The Java backend serves the existing browser frontend at **http://localhost:8500**. `npm start` is also available on Windows as a convenience wrapper. The first Maven Wrapper invocation needs an internet connection to download Maven and Java dependencies.

The PostgreSQL initializer uses `CREATE TABLE IF NOT EXISTS` and seeds sample stops only when PostgreSQL has no stops. The SQLite JDBC driver is retained only for the optional one-time data import.

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

1. Log out or open an Incognito window and navigate to `http://localhost:8500`.
2. To include a photo with failed-login alerts, explicitly select **Enable Camera for Security Capture** and allow access when prompted. Camera access is optional; sign-in remains available without it.
3. Try logging in with the admin email `admin@college.edu` and an **incorrect password** (or incorrect 2FA code).
4. The system will:
   * Instantly capture a photo from your webcam.
   * Play an audible intrusion alert chime.
   * Save the photo under `public/uploads/intruders/`.
   * Trigger an email alert to `ADMIN_ALERT_EMAIL` with the photo attached.
   * Push a real-time event over the authenticated Java SSE stream to the Admin Dashboard.
5. Log in with the correct admin credentials and visit `/dashboard.html` to view the **Intercepted Intruder Capture Gallery**. Admins can remove a photo and its associated record using the delete button on each gallery entry.

---

## 🧪 Graph Algorithm Test Verification (Section 12)

The database comes pre-seeded with the exact test graph from **Section 12 of the SRS**:
* **Stops**: `College Main Campus` (ID 1), `Stop A` (ID 2), `Stop B` (ID 3), `Stop C` (ID 4), `Stop D` (ID 5), `Stop E` (ID 6).
* **Edges**: A-B (4 km), A-C (2 km), B-C (1 km), B-D (5 km), C-D (8 km), D-College (3 km), B-College (9 km), C-E (6 km), E-College (7 km).

**Kruskal Route Verification**:
* The route finder builds a minimum spanning tree, then follows its path between the selected origin and destination.
* The test verifies the returned path uses MST edges and sums their distances correctly; this path is not guaranteed to be the shortest path in the original graph.
