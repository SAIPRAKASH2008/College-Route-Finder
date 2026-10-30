package edu.college.bus;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;
import org.springframework.core.env.MapPropertySource;

@SpringBootApplication
public class BusApplication extends SpringBootServletInitializer {
    public static void main(String[] args) {
        Map<String, String> dotenv = Env.load();
        boolean postgres = dotenv.containsKey("DATABASE_URL")
                && !dotenv.get("DATABASE_URL").isBlank();
        String jdbcUrl = postgres
                ? dotenv.get("DATABASE_URL")
                : sqliteJdbcUrl(dotenv.get("DATABASE_PATH"));
        Map<String, Object> dotenvProperties = new HashMap<>();
        dotenvProperties.putAll(Env.asObjectMap(dotenv));

        SpringApplication app = new SpringApplication(BusApplication.class);
        Map<String, Object> defaultProperties = new HashMap<>();
        defaultProperties.put("server.port", dotenv.getOrDefault("PORT", "8500"));
        defaultProperties.put("spring.datasource.url", jdbcUrl);
        defaultProperties.put("spring.datasource.driver-class-name",
                postgres ? "org.postgresql.Driver" : "org.sqlite.JDBC");
        if (postgres) {
            defaultProperties.put("spring.datasource.username", dotenv.getOrDefault("DATABASE_USERNAME", "postgres"));
            defaultProperties.put("spring.datasource.password", dotenv.getOrDefault("DATABASE_PASSWORD", ""));
        }
        defaultProperties.put("spring.jackson.serialization.write-dates-as-timestamps", "false");
        defaultProperties.put("spring.servlet.multipart.max-file-size", "15MB");
        defaultProperties.put("spring.servlet.multipart.max-request-size", "15MB");
        app.setDefaultProperties(defaultProperties);
        app.addInitializers(context -> context.getEnvironment().getPropertySources()
                .addFirst(new MapPropertySource("dotenv", dotenvProperties)));
        if (!postgres) {
            System.getLogger(BusApplication.class.getName()).log(System.Logger.Level.WARNING,
                    "DATABASE_URL is not configured; starting with the existing SQLite database. "
                            + "Set DATABASE_URL to use PostgreSQL.");
        }
        app.run(args);
    }

    private static String sqliteJdbcUrl(String configuredPath) {
        Path database;
        if (configuredPath != null && !configuredPath.isBlank()) {
            database = Path.of(configuredPath);
            if (!database.isAbsolute()) database = findProjectFile(database);
        } else {
            database = findProjectFile(Path.of("database.sqlite"));
        }
        return "jdbc:sqlite:" + database.toAbsolutePath().normalize() + "?foreign_keys=on";
    }

    private static Path findProjectFile(Path file) {
        Path directory = Path.of("").toAbsolutePath();
        while (directory != null) {
            Path candidate = directory.resolve(file).normalize();
            if (Files.exists(candidate)) return candidate;
            directory = directory.getParent();
        }
        return Path.of("").toAbsolutePath().resolve("database.sqlite");
    }

    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        return builder.sources(BusApplication.class);
    }
}
