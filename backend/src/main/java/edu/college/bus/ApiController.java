package edu.college.bus;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.qrcode.QRCodeWriter;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMultipart;
import jakarta.activation.DataHandler;
import jakarta.activation.FileDataSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api")
public class ApiController {
    private static final Pattern PHOTO_DATA = Pattern.compile("^data:[A-Za-z0-9.+-]+/[^;]+;base64,(.*)$", Pattern.DOTALL);
    private final JdbcTemplate jdbc;
    private final TokenService tokens;
    private final RealtimeHub realtime;
    private final ObjectMapper mapper;
    private final boolean postgres;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(10);
    private final Map<String, IpAttempt> ipAttempts = new ConcurrentHashMap<>();

    private record IpAttempt(int count, Instant lockedUntil) {}

    public ApiController(JdbcTemplate jdbc, TokenService tokens, RealtimeHub realtime, ObjectMapper mapper,
                         @Value("${spring.datasource.url}") String databaseUrl) {
        this.jdbc = jdbc;
        this.tokens = tokens;
        this.realtime = realtime;
        this.mapper = mapper;
        this.postgres = databaseUrl.startsWith("jdbc:postgresql:");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleException(Exception exception) {
        if (exception instanceof ResponseStatusException responseStatus) {
            return ResponseEntity.status(responseStatus.getStatusCode())
                    .body(map("error", responseStatus.getReason()));
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(map("error", "Internal Server Error"));
    }

    @PostMapping("/auth/register")
    public ResponseEntity<?> register(@RequestBody Map<String, Object> body) {
        String name = string(body.get("name")), email = string(body.get("email")), password = string(body.get("password"));
        if (blank(name) || blank(email) || blank(password))
            return bad("Name, email, and password are required.");
        if (password.length() < 6) return bad("Password must be at least 6 characters long.");
        String cleanEmail = email.trim().toLowerCase(Locale.ROOT);
        if (!jdbc.queryForList("SELECT id FROM users WHERE email = ?", cleanEmail).isEmpty())
            return bad("An account with this email address already exists.");
        Long id = java.util.Objects.requireNonNull(jdbc.queryForObject(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'USER') RETURNING id",
                Long.class, name.trim(), cleanEmail, passwords.encode(password)));
        return ResponseEntity.status(HttpStatus.CREATED).body(map("message", "Registration successful! You can now log in.",
                "userId", id));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String ip = clientIp(request);
        ResponseEntity<?> locked = checkLockout(body.get("email"), ip);
        if (locked != null) return locked;
        String email = string(body.get("email")), password = string(body.get("password"));
        if (blank(email) || blank(password)) return bad("Email and password are required.");
        String cleanEmail = email.trim().toLowerCase(Locale.ROOT);
        Map<String, Object> user = one("SELECT * FROM users WHERE email = ?", cleanEmail);
        if (user == null) return loginFailure(cleanEmail, ip, request, "User not found", body.get("photoData"));

        String portalRole = string(body.get("portalRole"));
        String role = string(user.get("role"));
        if ("ADMIN".equals(portalRole) && !"ADMIN".equals(role))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(map("error",
                    "Student account detected. Students do not require 2FA — please sign in via the Student Login.",
                    "portalMismatch", true, "suggestedRole", "USER"));
        if ("USER".equals(portalRole) && "ADMIN".equals(role))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(map("error",
                    "Staff & Administrator account detected. Staff 2FA is required — please sign in via the Staff & Admin Portal.",
                    "portalMismatch", true, "suggestedRole", "ADMIN"));
        if (!passwords.matches(password, string(user.get("password_hash"))))
            return loginFailure(cleanEmail, ip, request, "Incorrect password", body.get("photoData"));

        if ("ADMIN".equals(role) && number(user.get("is_2fa_enabled")) != 0) {
            String code = string(body.get("totpCode"));
            if (blank(code)) return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(map("error", "Staff 2FA Google Authenticator code is required.", "requires2FA", true));
            String secret = decryptSecret(string(user.get("totp_secret")));
            if (secret == null) return ResponseEntity.internalServerError()
                    .body(map("error", "Server could not decrypt 2FA secret key."));
            if (!Totp.verify(secret, code.trim()))
                return loginFailure(cleanEmail, ip, request, "Invalid 2FA TOTP code", body.get("photoData"));
        }
        resetFailedAttempts(cleanEmail, ip);
        Map<String, Object> resultUser = userPublic(user, true);
        Map<String, Object> claims = new LinkedHashMap<>(resultUser);
        String token = tokens.issue(claims);
        return ResponseEntity.ok(map("message", "Login successful!", "token", token, "user", resultUser));
    }

    @PostMapping("/auth/2fa/enrollment/start")
    public ResponseEntity<?> startEnrollment(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        ResponseEntity<?> locked = checkLockout(body.get("email"), clientIp(request));
        if (locked != null) return locked;
        String email = string(body.get("email")), password = string(body.get("password"));
        if (blank(email) || blank(password)) return bad("Email and password are required.");
        String cleanEmail = email.trim().toLowerCase(Locale.ROOT);
        Map<String, Object> user = one("SELECT id, name, email, password_hash, role, is_2fa_enabled FROM users WHERE email = ?", cleanEmail);
        boolean valid = user != null && passwords.matches(password, string(user.get("password_hash")));
        if (user == null || !valid) {
            if (user != null) recordFailedAttempt(cleanEmail, clientIp(request));
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(map("error", "Invalid staff/admin email or password."));
        }
        if (!"ADMIN".equals(string(user.get("role")))) {
            recordFailedAttempt(cleanEmail, clientIp(request));
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(map("error", "Invalid staff/admin email or password."));
        }
        if (number(user.get("is_2fa_enabled")) != 0)
            return ResponseEntity.status(HttpStatus.CONFLICT).body(map("error",
                    "2FA is already enabled. Sign in with your authenticator code to manage your settings."));
        String secret = Totp.newSecret();
        String url = Totp.provisioningUrl(secret, cleanEmail);
        String setupToken = tokens.issue(map("userId", user.get("id"), "scope", "2fa-enrollment", "secret", secret), 600);
        return ResponseEntity.ok(map("setupToken", setupToken, "secret", secret, "qrCodeDataUrl", qrCode(url),
                "instructions", "Scan this QR code using Google Authenticator, Authy, or 1Password."));
    }

    @PostMapping("/auth/2fa/enrollment/verify")
    public ResponseEntity<?> verifyEnrollment(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String email = string(body.get("email")), setupToken = string(body.get("setupToken")), code = string(body.get("token"));
        if (blank(email) || blank(setupToken) || blank(code) || !code.matches("\\d{6}"))
            return bad("Email, setup session, and a 6-digit code are required.");
        Map<String, Object> enrollment;
        try { enrollment = tokens.verify(setupToken); }
        catch (IllegalArgumentException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(map("error", "Invalid or expired 2FA setup session. Start setup again."));
        }
        if (!"2fa-enrollment".equals(enrollment.get("scope")) || enrollment.get("userId") == null
                || enrollment.get("secret") == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(map("error", "Invalid or expired 2FA setup session. Start setup again."));
        Map<String, Object> user = one("SELECT id, email, role, is_2fa_enabled FROM users WHERE id = ? AND email = ?",
                enrollment.get("userId"), email.trim().toLowerCase(Locale.ROOT));
        if (user == null || !"ADMIN".equals(string(user.get("role"))))
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(map("error", "Invalid or expired 2FA setup session. Start setup again."));
        if (number(user.get("is_2fa_enabled")) != 0)
            return ResponseEntity.status(HttpStatus.CONFLICT).body(map("error", "2FA is already enabled for this account."));
        String secret = string(enrollment.get("secret"));
        if (!Totp.verify(secret, code)) {
            recordFailedAttempt(string(user.get("email")), clientIp(request));
            return bad("Invalid verification code. Check your authenticator app and try again.");
        }
        int updated = jdbc.update("UPDATE users SET totp_secret = ?, is_2fa_enabled = 1 WHERE id = ? AND is_2fa_enabled = 0",
                encryptSecret(secret), user.get("id"));
        if (updated != 1) return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(map("error", "2FA was changed for this account. Start setup again."));
        return ResponseEntity.ok(map("success", true,
                "message", "Google Authenticator 2FA is enabled. Use your password and authenticator code to sign in."));
    }

    @GetMapping("/auth/2fa/setup")
    public ResponseEntity<?> setupTwoFactor(HttpServletRequest request) {
        Map<String, Object> user = authorizedUser(request, true);
        if (user == null) return authError(request);
        Map<String, Object> account = one("SELECT email, name FROM users WHERE id = ?", user.get("id"));
        if (account == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(map("error", "User not found"));
        String secret = Totp.newSecret(), url = Totp.provisioningUrl(secret, string(account.get("email")));
        return ResponseEntity.ok(map("secret", secret, "otpauthUrl", url, "qrCodeDataUrl", qrCode(url),
                "instructions", "Scan this QR code using Google Authenticator, Authy, or 1Password on your mobile device."));
    }

    @PostMapping("/auth/2fa/verify")
    public ResponseEntity<?> activateTwoFactor(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> user = authorizedUser(request, true);
        if (user == null) return authError(request);
        String secret = string(body.get("secret")), code = string(body.get("token"));
        if (blank(secret) || blank(code)) return bad("Secret and 6-digit verification code are required.");
        if (!Totp.verify(secret, code.trim()))
            return bad("Invalid verification code. Please check your authenticator app.");
        jdbc.update("UPDATE users SET totp_secret = ?, is_2fa_enabled = 1 WHERE id = ?", encryptSecret(secret), user.get("id"));
        return ResponseEntity.ok(map("success", true,
                "message", "Google Authenticator 2FA activated successfully! You must now enter this code on future logins."));
    }

    @PostMapping("/auth/2fa/disable")
    public ResponseEntity<?> disableTwoFactor(HttpServletRequest request) {
        Map<String, Object> user = authorizedUser(request, true);
        if (user == null) return authError(request);
        jdbc.update("UPDATE users SET totp_secret = NULL, is_2fa_enabled = 0 WHERE id = ?", user.get("id"));
        return ResponseEntity.ok(map("success", true, "message", "Two-factor authentication disabled."));
    }

    @GetMapping("/auth/me")
    public ResponseEntity<?> me(HttpServletRequest request) {
        Map<String, Object> user = authorizedUser(request, false);
        if (user == null) return authError(request);
        Map<String, Object> details = one("SELECT id, name, email, role, is_2fa_enabled, created_at FROM users WHERE id = ?",
                user.get("id"));
        if (details == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(map("error", "User not found"));
        details.put("is_2fa_enabled", number(details.get("is_2fa_enabled")) != 0);
        return ResponseEntity.ok(map("user", details));
    }

    @GetMapping("/stops")
    public ResponseEntity<?> stops(HttpServletRequest request) {
        if (authorizedUser(request, false) == null) return authError(request);
        return ResponseEntity.ok(jdbc.queryForList("SELECT * FROM stops ORDER BY is_college DESC, name ASC"));
    }

    @PostMapping("/stops")
    public ResponseEntity<?> createStop(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        String name = string(body.get("name"));
        if (blank(name)) return bad("Stop name is required.");
        String cleanName = name.trim();
        if (one("SELECT id FROM stops WHERE LOWER(name) = LOWER(?)", cleanName) != null)
            return bad("A stop with this name already exists.");
        int college = truthy(body.get("is_college")) ? 1 : 0;
        if (college == 1) jdbc.update("UPDATE stops SET is_college = 0 WHERE is_college = 1");
        Long stopId = java.util.Objects.requireNonNull(jdbc.queryForObject(
                "INSERT INTO stops (name, latitude, longitude, is_college) VALUES (?, ?, ?, ?) RETURNING id",
                Long.class, cleanName, nullableNumber(body.get("latitude")),
                nullableNumber(body.get("longitude")), college));
        Map<String, Object> stop = one("SELECT * FROM stops WHERE id = ?", stopId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(map("message", "Pickup point created successfully", "stop", stop));
    }

    @PutMapping("/stops/{id}")
    public ResponseEntity<?> updateStop(@PathVariable String id, @RequestBody Map<String, Object> body,
                                        HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer stopId = parseId(id);
        if (stopId == null) return bad("Invalid pickup point ID.");
        String name = string(body.get("name"));
        if (blank(name)) return bad("Stop name is required.");
        String cleanName = name.trim();
        if (one("SELECT id FROM stops WHERE LOWER(name) = LOWER(?) AND id != ?", cleanName, stopId) != null)
            return bad("Another stop with this name already exists.");
        int college = truthy(body.get("is_college")) ? 1 : 0;
        if (college == 1) jdbc.update("UPDATE stops SET is_college = 0 WHERE is_college = 1 AND id != ?", stopId);
        jdbc.update("UPDATE stops SET name = ?, latitude = ?, longitude = ?, is_college = ? WHERE id = ?",
                cleanName, nullableNumber(body.get("latitude")), nullableNumber(body.get("longitude")), college, stopId);
        Map<String, Object> stop = one("SELECT * FROM stops WHERE id = ?", stopId);
        return ResponseEntity.ok(map("message", "Pickup point updated successfully", "stop", stop));
    }

    @DeleteMapping("/stops/{id}")
    public ResponseEntity<?> deleteStop(@PathVariable String id, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer stopId = parseId(id);
        if (stopId == null) return bad("Invalid pickup point ID.");
        Map<String, Object> stop = one("SELECT * FROM stops WHERE id = ?", stopId);
        if (stop == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(map("error", "Pickup point not found."));
        jdbc.update("DELETE FROM edges WHERE source_stop_id = ? OR dest_stop_id = ?", stopId, stopId);
        jdbc.update("DELETE FROM stops WHERE id = ?", stopId);
        return ResponseEntity.ok(map("message", "Pickup point \"" + stop.get("name")
                + "\" and all connected road edges were deleted successfully."));
    }

    @GetMapping("/edges")
    public ResponseEntity<?> edges(HttpServletRequest request) {
        if (authorizedUser(request, false) == null) return authError(request);
        return ResponseEntity.ok(jdbc.queryForList("""
                SELECT e.id, e.source_stop_id, e.dest_stop_id, e.distance_km, e.created_at,
                  s1.name AS source_name, s1.is_college AS source_is_college,
                  s2.name AS dest_name, s2.is_college AS dest_is_college
                FROM edges e JOIN stops s1 ON e.source_stop_id = s1.id
                JOIN stops s2 ON e.dest_stop_id = s2.id ORDER BY e.id DESC
                """));
    }

    @PostMapping("/edges")
    public ResponseEntity<?> createEdge(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer source = parseInteger(body.get("source_stop_id")), dest = parseInteger(body.get("dest_stop_id"));
        Double distance = parseDouble(body.get("distance_km"));
        if (source == null || source == 0 || dest == null || dest == 0)
            return bad("Source and destination stops must be specified.");
        if (source.equals(dest))
            return bad("Self-loops are not allowed. Source and destination must be distinct stops.");
        if (distance == null || distance <= 0) return bad("Distance must be a positive number greater than 0.");
        Map<String, Object> sourceStop = one("SELECT id, name FROM stops WHERE id = ?", source);
        Map<String, Object> destStop = one("SELECT id, name FROM stops WHERE id = ?", dest);
        if (sourceStop == null || destStop == null)
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(map("error", "One or both of the selected stops do not exist."));
        if (one("SELECT id FROM edges WHERE (source_stop_id = ? AND dest_stop_id = ?) OR (source_stop_id = ? AND dest_stop_id = ?)",
                source, dest, dest, source) != null)
            return bad("A road connection already exists between \"" + sourceStop.get("name") + "\" and \""
                    + destStop.get("name") + "\". You can edit the existing connection instead.");
        Long edgeId = java.util.Objects.requireNonNull(jdbc.queryForObject(
                "INSERT INTO edges (source_stop_id, dest_stop_id, distance_km) VALUES (?, ?, ?) RETURNING id",
                Long.class, source, dest, distance));
        return ResponseEntity.status(HttpStatus.CREATED).body(map("message", "Road connection added successfully",
                "edgeId", edgeId, "edge", map("id", edgeId, "source_stop_id", source, "dest_stop_id", dest,
                        "source_name", sourceStop.get("name"), "dest_name", destStop.get("name"), "distance_km", distance)));
    }

    @PutMapping("/edges/{id}")
    public ResponseEntity<?> updateEdge(@PathVariable String id, @RequestBody Map<String, Object> body,
                                        HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer edgeId = parseId(id), source = parseInteger(body.get("source_stop_id"));
        Integer dest = parseInteger(body.get("dest_stop_id"));
        Double distance = parseDouble(body.get("distance_km"));
        if (source == null || source == 0 || dest == null || dest == 0)
            return bad("Source and destination stops are required.");
        if (source.equals(dest)) return bad("Self-loops are not allowed.");
        if (distance == null || distance <= 0) return bad("Distance must be a positive number greater than 0.");
        if (one("SELECT id FROM edges WHERE id != ? AND ((source_stop_id = ? AND dest_stop_id = ?) OR (source_stop_id = ? AND dest_stop_id = ?))",
                edgeId, source, dest, dest, source) != null)
            return bad("A road connection already exists between these two stops.");
        jdbc.update("UPDATE edges SET source_stop_id = ?, dest_stop_id = ?, distance_km = ? WHERE id = ?",
                source, dest, distance, edgeId);
        return ResponseEntity.ok(map("message", "Edge updated successfully"));
    }

    @DeleteMapping("/edges/{id}")
    public ResponseEntity<?> deleteEdge(@PathVariable String id, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer edgeId = parseId(id);
        if (edgeId == null || one("SELECT id FROM edges WHERE id = ?", edgeId) == null)
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(map("error", "Edge not found."));
        jdbc.update("DELETE FROM edges WHERE id = ?", edgeId);
        return ResponseEntity.ok(map("message", "Road connection deleted successfully."));
    }

    @GetMapping("/graph")
    public ResponseEntity<?> graph(HttpServletRequest request) {
        if (authorizedUser(request, false) == null) return authError(request);
        List<Map<String, Object>> stops = jdbc.queryForList("SELECT * FROM stops ORDER BY id ASC");
        List<Map<String, Object>> edges = jdbc.queryForList("SELECT * FROM edges ORDER BY id ASC");
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Map<String, Object> stop : stops) {
            boolean college = number(stop.get("is_college")) != 0;
            nodes.add(map("id", stop.get("id"), "label", stop.get("name"), "is_college", college,
                    "latitude", stop.get("latitude"), "longitude", stop.get("longitude"),
                    "shape", college ? "hexagon" : "dot", "size", college ? 28 : 20,
                    "color", college
                            ? map("background", "#6F4E37", "border", "#E5E4E2",
                                "highlight", map("background", "#8D6346", "border", "#FFFFFF"))
                            : map("background", "#E6E0F0", "border", "#6F4E37",
                                "highlight", map("background", "#FFFFFF", "border", "#6F4E37")),
                    "font", map("color", "#E5E4E2", "size", college ? 15 : 13,
                            "bold", college, "face", "Inter, system-ui, sans-serif"),
                    "title", stop.get("name") + (college ? " [CAMPUS TERMINAL]" : "")));
        }
        List<Map<String, Object>> graphEdges = new ArrayList<>();
        for (Map<String, Object> edge : edges) {
            double distance = decimal(edge.get("distance_km"));
            graphEdges.add(map("id", "e_" + edge.get("id"), "dbId", edge.get("id"),
                    "from", edge.get("source_stop_id"), "to", edge.get("dest_stop_id"),
                    "label", distance + " km", "distance", distance,
                    "font", map("align", "middle", "size", 11, "color", "#E5E4E2",
                            "background", "rgba(38, 28, 30, 0.92)", "strokeWidth", 0),
                    "color", map("color", "rgba(229, 228, 226, 0.45)", "highlight", "#E6E0F0"),
                    "width", 2, "smooth", map("type", "continuous")));
        }
        return ResponseEntity.ok(map("nodes", nodes, "edges", graphEdges,
                "stats", map("totalNodes", stops.size(), "totalEdges", edges.size())));
    }

    @PostMapping("/route/compute")
    public ResponseEntity<?> computeRoute(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (authorizedUser(request, false) == null) return authError(request);
        List<Map<String, Object>> stops = jdbc.queryForList("SELECT * FROM stops ORDER BY id");
        List<Map<String, Object>> edges = jdbc.queryForList("SELECT * FROM edges ORDER BY id");
        if (stops.size() < 2) return bad("At least 2 pickup points must exist in the network to compute routes.");
        if (edges.isEmpty()) return bad("No road connections (edges) have been defined yet. Please add edges first.");
        Integer start = parseInteger(body.get("startId")), end = parseInteger(body.get("endId"));
        String algorithm = blank(string(body.get("algorithm"))) ? "KRUSKAL" : string(body.get("algorithm")).toUpperCase(Locale.ROOT);
        RouteAlgorithms graph = new RouteAlgorithms(stops, edges);
        Map<String, Object> result;
        if ("KRUSKAL".equals(algorithm)) {
            if (start == null || start == 0 || end == null || end == 0)
                return bad("Start stop and destination stop are both required for a Kruskal route.");
            if (!graphHas(stops, start) || !graphHas(stops, end))
                return bad("The selected start or destination stop does not exist.");
            result = graph.kruskal(start, end);
            result.put("algorithm", "KRUSKAL");
        } else if ("MST".equals(algorithm)) {
            result = graph.prim(start);
            result.put("algorithm", "MST");
        } else if ("NEAREST_NEIGHBOUR".equals(algorithm) || "NN".equals(algorithm)) {
            result = graph.nearestNeighbour(start, !Boolean.FALSE.equals(body.get("returnToCollege")));
            result.put("algorithm", "NEAREST_NEIGHBOUR");
        } else {
            return bad("Unsupported algorithm \"" + algorithm + "\". Choose KRUSKAL, MST, or NEAREST_NEIGHBOUR.");
        }
        Integer effectiveStart = start;
        if (effectiveStart == null || effectiveStart == 0) {
            effectiveStart = stops.stream().filter(stop -> number(stop.get("is_college")) != 0)
                    .map(stop -> number(stop.get("id"))).findFirst().orElse(number(stops.get(0).get("id")));
        }
        Map<String, Object> mst = graph.prim(effectiveStart);
        Map<String, Object> nearest = graph.nearestNeighbour(effectiveStart, true);
        result.put("comparison", map("mstTotalDistance", mst.get("totalDistance"),
                "nearestNeighbourTotalDistance", nearest.get("totalDistance"), "totalStopsCount", stops.size(),
                "connectedStopsCount", stops.size() - ((List<?>) mst.get("unreachable")).size()));
        return ResponseEntity.ok(result);
    }

    @PostMapping("/route/save")
    public ResponseEntity<?> saveRoute(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Map<String, Object> user = authorizedUser(request, true);
        if (user == null) return authError(request);
        String name = string(body.get("route_name")), algorithm = string(body.get("algorithm"));
        Object routePath = body.get("route_path");
        if (blank(name) || blank(algorithm) || routePath == null)
            return bad("Route name, algorithm, and path data are required.");
        String path = routePath instanceof String value ? value : writeJson(routePath);
        double distance = parseDouble(body.get("total_distance")) == null ? 0 : parseDouble(body.get("total_distance"));
        Long routeId = java.util.Objects.requireNonNull(jdbc.queryForObject(
                "INSERT INTO saved_routes (route_name, algorithm, route_path, total_distance, created_by) "
                        + "VALUES (?, ?, ?, ?, ?) RETURNING id",
                Long.class, name.trim(), algorithm, path, distance, user.get("id")));
        return ResponseEntity.status(HttpStatus.CREATED).body(map("message", "Route saved successfully!",
                "routeId", routeId));
    }

    @GetMapping("/route/saved")
    public ResponseEntity<?> savedRoutes(HttpServletRequest request) {
        if (authorizedUser(request, false) == null) return authError(request);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT r.id, r.route_name, r.algorithm, r.route_path, r.total_distance, r.created_at,
                       u.name AS creator_name
                FROM saved_routes r LEFT JOIN users u ON r.created_by = u.id ORDER BY r.id DESC
                """);
        for (Map<String, Object> row : rows) {
            try { row.put("route_path", mapper.readValue(string(row.get("route_path")), new TypeReference<>() {})); }
            catch (Exception ignored) { }
        }
        return ResponseEntity.ok(rows);
    }

    @DeleteMapping("/route/saved/{id}")
    public ResponseEntity<?> deleteSavedRoute(@PathVariable String id, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer routeId = parseId(id);
        if (routeId == null) return bad("Invalid saved route ID.");
        jdbc.update("DELETE FROM saved_routes WHERE id = ?", routeId);
        return ResponseEntity.ok(map("message", "Saved route deleted successfully."));
    }

    @GetMapping("/security/intruders")
    public ResponseEntity<?> intruders(HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        return ResponseEntity.ok(jdbc.queryForList("SELECT * FROM intruder_logs ORDER BY created_at DESC LIMIT 100"));
    }

    @GetMapping("/security/visitors")
    public ResponseEntity<?> visitors(HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        return ResponseEntity.ok(jdbc.queryForList("SELECT * FROM visitor_logs ORDER BY created_at DESC LIMIT 100"));
    }

    @GetMapping("/security/stats")
    public ResponseEntity<?> stats(HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        long visitors = count("visitor_logs"), intruders = count("intruder_logs"), stops = count("stops");
        long edges = count("edges"), routes = count("saved_routes");
        String databaseNow = postgres ? "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')" : "datetime('now')";
        List<Map<String, Object>> lockedUsers = jdbc.queryForList(
                "SELECT email, locked_until FROM users WHERE locked_until > " + databaseNow);
        return ResponseEntity.ok(map("totalVisitors", visitors, "totalIntruders", intruders, "totalStops", stops,
                "totalEdges", edges, "totalSavedRoutes", routes, "lockedAccountsCount", lockedUsers.size(),
                "lockedUsers", lockedUsers));
    }

    @DeleteMapping("/security/intruders/{id}")
    public ResponseEntity<?> deleteIntruder(@PathVariable String id, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        Integer logId = parseId(id);
        if (logId == null) return bad("Invalid intruder log ID.");
        Map<String, Object> log = one("SELECT id, photo_path FROM intruder_logs WHERE id = ?", logId);
        if (log == null) return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(map("error", "Intruder log entry not found."));
        String photo = string(log.get("photo_path"));
        if (!blank(photo)) {
            Matcher matcher = Pattern.compile("^/?uploads/intruders/([^/\\\\]+)$").matcher(photo.replace('\\', '/'));
            if (!matcher.matches()) return bad("Stored photo path is outside the intruder photo directory.");
            Path directory = Path.of("public", "uploads", "intruders").toAbsolutePath().normalize();
            Path file = directory.resolve(matcher.group(1)).normalize();
            if (!directory.equals(file.getParent())) return bad("Invalid stored intruder photo path.");
            try { Files.deleteIfExists(file); }
            catch (Exception ex) { return ResponseEntity.internalServerError().body(map("error",
                    "Failed to delete the intruder record and photo.")); }
        }
        jdbc.update("DELETE FROM intruder_logs WHERE id = ?", logId);
        return ResponseEntity.ok(map("message", "Intruder record and photo deleted."));
    }

    @PostMapping("/security/clear-lockout")
    public ResponseEntity<?> clearLockout(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (authorizedUser(request, true) == null) return authError(request);
        String email = string(body.get("email"));
        if (blank(email)) return bad("Email required");
        jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?", email);
        return ResponseEntity.ok(map("message", "Lockout cleared for " + email + "."));
    }

    @GetMapping("/security/events")
    public SseEmitter eventStream(HttpServletRequest request) {
        Map<String, Object> claims;
        try { claims = tokens.verify(bearer(request)); }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                "Invalid or expired token. Please log in again."); }
        if (!"ADMIN".equals(string(claims.get("role"))))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: Admin privileges required.");
        return realtime.subscribe();
    }

    @PostMapping("/visitor/ping")
    public ResponseEntity<?> visitorPing(@RequestBody(required = false) Map<String, Object> body,
                                         HttpServletRequest request) {
        if (trackingDisabled(request)) return ResponseEntity.noContent().build();
        Map<String, Object> data = visitorData(request, body == null ? Map.of() : body);
        realtime.publish("visitor:arrive", data);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<?> loginFailure(String email, String ip, HttpServletRequest request, String reason, Object photoData) {
        Failure failure = recordFailedAttempt(email, ip);
        String photoPath = savePhoto(photoData);
        String agent = truncate(request.getHeader("User-Agent"), 200, "Unknown Browser");
        Long logId = java.util.Objects.requireNonNull(jdbc.queryForObject("""
                INSERT INTO intruder_logs (email_attempted, failure_reason, ip_address, user_agent, photo_path, attempt_count)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, Long.class, email, reason, ip, agent, photoPath, failure.attempts()));
        long id = logId;
        String timestamp = Instant.now().toString();
        realtime.publish("security:intruder", map("id", id, "emailAttempted", email,
                "failureReason", reason, "ipAddress", ip, "userAgent", agent, "photoPath", photoPath,
                "attemptCount", failure.attempts(), "timestamp", timestamp));
        sendAlert(email, reason, ip, agent, failure.attempts(), photoPath, timestamp);
        int max = envInt("MAX_FAILED_ATTEMPTS", 5), minutes = envInt("LOCKOUT_TIME_MINUTES", 15);
        String message = "Invalid credentials. Attempt " + failure.attempts() + " of " + max + ".";
        if (failure.locked()) message = "Security Alert: Too many failed attempts. Terminal locked for " + minutes + " minutes.";
        else if (reason.contains("2FA")) message = "Invalid 2FA Authenticator code. Attempt " + failure.attempts() + " of " + max + ".";
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(map("error", message, "reason", reason,
                "attemptCount", failure.attempts(), "isLocked", failure.locked(), "requiresPhotoCapture", true));
    }

    private record Failure(int attempts, boolean locked) {}

    private Failure recordFailedAttempt(String email, String ip) {
        int max = envInt("MAX_FAILED_ATTEMPTS", 5);
        IpAttempt prior = ipAttempts.getOrDefault(ip, new IpAttempt(0, null));
        int ipCount = prior.count() + 1;
        Instant lockedUntil = ipCount >= max ? Instant.now().plusSeconds(envInt("LOCKOUT_TIME_MINUTES", 15) * 60L) : null;
        ipAttempts.put(ip, new IpAttempt(ipCount, lockedUntil));
        Map<String, Object> user = blank(email) ? null : one("SELECT failed_attempts FROM users WHERE email = ?", email);
        int attempts = user == null ? ipCount : number(user.get("failed_attempts")) + 1;
        if (user != null) {
            Timestamp accountLock = attempts >= max
                    ? Timestamp.valueOf(LocalDateTime.ofInstant(Instant.now()
                        .plusSeconds(envInt("LOCKOUT_TIME_MINUTES", 15) * 60L), ZoneOffset.UTC)) : null;
            jdbc.update("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE email = ?", attempts, accountLock, email);
        }
        return new Failure(attempts, attempts >= max);
    }

    private ResponseEntity<?> checkLockout(Object emailValue, String ip) {
        IpAttempt ipAttempt = ipAttempts.get(ip);
        if (ipAttempt != null && ipAttempt.lockedUntil() != null && ipAttempt.lockedUntil().isAfter(Instant.now())) {
            long remaining = (ipAttempt.lockedUntil().toEpochMilli() - System.currentTimeMillis() + 59999) / 60000;
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(map("error",
                    "Security Lockout: Too many failed login attempts from this terminal. Try again in "
                            + remaining + " minute(s).", "locked", true, "remainingMinutes", remaining));
        }
        if (ipAttempt != null && ipAttempt.lockedUntil() != null) ipAttempts.remove(ip);
        String email = string(emailValue);
        if (!blank(email)) {
            Map<String, Object> user = one("SELECT failed_attempts, locked_until FROM users WHERE email = ?", email);
            if (user != null && user.get("locked_until") != null) {
                Instant lock = parseDate(string(user.get("locked_until")));
                if (lock != null && lock.isAfter(Instant.now())) {
                    long remaining = (lock.toEpochMilli() - System.currentTimeMillis() + 59999) / 60000;
                    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(map("error",
                            "Account Locked: 5 consecutive failed attempts detected. Temporarily locked for security. Try again in "
                                    + remaining + " minute(s).", "locked", true, "remainingMinutes", remaining));
                }
                jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?", email);
            }
        }
        return null;
    }

    private void resetFailedAttempts(String email, String ip) {
        ipAttempts.remove(ip);
        jdbc.update("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = ?", email);
    }

    private void sendAlert(String email, String reason, String ip, String userAgent, int attemptCount,
                           String photoPath, String timestamp) {
        Map<String, String> env = Env.load();
        if (blank(env.get("SMTP_USER")) || blank(env.get("SMTP_PASS"))) return;
        try {
            String host = env.getOrDefault("SMTP_HOST", "smtp.gmail.com");
            String port = env.getOrDefault("SMTP_PORT", "587");
            java.util.Properties properties = new java.util.Properties();
            properties.put("mail.smtp.host", host);
            properties.put("mail.smtp.port", port);
            properties.put("mail.smtp.auth", "true");
            properties.put("mail.smtp.starttls.enable", String.valueOf(!"true".equalsIgnoreCase(env.get("SMTP_SECURE"))));
            if ("true".equalsIgnoreCase(env.get("SMTP_SECURE"))) properties.put("mail.smtp.ssl.enable", "true");
            Session session = Session.getInstance(properties, new Authenticator() {
                @Override protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(env.get("SMTP_USER"), env.get("SMTP_PASS"));
                }
            });
            MimeMessage message = new MimeMessage(session);
            message.setFrom(new InternetAddress(env.getOrDefault("EMAIL_FROM", env.get("SMTP_USER"))));
            message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(env.getOrDefault("ADMIN_ALERT_EMAIL", "admin@college.edu")));
            message.setSubject("SECURITY ALERT: Unauthorized Admin Login Attempt [" + reason + "]");
            String content = "Unauthorized login attempt detected.\n"
                    + "Attempted account: " + email + "\nReason: " + reason + "\nIP: " + ip
                    + "\nUser-Agent: " + userAgent + "\nAttempt: " + attemptCount + "\nTimestamp: " + timestamp;
            if (photoPath != null) content += "\nCaptured photo: " + photoPath;
            MimeMultipart multipart = new MimeMultipart();
            MimeBodyPart textPart = new MimeBodyPart();
            textPart.setText(content);
            multipart.addBodyPart(textPart);
            if (photoPath != null) {
                Path photo = Path.of("public", photoPath.replaceFirst("^/", "")).normalize();
                if (Files.isRegularFile(photo)) {
                    MimeBodyPart imagePart = new MimeBodyPart();
                    imagePart.setDataHandler(new DataHandler(new FileDataSource(photo.toFile())));
                    imagePart.setFileName(photo.getFileName().toString());
                    multipart.addBodyPart(imagePart);
                }
            }
            message.setContent(multipart);
            Transport.send(message);
        } catch (Exception ignored) {
            // Mail delivery must not prevent login-failure auditing.
        }
    }

    private String savePhoto(Object input) {
        if (!(input instanceof String encoded) || encoded.isBlank()) return null;
        try {
            Matcher matcher = PHOTO_DATA.matcher(encoded);
            String content = matcher.matches() ? matcher.group(1) : encoded;
            byte[] bytes = Base64.getDecoder().decode(content);
            if (bytes.length == 0 || bytes.length > 10 * 1024 * 1024) return null;
            Path directory = Path.of("public", "uploads", "intruders");
            Files.createDirectories(directory);
            String filename = "intruder_" + System.currentTimeMillis() + "_"
                    + Long.toUnsignedString(new SecureRandom().nextLong(), 36) + ".jpg";
            Files.write(directory.resolve(filename), bytes);
            return "/uploads/intruders/" + filename;
        } catch (Exception ignored) {
            return null;
        }
    }

    private String encryptSecret(String secret) {
        if (secret == null) return null;
        try {
            String configured = Env.load().get("ENCRYPTION_KEY");
            if (configured == null || !configured.matches("(?i)[0-9a-f]{64}"))
                throw new IllegalStateException("ENCRYPTION_KEY must be configured as 64 hexadecimal characters.");
            byte[] key = hex(configured);
            byte[] iv = new byte[16];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
            return hexString(iv) + ":" + hexString(cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (IllegalStateException ex) { throw ex; }
        catch (Exception ex) { throw new IllegalStateException("Unable to encrypt 2FA secret."); }
    }

    private String decryptSecret(String value) {
        if (value == null) return null;
        try {
            String configured = Env.load().get("ENCRYPTION_KEY");
            if (configured == null || !configured.matches("(?i)[0-9a-f]{64}")) return null;
            String[] parts = value.split(":", 2);
            if (parts.length != 2) return null;
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(hex(configured), "AES"), new IvParameterSpec(hex(parts[0])));
            return new String(cipher.doFinal(hex(parts[1])), StandardCharsets.UTF_8);
        } catch (Exception ex) { return null; }
    }

    private String qrCode(String content) {
        try {
            var matrix = new QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 260, 260);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (Exception ex) { throw new IllegalStateException("Unable to generate 2FA QR code."); }
    }

    private Map<String, Object> authorizedUser(HttpServletRequest request, boolean adminRequired) {
        String value = bearer(request);
        if (blank(value)) value = request.getParameter("token");
        if (blank(value)) return null;
        try {
            Map<String, Object> user = tokens.verify(value);
            if (adminRequired && !"ADMIN".equals(string(user.get("role")))) return null;
            return user;
        } catch (IllegalArgumentException ex) { return null; }
    }

    private ResponseEntity<?> authError(HttpServletRequest request) {
        String token = bearer(request);
        if (blank(token)) token = request.getParameter("token");
        if (blank(token)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(map("error", "Access denied. No authentication token provided."));
        try {
            Map<String, Object> claims = tokens.verify(token);
            if (!"ADMIN".equals(string(claims.get("role"))))
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(map("error", "Forbidden: Admin privileges required."));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(map("error", "Invalid or expired token. Please log in again."));
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(map("error", "Invalid authentication token."));
    }

    private static String bearer(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        String address = request.getRemoteAddr();
        return address == null || address.isBlank() ? "127.0.0.1" : address;
    }

    private boolean trackingDisabled(HttpServletRequest request) {
        String consent = request.getHeader("X-Consent-Analytics");
        String cookie = request.getHeader("Cookie");
        return "false".equalsIgnoreCase(consent) || (cookie != null && cookie.contains("cookie_consent=essential"));
    }

    private Map<String, Object> visitorData(HttpServletRequest request, Map<String, Object> body) {
        return map("page", truncate(body.get("page") == null ? request.getRequestURI() : string(body.get("page")), 100, "/"),
                "ip", anonymizeIp(clientIp(request)),
                "userAgent", truncate(body.get("userAgent") == null ? request.getHeader("User-Agent")
                        : string(body.get("userAgent")), 200, "Unknown Browser"),
                "referrer", truncate(body.get("referrer") == null ? request.getHeader("Referer")
                        : string(body.get("referrer")), 150, "Direct"),
                "timestamp", Instant.now().toString());
    }

    static Map<String, Object> visitRecord(HttpServletRequest request) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("page", truncate(request.getParameter("page") == null ? request.getRequestURI()
                : request.getParameter("page"), 100, "/"));
        event.put("ip", anonymizeIp(clientIp(request)));
        event.put("userAgent", userAgent(request));
        event.put("referrer", truncate(request.getHeader("Referer"), 150, "Direct"));
        event.put("timestamp", Instant.now().toString());
        return event;
    }

    private static String anonymizeIp(String ip) {
        if (ip == null || ip.isBlank()) return "0.0.0.0";
        if ("::1".equals(ip) || "127.0.0.1".equals(ip)) return "127.0.0.0";
        if (ip.contains(".")) {
            String[] parts = ip.split("\\.");
            if (parts.length == 4) return parts[0] + "." + parts[1] + "." + parts[2] + ".0";
        }
        if (ip.contains(":")) return String.join(":", java.util.Arrays.copyOf(ip.split(":"), Math.min(3, ip.split(":").length))) + "::0";
        return "127.0.0.0";
    }

    private static String userAgent(HttpServletRequest request) {
        return truncate(request.getHeader("User-Agent"), 200, "Unknown Browser");
    }

    private static Map<String, Object> userPublic(Map<String, Object> user, boolean login) {
        return map("id", user.get("id"), "name", user.get("name"), "email", user.get("email"),
                "role", user.get("role"), "is_2fa_enabled", number(user.get("is_2fa_enabled")) != 0);
    }

    private Map<String, Object> one(String sql, Object... args) {
        Object[] params = args == null ? new Object[0] : args;
        String query = java.util.Objects.requireNonNull(sql, "SQL query is required.");
        List<Map<String, Object>> rows = jdbc.queryForList(query, params);
        return rows.isEmpty() ? null : new LinkedHashMap<>(rows.get(0));
    }

    private long count(String table) {
        String normalized = table == null ? "" : table.trim();
        if (normalized.isEmpty() || !normalized.matches("[A-Za-z0-9_]+")) {
            return 0L;
        }
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM " + normalized, Long.class);
        return count == null ? 0L : count;
    }

    private ResponseEntity<Map<String, Object>> bad(String error) {
        return ResponseEntity.badRequest().body(map("error", error));
    }

    private static boolean graphHas(List<Map<String, Object>> stops, int id) {
        return stops.stream().anyMatch(stop -> number(stop.get("id")) == id);
    }

    private static Integer parseId(String text) {
        if (text == null || !text.matches("\\d+")) return null;
        try { return Integer.valueOf(text); } catch (NumberFormatException ex) { return null; }
    }

    private static Integer parseInteger(Object value) {
        if (value == null) return null;
        try { return value instanceof Number number ? number.intValue() : Integer.parseInt(value.toString()); }
        catch (NumberFormatException ex) { return null; }
    }

    private static Double parseDouble(Object value) {
        if (value == null) return null;
        try {
            double parsed = value instanceof Number number ? number.doubleValue() : Double.parseDouble(value.toString());
            return Double.isFinite(parsed) ? parsed : null;
        } catch (NumberFormatException ex) { return null; }
    }

    private static Object nullableNumber(Object value) {
        Double number = parseDouble(value);
        return number == null || number == 0 ? null : number;
    }

    private static int number(Object value) {
        if (value instanceof Number number) return number.intValue();
        if (value == null) return 0;
        try { return Integer.parseInt(value.toString()); } catch (NumberFormatException ex) { return 0; }
    }

    private static double decimal(Object value) {
        return value instanceof Number number ? number.doubleValue() : Double.parseDouble(value.toString());
    }

    private static boolean truthy(Object value) {
        return Boolean.TRUE.equals(value) || (value instanceof Number number && number.doubleValue() != 0)
                || "true".equalsIgnoreCase(string(value));
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String string(Object value) { return value == null ? null : value.toString(); }

    private static String truncate(String value, int maxLength, String fallback) {
        if (value == null || value.isBlank()) value = fallback;
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }

    private String writeJson(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalArgumentException("Invalid route path data."); }
    }

    private static byte[] hex(String value) {
        byte[] output = new byte[value.length() / 2];
        for (int i = 0; i < output.length; i++) output[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        return output;
    }

    private static String hexString(byte[] input) {
        StringBuilder output = new StringBuilder(input.length * 2);
        for (byte value : input) output.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return output.toString();
    }

    private static int envInt(String key, int fallback) {
        try { return Integer.parseInt(Env.load().getOrDefault(key, Integer.toString(fallback))); }
        catch (NumberFormatException ex) { return fallback; }
    }

    private static Instant parseDate(String value) {
        if (value == null) return null;
        try { return Instant.parse(value); } catch (Exception ignored) { }
        try { return LocalDateTime.parse(value.replace(' ', 'T')).toInstant(ZoneOffset.UTC); }
        catch (Exception ignored) { return null; }
    }
}
