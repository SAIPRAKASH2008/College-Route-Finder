package edu.college.bus;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class RouteAlgorithms {
    private final Map<Integer, Map<String, Object>> nodes = new LinkedHashMap<>();
    private final Map<Integer, List<Edge>> adjacency = new LinkedHashMap<>();
    private final List<Edge> edges = new ArrayList<>();

    record Edge(int source, int dest, double distance, int id) {}

    RouteAlgorithms(List<Map<String, Object>> stops, List<Map<String, Object>> rows) {
        for (Map<String, Object> stop : stops) {
            int id = number(stop.get("id"));
            nodes.put(id, stop);
            adjacency.put(id, new ArrayList<>());
        }
        for (Map<String, Object> row : rows) {
            Edge edge = new Edge(number(row.get("source_stop_id")), number(row.get("dest_stop_id")),
                    decimal(row.get("distance_km")), number(row.get("id")));
            if (edge.source() == edge.dest() || edge.distance() <= 0) continue;
            List<Edge> sourceEdges = adjacency.computeIfAbsent(edge.source(), ignored -> new ArrayList<>());
            if (sourceEdges.stream().anyMatch(existing -> existing.dest() == edge.dest())) continue;
            edges.add(edge);
            sourceEdges.add(edge);
            adjacency.computeIfAbsent(edge.dest(), ignored -> new ArrayList<>())
                    .add(new Edge(edge.dest(), edge.source(), edge.distance(), edge.id()));
        }
    }

    Map<String, Object> kruskal(int start, int end) {
        if (!nodes.containsKey(start) || !nodes.containsKey(end)) {
            return map("path", List.of(), "stopNames", List.of(), "segments", List.of(),
                    "totalDistance", null, "unreachable", List.of());
        }
        Map<Integer, Integer> parent = new HashMap<>();
        Map<Integer, Integer> rank = new HashMap<>();
        Map<Integer, List<Edge>> tree = new HashMap<>();
        nodes.keySet().forEach(id -> { parent.put(id, id); rank.put(id, 0); tree.put(id, new ArrayList<>()); });
        List<Edge> sorted = edges.stream().sorted(
                Comparator.comparingDouble((Edge edge) -> edge.distance())
                        .thenComparingInt((Edge edge) -> edge.source())
                        .thenComparingInt((Edge edge) -> edge.dest()))
                .toList();
        List<Map<String, Object>> mstEdges = new ArrayList<>();
        double networkTotal = 0;
        for (Edge edge : sorted) {
            if (find(parent, edge.source()) == find(parent, edge.dest())) continue;
            union(parent, rank, edge.source(), edge.dest());
            tree.get(edge.source()).add(edge);
            tree.get(edge.dest()).add(new Edge(edge.dest(), edge.source(), edge.distance(), edge.id()));
            networkTotal += edge.distance();
            mstEdges.add(map("sourceId", edge.source(), "destId", edge.dest(),
                    "sourceName", name(edge.source()), "destName", name(edge.dest()),
                    "distance", round(edge.distance())));
        }
        Map<Integer, Integer> previous = new HashMap<>();
        Map<Integer, Edge> previousEdge = new HashMap<>();
        Deque<Integer> queue = new ArrayDeque<>();
        previous.put(start, null);
        queue.add(start);
        while (!queue.isEmpty() && !previous.containsKey(end)) {
            int current = queue.removeFirst();
            for (Edge edge : tree.getOrDefault(current, List.of())) {
                if (previous.containsKey(edge.dest())) continue;
                previous.put(edge.dest(), current);
                previousEdge.put(edge.dest(), edge);
                queue.addLast(edge.dest());
            }
        }
        if (!previous.containsKey(end)) {
            return map("startId", start, "endId", end, "path", List.of(), "stopNames", List.of(),
                    "segments", List.of(), "totalDistance", null, "unreachable", unreachable(start),
                    "mstEdges", mstEdges, "networkTotalDistance", round(networkTotal),
                    "message", "Destination stop is unreachable from starting stop.");
        }
        List<Integer> path = new ArrayList<>();
        for (Integer current = end; current != null; current = previous.get(current)) path.add(0, current);
        List<String> names = path.stream().map(id -> name(java.util.Objects.requireNonNull(id))).toList();
        List<Map<String, Object>> segments = new ArrayList<>();
        double total = 0;
        for (int i = 0; i + 1 < path.size(); i++) {
            Edge edge = previousEdge.get(path.get(i + 1));
            total += edge.distance();
            segments.add(map("fromId", path.get(i), "toId", path.get(i + 1), "fromName", names.get(i),
                    "toName", names.get(i + 1), "distance", round(edge.distance())));
        }
        return map("startId", start, "endId", end, "path", path, "stopNames", names,
                "segments", segments, "totalDistance", round(total), "unreachable", unreachable(start),
                "mstEdges", mstEdges, "networkTotalDistance", round(networkTotal));
    }

    Map<String, Object> prim(Integer requestedStart) {
        if (nodes.isEmpty()) return map("mstEdges", List.of(), "visitedStops", List.of(),
                "totalDistance", 0, "unreachable", List.of());
        int start = requestedStart == null || requestedStart == 0 || !nodes.containsKey(requestedStart)
                ? collegeId() : requestedStart;
        Set<Integer> visited = new LinkedHashSet<>();
        visited.add(start);
        List<Map<String, Object>> mst = new ArrayList<>();
        List<Edge> candidates = new ArrayList<>(adjacency.getOrDefault(start, List.of()));
        double total = 0;
        while (!candidates.isEmpty() && visited.size() < nodes.size()) {
            candidates.sort(Comparator.<Edge>comparingDouble(edge -> edge.distance()));
            Edge edge = candidates.remove(0);
            if (visited.contains(edge.dest())) continue;
            visited.add(edge.dest());
            total += edge.distance();
            mst.add(map("sourceId", edge.source(), "destId", edge.dest(), "sourceName", name(edge.source()),
                    "destName", name(edge.dest()), "distance", round(edge.distance())));
            candidates.addAll(adjacency.getOrDefault(edge.dest(), List.of()).stream()
                    .filter(next -> !visited.contains(next.dest())).toList());
        }
        List<Integer> unreachable = nodes.keySet().stream().filter(id -> !visited.contains(id)).toList();
        return map("startId", start, "startName", name(start), "mstEdges", mst,
                "visitedStops", new ArrayList<>(visited), "totalDistance", round(total), "unreachable", unreachable);
    }

    Map<String, Object> nearestNeighbour(Integer requestedStart, boolean returnToCollege) {
        if (nodes.isEmpty()) return map("path", List.of(), "stopNames", List.of(), "segments", List.of(),
                "tourStops", List.of(), "totalDistance", 0, "unreachable", List.of());
        int start = requestedStart == null || requestedStart == 0 || !nodes.containsKey(requestedStart)
                ? collegeId() : requestedStart;
        int current = start;
        Set<Integer> unvisited = new LinkedHashSet<>(nodes.keySet());
        unvisited.remove(current);
        List<Integer> path = new ArrayList<>(List.of(current));
        List<Integer> tourStops = new ArrayList<>(List.of(current));
        List<Map<String, Object>> segments = new ArrayList<>();
        double total = 0;
        while (!unvisited.isEmpty()) {
            Integer closest = null;
            Map<String, Object> best = null;
            double shortest = Double.POSITIVE_INFINITY;
            for (int candidate : unvisited) {
                Map<String, Object> route = dijkstra(current, candidate);
                double distance = ((Number) route.get("totalDistance")).doubleValue();
                if (!((List<?>) route.get("path")).isEmpty() && distance < shortest) {
                    closest = candidate;
                    best = route;
                    shortest = distance;
                }
            }
            if (closest == null) break;
            addRoute(best, path, segments);
            total += shortest;
            current = closest;
            unvisited.remove(current);
            tourStops.add(current);
        }
        if (returnToCollege && current != start) {
            Map<String, Object> back = dijkstra(current, start);
            if (!((List<?>) back.get("path")).isEmpty()) {
                addRoute(back, path, segments);
                total += ((Number) back.get("totalDistance")).doubleValue();
                tourStops.add(start);
            }
        }
        return map("startId", start, "path", path, "stopNames", path.stream().map(id -> name(id)).toList(),
                "segments", segments, "tourStops", tourStops, "totalDistance", round(total),
                "unreachable", new ArrayList<>(unvisited));
    }

    int reachableCount(int start) {
        Set<Integer> reachable = new HashSet<>();
        Deque<Integer> queue = new ArrayDeque<>();
        reachable.add(start);
        queue.add(start);
        while (!queue.isEmpty()) {
            int current = queue.removeFirst();
            for (Edge edge : adjacency.getOrDefault(current, List.of())) {
                if (reachable.add(edge.dest())) queue.addLast(edge.dest());
            }
        }
        return reachable.size();
    }

    private Map<String, Object> dijkstra(int source, int target) {
        Map<Integer, Double> distances = new HashMap<>();
        Map<Integer, Integer> previous = new HashMap<>();
        Set<Integer> unvisited = new LinkedHashSet<>(nodes.keySet());
        nodes.keySet().forEach(id -> { distances.put(id, Double.POSITIVE_INFINITY); previous.put(id, null); });
        distances.put(source, 0.0);
        if (source == target) return map("path", List.of(source), "segments", List.of(), "totalDistance", 0.0);
        while (!unvisited.isEmpty()) {
            int current = -1;
            double minimum = Double.POSITIVE_INFINITY;
            for (int id : unvisited) {
                if (distances.get(id) < minimum) { current = id; minimum = distances.get(id); }
            }
            if (current < 0 || current == target) break;
            unvisited.remove(current);
            for (Edge edge : adjacency.getOrDefault(current, List.of())) {
                if (unvisited.contains(edge.dest()) && minimum + edge.distance() < distances.get(edge.dest())) {
                    distances.put(edge.dest(), minimum + edge.distance());
                    previous.put(edge.dest(), current);
                }
            }
        }
        if (distances.getOrDefault(target, Double.POSITIVE_INFINITY).isInfinite()) {
            return map("path", List.of(), "segments", List.of(), "totalDistance", Double.POSITIVE_INFINITY);
        }
        List<Integer> path = new ArrayList<>();
        for (Integer current = target; current != null; current = previous.get(current)) path.add(0, current);
        List<Map<String, Object>> segments = new ArrayList<>();
        for (int i = 0; i + 1 < path.size(); i++) {
            int from = path.get(i), to = path.get(i + 1);
            Edge edge = adjacency.get(from).stream().filter(item -> item.dest() == to).findFirst().orElseThrow();
            segments.add(map("fromId", from, "toId", to, "fromName", name(from), "toName", name(to),
                    "distance", round(edge.distance())));
        }
        return map("path", path, "segments", segments, "totalDistance", round(distances.get(target)));
    }

    private void addRoute(Map<String, Object> route, List<Integer> path, List<Map<String, Object>> segments) {
        List<Integer> routePath = routePath(route);
        for (int i = 1; i < routePath.size(); i++) path.add(routePath.get(i));
        segments.addAll(routeSegments(route));
    }

    private static List<Integer> routePath(Map<String, Object> route) {
        return routePath(route.get("path"));
    }

    private static List<Integer> routePath(Object value) {
        if (!(value instanceof List<?> items)) return List.of();
        List<Integer> result = new ArrayList<>();
        for (Object item : items) {
            if (item instanceof Number number) {
                result.add(number.intValue());
            } else if (item instanceof String text) {
                result.add(Integer.parseInt(text));
            }
        }
        return result;
    }

    private static List<Map<String, Object>> routeSegments(Map<String, Object> route) {
        return routeSegments(route.get("segments"));
    }

    private static List<Map<String, Object>> routeSegments(Object value) {
        if (!(value instanceof List<?> items)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : items) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> typed = new LinkedHashMap<>();
                map.forEach((key, entryValue) -> typed.put(String.valueOf(key), entryValue));
                result.add(typed);
            }
        }
        return result;
    }

    private int collegeId() {
        return nodes.values().stream().filter(node -> number(node.get("is_college")) != 0)
                .mapToInt(node -> number(node.get("id"))).findFirst()
                .orElseGet(() -> nodes.keySet().iterator().next());
    }

    private List<Integer> unreachable(int start) {
        Set<Integer> reachable = new HashSet<>();
        Deque<Integer> queue = new ArrayDeque<>();
        reachable.add(start);
        queue.add(start);
        while (!queue.isEmpty()) {
            int current = queue.removeFirst();
            for (Edge edge : adjacency.getOrDefault(current, List.of())) {
                if (reachable.add(edge.dest())) queue.addLast(edge.dest());
            }
        }
        return nodes.keySet().stream().filter(id -> !reachable.contains(id)).toList();
    }

    private String name(int id) {
        Object value = nodes.containsKey(id) ? nodes.get(id).get("name") : null;
        return value == null ? "Stop #" + id : value.toString();
    }

    private static int find(Map<Integer, Integer> parent, int id) {
        while (parent.get(id) != id) id = parent.get(id);
        return id;
    }

    private static void union(Map<Integer, Integer> parent, Map<Integer, Integer> rank, int first, int second) {
        int firstRoot = find(parent, first), secondRoot = find(parent, second);
        if (firstRoot == secondRoot) return;
        if (rank.get(firstRoot) < rank.get(secondRoot)) {
            int temp = firstRoot; firstRoot = secondRoot; secondRoot = temp;
        }
        parent.put(secondRoot, firstRoot);
        if (rank.get(firstRoot).equals(rank.get(secondRoot))) rank.put(firstRoot, rank.get(firstRoot) + 1);
    }

    private static int number(Object value) {
        return value instanceof Number number ? number.intValue() : Integer.parseInt(value.toString());
    }

    private static double decimal(Object value) {
        return value instanceof Number number ? number.doubleValue() : Double.parseDouble(value.toString());
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }
}
