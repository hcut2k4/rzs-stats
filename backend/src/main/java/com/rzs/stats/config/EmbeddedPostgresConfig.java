package com.rzs.stats.config;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Path;

@Configuration
@Profile("embedded-db")
public class EmbeddedPostgresConfig {

    @Bean(destroyMethod = "close")
    public EmbeddedPostgres embeddedPostgres() throws IOException {
        return EmbeddedPostgres.builder()
                .setDataDirectory(Path.of(".localdb"))
                .setCleanDataDirectory(false)
                .start();
    }

    @Bean
    public DataSource dataSource(EmbeddedPostgres pg) {
        return pg.getPostgresDatabase();
    }
}
