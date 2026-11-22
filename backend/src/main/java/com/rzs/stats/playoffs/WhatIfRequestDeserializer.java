package com.rzs.stats.playoffs;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Set;

public class WhatIfRequestDeserializer extends JsonDeserializer<WhatIfService.Request> {
    static final int MAX_PICKS = 272;

    @Override
    public WhatIfService.Request deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        JsonNode root = parser.getCodec().readTree(parser);
        fields(root, Set.of("season", "rules", "picks", "simulations"), context);
        var picks = new ArrayList<WhatIfService.Pick>();
        var input = root.get("picks");
        if (input != null && !input.isNull()) {
            if (!input.isArray() || input.size() > MAX_PICKS) return context.reportInputMismatch(WhatIfService.Request.class, "Too many picks or invalid picks list");
            for (var pick : input) {
                fields(pick, Set.of("gameId", "result"), context);
                picks.add(new WhatIfService.Pick(integer(pick.get("gameId"), context), string(pick.get("result"), context)));
            }
        }
        return new WhatIfService.Request(integer(root.get("season"), context), string(root.get("rules"), context),
                picks, integer(root.get("simulations"), context));
    }

    private void fields(JsonNode node, Set<String> allowed, DeserializationContext context) throws IOException {
        if (!node.isObject()) context.reportInputMismatch(WhatIfService.Request.class, "Expected an object");
        var names = node.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            if (!allowed.contains(name)) context.reportInputMismatch(WhatIfService.Request.class, "Unknown property: %s", name);
        }
    }

    private Integer integer(JsonNode node, DeserializationContext context) throws IOException {
        if (node == null || node.isNull()) return null;
        if (!node.isIntegralNumber() || !node.canConvertToInt()) return context.reportInputMismatch(Integer.class, "Expected an integer");
        return node.intValue();
    }

    private String string(JsonNode node, DeserializationContext context) throws IOException {
        if (node == null || node.isNull()) return null;
        if (!node.isTextual()) return context.reportInputMismatch(String.class, "Expected a string");
        return node.textValue();
    }
}
