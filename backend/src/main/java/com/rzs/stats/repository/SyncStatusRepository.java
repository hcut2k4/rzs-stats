package com.rzs.stats.repository;

import com.rzs.stats.model.entity.SyncStatusEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SyncStatusRepository extends JpaRepository<SyncStatusEntity, Long> {}
