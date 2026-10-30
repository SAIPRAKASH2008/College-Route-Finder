package edu.college.bus;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class RealtimeHub {
    private final ObjectMapper mapper;
    private final Set<SseEmitter> admins = ConcurrentHashMap.newKeySet();

    public RealtimeHub(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        admins.add(emitter);
        emitter.onCompletion(() -> admins.remove(emitter));
        emitter.onTimeout(() -> admins.remove(emitter));
        emitter.onError(error -> admins.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("connected")
                    .data(Objects.requireNonNull(Map.<String, Object>of(
                            "message", "Connected to Live Security Stream"))));
        } catch (IOException ex) {
            admins.remove(emitter);
        }
        return emitter;
    }

    public void publish(String eventName, Object data) {
        for (SseEmitter emitter : admins) {
            try {
                emitter.send(SseEmitter.event().name(Objects.requireNonNull(eventName))
                        .data(Objects.requireNonNull(mapper.writeValueAsString(data))));
            } catch (Exception ex) {
                admins.remove(emitter);
            }
        }
    }
}
