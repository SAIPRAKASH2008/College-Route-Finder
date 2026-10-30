package edu.college.bus;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

final class Env {
    private Env() {}

    static Map<String, String> load() {
        Map<String, String> values = new LinkedHashMap<>();
        Path file = Path.of(".env");
        if (Files.isRegularFile(file)) {
            try {
                for (String line : Files.readAllLines(file)) {
                    String trimmed = line.trim();
                    if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                    int separator = trimmed.indexOf('=');
                    if (separator <= 0) continue;
                    String key = trimmed.substring(0, separator).trim();
                    String value = trimmed.substring(separator + 1).trim();
                    if ((value.startsWith("\"") && value.endsWith("\""))
                            || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.substring(1, value.length() - 1);
                    }
                    values.put(key, value);
                }
            } catch (IOException ex) {
                throw new IllegalStateException("Unable to read .env configuration file.", ex);
            }
        }
        System.getenv().forEach(values::put);
        return values;
    }

    static Map<String, Object> asObjectMap(Map<String, String> map) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.putAll(map);
        return result;
    }
}
