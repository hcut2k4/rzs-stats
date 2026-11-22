package com.rzs.stats.repository;

import com.rzs.stats.model.entity.TeamEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TeamRepository extends JpaRepository<TeamEntity, Long> {
    @org.springframework.data.jpa.repository.Query("SELECT t.teamId, t.abbrName, t.displayName, t.conference, t.division FROM TeamEntity t ORDER BY t.teamId, t.id")
    java.util.stream.Stream<Object[]> fingerprintRows();

    Optional<TeamEntity> findByTeamId(Integer teamId);
    Optional<TeamEntity> findByNsId(Integer nsId);
}
