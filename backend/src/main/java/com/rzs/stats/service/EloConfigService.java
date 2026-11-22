package com.rzs.stats.service;

import com.rzs.stats.model.dto.EloConfig;
import com.rzs.stats.model.entity.EloConfigEntity;
import com.rzs.stats.repository.EloConfigRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EloConfigService {
    private final EloConfigRepository repository;

    public EloConfigService(EloConfigRepository repository) {
        this.repository = repository;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seed() {
        if (!repository.existsById(1L)) repository.save(new EloConfigEntity());
    }

    public EloConfig get() {
        return repository.findById(1L).map(EloConfigEntity::config).orElseGet(EloConfig::defaults);
    }

    @Transactional
    @CacheEvict(value = {"eloHistory", "playoffOdds", "leverage", "playoffPicture", "eloCalibration", "playoffPath", "playoffChampionship", "playoffWhatIf"}, allEntries = true)
    public EloConfig update(EloConfig config) {
        if (config == null || !config.valid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Elo configuration");
        }
        EloConfigEntity entity = repository.findById(1L).orElseGet(EloConfigEntity::new);
        entity.update(config);
        repository.save(entity);
        return config;
    }
}
