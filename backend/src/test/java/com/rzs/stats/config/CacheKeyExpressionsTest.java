package com.rzs.stats.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class CacheKeyExpressionsTest {
    private static final Pattern CLASS_REFERENCE = Pattern.compile("\\bnew\\s+[A-Za-z_]|\\bT\\s*\\(");

    @Test
    void cacheKeyExpressionsNeverReferenceClassesBecauseTheProductionJarCannotResolveThem() throws Exception {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(org.springframework.stereotype.Component.class));
        var offenders = new ArrayList<String>();
        int checked = 0;
        for (BeanDefinition definition : scanner.findCandidateComponents("com.rzs.stats")) {
            Class<?> type = Class.forName(definition.getBeanClassName());
            for (Method method : type.getDeclaredMethods()) {
                var cacheable = AnnotatedElementUtils.findMergedAnnotation(method, Cacheable.class);
                if (cacheable == null || cacheable.key().isBlank()) continue;
                checked++;
                if (CLASS_REFERENCE.matcher(cacheable.key()).find()) offenders.add(type.getSimpleName() + "." + method.getName() + ": " + cacheable.key());
            }
        }
        assertThat(checked).isPositive();
        assertThat(offenders).as("Build cache keys in a Java method and call it from the expression").isEmpty();
    }
}
