"""
FastAPI backend for the modeler app.

Auth model
----------
* App SP — used for Model Serving calls, Lakebase writes, Jobs SDK (apply job).
* User OBO — used for Unity Catalog reads (so grants are enforced as the *user's*
  permissions, not the app's).

Lakebase connection metadata comes from the Apps-injected `PG*` env vars (PGHOST,
PGPORT, PGUSER, PGDATABASE, PGAPPNAME). The OAuth password (~1h token) is minted on
first DB access and re-minted before expiry by
`agent.tools.proposal_store.ensure_lakebase_password`. SDK failures surface at the
call site instead of being hidden by a broad startup try/except.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.routers import agent, apply, catalog, proposals, sessions

import logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    force=True,                # critical: kicks out any handlers already installed
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lakebase credentials are populated lazily on first DB access (and refreshed
    # before token expiry) by `agent.tools.proposal_store.ensure_lakebase_creds`.
    # No startup priming — it previously masked real SDK failures behind a vague
    # "Missing env vars" error surfaced minutes later in the chat handler.

    # MLflow Tracing — wire the graph's @mlflow.trace spans to the configured experiment.
    # Without this, traces silently no-op (no Inference Tables now that Model Serving is gone).
    try:
        import mlflow
        experiment = os.environ.get("MLFLOW_EXPERIMENT")
        if experiment:
            mlflow.set_tracking_uri("databricks")
            mlflow.set_experiment(experiment)
            mlflow.langchain.autolog()
            log.info("MLflow tracing enabled (experiment=%s)", experiment)
        else:
            log.warning("MLFLOW_EXPERIMENT not set; agent traces will not be recorded.")
    except Exception as e:  # noqa: BLE001
        log.warning("Could not configure MLflow tracing at startup: %s", e)

    yield


app = FastAPI(title=os.environ.get("APP_TITLE", "ai-modeler-app"), lifespan=lifespan)

# In dev, the apx frontend runs on a separate port. Production serves both from the same
# origin, so CORS is wide-open here — restrict if you wire in real auth.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router, prefix="/api/catalog", tags=["catalog"])
app.include_router(agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(proposals.router, prefix="/api/proposals", tags=["proposals"])
app.include_router(apply.router, prefix="/api/apply", tags=["apply"])
app.include_router(sessions.router, prefix="/api/chat/sessions", tags=["sessions"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class SPAStaticFiles(StaticFiles):
    """StaticFiles that falls back to index.html for unknown non-API paths.

    Starlette's `html=True` only serves `index.html` for directory requests
    (so `/` works) and `404.html` as an error body — it does NOT make
    arbitrary client-side routes like `/chat` or `/approvals` resolve to the
    SPA shell. Without this subclass, refreshing or deep-linking those
    routes returns FastAPI's default `{"detail":"Not Found"}` JSON.

    `/api/*` is excluded so genuine API 404s still return JSON instead of
    being silently masked by the SPA HTML.
    """

    async def get_response(self, path: str, scope):
        if path.startswith("api/") or path == "api":
            raise StarletteHTTPException(status_code=404)
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


# Mount the built React SPA at /. Guarded so the backend stays importable
# locally before the frontend is built (e.g. `pytest` against backend-only code).
_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", SPAStaticFiles(directory=str(_dist), html=True), name="ui")
