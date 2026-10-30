package edu.college.bus;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class TokenService {
    private final ObjectMapper mapper;
    private final byte[] key;
    private final long expirationSeconds;

    public TokenService(ObjectMapper mapper) {
        this.mapper = mapper;
        String secret = Env.load().get("JWT_SECRET");
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException("JWT_SECRET must be configured with at least 32 characters.");
        }
        this.key = secret.getBytes(StandardCharsets.UTF_8);
        this.expirationSeconds = parseExpiration(Env.load().getOrDefault("JWT_EXPIRES_IN", "24h"));
    }

    public String issue(Map<String, Object> claims, long lifetimeSeconds) {
        try {
            long now = Instant.now().getEpochSecond();
            Map<String, Object> payload = new LinkedHashMap<>(claims);
            payload.put("iat", now);
            payload.put("exp", now + lifetimeSeconds);
            String header = encode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
            String encodedPayload = encode(mapper.writeValueAsString(payload));
            String signingInput = header + "." + encodedPayload;
            return signingInput + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(sign(signingInput));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to create authentication token.");
        }
    }

    public String issue(Map<String, Object> claims) {
        return issue(claims, expirationSeconds);
    }

    public Map<String, Object> verify(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new IllegalArgumentException();
            Map<String, Object> header = mapper.readValue(Base64.getUrlDecoder().decode(parts[0]),
                    new TypeReference<>() {});
            if (!"HS256".equals(header.get("alg"))) throw new IllegalArgumentException();
            String signingInput = parts[0] + "." + parts[1];
            byte[] expected = sign(signingInput);
            byte[] actual = Base64.getUrlDecoder().decode(parts[2]);
            if (!MessageDigest.isEqual(expected, actual)) throw new IllegalArgumentException();
            Map<String, Object> claims = mapper.readValue(Base64.getUrlDecoder().decode(parts[1]),
                    new TypeReference<>() {});
            Object expiry = claims.get("exp");
            if (!(expiry instanceof Number) || ((Number) expiry).longValue() <= Instant.now().getEpochSecond()) {
                throw new IllegalArgumentException();
            }
            return claims;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid or expired token. Please log in again.");
        }
    }

    private byte[] sign(String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.US_ASCII));
    }

    private static String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static long parseExpiration(String value) {
        try {
            String text = value.trim().toLowerCase();
            long multiplier = 1;
            if (text.endsWith("s")) text = text.substring(0, text.length() - 1);
            else if (text.endsWith("m")) { multiplier = 60; text = text.substring(0, text.length() - 1); }
            else if (text.endsWith("h")) { multiplier = 3600; text = text.substring(0, text.length() - 1); }
            else if (text.endsWith("d")) { multiplier = 86400; text = text.substring(0, text.length() - 1); }
            return Math.multiplyExact(Long.parseLong(text), multiplier);
        } catch (RuntimeException ex) {
            return 86400;
        }
    }
}
