CREATE EXTENSION IF NOT EXISTS postgis;

-- 지도 오버레이용 어려운 지점 (자료정리 파트가 적재)
CREATE TABLE IF NOT EXISTS hotspots (
    id      BIGSERIAL PRIMARY KEY,
    code    TEXT NOT NULL,        -- app/domain/factors.py 의 FactorCode
    note    TEXT,
    geom    geometry(Point, 4326) NOT NULL,
    source  TEXT                   -- 원천 데이터 (예: koroad_accident_2025)
);

CREATE INDEX IF NOT EXISTS hotspots_geom_idx ON hotspots USING GIST (geom);
CREATE INDEX IF NOT EXISTS hotspots_code_idx ON hotspots (code);
