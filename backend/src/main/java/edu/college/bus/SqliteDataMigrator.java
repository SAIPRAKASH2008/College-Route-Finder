package edu.college.bus;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.springframework.stereotype.Component;

@Component
public class SqliteDataMigrator {
    private static final System.Logger LOGGER = System.getLogger(SqliteDataMigrator.class.getName());
    private static final List<TableSpec> TABLES = List.of(
            new TableSpec("users", List.of("id", "name", "email", "password_hash", "role", "totp_secret",
                    "is_2fa_enabled", "failed_attempts", "locked_until", "created_at"),
                    Set.of("locked_until", "created_at")),
            new TableSpec("stops", List.of("id", "name", "latitude", "longitude", "is_college", "created_at"),
                    Set.of("created_at")),
            new TableSpec("edges", List.of("id", "source_stop_id", "dest_stop_id", "distance_km", "created_at"),
                    Set.of("created_at")),
            new TableSpec("saved_routes", List.of("id", "route_name", "algorithm", "route_path", "total_distance",
                    "created_by", "created_at"), Set.of("created_at")),
            new TableSpec("intruder_logs", List.of("id", "email_attempted", "failure_reason", "ip_address",
                    "user_agent", "photo_path", "attempt_count", "created_at"), Set.of("created_at")),
            new TableSpec("visitor_logs", List.of("id", "page", "ip_address", "user_agent", "referrer", "created_at"),
                    Set.of("created_at")));

    private final DataSource dataSource;

    public SqliteDataMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public void importIfConfigured() {
        String configuredPath = Env.load().get("SQLITE_IMPORT_PATH");
        if (configuredPath != null && configuredPath.isBlank()) return;
        if (configuredPath == null) {
            Path defaultImportFile = Path.of("database.sqlite");
            if (!Files.isRegularFile(defaultImportFile)) return;
            configuredPath = defaultImportFile.toString();
        }

        Path sqliteFile = Path.of(configuredPath).toAbsolutePath().normalize();
        if (!Files.isRegularFile(sqliteFile)) {
            throw new IllegalStateException("Configured SQLite import file does not exist: " + sqliteFile);
        }

        try (Connection source = DriverManager.getConnection("jdbc:sqlite:" + sqliteFile);
             Connection target = dataSource.getConnection()) {
            if (!isTargetEmpty(target)) {
                LOGGER.log(System.Logger.Level.WARNING,
                        "SQLite import skipped because the PostgreSQL tables already contain data.");
                return;
            }

            target.setAutoCommit(false);
            try {
                long rowsCopied = 0;
                for (TableSpec table : TABLES) {
                    rowsCopied += copyTable(source, target, table);
                }
                for (TableSpec table : TABLES) {
                    resetIdentitySequence(target, table.name());
                }
                target.commit();
                LOGGER.log(System.Logger.Level.INFO,
                        "Imported {0} rows from SQLite into PostgreSQL.", rowsCopied);
            } catch (Exception exception) {
                target.rollback();
                throw new IllegalStateException("SQLite data import failed; PostgreSQL changes were rolled back.",
                        exception);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Unable to read the SQLite import file or connect to PostgreSQL.",
                    exception);
        }
    }

    private static boolean isTargetEmpty(Connection target) throws SQLException {
        try (Statement statement = target.createStatement()) {
            for (TableSpec table : TABLES) {
                try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM " + table.name())) {
                    if (result.next() && result.getLong(1) > 0) return false;
                }
            }
        }
        return true;
    }

    private static long copyTable(Connection source, Connection target, TableSpec table) throws SQLException {
        String columns = String.join(", ", table.columns());
        String placeholders = String.join(", ", java.util.Collections.nCopies(table.columns().size(), "?"));
        String insertSql = "INSERT INTO " + table.name() + " (" + columns + ") VALUES (" + placeholders + ")";
        long copied = 0;

        try (Statement sourceStatement = source.createStatement();
             ResultSet rows = sourceStatement.executeQuery("SELECT " + columns + " FROM " + table.name());
             PreparedStatement insert = target.prepareStatement(insertSql)) {
            while (rows.next()) {
                for (int index = 0; index < table.columns().size(); index++) {
                    String column = table.columns().get(index);
                    Object value = rows.getObject(index + 1);
                    if (value instanceof String text && table.timestampColumns().contains(column)) {
                        value = parseTimestamp(text);
                    }
                    insert.setObject(index + 1, value);
                }
                insert.executeUpdate();
                copied++;
            }
        }
        return copied;
    }

    private static Timestamp parseTimestamp(String value) {
        String normalized = value.trim().replace('T', ' ').replaceFirst("(Z|[+-]\\d{2}:\\d{2})$", "");
        return Timestamp.valueOf(normalized);
    }

    private static void resetIdentitySequence(Connection target, String table) throws SQLException {
        String sql = "SELECT setval(pg_get_serial_sequence(?, 'id'), "
                + "COALESCE(MAX(id), 1), COUNT(*) > 0) FROM " + table;
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            statement.setString(1, table);
            statement.executeQuery().close();
        }
    }

    private record TableSpec(String name, List<String> columns, Set<String> timestampColumns) {}
}
