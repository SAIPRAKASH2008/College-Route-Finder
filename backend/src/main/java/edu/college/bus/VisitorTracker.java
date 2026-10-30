package edu.college.bus;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class VisitorTracker implements HandlerInterceptor {
    private final JdbcTemplate jdbc;
    private final RealtimeHub realtime;

    public VisitorTracker(JdbcTemplate jdbc, RealtimeHub realtime) {
        this.jdbc = jdbc;
        this.realtime = realtime;
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        String cookie = request.getHeader("Cookie");
        if ("false".equalsIgnoreCase(request.getHeader("X-Consent-Analytics"))
                || (cookie != null && cookie.contains("cookie_consent=essential"))) return true;
        String accept = request.getHeader("Accept");
        if (accept == null || !accept.contains("text/html") || request.getRequestURI().startsWith("/api/")) return true;
        Map<String, Object> visitor = ApiController.visitRecord(request);
        try {
            jdbc.update("INSERT INTO visitor_logs (page, ip_address, user_agent, referrer) VALUES (?, ?, ?, ?)",
                    visitor.get("page"), visitor.get("ip"), visitor.get("userAgent"), visitor.get("referrer"));
            realtime.publish("visitor:arrive", visitor);
        } catch (Exception ignored) {
            // Page delivery continues if visitor analytics are temporarily unavailable.
        }
        return true;
    }
}
