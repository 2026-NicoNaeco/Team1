import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.routing.graph import RoadGraph


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, kakao_rest_api_key=None, redis_url=None, database_url=None, graph_path=None)


@pytest.fixture
def client(settings: Settings):
    app = create_app(settings)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def square_graph() -> RoadGraph:
    """A 에서 D 로 가는 두 경로.

    B(북)      D
    |  400m    | 600m
    A -------- C(동)
      600m

    A→B→D 는 짧지만 A-B 가 좁은 도로, A→C→D 는 길지만 깨끗하다.
    """
    return RoadGraph.from_dict({
        "nodes": [
            {"id": "A", "lat": 35.0, "lng": 127.0},
            {"id": "B", "lat": 35.0036, "lng": 127.0},
            {"id": "C", "lat": 35.0, "lng": 127.0044},
            {"id": "D", "lat": 35.0036, "lng": 127.0044},
        ],
        "edges": [
            {"id": "AB", "from": "A", "to": "B", "length_m": 400, "speed_kph": 30, "lanes": 1},
            {"id": "BD", "from": "B", "to": "D", "length_m": 400, "speed_kph": 30},
            {"id": "AC", "from": "A", "to": "C", "length_m": 600, "speed_kph": 30},
            {"id": "CD", "from": "C", "to": "D", "length_m": 600, "speed_kph": 30},
        ],
    })
