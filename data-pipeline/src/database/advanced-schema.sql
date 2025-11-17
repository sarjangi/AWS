-- Advanced Canonical Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Master entities table
CREATE TABLE entities (
    entity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    source_system VARCHAR(100) NOT NULL,
    canonical_id VARCHAR(255) UNIQUE NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
);

-- Time-series data (partitioned by month)
CREATE TABLE time_series_data (
    entity_id UUID NOT NULL REFERENCES entities(entity_id),
    metric_date DATE NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    value DECIMAL(15,2) NOT NULL,
    quality_score INTEGER,
    tags JSONB DEFAULT '{}',
    PRIMARY KEY (entity_id, metric_date, metric_type)
) PARTITION BY RANGE (metric_date);

-- Create partitions for current year
CREATE TABLE time_series_data_2024_01 PARTITION OF time_series_data
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Entity relationships
CREATE TABLE entity_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_entity_id UUID NOT NULL REFERENCES entities(entity_id),
    child_entity_id UUID NOT NULL REFERENCES entities(entity_id),
    relationship_type VARCHAR(50) NOT NULL,
    properties JSONB DEFAULT '{}',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_entities_canonical_id ON entities(canonical_id);
CREATE INDEX idx_entities_type_status ON entities(entity_type, status);
CREATE INDEX idx_entities_attributes_gin ON entities USING GIN (attributes);
CREATE INDEX idx_time_series_date ON time_series_data(metric_date DESC);
CREATE INDEX idx_relationships_parent ON entity_relationships(parent_entity_id);