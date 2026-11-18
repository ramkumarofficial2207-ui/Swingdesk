"""Compatibility entry point for local development.

The production and local API are both served by ``service.py``. The previous
single-stock heuristic endpoint was intentionally retired because it emitted
untrained probabilities that could be mistaken for model evidence.
"""

from service import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("service:app", host="127.0.0.1", port=8000, reload=True)
